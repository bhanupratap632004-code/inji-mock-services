import { TEST_ERROR_STAGES } from "./test-errors.js";

const FLOW_OPTIONS = new Set(["normal", "pdi", "pre-auth", "pre-auth-tx"]);
const VERSION_OPTIONS = new Set(["v1", "draft13"]);
const CREDENTIAL_OPTIONS = new Set(["farmer", "employee", "sd-jwt", "mdoc"]);

export const SPEC_VERSION_OPTIONS = new Set(["draft-23", "version-1.0"])
export const RESPONSE_MODE_OPTIONS = new Set(["iar-post", "iar-post.jwt", "iae_post", "iae_post.jwt"]);
export const CLIENT_ID_PREFIX_OPTIONS = new Set(["did", "decentralized_identifier", "redirect_uri", "pre-registered"])
export const REQUEST_MODE_OPTIONS = new Set(["by_reference", "by_value"]);
export const SIGNED_REQUEST_OPTIONS = new Set([true, false]);

export const DEFAULT_ISSUANCE_OPTIONS = Object.freeze({
  flow: "normal",
  version: "v1",
  credential: "farmer",
});

const CREDENTIAL_MAP = {
  farmer: {
    configurationId: "FarmerCredential",
    format: "ldp_vc",
    label: "Farmer Credential",
    scope: "degree.read",
    description: "LDP VC payload backed by the mock farmer dataset.",
  },
  employee: {
    configurationId: "JwtVerifiableCredential",
    format: "jwt_vc_json",
    label: "Employee Credential",
    scope: "jwt_vc_json.read",
    description: "JWT VC payload backed by the mock employee dataset.",
  },
  "sd-jwt": {
    configurationId: "SdJwtVerifiableCredential",
    format: "vc+sd-jwt",
    label: "SD-JWT Employee",
    scope: "sd_jwt_vc.read",
    description: "Selective Disclosure JWT VC for Employee.",
  },
  mdoc: {
    configurationId: "MdocVerifiableCredential",
    format: "mso_mdoc",
    label: "Mobile Driving License",
    scope: "mdoc.read",
    description: "ISO 18013-5 Mobile Driving License (mDL) as mdoc.",
  },
};

export function resolveIssuanceOptions(query = {}) {
  const flow = FLOW_OPTIONS.has(query.flow) ? query.flow : DEFAULT_ISSUANCE_OPTIONS.flow;
  const version = VERSION_OPTIONS.has(query.version)
    ? query.version
    : DEFAULT_ISSUANCE_OPTIONS.version;
  const credential = CREDENTIAL_OPTIONS.has(query.credential)
    ? query.credential
    : DEFAULT_ISSUANCE_OPTIONS.credential;
  const responseMode = RESPONSE_MODE_OPTIONS.has(query.responseMode)
    ? query.responseMode
    : "iar-post";
  const clientIdPrefix = CLIENT_ID_PREFIX_OPTIONS.has(query.clientIdPrefix) ? query.clientIdPrefix : "did"
  const specVersion = SPEC_VERSION_OPTIONS.has(query.specVersion) ? query.specVersion : "draft-23"
  const requestMode = REQUEST_MODE_OPTIONS.has(query.requestMode) ? query.requestMode : "by_reference"
  const signedRequest = query.signedRequest ? query.signedRequest === "true" : true
  const hasTestErrorCode = Object.prototype.hasOwnProperty.call(query, "test_error_code");

  return {
    flow,
    version,
    credential,
    credentialDetails: CREDENTIAL_MAP[credential],
    responseMode,
    clientIdPrefix,
    specVersion,
    requestMode,
    signedRequest,
    testErrorStage: TEST_ERROR_STAGES.has(query.test_error_stage)
      ? query.test_error_stage
      : null,
    testErrorCode: hasTestErrorCode ? query.test_error_code : null,
    testErrorStatus: query.test_error_status || null,
    testErrorDescription: query.test_error_description || null,
  };
}

export function buildOfferUrl(issuer, options) {
  const params = new URLSearchParams({
    flow: options.flow,
    version: options.version,
    credential: options.credential,
  });
  if (options.testErrorStage) params.set("test_error_stage", options.testErrorStage);
  if (options.testErrorCode !== null) params.set("test_error_code", options.testErrorCode);
  if (options.testErrorStatus) params.set("test_error_status", options.testErrorStatus);
  if (options.testErrorDescription) {
    params.set("test_error_description", options.testErrorDescription);
  }

  return `${issuer}/credential-offer?${params.toString()}`;
}
