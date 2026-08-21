import { request as httpRequest, type IncomingMessage } from 'http';
import { request as httpsRequest } from 'https';
import { createBrotliDecompress, createGunzip, createInflate } from 'zlib';
import type { Readable } from 'stream';

/**
 * The one HTTP client the app makes outbound calls with.
 *
 * On a normal Node runtime this is just global fetch. On iOS it can't be:
 * nodejs-mobile runs V8 without JIT, so WebAssembly is unavailable, and Node's
 * bundled fetch is undici — whose HTTP parser is a WASM module. Calling fetch
 * there dies with "WebAssembly is not defined". node:http/node:https use the
 * native C++ parser and work fine, so that's the fallback.
 *
 * Only the slice of the fetch surface this codebase actually uses is
 * implemented: method/headers/body/signal in, ok/status/headers/json/text out.
 */

export interface AppRequestInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string | Buffer | Uint8Array;
  signal?: AbortSignal;
}

export interface AppResponse {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  json<T = any>(): Promise<T>;
  text(): Promise<string>;
}

/**
 * WebAssembly is the tell: where it's missing, so is a working fetch. Resolved
 * once at module load — the runtime doesn't gain WASM halfway through a session.
 */
const HAS_NATIVE_FETCH = typeof WebAssembly !== 'undefined' && typeof globalThis.fetch === 'function';

const MAX_REDIRECTS = 5;

function decompress(res: IncomingMessage): Readable {
  switch ((res.headers['content-encoding'] ?? '').toLowerCase()) {
    case 'gzip':
      return res.pipe(createGunzip());
    case 'deflate':
      return res.pipe(createInflate());
    case 'br':
      return res.pipe(createBrotliDecompress());
    default:
      return res;
  }
}

function nodeFetch(url: string, init: AppRequestInit = {}, redirectsLeft = MAX_REDIRECTS): Promise<AppResponse> {
  return new Promise((resolve, reject) => {
    const { signal } = init;
    if (signal?.aborted) {
      reject(signal.reason ?? new Error('Aborted'));
      return;
    }

    let target: URL;
    try {
      target = new URL(url);
    } catch {
      reject(new TypeError(`Invalid URL: ${url}`));
      return;
    }

    const body =
      typeof init.body === 'string' ? Buffer.from(init.body, 'utf-8')
      : init.body instanceof Uint8Array ? Buffer.from(init.body)
      : undefined;

    // Header names are lowercased so the caller-supplied ones win over these
    // defaults rather than being sent twice.
    const headers: Record<string, string | number> = {};
    for (const [key, value] of Object.entries(init.headers ?? {})) {
      headers[key.toLowerCase()] = value;
    }
    headers['accept-encoding'] ??= 'identity';
    if (body) headers['content-length'] = body.length;

    const send = target.protocol === 'http:' ? httpRequest : httpsRequest;
    const req = send(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || undefined,
        path: `${target.pathname}${target.search}`,
        method: init.method ?? 'GET',
        headers,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const location = res.headers.location;
        if (status >= 300 && status < 400 && location && redirectsLeft > 0) {
          res.resume(); // drain, or the socket is never released
          // 303, and 301/302 on POST, become a GET without a body — same rule fetch follows.
          const dropsBody = status === 303 || ((status === 301 || status === 302) && (init.method ?? 'GET') !== 'HEAD');
          const next: AppRequestInit = dropsBody
            ? { ...init, method: status === 303 ? 'GET' : (init.method ?? 'GET') === 'POST' ? 'GET' : init.method, body: undefined }
            : init;
          nodeFetch(new URL(location, target).toString(), next, redirectsLeft - 1).then(resolve, reject);
          return;
        }

        const chunks: Buffer[] = [];
        const stream = decompress(res);
        stream.on('data', (chunk: Buffer) => chunks.push(chunk));
        stream.on('error', reject);
        stream.on('end', () => {
          const raw = Buffer.concat(chunks);
          const text = async (): Promise<string> => raw.toString('utf-8');
          resolve({
            ok: status >= 200 && status < 300,
            status,
            headers: {
              get: (name: string) => {
                const value = res.headers[name.toLowerCase()];
                return Array.isArray(value) ? value.join(', ') : (value ?? null);
              },
            },
            text,
            json: async <T,>() => JSON.parse(raw.toString('utf-8')) as T,
          });
        });
      },
    );

    req.on('error', reject);

    if (signal) {
      // Rejecting with signal.reason keeps AbortSignal.timeout's DOMException
      // (name 'TimeoutError') intact — callers branch on that name.
      const onAbort = (): void => {
        req.destroy();
        reject(signal.reason ?? new Error('Aborted'));
      };
      signal.addEventListener('abort', onAbort, { once: true });
      req.on('close', () => signal.removeEventListener('abort', onAbort));
    }

    if (body) req.write(body);
    req.end();
  });
}

/** fetch where it exists, node:http/https where it doesn't (iOS). */
export function appFetch(url: string, init: AppRequestInit = {}): Promise<AppResponse> {
  if (HAS_NATIVE_FETCH) {
    return globalThis.fetch(url, init as RequestInit) as unknown as Promise<AppResponse>;
  }
  return nodeFetch(url, init);
}

/** Whether outbound HTTP is going through the no-WASM fallback path. */
export function isUsingFetchFallback(): boolean {
  return !HAS_NATIVE_FETCH;
}
