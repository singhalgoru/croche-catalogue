// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { checkState, exchangeCode, loginUrl, makeState, oauthConfig } from './oauth';
import { decryptMetaToken, encryptMetaToken } from '../_shared/metaCredentials';

const values: Record<string, string> = {
  META_APP_ID: '123', META_APP_SECRET: 'secret-fixture', META_LOGIN_CONFIG_ID: '456',
  META_OAUTH_REDIRECT_URI: 'https://example.test/meta-oauth-callback.html',
  META_GRAPH_API_VERSION: 'v27.0', META_OAUTH_STATE_SECRET: 'x'.repeat(48),
  META_TOKEN_ENCRYPTION_KEY: btoa('k'.repeat(32)), META_AD_ACCOUNT_ID: '1234',
};
const env = (name: string) => values[name];
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

it('binds signed, expiring login state to the initiating admin and a Meta login URL', async () => {
  const config = oauthConfig(env);
  const state = await makeState('admin', config.stateSecret);
  await expect(checkState(state, 'admin', config.stateSecret)).resolves.toBeUndefined();
  await expect(checkState(state, 'other', config.stateSecret)).rejects.toThrow('could not be verified');
  await expect(checkState(`${state}x`, 'admin', config.stateSecret)).rejects.toThrow('could not be verified');
  vi.useFakeTimers();
  vi.setSystemTime(Date.now() + 11 * 60_000);
  await expect(checkState(state, 'admin', config.stateSecret)).rejects.toThrow('expired');
  vi.useRealTimers();
  const url = new URL(loginUrl(config, state));
  expect(url.searchParams.get('config_id')).toBe('456');
  expect(url.searchParams.get('response_type')).toBe('code');
  expect(url.href).not.toContain(config.appSecret);
});

it('exchanges the code and validates account access before returning the long-lived token', async () => {
  const fetcher = vi.fn()
    .mockResolvedValueOnce(response({ access_token: 'short' }))
    .mockResolvedValueOnce(response({ access_token: 'long', expires_in: 3600 }))
    .mockResolvedValueOnce(response({ id: 'act_1234', name: 'Account', currency: 'INR', timezone_name: 'Asia/Kolkata', account_status: 1 }))
    .mockResolvedValueOnce(response({ data: [] }))
    .mockResolvedValueOnce(response({ data: [] }));
  const result = await exchangeCode(env, oauthConfig(env), 'code', fetcher);
  expect(result.token).toBe('long');
  expect(Date.parse(result.expiresAt)).toBeGreaterThan(Date.now());
  expect(fetcher.mock.calls[2][1].headers.Authorization).toBe('Bearer long');
  fetcher.mockReset().mockResolvedValueOnce(response({ error: 'secret-fixture' }, 400));
  await expect(exchangeCode(env, oauthConfig(env), 'code', fetcher)).rejects.toThrow('status 400');
});

it('accepts Meta expiry values encoded as numeric strings', async () => {
  const fetcher = vi.fn()
    .mockResolvedValueOnce(response({ access_token: 'short' }))
    .mockResolvedValueOnce(response({ access_token: 'long', expires_in: '5183944' }))
    .mockResolvedValueOnce(response({ id: 'act_1234', name: 'Account', currency: 'INR', timezone_name: 'Asia/Kolkata', account_status: 1 }))
    .mockResolvedValueOnce(response({ data: [] }))
    .mockResolvedValueOnce(response({ data: [] }));
  const before = Date.now();
  const result = await exchangeCode(env, oauthConfig(env), 'code', fetcher);
  const expiry = Date.parse(result.expiresAt);
  expect(result.token).toBe('long');
  expect(expiry).toBeGreaterThan(before + 5183943 * 1000);
  expect(expiry).toBeLessThanOrEqual(Date.now() + 5183944 * 1000);
});

it('uses Meta token inspection when the exchange response has no usable expiry', async () => {
  const expiry = Math.floor(Date.now() / 1000) + 3600;
  const fetcher = vi.fn()
    .mockResolvedValueOnce(response({ access_token: 'short' }))
    .mockResolvedValueOnce(response({ access_token: 'long' }))
    .mockResolvedValueOnce(response({ data: {
      app_id: '123', is_valid: true, expires_at: expiry, data_access_expires_at: 0,
    } }))
    .mockResolvedValueOnce(response({ id: 'act_1234', name: 'Account', currency: 'INR', timezone_name: 'Asia/Kolkata', account_status: 1 }))
    .mockResolvedValueOnce(response({ data: [] }))
    .mockResolvedValueOnce(response({ data: [] }));
  const result = await exchangeCode(env, oauthConfig(env), 'code', fetcher);
  expect(result.expiresAt).toBe(new Date(expiry * 1000).toISOString());
  expect(new URL(fetcher.mock.calls[2][0]).pathname).toBe('/v27.0/debug_token');
  expect(new URL(fetcher.mock.calls[2][0]).searchParams.get('input_token')).toBe('long');
  expect(fetcher.mock.calls[2][1].headers.Authorization).toBe('Bearer 123|secret-fixture');
  expect(fetcher.mock.calls[3][1].headers.Authorization).toBe('Bearer long');
});

it('supports verified non-expiring tokens and rejects unverified tokens', async () => {
  const permanentTokenFetcher = vi.fn()
    .mockResolvedValueOnce(response({ access_token: 'short' }))
    .mockResolvedValueOnce(response({ access_token: 'long', expires_in: '0' }))
    .mockResolvedValueOnce(response({ data: {
      app_id: '123', is_valid: true, expires_at: 0, data_access_expires_at: 0,
    } }))
    .mockResolvedValueOnce(response({ id: 'act_1234', name: 'Account', currency: 'INR', timezone_name: 'Asia/Kolkata', account_status: 1 }))
    .mockResolvedValueOnce(response({ data: [] }))
    .mockResolvedValueOnce(response({ data: [] }));
  await expect(exchangeCode(env, oauthConfig(env), 'code', permanentTokenFetcher))
    .resolves.toMatchObject({ token: 'long', expiresAt: null });

  const invalidTokenFetcher = vi.fn()
    .mockResolvedValueOnce(response({ access_token: 'short' }))
    .mockResolvedValueOnce(response({ access_token: 'long' }))
    .mockResolvedValueOnce(response({ data: { app_id: 'other-app', is_valid: true, expires_at: 0 } }));
  await expect(exchangeCode(env, oauthConfig(env), 'code', invalidTokenFetcher))
    .rejects.toThrow('did not confirm that the new token is valid');
  expect(invalidTokenFetcher).toHaveBeenCalledTimes(3);
});

it('encrypts credentials with a fresh nonce and rejects a different key or tampering', async () => {
  const first = await encryptMetaToken('secret-token', values.META_TOKEN_ENCRYPTION_KEY);
  const second = await encryptMetaToken('secret-token', values.META_TOKEN_ENCRYPTION_KEY);
  expect(first).not.toContain('secret-token');
  expect(first).not.toBe(second);
  await expect(decryptMetaToken(first, values.META_TOKEN_ENCRYPTION_KEY)).resolves.toBe('secret-token');
  await expect(decryptMetaToken(first, btoa('q'.repeat(32)))).rejects.toThrow();
});

it('rejects invalid reconnect configuration before issuing a login URL', () => {
  expect(() => oauthConfig(name => name === 'META_TOKEN_ENCRYPTION_KEY' ? 'invalid' : env(name)))
    .toThrow('encryption key is invalid');
  expect(() => oauthConfig(name => name === 'META_OAUTH_REDIRECT_URI' ? 'http://example.test/meta-oauth-callback.html' : env(name)))
    .toThrow('redirect URI is invalid');
});
