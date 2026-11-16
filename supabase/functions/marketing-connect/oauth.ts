import { fetchMetaOverview, readMetaConfig } from '../marketing-read/meta.ts';

type Env = (name: string) => string | undefined;
type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
const text = new TextEncoder();

function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decode(value: string) {
  const normal = value.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(normal), c => c.charCodeAt(0));
}

async function stateKey(secret: string): Promise<CryptoKey> {
  if (secret.length < 32) throw new Error('Meta reconnect is not configured.');
  return crypto.subtle.importKey('raw', text.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function makeState(userId: string, secret: string): Promise<string> {
  const payload = base64url(text.encode(JSON.stringify({
    userId, expires: Date.now() + 10 * 60_000, nonce: base64url(crypto.getRandomValues(new Uint8Array(32))),
  })));
  const signature = await crypto.subtle.sign('HMAC', await stateKey(secret), text.encode(payload));
  return `${payload}.${base64url(new Uint8Array(signature))}`;
}

export async function checkState(state: string, userId: string, secret: string): Promise<void> {
  try {
    const parts = state.split('.');
    if (parts.length !== 2 || !await crypto.subtle.verify('HMAC', await stateKey(secret), decode(parts[1]), text.encode(parts[0]))) {
      throw new Error();
    }
    const data: unknown = JSON.parse(new TextDecoder().decode(decode(parts[0])));
    if (!data || typeof data !== 'object' || !('userId' in data) || data.userId !== userId
      || !('expires' in data) || typeof data.expires !== 'number' || data.expires <= Date.now()) throw new Error();
  } catch {
    throw new Error('Meta login has expired or could not be verified. Please reconnect again.');
  }
}

export function oauthConfig(env: Env) {
  const appId = env('META_APP_ID')?.trim();
  const appSecret = env('META_APP_SECRET')?.trim();
  const configurationId = env('META_LOGIN_CONFIG_ID')?.trim();
  const redirectUri = env('META_OAUTH_REDIRECT_URI')?.trim();
  const version = env('META_GRAPH_API_VERSION')?.trim();
  const stateSecret = env('META_OAUTH_STATE_SECRET')?.trim();
  const encryptionKey = env('META_TOKEN_ENCRYPTION_KEY')?.trim();
  if (!appId || !/^\d+$/.test(appId) || !appSecret || !configurationId || !/^\d+$/.test(configurationId)
    || !redirectUri || !version || !/^v\d{1,3}\.\d{1,2}$/.test(version) || !stateSecret || stateSecret.length < 32
    || !encryptionKey) throw new Error('Meta reconnect is not configured. Contact the site operator.');
  try {
    if (atob(encryptionKey).length !== 32) throw new Error();
  } catch {
    throw new Error('Meta reconnect encryption key is invalid.');
  }
  let url: URL;
  try { url = new URL(redirectUri); } catch { throw new Error('Meta reconnect redirect URI is invalid.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
    || !url.pathname.endsWith('/meta-oauth-callback.html')) throw new Error('Meta reconnect redirect URI is invalid.');
  return { appId, appSecret, configurationId, redirectUri, version, stateSecret, encryptionKey };
}

export function loginUrl(config: ReturnType<typeof oauthConfig>, state: string): string {
  const url = new URL(`https://www.facebook.com/${config.version}/dialog/oauth`);
  url.search = new URLSearchParams({
    client_id: config.appId, redirect_uri: config.redirectUri, state,
    config_id: config.configurationId, response_type: 'code', display: 'popup',
  }).toString();
  return url.href;
}

async function tokenRequest(config: ReturnType<typeof oauthConfig>, parameters: Record<string, string>, fetcher: Fetcher) {
  const url = new URL(`https://graph.facebook.com/${config.version}/oauth/access_token`);
  url.search = new URLSearchParams({ client_id: config.appId, client_secret: config.appSecret, ...parameters }).toString();
  let response: Response;
  try {
    response = await fetcher(url, { signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new Error('Unable to connect to Meta for authorization.');
  }
  if (!response.ok) throw new Error(`Meta authorization failed (status ${response.status}). Check the login configuration and try again.`);
  let result: unknown;
  try { result = await response.json(); } catch { throw new Error('Meta returned an invalid authorization response.'); }
  if (!result || typeof result !== 'object' || !('access_token' in result)
    || typeof result.access_token !== 'string' || !result.access_token) throw new Error('Meta returned an invalid authorization response.');
  return {
    accessToken: result.access_token,
    expiresIn: 'expires_in' in result ? result.expires_in : undefined,
  };
}

export async function exchangeCode(
  env: Env, config: ReturnType<typeof oauthConfig>, code: string, fetcher: Fetcher = fetch,
): Promise<{ token: string; expiresAt: string }> {
  const short = await tokenRequest(config, { redirect_uri: config.redirectUri, code }, fetcher);
  const long = await tokenRequest(config, { grant_type: 'fb_exchange_token', fb_exchange_token: short.accessToken }, fetcher);
  if (typeof long.expiresIn !== 'number'
    || !Number.isSafeInteger(long.expiresIn) || long.expiresIn <= 0 || long.expiresIn > 365 * 86400) {
    throw new Error('Meta returned an invalid token expiry.');
  }
  const readConfig = readMetaConfig(name => name === 'META_ACCESS_TOKEN' ? long.accessToken : env(name));
  await fetchMetaOverview(readConfig, fetcher);
  return { token: long.accessToken, expiresAt: new Date(Date.now() + long.expiresIn * 1000).toISOString() };
}
