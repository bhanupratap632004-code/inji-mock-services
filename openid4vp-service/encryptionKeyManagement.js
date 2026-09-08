
// jose will be loaded dynamically since it's ESM-only
let jose = null;
async function getJose() {
    if (!jose) {
        jose = await import('jose');
    }
    return jose;
}

// Default verifier key pair for X25519 ECDH-ES
const defaultVerifierKeys = {
    publicKeyBase64: "Z5a2OjR7a6rOqBdApvDaqR7mBV+OD3VT2UgCdKQScwI=",
    privateKeyBase64: "Mjxgl/YAh11IxsTZ6b6TD63BGc1FPWe+yAhD96S0IC0="
};

const ecVerifierKey = {
    "kty": "EC",
    "d": "Llyw0UJUFOvBY7hLiyZuSqXgxvk_r0HpikmUFSVjprs",
    "use": "enc",
    "crv": "P-256",
    "kid": "p-256-enc-key",
    "x": "cDkxy2ZK0R2alOAvHo3n5EnzA5yV-qg6lbT3TnF_7xQ",
    "y": "7GffiqVWpLBAqRByuoJ-0TCtxRAs7_-OK02kpGyWO7g",
    "alg": "ECDH-ES"
}

/**
 * Convert base64 to base64url format
 * @param {string} base64 - Standard base64 string
 * @returns {string} Base64url encoded string
 */
function base64ToBase64Url(base64) {
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/**
 * Initialize encryption keys for the verifier
 * @returns {Object} Object containing the encryption key info
 */
async function initializeEncryptionKeys() {
    const publicKeyB64Url = base64ToBase64Url(defaultVerifierKeys.publicKeyBase64);
    const pvtKeyB64Url = base64ToBase64Url(defaultVerifierKeys.privateKeyBase64);

    const encryptionKey = {
        jwk: {
            kty: "OKP",
            crv: "X25519",
            use: "enc",
            x: publicKeyB64Url,
            d: pvtKeyB64Url,
            alg: "ECDH-ES",
            kid: "verifier-static-key"
        },
        keyId: "verifier-static-key",
        algorithm: "ECDH-ES",
        encryptionMethods: ["A256GCM"],
        publicKeyBase64: defaultVerifierKeys.publicKeyBase64,
        privateKeyBase64: defaultVerifierKeys.privateKeyBase64
    };

    const ecEncryptionKey = {
        jwk: ecVerifierKey,
        keyId: ecVerifierKey.kid,
        algorithm: ecVerifierKey.alg,
        encryptionMethods: ["A256GCM"]
    }

    // return the type of Encryption key required for Verifier encryption key - Eg : return { encryptionKey: ecEncryptionKey };

    return { encryptionKey };
}

/**
 * Export key information for logging (without exposing private key)
 * @param {Object} encryptionKey - The encryption key object
 * @returns {string} Human readable key info
 */
function exportKeyInfo(encryptionKey) {
    return `
=== Encryption Key Info ===
Key ID: ${encryptionKey.keyId}
Algorithm: ${encryptionKey.algorithm}
Curve: X25519
Encryption Methods: ${encryptionKey.encryptionMethods.join(', ')}
===========================`;
}

/**
 * Decrypt a JWE token using ECDH-ES with X25519 via jose library
 * @param {string} jweToken - The JWE token string (compact serialization)
 * @param {Object} encryptionKey - The encryption key object with private key
 * @returns {Object} Decrypted payload
 */
async function decryptJwe(jweToken, encryptionKey) {
    if (!jweToken || typeof jweToken !== 'string') {
        throw new Error('Invalid JWE token: must be a non-empty string');
    }

    if (!encryptionKey) {
        throw new Error('Invalid encryption key: private key required');
    }

    const privateJwk = encryptionKey.jwk;

    try {
        // Load jose dynamically (ESM module)
        const jose = await getJose();

        // Import the private key for decryption
        const privateKey = await jose.importJWK(privateJwk, 'ECDH-ES');

        // Decrypt the JWE token
        const { plaintext, protectedHeader } = await jose.compactDecrypt(jweToken, privateKey);

        console.debug('JWE Header:', JSON.stringify(protectedHeader, null, 2));

        // Convert plaintext to string
        const payloadString = new TextDecoder().decode(plaintext);

        // Try to parse as JSON
        try {
            return JSON.parse(payloadString);
        } catch {
            // Return as string if not valid JSON
            return payloadString;
        }
    } catch (error) {
        console.error('Jose decryption error:', error);
        throw new Error(`Failed to decrypt JWE: ${error.message}`);
    }
}

module.exports = {
    defaultVerifierKeys,
    initializeEncryptionKeys,
    exportKeyInfo,
    decryptJwe
}
