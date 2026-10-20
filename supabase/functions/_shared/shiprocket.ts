const API = 'https://apiv2.shiprocket.in/v1/external';
interface TokenStore {
  read: () => Promise<string | null>;
  write: (token: string, expiresAt: string) => Promise<void>;
}
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Shiprocket returned an invalid response.');
  return value as Record<string, unknown>;
};
export function createShiprocketClient(email: string, password: string, tokens: TokenStore, timeoutMs = 8000) {
  let current: string | null = null;
  async function login() {
    const response = await fetch(`${API}/auth/login`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email,password }),
      signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) throw new Error(`Shiprocket login failed (HTTP ${response.status}).`);
    const value = object(await response.json()).token;
    if (typeof value !== 'string' || !value) throw new Error('Shiprocket login returned no token.');
    await tokens.write(value,new Date(Date.now()+9*86400000).toISOString());
    return value;
  }
  return async (path: string, body?: unknown) => {
    current ??= await tokens.read() ?? await login();
    const send = () => fetch(`${API}${path}`, { method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${current}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(timeoutMs) });
    let response = await send();
    if (response.status === 401) { current = await login(); response = await send(); }
    if (response.status === 404 && body === undefined && path.startsWith('/courier/serviceability/?')) return { status: 404 };
    if (!response.ok) throw new Error(`Shiprocket request failed (HTTP ${response.status}). Check Shiprocket before retrying a booking.`);
    return object(await response.json());
  };
}
