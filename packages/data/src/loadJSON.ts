/**
 * Fetch and parse a JSON document. The single entry point for reading the small
 * JSON artifacts that precompute exports into `public/data/<course>/`.
 *
 * @typeParam T - the expected shape of the parsed JSON. This is an unchecked
 *   cast — validate at the call site if the source is untrusted.
 */
export async function loadJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    throw new Error(`loadJSON: ${res.status} ${res.statusText} — ${url}`);
  }
  return (await res.json()) as T;
}
