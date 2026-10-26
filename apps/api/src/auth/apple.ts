import { createPublicKey, type JsonWebKey } from 'node:crypto';
import { JwtService } from '@nestjs/jwt';

const ISSUER = 'https://appleid.apple.com';

export type AppleConfig = { bundleId: string; teamId: string; keyId: string; privateKey: string };
export type AppleIdentity = { sub: string; email: string | null; emailVerified: boolean };

/** Apple's signing keys, cached: they rotate rarely, and a missing kid refetches. */
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

/** Checks the identity token from "Sign in with Apple" on the phone: Apple-signed, for Jump's app, not expired. */
export async function verifyAppleIdentityToken(jwt: JwtService, identityToken: string, bundleId: string): Promise<AppleIdentity> {
  const header = JSON.parse(Buffer.from(identityToken.split('.')[0] ?? '', 'base64url').toString('utf8')) as { kid?: string };
  if (!header.kid) throw new Error('No key id');
  // `secret`, not `publicKey`: the app's JwtModule has its own secret, which @nestjs/jwt prefers over `publicKey`.
  const payload = await jwt.verifyAsync<{ sub: string; email?: string; email_verified?: boolean | string }>(identityToken, {
    secret: await publicKey(header.kid),
    algorithms: ['RS256'],
    issuer: ISSUER,
    audience: bundleId,
  });
  return { sub: payload.sub, email: payload.email?.trim().toLowerCase() || null, emailVerified: payload.email_verified === true || payload.email_verified === 'true' };
}

/** Whether the key for talking to Apple (token exchange and revocation) is set. Sign-in works without it. */
export function appleKeyConfigured(config: AppleConfig) {
  return Boolean(config.teamId && config.keyId && config.privateKey);
}

/** The short-lived client secret Apple wants: a JWT signed with Jump's Sign in with Apple key. */
function clientSecret(jwt: JwtService, config: AppleConfig) {
  return jwt.sign({}, {
    algorithm: 'ES256',
    // `secret` for the same reason as above: it wins over the module's own secret.
    secret: config.privateKey.replace(/\\n/g, '\n'),
    keyid: config.keyId,
    issuer: config.teamId,
    audience: ISSUER,
    subject: config.bundleId,
    expiresIn: '5m',
  });
}

/** Swaps the one-time authorization code for a refresh token, kept only so deletion can revoke it. */
export async function exchangeAppleCode(jwt: JwtService, config: AppleConfig, code: string) {
  const response = await fetch(`${ISSUER}/auth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: config.bundleId, client_secret: clientSecret(jwt, config), code, grant_type: 'authorization_code' }),
  });
  if (!response.ok) throw new Error(`Apple token ${response.status}`);
  return ((await response.json()) as { refresh_token?: string }).refresh_token ?? null;
}

/** Tells Apple the runner deleted their Jump account, as App Review expects. */
export async function revokeAppleToken(jwt: JwtService, config: AppleConfig, refreshToken: string) {
  const response = await fetch(`${ISSUER}/auth/revoke`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: config.bundleId, client_secret: clientSecret(jwt, config), token: refreshToken, token_type_hint: 'refresh_token' }),
  });
  if (!response.ok) throw new Error(`Apple revoke ${response.status}`);
}
