import express from "express";
import https from "https";
import fs from "fs";
import cors from "cors";
import authServerMetadata from "./as/metadata.js";
import credentialOfferHandler from "./credential/offer.js";
import issuerMetadata from "./issuer-metadata.js";
import qrPageHandler, { qrImageHandler } from "./qr.js";
import authorizeHandler from "./as/authorize.js";
import interactiveAuthorizationHandler from "./as/interactive-authorization.js";
import tokenHandler from "./as/token.js";
import credentialHandler from "./credential/endpoint.js";
import loginHandler from "./as/login.js";
import nonceHandler from "./nonce.js";
import { getDidDocument } from "./credential/ldp-vc.js";

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cors());

// ---- QR CODE ---- //
app.get("/qr", qrPageHandler);
app.get("/qr/image", qrImageHandler);

// ---- WELL-KNOWN ---- //
app.get("/.well-known/did.json", async (req, res) => {
  const host = req.headers.host || "mock-issuer.local:4000";
  const issuerDid = `did:web:${host.replace(/:/g, "%3A")}`;

  const didDocument = await getDidDocument(issuerDid);

  res.json(didDocument);
});

app.get("/.well-known/openid-credential-issuer", issuerMetadata);
app.get("/:flow(pdi)/.well-known/openid-credential-issuer", issuerMetadata);
app.get("/:version(v1|draft13)/.well-known/openid-credential-issuer", issuerMetadata);
app.get("/:version(v1|draft13)/:flow(pdi)/.well-known/openid-credential-issuer", issuerMetadata);


// ------------------------------
// AUTHORIZATION SERVER METADATA
// ------------------------------
app.get(
    "/as/.well-known/oauth-authorization-server",
    authServerMetadata
  );
app.get(
    "/:flow(pdi)/as/.well-known/oauth-authorization-server",
    authServerMetadata
  );
app.get(
    "/:version(v1|draft13)/as/.well-known/oauth-authorization-server",
    authServerMetadata
  );
app.get(
    "/:version(v1|draft13)/:flow(pdi)/as/.well-known/oauth-authorization-server",
    authServerMetadata
  );

// --------------
// CREDENTIAL OFFER
// --------------

app.get("/credential-offer", credentialOfferHandler);


// ---- AUTHORIZATION SERVER ---- //
// app.get("/as/authorize", authorizeHandler);
app.post("/as/interactive-authorization", interactiveAuthorizationHandler);
app.post("/:flow(pdi)/as/interactive-authorization", interactiveAuthorizationHandler);
app.post("/:version(v1|draft13)/as/interactive-authorization", interactiveAuthorizationHandler);
app.post("/:version(v1|draft13)/:flow(pdi)/as/interactive-authorization", interactiveAuthorizationHandler);
app.post("/as/token", tokenHandler);
app.post("/:flow(pdi)/as/token", tokenHandler);
app.post("/:version(v1|draft13)/as/token", tokenHandler);
app.post("/:version(v1|draft13)/:flow(pdi)/as/token", tokenHandler);
app.get("/as/authorize", authorizeHandler);
app.get("/:flow(pdi)/as/authorize", authorizeHandler);
app.get("/:version(v1|draft13)/as/authorize", authorizeHandler);
app.get("/:version(v1|draft13)/:flow(pdi)/as/authorize", authorizeHandler);

// login form handler
app.post("/as/login", express.urlencoded({ extended: true }), loginHandler);
app.post("/:flow(pdi)/as/login", express.urlencoded({ extended: true }), loginHandler);
app.post("/:version(v1|draft13)/as/login", express.urlencoded({ extended: true }), loginHandler);
app.post("/:version(v1|draft13)/:flow(pdi)/as/login", express.urlencoded({ extended: true }), loginHandler);

// ---- CREDENTIAL ENDPOINT ---- //
app.post("/credential", credentialHandler);
app.post("/:flow(pdi)/credential", credentialHandler);
app.post("/:version(v1|draft13)/credential", credentialHandler);
app.post("/:version(v1|draft13)/:flow(pdi)/credential", credentialHandler);

// ---- NONCE ENDPOINT (OID4VCI 1.0) ---- //
app.post("/nonce", nonceHandler);
app.post("/:flow(pdi)/nonce", nonceHandler);
app.post("/:version(v1|draft13)/nonce", nonceHandler);
app.post("/:version(v1|draft13)/:flow(pdi)/nonce", nonceHandler);

// ---- HTTPS SERVER ---- //
const options = {
  key: fs.readFileSync("cert/server.key"),
  cert: fs.readFileSync("cert/server.cert")
};

https.createServer(options, app).listen(4000, () => {
  console.log("Mock Issuer running at https://mock-issuer.local:4000");
});

// app.listen(4000, () => {
//   console.log(`Server is running on http://localhost:4000`);
// });