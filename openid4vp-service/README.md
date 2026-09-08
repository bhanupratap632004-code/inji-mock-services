# openid4vp-service

**Description**: 

This is a mock service which mocks openid4vp backend to generate a QR code with Verifiable Presentation request and receive response in response-uri end-point.

## Quick Gist

This mock OpenID4VP setup has **2 apps**:

1. **Backend app** (`openid4vp-service`)
  - Generates OpenID4VP authorization requests.
  - Creates QR payloads (`by_value` or `by_reference`).
  - Exposes verifier APIs such as request object, presentation-definition URI, and VP response endpoints.
  - Runs on `http://localhost:3000`.

2. **Frontend app** (`ovp-client`)
  - UI for selecting verifier configuration (draft/version, request mode, response mode, signing).
  - Displays QR code and request payload details.
  - Shows wallet scan results and debug data.
  - Runs on `http://localhost:3001`.

### Quick Start (Both Apps)

Backend:

```bash
cd openid4vp-service
npm install
npm start
```

Frontend:

```bash
cd ovp-client
npm install
npm start
```

Open `http://localhost:3001`, choose a flow in the UI, and use the generated QR for wallet testing.

For detailed setup and feature documentation, see:
- **Backend**: [openid4vp-service/README.md](README.md)
- **Frontend**: [ovp-client/README.md](ovp-client/README.md)

#### specification followed

openID4VP [Specification-1.0](https://openid.net/specs/openid-4-verifiable-presentations-1_0.html) and [Draft 23](https://openid.net/specs/openid-4-verifiable-presentations-1_0-23.html).

### Backend - Start the service

#### Steps to start service
1. Install the dependencies
   - Change directory to openid4vp-service
```bash
  cd openid4vp-service
  npm install
```
2. Start the service
   - Start the service by running the below command
   - Note: Make sure the current working directory is openid4vp-service

```bash
  npm start
```
Provide your exposed remote URL as input which will be used as base URL for verifier host in the request data 

To simplify the process, script is also exposed 


# Supported features

| Feature                                                   | Supported values                                                                                                                                                                                                                                                                                                                                                   |
|-----------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| OpenID4VP specification versions                          | `draft-23`, `version-1.0`                                                                                                                                                                                                                                                                                                                                         |
| Device flow                                               | cross device flow (QR code generated for the authorization request), Same device flow (Generated QR code with authorization request is clickable)                                                                                                                                                                                                                  |
| Client id Prefix                                          | `pre-registered`, `redirect_uri`, `decentralized_identifier (or did for OVP draft 23)`                                                                                                                                                                                                                                                                                                                            |
| Signed authorization request algorithms                   | Ed25519                                                                                                                                                                                                                                                                                                                                                            |
| Creating authorization request                            | By value, By reference ( via `request_uri` method) <br> _[Note: Authorization request by value is not supported for the decentralized_identifier Client id Prefix (or did client ID scheme), as it requires a signed request. Instead, a Request URI should be used to fetch the signed authorization request ([reference](https://openid.net/specs/openid-4-verifiable-presentations-1_0-23.html#section-3.2))]_ |
| Creating presentation definition in authorization request | By value, By reference (via `presentation_definition_uri`)                                                                                                                                                                                                                                                                                                         |
| Authorization Response mode                               | `direct_post`, `direct_post.jwt` (with encrypted & unsigned responses)                                                                                                                                                                                                                                                                                             |
| Authorization Response type                               | `vp_token`                                                                                                                                                                                                                                                                                                                                                         |
| Supported Credential formats                              | `ldp_vc`, `mso_mdoc`                                                                                                                                                                                                                                                                                                                                               |
#### Encrypted Response

For the `direct_post.jwt` response mode, the VP response is returned in encrypted form.

The mock application supports the `ECDH-ES` key management algorithm with `A256GCM` content encryption for the following key types:

* `OKP` (curve `Ed25519`)
* `EC` (curves `P-256`, `P-384`, and `P-521`)

By default, the Verifier's encryption key is exposed as an `OKP` key using the `Ed25519` curve. To customize the encryption key, update the `initializeEncryptionKeys` method in the [encryptionKeyManagement](./encryptionKeyManagement.js) file so that it returns the desired Verifier encryption key as `encryptionKey`.


#### Hosted public keys of the Verifier

- The public keys used by the Verifier for signing JWTs are exposed at the endpoint `/.well-known/jwks.json`.
- This endpoint returns a JWKS (JSON Web Key Set) containing the public keys in standard format, which can be used by clients and wallets to verify signatures.
- Example usage: Fetch the JWKS from `<base-url>/.well-known/jwks.json` to validate the Verifier's JWTs.


## Client id Prefixes / Schemes supported

1. `redirect_uri` (example: client_id: `https://client.example.org/cb`)
2. `decentralized_identifier` (example: client_id: `decentralized_identifier:did:example:123`) OR `did` scheme (example: client_id: `did:example:123`)
3. `pre-registered` (example: client_id: `mock-example client`)

## Port & Tunnel Configuration

**Mock Backend Service**
- Runs on http://localhost:3000 and is exposed via LocalTunnel at a public URL (e.g., https://your-subdomain.loca.lt).
- Expose port number `3000` using localtunnel
  - Install localtunnel globally if you haven't already:
    ```
    npm install -g localtunnel
    ```
      - Start localtunnel to expose your backend service:
    ```
    lt --port 3000 --subdomain <name> # Replace <name> with any unique subdomain
    ```
- Open the exposed localtunnel url in browser and access the mock services using tunnel password. Steps to get tunnel password are provided in the mock service page itself.
    
**Mock Frontend UI**
- Runs on http://localhost:3001 and is exposed via ngrok at a public URL (e.g., https://your-ui.ngrok.io).
- Steps to run the Mock Frontend UI are provided in the `ovp-client/README.md` file.

## Available APIs

| Method | Path | Responsibility |
|--------|------|----------------|
| `GET` | `/.well-known/jwks.json` | Exposes verifier public keys as a JWKS for signature verification. |
| `GET`, `POST` | `/verifier/:client_id_prefix/:request_mode` | Generates the authorization request and returns the QR response payload. Applies request overrides such as `dcql_query`, `presentation_definition`, signing option, draft/version, and response mode. |
| `GET`, `POST` | `/verifier/get-auth-request-obj/:sessionId/:client_id_prefix` | Returns the actual authorization request object for `by_reference` flows using the request data stored for the given `sessionId`. |
| `GET` | `/verifier/presentation-definition-uri/:sessionId` | Returns the session-scoped presentation definition, including any stored overrides for that `sessionId`. |
| `GET` | `/verifier/presentation_definition_uri` | Legacy endpoint that returns the default presentation definition without session-specific overrides. |
| `POST` | `/verifier/vp-response` | Accepts the wallet VP response and stores it as the latest received verifier result. |
| `GET` | `/verifier/vp-result` | Returns the latest stored VP result once and clears it from in-memory state. |
| `GET` | `/verifier/check-response` | Returns whether a verifier response has been received. |
| `GET` | `/verifier/callback` | Renders the success callback page after completion of the response flow. |
| `POST` | `/verifier/decrypt-jwe` | Decrypts a JWE token using the active server encryption key and returns the decrypted payload. |

### Presentation During Issuance (PDI) integration with mock-issuer-service

The `mock-issuer-service` calls this backend's `/verifier/:client_id_prefix/:request_mode`
endpoint during its PDI interactive-authorization flow to obtain a verifier request,
passing the client ID prefix, request mode, signing option, and presentation
definition / DCQL query it wants to use. That request shape is configured entirely on
the issuer side (its own `/qr` page, PDI flow) - see the `mock-issuer-service` README
for details. This backend doesn't need any special PDI-specific setup; it just serves
the same `/verifier/:client_id_prefix/:request_mode` endpoint used for standalone QR
testing via the ovp-client UI.

To drive a PDI run, start both services together with `npm start` from
`mock-issuer-service` (see that service's README for the one-command flow, including
the ngrok prompts), then configure the verifier request on the issuer's `/qr` page.


Generate a QR code payload for a `by_reference` request:

```bash
curl -X POST "http://localhost:3000/verifier/pre-registered/by_reference?spec=version-1.0" \
  -H "Content-Type: application/json" \
  -d '{
    "signed": true,
    "response_mode": "direct_post",
    "dcql_query": {
      "credentials": []
    }
  }'
```

Fetch the actual authorization request object for a session:

```bash
curl "http://localhost:3000/verifier/get-auth-request-obj/<sessionId>/pre-registered?spec=version-1.0&response_mode=direct_post"
```

Post a wallet VP response back to the verifier:

```bash
curl -X POST "http://localhost:3000/verifier/vp-response" \
  -H "Content-Type: application/json" \
  -d '{
    "vp_token": "<vp-token>",
    "presentation_submission": {
      "id": "submission-id"
    }
  }'
```

## Session Creation Using sessionId

- When `/verifier/:client_id_prefix/:request_mode` is called, the service generates a new `sessionId` for that request.
- The generated `sessionId` is used to store session-scoped request data such as `dcql_query` and `presentation_definition` overrides.
- For `by_reference` flows, the `sessionId` is embedded into the generated `request_uri` as `/verifier/get-auth-request-obj/:sessionId/:client_id_prefix`.
- When presentation definition is served by reference, the service also uses the same `sessionId` in `/verifier/presentation-definition-uri/:sessionId`.
- This allows each QR code request to resolve the correct request object and presentation definition without mixing overrides from other sessions.

Reference: https://openid.net/specs/openid-4-verifiable-presentations-1_0.html

## Version Supported

- OpenId4VP library version: [0.3.0](https://github.com/mosip/inji-openid4vp/tree/release-0.3.x)
- Inji Wallet version: [0.17.0](https://github.com/mosip/inji-wallet/tree/release-0.17.x)
