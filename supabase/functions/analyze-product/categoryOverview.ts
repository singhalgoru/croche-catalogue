export const callCloudflareOverview = async (
  accountId: string,
  token: string,
  prompt: string,
): Promise<{ data: Record<string, unknown> } | { error: string }> => {
  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/@cf/meta/llama-3.3-70b-instruct-fp8-fast`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(20_000),
        body: JSON.stringify({
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          max_tokens: 500,
          response_format: {
            type: 'json_schema',
            json_schema: {
              type: 'object',
              properties: { overview: { type: 'string' } },
              required: ['overview'],
            },
          },
        }),
      },
    );
    const payload = await response.json();
    if (!response.ok || payload?.success === false) {
      return { error: `Cloudflare overview generation failed (HTTP ${response.status}). Check Workers AI permissions and quota, or try again later.` };
    }
    const result: unknown = payload?.result?.response;
    let data: unknown = result;
    if (typeof result === 'string') {
      try {
        data = JSON.parse(result);
      } catch {
        return { error: 'Cloudflare returned an invalid category overview response.' };
      }
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)
      || !('overview' in data) || typeof data.overview !== 'string') {
      return { error: 'Cloudflare returned an invalid category overview response.' };
    }
    return { data: data as Record<string, unknown> };
  } catch (error) {
    return { error: error !== null && typeof error === 'object' && 'name' in error
      && (error.name === 'TimeoutError' || error.name === 'AbortError')
      ? 'Cloudflare overview generation timed out. Please try again later.'
      : 'Cloudflare could not complete overview generation. Check the connection or try again later.' };
  }
};
