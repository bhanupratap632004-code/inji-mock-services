# Mock OID4VC Issuer (Express)

A lightweight **mock OpenID for Verifiable Credential Issuer** built with **Node.js + Express**, useful for local development and testing of:

* Credential Offers
* Issuer Metadata
* Authorization Code / Pre-Auth flows
* Token endpoint
* Credential endpoint
* QR-based initiation

---

## 📦 Features

* ✅ OpenID Credential Issuer metadata
* ✅ OAuth Authorization Server metadata
* ✅ Credential Offer endpoint
* ✅ Authorization + Token flow
* ✅ Credential issuance endpoint
* ✅ Support for multiple formats: **LDP-VC, JWT-VC, SD-JWT, and mdoc**
* ✅ HTTPS support (required by wallets)
* ✅ QR endpoint for easy testing

---

## 🚦 One-command PDI flow startup (recommended)

Instead of manually starting the issuer and the OVP backend in separate terminals,
you can start the whole Presentation During Issuance (PDI) demo stack from here with a
single command:

```bash
cd mock-issuer-service
npm install
npm start
```

This runs `scripts/start-all.js`, which:

1. Prompts for the two public tunnel URLs the flow needs (press Enter to keep the
   current value shown):
   * Issuer service (port 4000)
   * OVP verifier backend (port 3000)

   Expose those two local ports over public HTTPS with the tunnel of your choice
   (ngrok, serveo, cloudflared, etc.) *before* answering the prompts, then paste the
   URLs in. The values are written into `src/issuer-profile.js` (`ISSUER`) and
   `../openid4vp-service/constants.js` (`baseUrl`).
2. Starts the OVP verifier backend (`openid4vp-service`, port 3000), which the issuer
   calls during PDI to build the verifier's authorization request.
3. Starts this issuer service itself (port 4000).

The OVP verifier UI (`ovp-client`, port 3001) is only useful for standalone testing of
the verifier and is **not** started by default. Pass `--with-ui` (or set
`START_OVP_UI=true`) to launch it too:

```bash
npm start -- --with-ui
```

All processes' logs are shown together (prefixed `[OVP-BACKEND]`, `[ISSUER]`, and
`[OVP-UI]` when enabled); press `Ctrl+C` once to stop all of them.

To run only the issuer (e.g. if the other services are already running
elsewhere), use `npm run start:issuer-only` instead.

### Configuring the PDI verifier request

The PDI verifier request (spec version, client ID prefix, request mode, signing,
presentation definition / DCQL query) is configured entirely on **this service's own
`/qr` page** - no need to touch the OVP UI or backend:

1. Open `https://mock-issuer.local:4000/qr` and select the **PDI** flow toggle.
2. Use the dropdowns to pick spec version, client ID prefix, request mode, response
   mode, and whether the request should be signed - each change reloads the page and
   applies immediately (no restart needed).
3. Edit the **Presentation Definition** (shown for `draft-23`) or **DCQL Query**
   (shown for `version-1.0`) JSON directly in the textarea, then click **"Apply JSON
   config"**. Invalid JSON is flagged with an error banner and the previous valid
   value keeps being used until you fix it.

All of this is held in `src/as/verifier-config.js` (`verifierConfig`), which the
issuer reads directly when it calls the verifier during `POST
/as/interactive-authorization`. You can also edit that file directly if you prefer.

---

## 🧱 Tech Stack

* Node.js (ESM)
* Express
* HTTPS (self-signed cert)
* No database (fully in-memory)

---

## 🚀 Getting Started

### 1️⃣ Prerequisites

Make sure you have:

* **Node.js ≥ 18**
* **npm** (comes with Node)
* Basic understanding of OAuth / OID4VC (optional but helpful)

Check version:

```bash
node -v
```

---

### 2️⃣ Clone the Repository

```bash
git clone <your-repo-url>
cd mock-issuer
```

---

### 3️⃣ Install Dependencies

```bash
npm install
```

---

### 4️⃣ Generate HTTPS Certificates (Required)

Most wallets **require HTTPS**, even locally. Create a `cert/` directory:

```bash
mkdir cert
```

Generate a self-signed certificate:

```bash
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout cert/server.key \
  -out cert/server.cert \
  -days 365
```

> 💡 When prompted:
>
> * **Common Name** → `mock-issuer.local`

---

### 5️⃣ Add Host Entry (Important)

Map the issuer domain to localhost. Edit `/etc/hosts` (macOS / Linux):

```bash
sudo nano /etc/hosts
```

Add:

```
127.0.0.1 mock-issuer.local
```

---

### 6️⃣ Start the Server

```bash
node index.js
```

You should see:

```text
Mock Issuer running at https://mock-issuer.local:4000
```

---

## 🔌 Available Endpoints

### 🔹 QR Code

```
GET /qr
```

Returns a QR code that initiates the credential flow.

---

### 🔹 Issuer Metadata

```
GET /.well-known/openid-credential-issuer
```

OID4VC Issuer metadata.

---

### 🔹 Authorization Server Metadata

```
GET /as/.well-known/oauth-authorization-server
```

OAuth AS discovery document.

---

### 🔹 Credential Offer

```
GET /credential-offer
```

Returns a credential offer (by value).

---

### 🔹 Authorization Endpoint

```
GET /as/authorize
```

Starts the authorization flow.

---

### 🔹 Login Handler

```
POST /as/login
```

Handles user login during authorization.

---

### 🔹 Interactive Authorization

```
POST /as/interactive-authorization
```

Handles consent / interaction step.

---

### 🔹 Token Endpoint

```
POST /as/token
```

Exchanges auth code / pre-auth code for access token.

---

### 🔹 Credential Endpoint

```
POST /credential
```

Issues the credential.

---

## 🧪 Testing with a Wallet

1. Start the mock issuer
2. Open wallet app (Inji, custom wallet, etc.)
3. Scan QR from:
   ```
   https://mock-issuer.local:4000/qr
   ```
4. Complete auth / consent
5. Receive credential 🎉

---

## ⚠️ Notes & Limitations

* ❌ No persistence (restart = reset)
* ❌ Not production-ready
* ❌ No real authentication
* ✅ Intended only for **local development & demos**

---

## 🧩 Project Structure (Quick Overview)

```
.
├── as/
│   ├── metadata.js
│   ├── authorize.js
│   ├── token.js
│   ├── login.js
│   └── interactive-authorization.js
├── credential/
│   ├── offer.js
│   └── endpoint.js
├── cert/
│   ├── server.key
│   └── server.cert
├── qr.js
├── issuer-metadata.js
├── index.js
└── package.json
```

---

## 🛠 Customization Tips

* Update credential claims in `credential/endpoint.js`
* Modify issuer metadata in `issuer-metadata.js`
* Adjust flows in `as/*` handlers
* Change port or domain in `index.js`

---

## 🌐 Working with ngrok & OpenID4VP Service

### Setting up ngrok tunnels

If you want to test with external wallets or integrate with an OpenID4VP service, you'll need public URLs:

**1. Expose the Issuer (Port 4000)**

```bash
ngrok http 4000
```

Copy the ngrok URL (e.g., `https://abc123.ngrok.io`)

**2. Expose the OpenID4VP Service (Port 3000)**

In a separate terminal:

```bash
ngrok http 3000
```

Copy the ngrok URL (e.g., `https://xyz789.ngrok.io`)

---

### Updating Issuer URLs

Replace this instace of ISSUER `https://mock-issuer.local:4000` with your **port 4000 ngrok URL** in:
```export const ISSUER = "https://e4845fb4e9e7.ngrok-free.app";``` 
in issuer-metadata.js

**Example:**

```javascript
// Before
const ISSUER = 'https://mock-issuer.local:4000';

// After
const ISSUER = 'https://abc123.ngrok.io';
```

---

### Integrating with OpenID4VP Service

If you're running a separate OpenID4VP verifier service on **port 3000**:

**1. Start the VP Service**

```bash
cd /path/to/openid4vp-service
node index.js
```

### Verifier Configuration for PDI Flow

The file `src/as/verifier-config.js` is used by the issuer during the **PDI interactive authorization flow**.

> ℹ️ **Configure it from the `/qr` page**: rather than editing this file by hand, open
> `/qr`, select the **PDI** flow, and use the dropdowns / JSON textareas there - see
> [Configuring the PDI verifier request](#configuring-the-pdi-verifier-request) above.
> Those controls update this same `verifierConfig` object in memory, immediately, with
> no restart required.

When the issuer handles `POST /as/interactive-authorization`, it loads the values from `verifier-config.js`, calls the verifier service, and uses the returned verifier request object as the `openid4vp_request` sent back to the wallet.

This helps you customize verifier behavior for PDI without changing the interactive authorization handler itself.

You can use `verifier-config.js` to control:

* `specVersion`: selects whether the verifier request is built for `draft-23` or `version-1.0`
* `responseMode`: controls how the verifier expects the presentation response
* `clientIdPrefix`: selects the verifier client ID prefix such as `did` (draft-23), `decentralized_identifier` (version-1.0), `redirect_uri`, or `pre-registered`
* `requestMode`: switches between `by_value` and `by_reference`
* `verifierBaseUrl`: points the issuer to the verifier service instance to call (issuer-local; can also be set via the `VERIFIER_BASE_URL` environment variable)
* `signedRequest`: enables or disables signed verifier requests
* `presentationDefinition`: used when the selected spec version is `draft-23`
* `dcqlQuery`: used when the selected spec version is `version-1.0`

In practice, this means you can change the verifier requirements for a PDI run by editing one config file before starting the flow. For example, you can switch from presentation-definition based requests to DCQL-based requests, change the verifier endpoint, or test signed versus unsigned requests.

**Example:**

* Set `specVersion` to `draft-23` and update `presentationDefinition` to test a presentation-definition based verifier request.
* Set `specVersion` to `version-1.0` and update `dcqlQuery` to test a DCQL-based verifier request.
* Change `verifierBaseUrl` when your verifier is exposed through ngrok or another public tunnel.

**3. Link Services**

To make changes in the VP service reflect in the issuer:

* Update the issuer's credential format to match VP requirements
* Ensure both services use compatible DID methods
* Configure the issuer to reference VP service endpoints in [interactive-authorization.js](src/as/interactive-authorization.js)(e.g., for presentation definitions)

**Example Integration:**

```javascript
// Reference VP service for additional flows
const presentationDefinition = await fetch(`${VP_SERVICE_URL}/presentation-definition`);
```

---

### 🔄 Quick Sync Checklist

When making changes across both services:

- [ ] Update ngrok URLs in both services after restart
- [ ] Ensure credential formats match between issuer and verifier
- [ ] Verify DID methods are compatible
- [ ] Test the complete flow: offer → present & authorize → verify -> download

---

## 🔐 DPoP Testing (RFC 9449)

The mock issuer now supports **DPoP sender-constrained access tokens**. When the wallet sends a `DPoP` header on the token request, the server validates the proof and issues a `token_type: DPoP` token. The credential endpoint then validates the access-token-bound DPoP proof on every credential request.

### How it works

```
Wallet                          Mock Issuer
  │                                 │
  │── POST /as/token ───────────────▶
  │   DPoP: <proof JWT>             │  validates proof (htm, htu, iat, jti)
  │◀─ 200 { token_type:"DPoP" } ───│  stores JWK thumbprint with token
  │   DPoP-Nonce: <nonce>           │
  │                                 │
  │── POST /credential ─────────────▶
  │   Authorization: DPoP <token>   │  validates ath-bound proof
  │   DPoP: <proof JWT w/ ath>      │  (ath = SHA-256 of access token)
  │◀─ 200 { credential: … } ───────│
```

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `USE_DPOP_NONCE` | `false` | When `true`, the AS returns `400 use_dpop_nonce` on the first token request, forcing the wallet to retry with a server-issued nonce. Use this to test the nonce-retry flow. |

### Starting the server for DPoP testing

**Happy path (no nonce required):**
```bash
npm start
# or
node src/server.js
```

**Nonce-retry flow:**
```bash
USE_DPOP_NONCE=true node src/server.js
```

### QA test scenarios (release-build wallet)

These run end-to-end against a **released wallet build** — no wallet code changes or
hand-crafted requests. QA only controls the **issuer side** (the `USE_DPOP_NONCE` env
var and which wallet release is used) and confirms results from the issuer console
logs and the wallet's success/error screen.

| # | Scenario | How to trigger | Expected result |
|---|---|---|---|
| **TC-01** | DPoP happy path | Start the server normally and complete issuance from the wallet | Credential issued; issuer log shows `token_type: DPoP` |
| **TC-02** | Nonce-retry flow | Start with `USE_DPOP_NONCE=true`, then complete issuance from the wallet | Wallet gets `400 use_dpop_nonce` + `DPoP-Nonce` on the first token request, auto-retries with the nonce, and issuance still succeeds |
| **TC-03** | Backward compatibility | Use a pre-DPoP wallet release (sends no `DPoP` header) | Issuer log shows `token_type: Bearer`; credential still issued |
| **TC-04** | Plain-HTTP issuer | Point the wallet at an `http://` issuer URL | Wallet's HTTPS check rejects it client-side before any request is sent |

---



MIT