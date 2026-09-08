import { SignJWT, exportPKCS8 } from 'jose';
import { randomBytes, createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { writeFile, rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const CERT_GENERATION_TIMEOUT_MS = 10_000;

function base64url(buffer) {
  return buffer.toString('base64url');
}

function sha256(data) {
  return createHash('sha256').update(data).digest();
}

// One certificate per signing key, so repeat issuance with the same key does not shell out
// to OpenSSL again. Keyed by the key object, which is what createSdJwt is handed.
const certificateCache = new WeakMap();

async function generateSelfSignedCertB64(privateKey) {
  const pkcs8 = await exportPKCS8(privateKey);
  const dir = await mkdtemp(join(tmpdir(), 'sdjwt-cert-'));
  const keyPath = join(dir, 'key.pem');
  try {
    await writeFile(keyPath, pkcs8, { mode: 0o600 });
    const { stdout } = await execFileAsync(
      'openssl',
      ['req', '-x509', '-key', keyPath,
       '-subj', '/CN=INJI Mock Issuer/O=INJI Mock Services',
       '-days', '365', '-outform', 'DER'],
      { maxBuffer: 1 << 20, timeout: CERT_GENERATION_TIMEOUT_MS, encoding: 'buffer' },
    );
    return stdout.toString('base64');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function selfSignedCertB64(privateKey) {
  let pending = certificateCache.get(privateKey);
  if (!pending) {
    // Cache the promise rather than the result so concurrent requests share one generation.
    pending = generateSelfSignedCertB64(privateKey).catch((error) => {
      certificateCache.delete(privateKey);
      throw error;
    });
    certificateCache.set(privateKey, pending);
  }
  return pending;
}

export async function createSdJwt(payload, privateKey, issuer, holderDid) {
  const disclosures = [];
  const sdHashes = [];

  const claimsToDisclose = Object.keys(payload).filter(k => k !== 'iss' && k !== 'sub' && k !== 'iat' && k !== 'exp' && k !== 'nbf' && k !== 'jti' && k !== 'vct' && k !== 'cnf');

  const newPayload = { ...payload };

  for (const claim of claimsToDisclose) {
    const salt = base64url(randomBytes(16));
    const disclosureArray = [salt, claim, payload[claim]];
    const disclosureJson = JSON.stringify(disclosureArray);
    const disclosureB64 = Buffer.from(disclosureJson).toString('base64url');
    disclosures.push(disclosureB64);

    const hash = base64url(sha256(disclosureB64));
    sdHashes.push(hash);
    delete newPayload[claim];
  }

  newPayload._sd = sdHashes.sort();
  newPayload._sd_alg = 'sha-256';
  newPayload.keyName = "Simon"
  newPayload.residence = "Bangalore";

  const x5c = [await selfSignedCertB64(privateKey)];

  const jwt = await new SignJWT(newPayload)
    .setProtectedHeader({ alg: 'ES256', typ: 'vc+sd-jwt', kid: issuer, x5c })
    .setIssuedAt()
    .setIssuer(issuer)
    .setSubject(holderDid)
    .setExpirationTime('1y')
    .sign(privateKey);

  return jwt + '~' + disclosures.join('~') + '~';
}
