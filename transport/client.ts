import type {
  IExecuteFunctions,
  IHookFunctions,
  IPollFunctions,
  IHttpRequestOptions,
  IHttpRequestMethods,
  INode,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

const ALLOWED_PREFIX = '/instrument/';

// Union of the helpers objects available across n8n node context types.
// All three expose helpers.httpRequest() in n8n-workflow 2.x.
type RequestHelpers =
  | IExecuteFunctions['helpers']
  | IHookFunctions['helpers']
  | IPollFunctions['helpers'];

export class LynxClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly helpers: RequestHelpers;
  private readonly node: INode;

  constructor(
    baseUrl: string,
    apiKey: string,
    timeoutMs: number,
    helpers: RequestHelpers,
    node: INode,
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
    this.timeoutMs = timeoutMs;
    this.helpers = helpers;
    this.node = node;
  }

  // ------------------------------------------------------------------ guards

  private assertPath(path: string): void {
    if (!path.startsWith(ALLOWED_PREFIX)) {
      throw new Error(
        `LynxClient: path must start with "${ALLOWED_PREFIX}", got "${path}"`,
      );
    }
  }

  private buildUrl(
    path: string,
    query?: Record<string, string | number>,
  ): string {
    let url = `${this.baseUrl}${path}`;
    if (query && Object.keys(query).length > 0) {
      const params = new URLSearchParams(
        Object.entries(query).map(([k, v]) => [k, String(v)]),
      );
      url = `${url}?${params.toString()}`;
    }
    return url;
  }

  // ---------------------------------------------------------------- base call
  // Shared options enforced on every request (FR-2, FR-5, FR-6, FR-9):
  //   - X-API-Key header (FR-2)
  //   - disableFollowRedirect: true → never follow 3xx, so an off-host
  //     redirect can never be chased (FR-5; the n8n-workflow 2.x field)
  //   - timeout in ms               → configurable, default 10 s (FR-6)
  //   - called once, never retried by this client (FR-9)

  private baseOptions(): Pick<
    IHttpRequestOptions,
    'headers' | 'disableFollowRedirect' | 'timeout'
  > {
    return {
      headers: { 'X-API-Key': this.apiKey },
      disableFollowRedirect: true,   // FR-5: never follow redirects (refuses off-host 3xx)
      timeout: this.timeoutMs,       // FR-6: configurable timeout (ms)
    };
  }

  // ------------------------------------------------------------- transport gate
  // Classify a transport-layer failure (no HTTP response: timeout, refused
  // connection, DNS failure) into a clear NodeOperationError that names the
  // verb, URL, and a human cause. This is distinct from an MM4 application
  // error (HTTP 2xx with a non-zero `error` field), which is handled by
  // `checkMM4Error` after a response is decoded. The API key lives only in a
  // header, never in the URL, so it is never echoed into these messages (NFR-2).

  private wrapTransportError(
    error: unknown,
    method: string,
    url: string,
  ): NodeOperationError {
    const err = error as { message?: string; code?: string } | undefined;
    const message = err?.message ?? String(error);
    const code = err?.code;

    let reason: string;
    if (code === 'ECONNABORTED' || /timeout/i.test(message)) {
      reason =
        `no response within ${this.timeoutMs} ms — the Method Manager host may be ` +
        `unreachable (is the tunnel/VPN up and the base URL correct?)`;
    } else if (code === 'ECONNREFUSED') {
      reason = 'connection refused — the Method Manager server may not be running or the port is wrong';
    } else if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
      reason = 'DNS lookup failed — check the base URL host';
    } else {
      reason = message;
    }

    return new NodeOperationError(
      this.node,
      `Method Manager request failed: ${method} ${url} — ${reason}`,
      { description: message },
    );
  }

  private async send<T>(
    method: IHttpRequestMethods,
    url: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const options: IHttpRequestOptions = {
      method,
      url,
      ...this.baseOptions(),
      ...(body !== undefined ? { body, json: true } : {}),
    };
    try {
      return (await this.helpers.httpRequest(options)) as T;
    } catch (error) {
      throw this.wrapTransportError(error, method, url);
    }
  }

  // ------------------------------------------------------------------- verbs

  async get<T = unknown>(
    path: string,
    query?: Record<string, string | number>,
  ): Promise<T> {
    this.assertPath(path);
    return this.send<T>('GET', this.buildUrl(path, query));
  }

  async post<T = unknown>(
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    this.assertPath(path);
    return this.send<T>('POST', this.buildUrl(path), body ?? {});
  }

  async put<T = unknown>(
    path: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    this.assertPath(path);
    return this.send<T>('PUT', this.buildUrl(path), body);
  }
}
