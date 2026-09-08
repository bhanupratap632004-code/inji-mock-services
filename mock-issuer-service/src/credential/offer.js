import crypto from "crypto";
import { resolveIssuanceOptions } from "../issuance-options.js";
import { authServerBaseUrl, issuerBaseUrl } from "../issuer-profile.js";
import { issuerStateStore, preAuthCodeStore, stageTestErrorStore } from "../as/authz-store.js";
import { envTestError, resolveTestError } from "../test-errors.js";

export default function credentialOfferHandler(req, res) {
  const options = resolveIssuanceOptions(req.query);
  const flow = options.flow === "pdi" ? "pdi" : null;
  const issuer = issuerBaseUrl(options.version, true, flow);
  const authServer = authServerBaseUrl(
    options.version,
    true,
    flow,
  );

  // random issuer_state for this issuance session
  const issuerState = crypto.randomBytes(8).toString("hex");
  const testError = envTestError("offer") || resolveTestError(req.query);
  if (testError?.stage === "offer") {
    if (testError.code === "credential_offer_fetch_failed") {
      return res.status(testError.status).json({
        error: testError.responseCode,
        error_description: testError.description,
      });
    }

    if (testError.code === "invalid_credential_offer") {
      return res.json({
        issuer_state: issuerState,
        grants: {},
      });
    }

    if (testError.code === "unsupported_grant") {
      return res.json({
        credential_issuer: issuer,
        issuer_state: issuerState,
        credential_configuration_ids: [options.credentialDetails.configurationId],
        grants: {
          "urn:example:unsupported-grant": {
            issuer_state: issuerState,
          },
        },
      });
    }
  }

  if (testError) {
    issuerStateStore.set(issuerState, { testError });
    stageTestErrorStore.set(testError.stage, testError);
  }

  let grantResponse = {};

  if (options.flow === "pdi") {
    grantResponse = {
      authorization_code: {
        issuer_state: issuerState,
        authorization_server: authServer,
      },
      interaction_required: {
        mode: "presentation_during_issuance",
        endpoint: `${authServer}/interactive-authorization`,
      },
    };
  } else if (options.flow === "pre-auth" || options.flow === "pre-auth-tx") {
    const preAuthorizedCode = crypto.randomBytes(16).toString("hex");
    let txCode = null;
    
    const grant = {
      "pre-authorized_code": preAuthorizedCode,
    };

    if (options.flow === "pre-auth-tx") {
      // Use the tx_code passed from the UI/Console
      txCode = req.query.tx_code || "0000"; 
      grant.tx_code = {
        length: txCode.length,
        input_mode: "numeric",
        description: "Please enter the PIN displayed on the issuer console"
      };
    }

    preAuthCodeStore.set(preAuthorizedCode, {
      txCode,
      configurationId: options.credentialDetails.configurationId,
      scope: options.credentialDetails.scope,
      testError,
    });

    grantResponse = {
      "urn:ietf:params:oauth:grant-type:pre-authorized_code": grant
    };
  } else {
    grantResponse = {
      authorization_code: {
        issuer_state: issuerState,
      },
    };
  }

  const response = {
    credential_issuer: issuer,
    issuer_state: issuerState,
    credential_configuration_ids: [options.credentialDetails.configurationId],
    grants: grantResponse,
  };

  return res.json(response);
}
