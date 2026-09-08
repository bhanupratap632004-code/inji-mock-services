import { authServerBaseUrl, hasExplicitVersion, resolveRequestVersion } from "../issuer-profile.js";

// Set MOCK_AS_PAR_ENABLED=false to advertise an AS without PAR, which exercises the
// wallet's fallback to a standard authorization request.
const PAR_ENABLED = (process.env.MOCK_AS_PAR_ENABLED ?? "true").toLowerCase() !== "false";
// Set MOCK_AS_PAR_REQUIRED=true to advertise require_pushed_authorization_requests,
// which makes PAR mandatory (RFC 9126 §5) - the wallet must not fall back.
const PAR_REQUIRED = (process.env.MOCK_AS_PAR_REQUIRED ?? "false").toLowerCase() === "true";

export default function authServerMetadata(req, res) {
  const version = resolveRequestVersion(req);
  const flow = req.params?.flow === "pdi" ? "pdi" : null;
  const asIssuer = authServerBaseUrl(version, hasExplicitVersion(req), flow);

  const response = {
    // The "issuer" of this Authorization Server
    issuer: asIssuer,

    // Where the wallet will send the user for interactive authorization
    authorization_endpoint: `${asIssuer}/authorize`,

    // Where the wallet will later exchange the code for tokens
    token_endpoint: `${asIssuer}/token`,

    // For our simple IAR flow we just support the classic OAuth code flow
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],

    // We want wallets to use PKCE S256
    code_challenge_methods_supported: ["S256"],

    // Nice to have: helps debuggers & wallet UIs
    scopes_supported: ["degree.read", "jwt_vc_json.read", "openid"],
    token_endpoint_auth_methods_supported: ["none"],

    // DPoP sender-constrained tokens (RFC 9449)
    // Priority order matches the VCI client library: EdDSA → ES256K → ES256/ES384/ES512 → RS256
    dpop_signing_alg_values_supported: ["EdDSA", "ES256K", "ES256", "ES384", "ES512", "RS256"],

    // For OpenID4VCI, authorization_details will be used
    authorization_details_types_supported: ["openid_credential"]
  };

  if (flow === "pdi") {
    response.interactive_authorization_endpoint = `${asIssuer}/interactive-authorization`;
  }

  // Pushed Authorization Requests (RFC 9126)
  if (PAR_ENABLED) {
    response.pushed_authorization_request_endpoint = `${asIssuer}/par`;
  }
  // Advertised independently of the endpoint so the "PAR is mandatory but none is offered"
  // case can be exercised - a client must error there rather than fall back.
  if (PAR_REQUIRED) {
    response.require_pushed_authorization_requests = true;
  }

  res.json(response);
}
