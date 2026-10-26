import { createPublicKey, type JsonWebKey } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';

const ISSUER = 'https://appleid.apple.com';

export type AppleConfig = { bundleId: string; teamId: string; keyId: string; privateKey: string };
export type AppleIdentity = { sub: string; email: string | null; emailVerified: boolean };

let keys: { at: number; byKid: Map<string, string> } | null = null;

async function publicKey(kid: string) {
  if (!keys || Date.now() - keys.at > 60 * 60_000 || !keys.byKid.has(kid)) {
    const response = await fetch(`${ISSUER}/auth/keys`);
    if (!response.ok) throw new Error(`Apple keys ${response.status}`);
    const body = await response.json() as { keys: Array<JsonWebKey & { kid: string }> };
    keys = { at: Date.now(), byKid: new Map(body.keys.map((key) => [key.kid, createPublicKey({ key, format: 'jwk' }).export({ type: 'spki', format: 'pem' }).toString()])) };
  }
  const pem = keys.byKid.get(kid);
  if (!pem) throw new Error('Unknown Apple key');
  return pem;
}

export async function verifyAppleIdentityToken(jwt: JwtService, identityToken: string, bundleId: string): Promise<AppleIdentity> {
  const header = JSON.parse(Buffer.from(identityToken.split('.')[0] ?? '', 'base64url').toString('utf8')) as { kid?: string };
  if (!header.kid) throw new Error('No key id');
  const payload = await jwt.verifyAsync<{ sub: string; email?: string; email_verified?: boolean | string }>(identityToken, {
    secret: await publicKey(header.kid),
    algorithms: ['RS256'],
    issuer: ISSUER,
    audience: bundleId,
  });
  return { sub: payload.sub, email: payload.email?.trim().toLowerCase() || null, emailVerified: payload.email_verified === true || payload.email_verified === 'true' };
}

export function appleKeyConfigured(config: AppleConfig) {
  return Boolean(config.teamId && config.keyId && config.privateKey);
}

function clientSecret(jwt: JwtService, config: AppleConfig) {
  return jwt.sign({}, {
    algorithm: 'ES256',
    secret: config.privateKey.replace(/\\n/g, '\n'),
    keyid: config.keyId,
    issuer: config.teamId,
    audience: ISSUER,
    subject: config.bundleId,
    expiresIn: '5m',
  });
}

export async function exchangeAppleCode(jwt: JwtService, config: AppleConfig, code: string) {
  const response = await fetch(`${ISSUER}/auth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: config.bundleId, client_secret: clientSecret(jwt, config), code, grant_type: 'authorization_code' }),
  });
  if (!response.ok) throw new Error(`Apple token ${response.status}`);
  return ((await response.json()) as { refresh_token?: string }).refresh_token ?? null;
}

export async function revokeAppleToken(jwt: JwtService, config: AppleConfig, refreshToken: string) {
  const response = await fetch(`${ISSUER}/auth/revoke`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: config.bundleId, client_secret: clientSecret(jwt, config), token: refreshToken, token_type_hint: 'refresh_token' }),
  });
  if (!response.ok) throw new Error(`Apple revoke ${response.status}`);
}
