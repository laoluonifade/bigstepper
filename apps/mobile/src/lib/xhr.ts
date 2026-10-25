/**
 * A `fetch` for uploads, on React Native's own XMLHttpRequest.
 *
 * Expo (SDK 54 and later) replaces the global `fetch` with its own, which can't send React Native's
 * `{ uri, name, type }` file parts ("Unsupported FormDataPart implementation"). XMLHttpRequest still
 * streams them straight from disk, so photos and voice notes go through here.
 */
export function xhrFetch(url: string, init: RequestInit): Promise<Response> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open(init.method ?? 'GET', url);
    for (const [key, value] of Object.entries((init.headers ?? {}) as Record<string, string>)) request.setRequestHeader(key, value);
    request.onload = () => {
      const text = request.responseText ?? '';
      resolve({
        ok: request.status >= 200 && request.status < 300,
        status: request.status,
        text: async () => text,
        json: async () => JSON.parse(text),
      } as Response);
    };
    request.onerror = () => reject(new TypeError('Network request failed'));
    request.ontimeout = () => reject(new TypeError('Network request timed out'));
    request.onabort = () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
    init.signal?.addEventListener('abort', () => request.abort());
    request.send(init.body as XMLHttpRequestBodyInit);
  });
}
