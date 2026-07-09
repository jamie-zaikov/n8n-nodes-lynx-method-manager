/**
 * Unit tests for LynxClient (transport/client.ts).
 *
 * Tests mock helpers.httpRequest (n8n-workflow 2.x API) — no live HTTP is made.
 * Run with: npx jest transport/client.test.ts
 */

import { LynxClient } from './client';

// ── minimal helpers mock ──────────────────────────────────────────────────────
// In n8n-workflow 2.x the HTTP helper is helpers.httpRequest(), not helpers.request().

function makeHelpers(returnValue: unknown = {}) {
  const httpRequest = jest.fn().mockResolvedValue(returnValue);
  return { httpRequest } as unknown as ConstructorParameters<typeof LynxClient>[3];
}

// Minimal INode mock for NodeOperationError construction.
const NODE = { name: 'Lynx Method Manager', type: 'lynxMethodManager', typeVersion: 1 } as unknown as ConstructorParameters<typeof LynxClient>[4];

// ── path guard ────────────────────────────────────────────────────────────────

describe('LynxClient path guard', () => {
  it('throws when path does not start with /instrument/', async () => {
    const client = new LynxClient('http://host', 'key', 5000, makeHelpers(), NODE);
    await expect(client.get('/other/path')).rejects.toThrow(
      'path must start with "/instrument/"',
    );
  });

  it('throws for an empty path', async () => {
    const client = new LynxClient('http://host', 'key', 5000, makeHelpers(), NODE);
    await expect(client.get('')).rejects.toThrow(
      'path must start with "/instrument/"',
    );
  });

  it('does NOT throw for a valid /instrument/... path (GET)', async () => {
    const helpers = makeHelpers({ ok: true });
    const client = new LynxClient('http://host', 'key', 5000, helpers, NODE);
    await expect(client.get('/instrument/methods/state')).resolves.toEqual({
      ok: true,
    });
  });

  it('throws BEFORE calling httpRequest on invalid path', async () => {
    const helpers = makeHelpers({});
    const client = new LynxClient('http://host', 'key', 5000, helpers, NODE);
    await expect(client.get('/bad/path')).rejects.toThrow();
    expect(helpers.httpRequest).not.toHaveBeenCalled();
  });
});

// ── URL construction ──────────────────────────────────────────────────────────

describe('LynxClient URL building', () => {
  it('builds GET URL without query params', async () => {
    const helpers = makeHelpers({});
    const client = new LynxClient('http://lm001:8000', 'key', 5000, helpers, NODE);
    await client.get('/instrument/methods/state');
    expect(helpers.httpRequest).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'http://lm001:8000/instrument/methods/state' }),
    );
  });

  it('builds GET URL with query params', async () => {
    const helpers = makeHelpers({});
    const client = new LynxClient('http://lm001:8000', 'key', 5000, helpers, NODE);
    await client.get('/instrument/notifications', { since: 42, max_items: 100 });
    const call = (helpers.httpRequest as jest.Mock).mock.calls[0][0] as { url: string };
    expect(call.url).toContain('since=42');
    expect(call.url).toContain('max_items=100');
  });

  it('strips trailing slash from baseUrl', async () => {
    const helpers = makeHelpers({});
    const client = new LynxClient('http://lm001:8000/', 'key', 5000, helpers, NODE);
    await client.get('/instrument/methods/state');
    const call = (helpers.httpRequest as jest.Mock).mock.calls[0][0] as { url: string };
    expect(call.url).toBe('http://lm001:8000/instrument/methods/state');
    expect(call.url).not.toContain('//instrument');
  });
});

// ── X-API-Key header ──────────────────────────────────────────────────────────

describe('LynxClient X-API-Key header', () => {
  const BASE = 'http://host';
  const KEY = 'test-api-key-123';

  it('sets X-API-Key on GET', async () => {
    const helpers = makeHelpers({});
    const client = new LynxClient(BASE, KEY, 5000, helpers, NODE);
    await client.get('/instrument/application/state');
    expect(helpers.httpRequest).toHaveBeenCalledWith(
      expect.objectContaining({ headers: expect.objectContaining({ 'X-API-Key': KEY }) }),
    );
  });

  it('sets X-API-Key on POST', async () => {
    const helpers = makeHelpers({});
    const client = new LynxClient(BASE, KEY, 5000, helpers, NODE);
    await client.post('/instrument/methods/stop', {});
    expect(helpers.httpRequest).toHaveBeenCalledWith(
      expect.objectContaining({ headers: expect.objectContaining({ 'X-API-Key': KEY }) }),
    );
  });

  it('sets X-API-Key on PUT', async () => {
    const helpers = makeHelpers({});
    const client = new LynxClient(BASE, KEY, 5000, helpers, NODE);
    await client.put('/instrument/variables/Count', { value: '5' });
    expect(helpers.httpRequest).toHaveBeenCalledWith(
      expect.objectContaining({ headers: expect.objectContaining({ 'X-API-Key': KEY }) }),
    );
  });
});

// ── disableFollowRedirect: true (n8n-workflow 2.x redirect-refusal field) ──────

describe('LynxClient redirect refusal (FR-5)', () => {
  const BASE = 'http://host';
  const KEY = 'key';

  it('sets disableFollowRedirect: true on GET', async () => {
    const helpers = makeHelpers({});
    const client = new LynxClient(BASE, KEY, 5000, helpers, NODE);
    await client.get('/instrument/application/state');
    expect(helpers.httpRequest).toHaveBeenCalledWith(
      expect.objectContaining({ disableFollowRedirect: true }),
    );
  });

  it('sets disableFollowRedirect: true on POST', async () => {
    const helpers = makeHelpers({});
    const client = new LynxClient(BASE, KEY, 5000, helpers, NODE);
    await client.post('/instrument/hardware/initialize', {});
    expect(helpers.httpRequest).toHaveBeenCalledWith(
      expect.objectContaining({ disableFollowRedirect: true }),
    );
  });

  it('sets disableFollowRedirect: true on PUT', async () => {
    const helpers = makeHelpers({});
    const client = new LynxClient(BASE, KEY, 5000, helpers, NODE);
    await client.put('/instrument/variables/X', { value: '1' });
    expect(helpers.httpRequest).toHaveBeenCalledWith(
      expect.objectContaining({ disableFollowRedirect: true }),
    );
  });
});

// ── timeout forwarding ────────────────────────────────────────────────────────

describe('LynxClient timeout (FR-6)', () => {
  it('forwards timeout from constructor on GET', async () => {
    const helpers = makeHelpers({});
    const client = new LynxClient('http://host', 'key', 12345, helpers, NODE);
    await client.get('/instrument/methods/state');
    expect(helpers.httpRequest).toHaveBeenCalledWith(
      expect.objectContaining({ timeout: 12345 }),
    );
  });

  it('forwards timeout from constructor on POST', async () => {
    const helpers = makeHelpers({});
    const client = new LynxClient('http://host', 'key', 7777, helpers, NODE);
    await client.post('/instrument/methods/stop', {});
    expect(helpers.httpRequest).toHaveBeenCalledWith(
      expect.objectContaining({ timeout: 7777 }),
    );
  });

  it('forwards timeout from constructor on PUT', async () => {
    const helpers = makeHelpers({});
    const client = new LynxClient('http://host', 'key', 3000, helpers, NODE);
    await client.put('/instrument/variables/N', { value: 'v' });
    expect(helpers.httpRequest).toHaveBeenCalledWith(
      expect.objectContaining({ timeout: 3000 }),
    );
  });
});

// ── no retry (FR-9) ───────────────────────────────────────────────────────────

describe('LynxClient no retry (FR-9)', () => {
  it('propagates rejection from helpers.httpRequest without retrying', async () => {
    const error = new Error('connection refused');
    const helpers = {
      httpRequest: jest.fn().mockRejectedValue(error),
    } as unknown as ConstructorParameters<typeof LynxClient>[3];
    const client = new LynxClient('http://host', 'key', 5000, helpers, NODE);
    await expect(client.get('/instrument/methods/state')).rejects.toThrow(
      'connection refused',
    );
    // Called exactly once — no retry
    expect(helpers.httpRequest).toHaveBeenCalledTimes(1);
  });
});

// ── transport-error wrapping (clear NodeOperationError, not raw AxiosError) ────

describe('LynxClient transport-error wrapping', () => {
  function rejectingClient(error: unknown, timeoutMs = 10_000) {
    const helpers = {
      httpRequest: jest.fn().mockRejectedValue(error),
    } as unknown as ConstructorParameters<typeof LynxClient>[3];
    return new LynxClient('http://lm001:8000', 'key', timeoutMs, helpers, NODE);
  }

  it('wraps an axios timeout into a clear, actionable message naming verb + URL', async () => {
    const client = rejectingClient(new Error('timeout of 10000ms exceeded'), 10_000);
    await expect(client.post('/instrument/hardware/initialize', {})).rejects.toThrow(
      /Method Manager request failed: POST http:\/\/lm001:8000\/instrument\/hardware\/initialize/,
    );
    await expect(client.post('/instrument/hardware/initialize', {})).rejects.toThrow(
      /no response within 10000 ms/,
    );
  });

  it('classifies ECONNABORTED as a timeout regardless of message', async () => {
    const client = rejectingClient(Object.assign(new Error('aborted'), { code: 'ECONNABORTED' }), 3000);
    await expect(client.get('/instrument/methods/state')).rejects.toThrow(/no response within 3000 ms/);
  });

  it('classifies ECONNREFUSED as connection refused', async () => {
    const client = rejectingClient(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }));
    await expect(client.get('/instrument/methods/state')).rejects.toThrow(/connection refused/);
  });

  it('classifies ENOTFOUND as a DNS failure', async () => {
    const client = rejectingClient(Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' }));
    await expect(client.get('/instrument/methods/state')).rejects.toThrow(/DNS lookup failed/);
  });

  it('falls back to the original message for unclassified errors', async () => {
    const client = rejectingClient(new Error('some other failure'));
    await expect(client.put('/instrument/variables/X', { value: '1' })).rejects.toThrow(/some other failure/);
  });

  it('never includes the API key in the wrapped error (NFR-2)', async () => {
    const helpers = {
      httpRequest: jest.fn().mockRejectedValue(new Error('timeout of 10000ms exceeded')),
    } as unknown as ConstructorParameters<typeof LynxClient>[3];
    const client = new LynxClient('http://lm001:8000', 'SUPER-SECRET-KEY', 10_000, helpers, NODE);
    const err = (await client
      .get('/instrument/methods/state')
      .catch((e) => e)) as Error & { description?: string };
    expect(err.message).not.toContain('SUPER-SECRET-KEY');
    expect(err.description ?? '').not.toContain('SUPER-SECRET-KEY');
  });
});
