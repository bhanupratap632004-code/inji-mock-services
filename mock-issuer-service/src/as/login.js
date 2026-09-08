import {
  generateAuthCode,
  authCodeStore,
  issuerStateStore,
  loginTxnStore,
} from "./authz-store.js";

export default function loginHandler(req, res) {
  // Every authorization-request parameter comes from the server-side transaction, never
  // from the posted form, so nothing the browser sends can alter what the client asked for.
  const { login_txn: loginTxn } = req.body;
  const transaction = loginTxn ? loginTxnStore.get(loginTxn) : null;
  if (!transaction) {
    return res.status(400).send("invalid or unknown login transaction");
  }
  if (transaction.expires_at < Date.now()) {
    loginTxnStore.delete(loginTxn);
    return res.status(400).send("login transaction has expired");
  }
  loginTxnStore.delete(loginTxn); // single use

  const {
    client_id,
    redirect_uri,
    state,
    issuer_state: issuerState,
    dpop_jkt,
    code_challenge,
    code_challenge_method,
    scope,
    nonce,
  } = transaction;

  const code = generateAuthCode();
  const issuerStateEntry = issuerState ? issuerStateStore.get(issuerState) : null;

  authCodeStore.set(code, {
    client_id,
    redirect_uri,
    state,
    dpop_jkt: dpop_jkt || null,   // RFC 9449 §10 — key binding
    // Bound to the code so /token can verify the code_verifier (RFC 7636)
    code_challenge: code_challenge || null,
    code_challenge_method: code_challenge_method || null,
    scope: scope || null,
    nonce: nonce || null,
    created_at: Date.now(),
    testError: issuerStateEntry?.testError || null,
  });
  console.log(
    `Auth code issued for client_id=${client_id}${dpop_jkt ? ` (dpop_jkt bound: ${dpop_jkt})` : " (no dpop_jkt)"}`,
  );
  if (issuerState) issuerStateStore.delete(issuerState);

  const redirectURL = new URL(redirect_uri);
  redirectURL.searchParams.set("code", code);

  if (state) redirectURL.searchParams.set("state", state);

  return res.redirect(302, redirectURL.toString());
}
