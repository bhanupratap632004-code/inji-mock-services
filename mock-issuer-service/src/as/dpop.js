/**
 * DPoP (RFC 9449) proof validation utilities for the mock issuer.
 *
 * Supports all algorithms advertised in the AS metadata:
 *   EdDSA, ES256K, ES256, ES384, ES512, RS256
 */
import {
  decodeProtectedHeader,
  jwtVerify,
  importJWK,
  calculateJwkThumbprint,
} from 'jose';
import { createHash } from 'node:crypto';

export const DPOP_ALGS = ['EdDSA', 'ES256K', 'ES256', 'ES384', 'ES512', 'RS256'];

// Allow up to 30 seconds clock skew on iat
const MAX_IAT_SKEW_SECONDS = 30;

/**
 * Validates a DPoP proof JWT per RFC 9449 §4.3.
 *
 * @param {string} dpopProof  - raw DPoP proof JWT from the `DPoP` header
 * @param {string} htm        - expected HTTP method  (e.g. "POST")
 * @param {string} htu        - expected HTTP URI     (scheme + host + path, no query)
 * @param {object} [opts]
 * @param {string} [opts.nonce]       - server-issued nonce that must appear in the proof
 * @param {string} [opts.accessToken] - raw access token; enables ath binding check
 * @returns {Promise<{ jwk: object, thumbprint: string }>}
 * @throws {DPoPError}
 */
export async function verifyDPoPProof(dpopProof, htm, htu, opts = {}) {
  if (!dpopProof) {
    throw new DPoPError('invalid_dpop_proof', 'DPoP header missing');
  }

  // 1. Decode header
  let header;
  try {
    header = decodeProtectedHeader(dpopProof);
  } catch {
    throw new DPoPError('invalid_dpop_proof', 'Cannot decode DPoP proof header');
  }

  if (header.typ !== 'dpop+jwt') {
    throw new DPoPError('invalid_dpop_proof', `typ must be "dpop+jwt", got "${header.typ}"`);
  }
  if (!DPOP_ALGS.includes(header.alg)) {
    throw new DPoPError('invalid_dpop_proof', `Unsupported DPoP alg: ${header.alg}`);
  }
  if (!header.jwk || typeof header.jwk !== 'object') {
    throw new DPoPError('invalid_dpop_proof', 'jwk claim missing from DPoP header');
  }

  // 2. Import public key and verify signature
  let publicKey;
  try {
    publicKey = await importJWK(header.jwk, header.alg);
  } catch {
    throw new DPoPError('invalid_dpop_proof', 'Invalid JWK in DPoP header');
  }

  let payload;
  try {
    ({ payload } = await jwtVerify(dpopProof, publicKey, {
      typ: 'dpop+jwt',
      clockTolerance: MAX_IAT_SKEW_SECONDS,
    }));
  } catch (e) {
    throw new DPoPError('invalid_dpop_proof', `DPoP signature invalid: ${e.message}`);
  }

  // 3. htm check
  if ((payload.htm || '').toUpperCase() !== htm.toUpperCase()) {
    throw new DPoPError(
      'invalid_dpop_proof',
      `htm mismatch: expected "${htm}", got "${payload.htm}"`,
    );
  }

  // 4. htu check (strip query string from both sides)
  const expectedHtu = htu.split('?')[0];
  const actualHtu = (payload.htu || '').split('?')[0];
  if (actualHtu !== expectedHtu) {
    throw new DPoPError(
      'invalid_dpop_proof',
      `htu mismatch: expected "${expectedHtu}", got "${actualHtu}"`,
    );
  }

  // 5. jti must be present (replay protection hint — full store optional for mock)
  if (!payload.jti) {
    throw new DPoPError('invalid_dpop_proof', 'jti claim missing from DPoP proof');
  }

  // 6. Nonce check
  if (opts.nonce && payload.nonce !== opts.nonce) {
    throw new DPoPError('use_dpop_nonce', 'DPoP nonce required or does not match');
  }

  // 7. ath check (credential endpoint only)
  if (opts.accessToken !== undefined) {
    const expectedAth = createHash('sha256')
      .update(opts.accessToken, 'ascii')
      .digest('base64url');
    if (payload.ath !== expectedAth) {
      throw new DPoPError('invalid_dpop_proof', `ath mismatch`);
    }
  }

  const thumbprint = await calculateJwkThumbprint(header.jwk, 'sha256');
  return { jwk: header.jwk, thumbprint };
}

/**
 * Builds the canonical htu value from an Express request (scheme + host + path).
 */
export function buildHtu(req) {
  // Respect x-forwarded-proto from reverse proxies (e.g. ngrok)
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:4000';
  return `${proto}://${host}${req.path}`;
}

export class DPoPError extends Error {
  constructor(code, description) {
    super(description);
    this.code = code;
    this.description = description;
  }
}
