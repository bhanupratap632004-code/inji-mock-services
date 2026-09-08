import crypto from "crypto";
import { parRequestStore, stageTestErrorStore } from "./authz-store.js";
import { envTestError, sendTestError } from "../test-errors.js";

// RFC 9126 — Pushed Authorization Requests
const PAR_EXPIRES_IN = 90; // seconds

export default function parHandler(req, res) {
  // Lets a test force the PAR attempt to fail, so the client's behaviour on failure can be
  // exercised: fall back to a plain authorization request, or error out when PAR is required.
  const testError = envTestError("par") || stageTestErrorStore.get("par") || null;
  if (testError) {
    stageTestErrorStore.delete("par");
    if (sendTestError(res, testError)) return;
  }

  const {
    response_type,
    client_id,
    redirect_uri,
    code_challenge,
    code_challenge_method,
    scope,
    state,
    nonce,
    request_uri,
    issuer_state,
    dpop_jkt,
  } = req.body;

  console.log("PAR request received for client_id:", client_id);

  // A PAR request MUST NOT itself contain a request_uri (RFC 9126 §2.1). Checked by
  // presence rather than value, so an explicitly supplied empty one is still rejected.
  if (Object.prototype.hasOwnProperty.call(req.body, "request_uri")) {
    return res.status(400).json({
      error: "invalid_request",
      error_description: "request_uri is not allowed in a pushed authorization request"
    });
  }

  if (!client_id) {
    return res.status(400).json({
      error: "invalid_request",
      error_description: "client_id is required"
    });
  }

  if (!redirect_uri) {
    return res.status(400).json({
      error: "invalid_request",
      error_description: "redirect_uri is required"
    });
  }

  if (response_type && response_type !== "code") {
    return res.status(400).json({
      error: "unsupported_response_type",
      error_description: "only response_type=code is supported"
    });
  }

  const requestUri = `urn:ietf:params:oauth:request_uri:${crypto.randomBytes(16).toString("hex")}`;

  parRequestStore.set(requestUri, {
    response_type: response_type || "code",
    client_id,
    redirect_uri,
    code_challenge,
    code_challenge_method,
    scope,
    state,
    nonce,
    // Under PAR every authorization-request parameter is pushed here rather than
    // sent to /authorize, including dpop_jkt (RFC 9449 §10) and issuer_state.
    issuer_state,
    dpop_jkt,
    expires_at: Date.now() + PAR_EXPIRES_IN * 1000
  });

  // request_uri is short-lived; evict it once it expires so the store does not grow unbounded.
  setTimeout(() => parRequestStore.delete(requestUri), PAR_EXPIRES_IN * 1000).unref();

  // Log only a short suffix — the full request_uri is a redeemable reference.
  console.log(`PAR issued request_uri (…${requestUri.slice(-8)}, expires in ${PAR_EXPIRES_IN}s)`);

  return res.status(201).json({
    request_uri: requestUri,
    expires_in: PAR_EXPIRES_IN
  });
}
