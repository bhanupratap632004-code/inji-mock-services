import QRCode from "qrcode";
import { ISSUER } from "./issuer-metadata.js";
import { buildOfferUrl, resolveIssuanceOptions, RESPONSE_MODE_OPTIONS, SPEC_VERSION_OPTIONS, CLIENT_ID_PREFIX_OPTIONS, REQUEST_MODE_OPTIONS, SIGNED_REQUEST_OPTIONS } from "./issuance-options.js";
import { verifierConfig } from "./as/verifier-config.js";

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildQrPayload(options, pin = null) {
  let offerUri = buildOfferUrl(ISSUER, options);
  if (pin) {
    const url = new URL(offerUri);
    url.searchParams.set("tx_code", pin);
    offerUri = url.toString();
  }

  return {
    offerUri,
    qrData:
      "openid-credential-offer://?credential_offer_uri=" +
      encodeURIComponent(offerUri),
  };
}

function optionButton(name, value, currentValue, label, hint) {
  const checked = value === currentValue ? "checked" : "";

  return `
    <label class="toggle-option">
      <input type="radio" name="${escapeHtml(name)}" value="${escapeHtml(value)}" ${checked} />
      <span>${escapeHtml(label)}</span>
      <small>${escapeHtml(hint)}</small>
    </label>
  `;
}

function updateClientIdPrefixes(specVersion) {
  let data
  if(specVersion === "version-1.0") {
    data = [...CLIENT_ID_PREFIX_OPTIONS].filter(data => data!="did")
  } else {
    data = [...CLIENT_ID_PREFIX_OPTIONS].filter(data => data!="decentralized_identifier")
  }
  return Array.from(data).map(name => ({ name }))
}

const responseModes = Array.from(RESPONSE_MODE_OPTIONS).map(name => ({ name }))
const specVersionOptions = Array.from(SPEC_VERSION_OPTIONS).map(name => ({ name }))
const requestModeOptions = Array.from(REQUEST_MODE_OPTIONS).map(name => ({ name }))
const signedRequestOptions = Array.from(SIGNED_REQUEST_OPTIONS).map(val => ({ name: String(val) }))

function dropDown(name, options, currentValue, hint = "Option") {
  return `
    <div class="select-field">
      <small>${hint}</small>
      <select name="${name}" id="${name}">
        ${options.map(option => `
          <option
            value="${option.name}"
            ${option.name === currentValue ? "selected" : ""}
          >
            ${option.name}
          </option>
        `).join("")}
      </select>
    </div>
  `;
}

function renderPage(options, pin = null, configError = null, jsonFieldText = {}) {
  const { offerUri, qrData } = buildQrPayload(options, pin);
  const presentationDefinitionText = jsonFieldText.presentationDefinition
    ?? JSON.stringify(verifierConfig.presentationDefinition, null, 2);
  const dcqlQueryText = jsonFieldText.dcqlQuery
    ?? JSON.stringify(verifierConfig.dcqlQuery, null, 2);

  const queryParams = new URLSearchParams({
    flow: options.flow,
    version: options.version,
    credential: options.credential
  });
  if (options.testErrorStage) queryParams.set("test_error_stage", options.testErrorStage);
  if (options.testErrorCode !== null) {
    queryParams.set("test_error_code", options.testErrorCode);
  }
  if (options.testErrorStatus) queryParams.set("test_error_status", options.testErrorStatus);
  if (options.testErrorDescription) {
    queryParams.set("test_error_description", options.testErrorDescription);
  }
  if (pin) queryParams.set("tx_code", pin);

  const qrImageUrl = `/qr/image?${queryParams.toString()}`;
  const offerPreviewUrl = `/credential-offer?${queryParams.toString()}`;

  const flowLabels = {
    normal: "Normal (Auth Code)",
    pdi: "PDI (Presentation)",
    "pre-auth": "Pre-Auth",
    "pre-auth-tx": "Pre-Auth + TX Code"
  };
  const flowLabel = flowLabels[options.flow] || options.flow;
  const versionLabel = options.version === "draft13" ? "Draft 13" : "V1";

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Mock Issuer Console</title>
    <style>
      :root {
        color-scheme: light;
        --page-bg: #f4f7f5;
        --surface: #ffffff;
        --surface-muted: #ebf1ec;
        --text: #15231b;
        --text-muted: #537161;
        --border: #c8d6cc;
        --accent: #176b52;
        --accent-strong: #0f4f3d;
        --accent-soft: #d8ece4;
        --highlight: #d29a26;
      }

      * { box-sizing: border-box; }

      body {
        margin: 0;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: linear-gradient(180deg, #eff5f1 0%, var(--page-bg) 100%);
        color: var(--text);
      }

      main {
        max-width: 1160px;
        margin: 0 auto;
        padding: 32px 20px 40px;
      }

      .hero {
        display: grid;
        grid-template-columns: minmax(0, 1.1fr) minmax(320px, 420px);
        gap: 24px;
        align-items: start;
      }

      .hero-main {
        display: grid;
        gap: 24px;
        align-content: start;
      }

      .intro {
        padding: 8px 0 0;
      }

      h1 {
        margin: 0 0 12px;
        font-size: clamp(32px, 5vw, 54px);
        line-height: 1.02;
      }

      .intro p {
        max-width: 58ch;
        margin: 0;
        color: var(--text-muted);
        font-size: 17px;
        line-height: 1.6;
      }

      .summary-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 12px;
        margin-top: 28px;
      }

      .summary-item {
        padding: 14px;
        border: 1px solid var(--border);
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.82);
      }

      .summary-item strong,
      .panel h2,
      .preview h2 {
        display: block;
        font-size: 13px;
        text-transform: uppercase;
        letter-spacing: 0;
        color: var(--text-muted);
        margin-bottom: 8px;
      }

      .summary-item span {
        display: block;
        font-size: 18px;
        font-weight: 700;
      }

      .panel,
      .preview {
        border: 1px solid var(--border);
        border-radius: 8px;
        background: var(--surface);
      }

      .panel {
        padding: 24px;
      }

      .control-group + .control-group {
        margin-top: 24px;
      }

      .control-group p {
        margin: 0 0 12px;
        color: var(--text-muted);
        line-height: 1.5;
      }

      .toggle-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }

      .toggle-option {
        display: block;
        padding: 14px;
        border: 1px solid var(--border);
        border-radius: 8px;
        background: var(--surface-muted);
        cursor: pointer;
      }

      .toggle-option input {
        position: absolute;
        opacity: 0;
        pointer-events: none;
      }

      .toggle-option span {
        display: block;
        font-size: 16px;
        font-weight: 700;
      }

      .toggle-option small {
        display: block;
        margin-top: 6px;
        color: var(--text-muted);
        line-height: 1.5;
      }

      .toggle-option:has(input:checked) {
        border-color: var(--accent);
        background: var(--accent-soft);
        box-shadow: inset 0 0 0 1px var(--accent);
      }

      .toggle-option:has(input:focus-visible) {
        outline: 2px solid rgba(23, 107, 82, 0.28);
        outline-offset: 2px;
      }

      .preview {
        padding: 24px;
      }

      .qr-shell {
        display: grid;
        justify-items: center;
        gap: 18px;
        padding: 22px;
        border: 1px solid var(--border);
        border-radius: 8px;
        background: linear-gradient(180deg, #ffffff 0%, #f4f8f5 100%);
      }

      .qr-shell img {
        width: min(100%, 320px);
        height: auto;
        border-radius: 8px;
        background: #fff;
      }

      .callout {
        margin: 0;
        color: var(--text-muted);
        text-align: center;
        line-height: 1.5;
      }

      .meta-list {
        margin: 18px 0 0;
        padding: 0;
        list-style: none;
        display: grid;
        gap: 12px;
      }

      .meta-list li {
        padding: 12px 0;
        border-top: 1px solid var(--border);
      }

      .meta-list li:first-child {
        border-top: 0;
        padding-top: 0;
      }

      .meta-list strong {
        display: block;
        margin-bottom: 6px;
        font-size: 13px;
        text-transform: uppercase;
        letter-spacing: 0;
        color: var(--text-muted);
      }

      code {
        display: block;
        white-space: pre-wrap;
        word-break: break-word;
        padding: 10px 12px;
        border-radius: 8px;
        background: #10251d;
        color: #effbf4;
        font-size: 12px;
        line-height: 1.55;
      }

      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 20px;
      }

      .button-link {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 42px;
        padding: 0 14px;
        border: 1px solid var(--accent);
        border-radius: 8px;
        text-decoration: none;
        font-weight: 700;
        color: var(--accent-strong);
        background: white;
      }

      .button-link.primary {
        background: var(--accent);
        color: white;
      }

      .footer-note {
        margin-top: 20px;
        color: var(--text-muted);
        font-size: 14px;
        line-height: 1.6;
      }

      @media (max-width: 920px) {
        .hero,
        .workspace {
          grid-template-columns: 1fr;
        }

        .summary-grid,
        .toggle-grid {
          grid-template-columns: 1fr;
        }
      }

      .dropdown-group {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: 20px;
      }

      .select-field {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .select-field label {
        font-size: 14px;
        font-weight: 700;
        color: var(--text);
      }

      .select-field small {
        color: var(--text-muted);
        font-size: 13px;
        line-height: 1.4;
      }

      .select-field select {
        width: 100%;
        padding: 10px 14px;
        font: inherit;
        color: var(--text);
        background: var(--surface-muted);
        border: 1px solid var(--border);
        border-radius: 8px;
        outline: none;
        transition: border-color .2s, box-shadow .2s, background .2s;
        cursor: pointer;
      }

      .select-field select:hover {
        border-color: var(--accent);
      }

      .select-field select:focus {
        border-color: var(--accent);
        background: #fff;
        box-shadow: 0 0 0 3px rgba(23, 107, 82, 0.15);
      }

      .json-field {
        display: flex;
        flex-direction: column;
        gap: 6px;
        margin-top: 14px;
      }

      .json-field label {
        font-size: 14px;
        font-weight: 700;
        color: var(--text);
      }

      .json-field small {
        color: var(--text-muted);
        font-size: 13px;
        line-height: 1.4;
      }

      .json-field textarea {
        width: 100%;
        min-height: 160px;
        padding: 10px 14px;
        font: 13px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
        color: var(--text);
        background: var(--surface-muted);
        border: 1px solid var(--border);
        border-radius: 8px;
        outline: none;
        resize: vertical;
        transition: border-color .2s, box-shadow .2s, background .2s;
      }

      .json-field textarea:focus {
        border-color: var(--accent);
        background: #fff;
        box-shadow: 0 0 0 3px rgba(23, 107, 82, 0.15);
      }

      .json-apply-button {
        align-self: flex-start;
        margin-top: 4px;
        padding: 8px 16px;
        font: inherit;
        font-weight: 600;
        font-size: 13px;
        color: #fff;
        background: var(--accent);
        border: none;
        border-radius: 8px;
        cursor: pointer;
      }

      .json-apply-button:hover {
        background: var(--accent-strong);
      }

      .config-error-banner {
        margin-top: 12px;
        padding: 10px 14px;
        border-radius: 8px;
        background: #fdecea;
        border: 1px solid #f2b8b5;
        color: #7a2019;
        font-size: 13px;
      }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <div class="hero-main">
          <div class="intro">
            <h1>Build the exact QR experience you want to test.</h1>
            <p>Switch flow, version, and credential type, then scan.</p>
            <div class="summary-grid">
              <div class="summary-item">
                <strong>Auth flow</strong>
                <span>${escapeHtml(flowLabel)}</span>
              </div>
              <div class="summary-item">
                <strong>Issuer profile</strong>
                <span>${escapeHtml(versionLabel)}</span>
              </div>
              <div class="summary-item">
                <strong>Credential</strong>
                <span>${escapeHtml(options.credentialDetails.label)}</span>
              </div>
            </div>
          </div>

          <form class="panel" id="issuer-controls">
            <div class="control-group">
              <h2>Authorization flow</h2>
              <div class="toggle-grid">
                ${optionButton("flow", "normal", options.flow, "Normal", "Auth Code flow")}
                ${optionButton("flow", "pre-auth", options.flow, "Pre-Auth", "Pre-Authorized Code flow")}
                ${optionButton("flow", "pre-auth-tx", options.flow, "Pre-Auth + TX", "Pre-Auth with 4-digit PIN")}
                ${optionButton("flow", "pdi", options.flow, "PDI", "Presentation during issuance")}
              </div>
            </div>

            ${options.flow === "pdi" ? `
              <div class="control-group">
                <h2>OpenID4VP Request Config</h2>
                <div class="dropdown-group">
                  ${dropDown(
                    "specVersion",
                    specVersionOptions,
                    options.specVersion,
                    "VP request spec version"
                  )}
                  ${dropDown(
                    "responseMode",
                    responseModes,
                    options.responseMode,
                    "Response mode"
                  )}
                  ${dropDown(
                    "clientIdPrefix",
                    updateClientIdPrefixes(options.specVersion),
                    options.clientIdPrefix,
                    "VP request Client ID Scheme"
                  )}
                  ${dropDown(
                    "requestMode",
                    requestModeOptions,
                    options.requestMode,
                    "VP Request Mode"
                  )}
                  ${dropDown(
                    "signedRequest",
                    signedRequestOptions,
                    options.signedRequest ? "true" : "false",
                    "Should the VP request be signed?"
                  )}
                </div>

                ${configError ? `<div class="config-error-banner">${escapeHtml(configError)}</div>` : ""}

                ${options.specVersion === "draft-23" ? `
                  <div class="json-field">
                    <label for="presentationDefinition">Presentation Definition (used for draft-23)</label>
                    <small>Edited here, this is what the issuer sends to the verifier as \`presentation_definition\` for every PDI request.</small>
                    <textarea name="presentationDefinition" id="presentationDefinition">${escapeHtml(presentationDefinitionText)}</textarea>
                  </div>
                ` : `
                  <div class="json-field">
                    <label for="dcqlQuery">DCQL Query (used for version-1.0)</label>
                    <small>Edited here, this is what the issuer sends to the verifier as \`dcql_query\` for every PDI request.</small>
                    <textarea name="dcqlQuery" id="dcqlQuery">${escapeHtml(dcqlQueryText)}</textarea>
                  </div>
                `}
                <button type="button" id="apply-json-config" class="json-apply-button">Apply JSON config</button>
              </div>
            `
            : ""}

            <div class="control-group">
              <h2>Spec version</h2>
              <div class="toggle-grid">
                ${optionButton("version", "v1", options.version, "V1", "Final issuer profile")}
                ${optionButton("version", "draft13", options.version, "Draft 13", "Legacy issuer profile")}
              </div>
            </div>

            <div class="control-group">
              <h2>Credential type</h2>
              <div class="toggle-grid">
                ${optionButton("credential", "farmer", options.credential, "Farmer credential", "LDP VC")}
                ${optionButton("credential", "employee", options.credential, "Employee credential", "JWT VC")}
                ${optionButton("credential", "sd-jwt", options.credential, "SD-JWT Employee", "Selective Disclosure")}
                ${optionButton("credential", "mdoc", options.credential, "Mobile DL", "ISO 18013-5 mdoc")}
              </div>
            </div>
          </form>
        </div>

        <aside class="preview">
          <h2>Live QR</h2>
          <div class="qr-shell">
            <img src="${escapeHtml(qrImageUrl)}" alt="Credential offer QR code" />
            <p class="callout">Scan this from a wallet. Every toggle updates the encoded credential offer URI.</p>
          </div>
          <ul class="meta-list">
            ${pin ? `
            <li>
              <strong style="color: var(--highlight);">Transaction PIN (TX Code)</strong>
              <code style="font-size: 24px; text-align: center; letter-spacing: 4px;">${escapeHtml(pin)}</code>
              <small style="display: block; margin-top: 8px; color: var(--text-muted);">This PIN is delivered out-of-band. Enter this in your wallet when prompted.</small>
            </li>
            ` : ""}
            <li>
              <strong>Offer URI</strong>
              <code>${escapeHtml(offerUri)}</code>
            </li>
            <li>
              <strong>Credential profile</strong>
              <code>${escapeHtml(options.credentialDetails.configurationId)} | ${escapeHtml(options.credentialDetails.format)}</code>
            </li>
          </ul>
          <div class="actions">
            <a class="button-link primary" href="${escapeHtml(qrData)}">Open in Wallet</a>
            <a class="button-link" href="${escapeHtml(qrImageUrl)}" target="_blank" rel="noreferrer">Open Raw QR</a>
            <a class="button-link" href="${escapeHtml(offerPreviewUrl)}" target="_blank" rel="noreferrer">Open Offer JSON</a>
          </div>
          <p class="footer-note">PDI mode keeps the authorization code grant but also advertises the interactive authorization endpoint for presentation-driven testing.</p>
        </aside>
      </section>
    </main>

    <script>
      const form = document.getElementById("issuer-controls");
      form.addEventListener("change", (event) => {
        if (event.target.tagName === "TEXTAREA") return; // textareas use the Apply button below instead
        const data = new FormData(form);
        const params = new URLSearchParams(data);
        window.location.search = params.toString();
      });

      const applyJsonButton = document.getElementById("apply-json-config");
      if (applyJsonButton) {
        applyJsonButton.addEventListener("click", () => {
          const data = new FormData(form);
          const params = new URLSearchParams(data);
          window.location.search = params.toString();
        });
      }
    </script>
  </body>
</html>`;
}

export async function qrImageHandler(req, res) {
  const options = resolveIssuanceOptions(req.query);
  const pin = req.query.tx_code;
  const { qrData } = buildQrPayload(options, pin);

  try {
    const png = await QRCode.toBuffer(qrData, {
      type: "png",
      width: 400,
      errorCorrectionLevel: "M",
    });

    res.setHeader("Content-Type", "image/png");
    res.send(png);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "QR generation failed" });
  }
}

export default async function qrPageHandler(req, res) {
  const options = resolveIssuanceOptions(req.query);
  let pin = req.query.tx_code;
  let configError = null;
  const jsonFieldText = {};

  if (options.flow === "pdi") {
    verifierConfig.specVersion = options.specVersion;
    verifierConfig.responseMode = options.responseMode;
    verifierConfig.clientIdPrefix = options.clientIdPrefix;
    verifierConfig.requestMode = options.requestMode;
    verifierConfig.signedRequest = options.signedRequest;

    if (typeof req.query.presentationDefinition === "string" && req.query.presentationDefinition.trim()) {
      jsonFieldText.presentationDefinition = req.query.presentationDefinition;
      try {
        verifierConfig.presentationDefinition = JSON.parse(req.query.presentationDefinition);
      } catch (err) {
        configError = `Invalid JSON in Presentation Definition: ${err.message}. Previous value is still in use - fix and click "Apply JSON config" again.`;
      }
    }

    if (typeof req.query.dcqlQuery === "string" && req.query.dcqlQuery.trim()) {
      jsonFieldText.dcqlQuery = req.query.dcqlQuery;
      try {
        verifierConfig.dcqlQuery = JSON.parse(req.query.dcqlQuery);
      } catch (err) {
        configError = `Invalid JSON in DCQL Query: ${err.message}. Previous value is still in use - fix and click "Apply JSON config" again.`;
      }
    }
  }

  if (options.flow === "pre-auth-tx" && !pin) {
    pin = Math.floor(1000 + Math.random() * 9000).toString();
    const params = new URLSearchParams(req.query);
    params.set("tx_code", pin);
    return res.redirect(`/qr?${params.toString()}`);
  } else if (options.flow !== "pre-auth-tx" && pin) {
    const params = new URLSearchParams(req.query);
    params.delete("tx_code");
    return res.redirect(`/qr?${params.toString()}`);
  }

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(renderPage(options, pin, configError, jsonFieldText));
}
