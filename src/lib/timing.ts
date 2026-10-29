/**
 * The speed test (2026-10-29, step 6): how long the slow-looking steps take on a
 * real phone, written to the terminal running `npx expo start` as
 * "[speed] search participants: 84 ms". Only in development; the field app
 * logs nothing.
 */
export async function timed<T>(label: string, work: () => Promise<T>, detail?: (result: T) => string): Promise<T> {
  if (!__DEV__) return work();
  const start = Date.now();
  try {
    const result = await work();
    const extra = detail ? ` (${detail(result)})` : "";
    console.log(`[speed] ${label}: ${Date.now() - start} ms${extra}`);
    return result;
  } catch (error) {
    console.log(`[speed] ${label}: failed after ${Date.now() - start} ms`);
    throw error;
  }
}
