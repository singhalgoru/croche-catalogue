const wait = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

export async function retryImport<T>(load: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await load();
    } catch (error) {
      lastError = error;
      if (attempt + 1 < attempts) await wait(200 * (attempt + 1));
    }
  }
  if (attempts < 1) throw new Error('Import failed without an attempt.');
  throw lastError;
}
