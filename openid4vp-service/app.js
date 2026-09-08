const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const cors = require('cors');
const { createVpSessionStore } = require('./services/vpSessionStore');
const { registerVerifierRoutes } = require('./routes/verifierRoutes');

// Import encryption key management
const { initializeEncryptionKeys, exportKeyInfo, decryptJwe } = require('./encryptionKeyManagement');
const VerifierMetadataModule = require('./VerifierMetadata');
const { updateWithEncryptionKey } = VerifierMetadataModule;

const app = express();
const {
    baseUrl,
    jwkSet,
} = require("./constants");


const PORT = process.env.PORT || 3000;
const {
    sessionMiddleware,
    clearSessionStoreOnStartup,
    generateSessionId,
    storeVPRequestInSession,
    getVPRequestFromSession,
} = createVpSessionStore();

let responseReceived = false;
let latestVpResult = null;
let activeEncryptionKey = null;

// Clear all session data on app startup.
clearSessionStoreOnStartup()
    .then(() => {
        console.log('Session store cleared on startup');
    })
    .catch((error) => {
        console.error('Failed to clear session store on startup:', error.message);
    });

// Initialize encryption keys on app startup
(async () => {
    try {
        const { encryptionKey } = await initializeEncryptionKeys();
        activeEncryptionKey = encryptionKey;
        updateWithEncryptionKey(encryptionKey);
        console.log(exportKeyInfo(encryptionKey));
    } catch (error) {
        console.error('Failed to initialize encryption keys:', error.message);
        // Continue with default keys if initialization fails
    }
})();

app.use(bodyParser.urlencoded({limit: '20mb', extended: true}));
app.use(bodyParser.json({limit: '20mb'}));
app.use(sessionMiddleware);
app.set('view engine', 'ejs');

app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));

app.use(cors());

registerVerifierRoutes(app, {
    generateSessionId,
    storeVPRequestInSession,
    getVPRequestFromSession,
});

app.get('/.well-known/jwks.json', async (req, res) => {
    res.json(jwkSet);
})

let responseCode = "Qaioewrhbfwd=="; // Initialize with a dummy value

app.post('/verifier/vp-response', (req, res) => {
    console.log("received vp response on ", Date.now());
    console.log('data:', JSON.stringify(req.body));

    responseReceived = true;
    latestVpResult = req.body;

    // Create a random response code
    console.log("received the response successfully")
    console.log("asking for a redirect...")

    const response = {
        redirect_uri: `${baseUrl}/verifier/callback#response_code=${responseCode}`,
        message: `Verifiable presentation is all right`,
    };
    console.log("Response to be sent:", response);
    res.status(200).json(response);
});

app.get('/verifier/callback', async (req, res) => {
    res.render("success", {message: "✅ All set! Transaction completed successfully. 🎉"});
})


app.get('/verifier/vp-result', (req, res) => {
    if (responseReceived && latestVpResult) {
        res.json(latestVpResult);
        responseReceived = false;
        latestVpResult = null;
    } else {
        res.json(false);
    }
});


app.get('/verifier/check-response', (req, res) => {
    res.json({responseReceived});
    responseReceived = false;
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

// API to decrypt JWE tokens
app.post('/verifier/decrypt-jwe', async (req, res) => {
        console.log('=== JWE Decryption Request ===');
        console.log('Request body:', JSON.stringify(req.body, null, 2));
        console.log('Request headers:', req.headers);

        const { jweToken} = req.body;

        console.log('Extracted jweToken:', jweToken ? `${jweToken.substring(0, 50)}...` : 'null');
        console.log('jweToken type:', typeof jweToken);

        // Decrypt the JWE token using the active encryption key
        if (!jweToken) {
            return res.status(400).json({
                error: 'Missing jweToken in request body',
                message: 'Please provide a JWE token to decrypt'
            });
        }

        if (!activeEncryptionKey) {
            return res.status(500).json({
                error: 'Encryption key not initialized',
                message: 'The server encryption key has not been initialized'
            });
        }

        try {
            const decryptedPayload = await decryptJwe(jweToken, activeEncryptionKey);
            console.log('Successfully decrypted JWE token');
            console.log('Decrypted payload:', JSON.stringify(decryptedPayload, null, 2));

            res.status(200).json({
                success: true,
                decryptedPayload: decryptedPayload
            });
        } catch (error) {
            console.error('Error decrypting JWE token:', error.message);
            res.status(400).json({
                error: 'Failed to decrypt JWE token',
                message: error.message
            });
        }
});


module.exports = app;

