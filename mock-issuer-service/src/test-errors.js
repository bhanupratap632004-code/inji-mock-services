export const TEST_ERROR_STAGES = new Set(["offer", "par", "authorization", "token", "credential"]);

// Error codes are free-form: any code is accepted for a valid stage. The maps below
// supply a sensible HTTP status (DEFAULT_STATUS) and error_description
// (DEFAULT_DESCRIPTIONS) for the common OAuth/OID4VCI codes; an unknown code still
// works and defaults to HTTP 400 with a generic description.
const DEFAULT_DESCRIPTIONS = {
  invalid_request: "Mock issuer test error: invalid request.",
  invalid_client: "Mock issuer test error: invalid client.",
  invalid_grant: "Mock issuer test error: invalid or expired grant.",
  unauthorized_client: "Mock issuer test error: unauthorized client.",
  access_denied: "Mock issuer test error: access denied.",
  unsupported_response_type: "Mock issuer test error: unsupported response type.",
  unsupported_grant_type: "Mock issuer test error: unsupported grant type.",
  invalid_scope: "Mock issuer test error: invalid scope.",
  server_error: "Mock issuer test error: authorization server error.",
  temporarily_unavailable: "Mock issuer test error: authorization server temporarily unavailable.",
  authorization_pending: "Mock issuer test error: authorization pending.",
  slow_down: "Mock issuer test error: slow down polling.",
  invalid_request_bearer: "Mock issuer test error: invalid bearer request.",
  invalid_token: "Mock issuer test error: invalid access token.",
  invalid_credential_request: "Mock issuer test error: invalid credential request.",
  unsupported_credential_type: "Mock issuer test error: unsupported credential type.",
  unsupported_credential_format: "Mock issuer test error: unsupported credential format.",
  invalid_proof: "Mock issuer test error: invalid proof.",
  invalid_encryption_parameters: "Mock issuer test error: invalid encryption parameters.",
  insufficient_scope: "Mock issuer test error: insufficient scope.",
  invalid_credential_offer: "Mock issuer test error: invalid credential offer.",
  credential_offer_fetch_failed: "Mock issuer test error: credential offer fetch failed.",
  unsupported_grant: "Mock issuer test error: unsupported grant.",
};

const DEFAULT_STATUS = {
  credential_offer_fetch_failed: 500,
  invalid_token: 401,
  insufficient_scope: 403,
};

function parseStatus(value, fallback) {
  const status = Number(value);
  return Number.isInteger(status) && status >= 400 && status <= 599
    ? status
    : fallback;
}

function readParam(source, primary, fallback) {
  if (Object.prototype.hasOwnProperty.call(source, primary)) return source[primary];
  if (Object.prototype.hasOwnProperty.call(source, fallback)) return source[fallback];
  return undefined;
}

export function resolveTestError(source = {}) {
  const stage = readParam(source, "test_error_stage", "error_stage");
  const code = readParam(source, "test_error_code", "error_code");

  if (!TEST_ERROR_STAGES.has(stage) || code === undefined) {
    return null;
  }

  return {
    stage,
    code,
    responseCode: code === "invalid_request_bearer" ? "invalid_request" : code,
    status: parseStatus(
      source.test_error_status || source.error_status,
      DEFAULT_STATUS[code] || 400,
    ),
    description:
      source.test_error_description ||
      source.error_description ||
      DEFAULT_DESCRIPTIONS[code] ||
      `Mock issuer test error: ${code || "empty error code"}.`,
  };
}

export function envTestError(stage) {
  const testError = resolveTestError({
    test_error_stage: process.env.TEST_ERROR_STAGE,
    test_error_code: process.env.TEST_ERROR_CODE,
    test_error_status: process.env.TEST_ERROR_STATUS,
    test_error_description: process.env.TEST_ERROR_DESCRIPTION,
  });

  return testError?.stage === stage ? testError : null;
}

export function sendTestError(res, testError) {
  if (!testError) return false;

  res.status(testError.status).json({
    error: testError.responseCode,
    error_description: testError.description,
  });
  return true;
}
