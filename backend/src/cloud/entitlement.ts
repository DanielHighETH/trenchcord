import { createLocalJWKSet, jwtVerify, type JSONWebKeySet, type JWTPayload } from 'jose';
import { appFetch } from '../utils/http.js';

// Public verification key(s) for entitlement JWTs signed by the Trenchcord
// cloud API. Replace `x` with the JWK printed by the cloud repo's
// `npm run generate-keys -w api`. Verification-only: this key cannot mint
// tokens. Unknown `kid`s fall back to the cloud's well-known JWKS endpoint so
// keys can rotate without shipping a new build.
const EMBEDDED_JWKS: JSONWebKeySet = {
  keys: [
    {
      kty: 'OKP',
      crv: 'Ed25519',
      alg: 'EdDSA',
      use: 'sig',
      kid: 'tc-2026-01',
      x: 'hvk0MQ_vIIebpD8xXleEUzvn8aMalBaMptZqiXNA9F4',
    },
  ],
};

export interface EntitlementPayload extends JWTPayload {
  entitled_until: string;
  dev: string;
  plan?: string;
}

let remoteJwksCache: JSONWebKeySet | null = null;

async function verifyAgainst(jwks: JSONWebKeySet, token: string): Promise<EntitlementPayload> {
  const { payload } = await jwtVerify(token, createLocalJWKSet(jwks), {
    algorithms: ['EdDSA'],
    issuer: 'trenchcord-cloud',
  });
  if (typeof payload.entitled_until !== 'string' || typeof payload.dev !== 'string') {
    throw new Error('Malformed entitlement payload');
  }
  return payload as EntitlementPayload;
}

/**
 * Verify an entitlement JWT. Tries the embedded key first, then the cloud's
 * well-known JWKS (once per process) for rotated keys. Returns null when the
 * token is invalid or expired.
 */
export async function verifyEntitlementJwt(token: string, cloudUrl: string): Promise<EntitlementPayload | null> {
  try {
    return await verifyAgainst(EMBEDDED_JWKS, token);
  } catch {
    // fall through to remote keys
  }
  try {
    if (!remoteJwksCache) {
      const res = await appFetch(`${cloudUrl}/.well-known/trenchcord-entitlement-keys`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return null;
      remoteJwksCache = (await res.json()) as JSONWebKeySet;
    }
    return await verifyAgainst(remoteJwksCache, token);
  } catch {
    return null;
  }
}
