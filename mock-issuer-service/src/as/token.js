import crypto from "crypto";
import {
  accessTokenStore,
  authCodeStore,
  preAuthCodeStore,
  stageTestErrorStore,
  generateDPoPNonce,
  isDPoPNonceValid,
} from "./authz-store.js";
import { envTestError, sendTestError } from "../test-errors.js";
import { verifyDPoPProof, buildHtu, DPoPError } from "./dpop.js";
import { decodeJwt, decodeProtectedHeader } from "jose";

function base64url(str) {
  return str.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// RFC 7636 — verify code_verifier against the code_challenge that was supplied at
// /par or /authorize. PAR makes this meaningful: the challenge is pushed over a
// back channel, so the browser never sees it.
function verifyPkce(codeVerifier, codeChallenge, codeChallengeMethod) {
  if (!codeChallenge) return true; // PKCE was not used for this authorization
  if (!codeVerifier) return false;
  // Only S256 is advertised in AS metadata (code_challenge_methods_supported), and it must
  // be stated explicitly: RFC 7636 §4.3 defaults an omitted method to "plain", not S256.
  if (codeChallengeMethod !== "S256") return false;
  const hash = crypto.createHash("sha256").update(codeVerifier).digest("base64");
  return base64url(hash) === codeChallenge;
}

// USE_DPOP_NONCE=true  → AS requires a server-issued nonce in the DPoP proof (tests retry flow)
// USE_DPOP_NONCE=false → AS accepts proofs without a nonce (default, simpler happy-path test)
const REQUIRE_DPOP_NONCE = String(process.env.USE_DPOP_NONCE ?? "false").toLowerCase() === "true";

export default async function tokenHandler(req, res) {
  const {
    grant_type,
    code,
    "pre-authorized_code": preAuthorizedCode,
    tx_code: txCodeInput,
    redirect_uri,
    client_id,
    code_verifier
  } = req.body;
  console.log("Token Request:", grant_type, code || preAuthorizedCode);

  let scope;
  let boundDpopJkt = null; // RFC 9449 §10: set if dpop_jkt was bound at authorization
  let testError = envTestError("token") || stageTestErrorStore.get("token") || null;
  let credentialTestError =
    envTestError("credential") || stageTestErrorStore.get("credential") || null;

  if (grant_type === "authorization_code") {
    const entry = authCodeStore.get(code);
    if (!entry) {
      return res.status(400).json({
        error: "invalid_grant",
        error_description: "Invalid or expired authorization code"
      });
    }
    if (redirect_uri !== entry.redirect_uri) {
      return res.status(400).json({
        error: "invalid_grant",
        error_description: "redirect_uri mismatch"
      });
    }
    if (client_id !== entry.client_id) {
      return res.status(400).json({
        error: "invalid_client",
        error_description: "client_id mismatch"
      });
    }

    // Validate PKCE (RFC 7636) against the challenge bound at /par or /authorize
    if (!verifyPkce(code_verifier, entry.code_challenge, entry.code_challenge_method)) {
      return res.status(400).json({
        error: "invalid_grant",
        error_description: "code_verifier does not match the code_challenge"
      });
    }

    scope = entry.scope;
    testError ||= entry.testError?.stage === "token" ? entry.testError : null;
    credentialTestError ||= entry.testError?.stage === "credential" ? entry.testError : null;

    // RFC 9449 §10: if dpop_jkt was bound at authorization, DPoP proof is mandatory
    if (entry.dpop_jkt) {
      if (!req.headers["dpop"]) {
        return res.status(400).json({
          error: "invalid_dpop_proof",
          error_description: "DPoP proof required — dpop_jkt was bound at authorization",
        });
      }
      boundDpopJkt = entry.dpop_jkt;
    }
    // NOTE: code is deleted only after DPoP validation succeeds below (see
    // "Issue access_token" section) — deleting it here would break the
    // RFC 9449 §8 use_dpop_nonce retry, since the wallet must resend the
    // SAME authorization_code grant with a nonce-bound proof.
  } else if (grant_type === "urn:ietf:params:oauth:grant-type:pre-authorized_code") {
    if (!preAuthorizedCode) {
      return res.status(400).json({
        error: "invalid_request",
        error_description: "pre-authorized_code missing"
      });
    }
    const entry = preAuthCodeStore.get(preAuthorizedCode);
    if (!entry) {
      return res.status(400).json({
        error: "invalid_grant",
        error_description: "Invalid or expired pre-authorized code"
      });
    }
    if (entry.txCode) {
      if (txCodeInput === undefined || txCodeInput === null || txCodeInput === "") {
        return res.status(400).json({
          error: "invalid_request",
          error_description: "tx_code is REQUIRED for this pre-authorized_code"
        });
      }
      if (txCodeInput !== entry.txCode) {
        return res.status(400).json({
          error: "invalid_grant",
          error_description: "Invalid tx_code"
        });
      }
    }
    scope = entry.scope;
    testError ||= entry.testError?.stage === "token" ? entry.testError : null;
    credentialTestError ||= entry.testError?.stage === "credential" ? entry.testError : null;
    // NOTE: deferred delete — see comment on authCodeStore above.
  } else {
    return res.status(400).json({
      error: "unsupported_grant_type",
      error_description: "Only authorization_code and pre-authorized_code grants are supported"
    });
  }

  if (testError) stageTestErrorStore.delete("token");
  if (sendTestError(res, testError)) return;

  // ── DPoP handling ──────────────────────────────────────────────────────────
  const dpopProof = req.headers["dpop"];
  let dpopThumbprint = null;
  let tokenType = "Bearer";

  if (!dpopProof) {
    console.log("No DPoP header present — issuing plain Bearer token");
  }

  if (dpopProof) {
    // Fresh nonce for proactive use (always issued so wallet can include it next time)
    const freshNonce = generateDPoPNonce();

    try {
      const htu = buildHtu(req);
      // Nonce is enforced manually below (any unexpired nonce in the store is accepted),
      // so it isn't passed to verifyDPoPProof.
      const result = await verifyDPoPProof(dpopProof, "POST", htu);

      // Manual nonce enforcement (any valid nonce in store is acceptable)
      if (REQUIRE_DPOP_NONCE) {
        // Extract nonce from proof payload (already decoded inside verifyDPoPProof —
        // re-decode header to get at payload)
        const proofPayload = decodeJwt(dpopProof);
        if (!proofPayload.nonce || !isDPoPNonceValid(proofPayload.nonce)) {
          console.log(
            `use_dpop_nonce challenge issued (proof nonce: ${proofPayload.nonce || "none"}) — freshNonce: ${freshNonce}`,
          );
          res.setHeader("DPoP-Nonce", freshNonce);
          return res.status(400).json({
            error: "use_dpop_nonce",
            error_description: "Authorization server requires nonce in DPoP proof",
          });
        }
        console.log(`DPoP nonce accepted ✓ (nonce: ${proofPayload.nonce})`);
      }

      dpopThumbprint = result.thumbprint;
      tokenType = "DPoP";
      console.log("[DPoP Token Proof]");
      console.log("  header :", JSON.stringify(decodeProtectedHeader(dpopProof)));
      console.log("  payload:", JSON.stringify(decodeJwt(dpopProof)));
      console.log(`DPoP proof valid (alg: ${result.jwk?.crv || "RSA"}, thumbprint: ${dpopThumbprint})`);

      // RFC 9449 §10: enforce dpop_jkt binding using the verified thumbprint
      if (boundDpopJkt && dpopThumbprint !== boundDpopJkt) {
        console.warn(`dpop_jkt mismatch: expected ${boundDpopJkt}, got ${dpopThumbprint}`);
        return res.status(400).json({
          error: "invalid_dpop_proof",
          error_description: "DPoP key thumbprint does not match dpop_jkt bound at authorization",
        });
      }
      if (boundDpopJkt) {
        console.log(`dpop_jkt verified ✓ (thumbprint: ${dpopThumbprint})`);
      }
    } catch (err) {
      if (err instanceof DPoPError && err.code === "use_dpop_nonce") {
        console.log(`use_dpop_nonce challenge issued (reason: ${err.description}) — freshNonce: ${freshNonce}`);
        res.setHeader("DPoP-Nonce", freshNonce);
        return res.status(400).json({
          error: "use_dpop_nonce",
          error_description: err.description,
        });
      }
      console.warn("DPoP proof validation failed:", err.message);
      res.setHeader("DPoP-Nonce", freshNonce);
      return res.status(400).json({
        error: "invalid_dpop_proof",
        error_description: err.message,
      });
    }
  }
  // ── End DPoP handling ──────────────────────────────────────────────────────

  // Consume the code now that DPoP validation (if any) has succeeded —
  // deleting earlier would prevent the RFC 9449 §8 nonce-retry from reusing
  // the same grant.
  if (grant_type === "authorization_code") {
    authCodeStore.delete(code);
  } else if (grant_type === "urn:ietf:params:oauth:grant-type:pre-authorized_code") {
    preAuthCodeStore.delete(preAuthorizedCode);
  }

  // Issue access_token + c_nonce
  const accessToken = base64url(crypto.randomBytes(32).toString("base64"));
  const cNonce = base64url(crypto.randomBytes(16).toString("base64"));
  accessTokenStore.set(accessToken, {
    created_at: Date.now(),
    scope,
    tokenType,
    dpopThumbprint,   // null for Bearer tokens
    testError: credentialTestError,
  });
  if (credentialTestError) stageTestErrorStore.delete("credential");

  console.log(
    `Issuing token: token_type=${tokenType} access_token=${accessToken} c_nonce=${cNonce}${
      dpopThumbprint ? ` dpop_thumbprint=${dpopThumbprint}` : ""
    }`,
  );

  res.setHeader("Cache-Control", "no-store");

  // Always include a fresh DPoP-Nonce so the wallet can proactively bind it
  // to the credential-endpoint proof (recommended by RFC 9449 §8.1)
  if (dpopProof) {
    res.setHeader("DPoP-Nonce", generateDPoPNonce());
  }

  res.json({
    access_token: accessToken,
    token_type: tokenType,
    expires_in: 3600,
    c_nonce: cNonce,
    c_nonce_expires_in: 300,
    scope,
  });
}
