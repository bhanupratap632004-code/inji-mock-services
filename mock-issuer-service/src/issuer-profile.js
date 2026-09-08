import "dotenv/config";

export const ISSUER = process.env.ISSUER_URL || "https://mock-issuer.local:4000";

export function normalizeSpecVersion(version) {
  return version === "draft13" ? "draft13" : "v1";
}

export function resolveRequestVersion(req) {
  return normalizeSpecVersion(req.params?.version || req.query?.version);
}

export function hasExplicitVersion(req) {
  return Boolean(req.params?.version || req.query?.version);
}

export function normalizeFlow(flow) {
  return flow === "pdi" ? "pdi" : null;
}

export function issuerBaseUrl(version, explicit = true, flow = null) {
  const normalized = normalizeSpecVersion(version);
  const normalizedFlow = normalizeFlow(flow);

  if (!explicit) {
    return normalizedFlow ? `${ISSUER}/${normalizedFlow}` : ISSUER;
  }

  const base = `${ISSUER}/${normalized}`;
  return normalizedFlow ? `${base}/${normalizedFlow}` : base;
}

export function authServerBaseUrl(version, explicit = true, flow = null) {
  const base = issuerBaseUrl(version, explicit);
  const normalizedFlow = normalizeFlow(flow);

  if (normalizedFlow) {
    return `${base}/${normalizedFlow}/as`;
  }

  return `${base}/as`;
}
