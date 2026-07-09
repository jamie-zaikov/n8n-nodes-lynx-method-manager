/**
 * Unit tests for nodes/LynxMethodManager/LynxMethodManagerTrigger.node.ts
 * Run with: npx jest nodes/LynxMethodManager/LynxMethodManagerTrigger.test.ts
 */

import { NodeOperationError } from 'n8n-workflow';
import { LynxMethodManagerTrigger } from './LynxMethodManagerTrigger.node';
import type { MM4ResponseModel, NotificationPollResponse } from '../../transport/mm4';

// ── Stubs ─────────────────────────────────────────────────────────────────────

const STUB_NODE = {
  id: 'trigger-1', name: 'Lynx Method Manager Trigger', type: 'lynxMethodManagerTrigger',
  typeVersion: 1, position: [0, 0] as [number, number], parameters: {},
};

function okRaw(overrides: Partial<MM4ResponseModel> = {}): MM4ResponseModel {
  return {
    error: 0, application_state: 129, item: null, method_state: 1,
    last_method_result: 0, result: null, command: 9, command_name: 'MethodWatch',
    ...overrides,
  };
}

function makePollResp(
  items: NotificationPollResponse['items'] = [],
  latestSeq = items.length > 0 ? items[items.length - 1].sequence : 0,
  dropped = false,
): NotificationPollResponse {
  return { items, latest_sequence: latestSeq, dropped };
}

function makeNotificationItem(
  overrides: Partial<NotificationPollResponse['items'][number]> = {},
): NotificationPollResponse['items'][number] {
  return {
    sequence: 1,
    timestamp: '2026-05-29T10:00:00.000000',
    notification_type: 1,
    item_name: 'prep_mix',
    item_value: null,
    application_state: 129,
    ...overrides,
  };
}

// ── Context builder ───────────────────────────────────────────────────────────

interface ContextOptions {
  methodNameFilter?: string;
  watchVariableEntries?: Array<{ variableName: string }>;
  staticData?: Record<string, unknown>;
  postResponses?: MM4ResponseModel[];
  pollResponse?: NotificationPollResponse;
}

function makeContext(opts: ContextOptions = {}) {
  const staticData: Record<string, unknown> = opts.staticData ?? {};

  const params: Record<string, unknown> = {
    methodNameFilter: opts.methodNameFilter ?? '',
    'watchVariables.entries': opts.watchVariableEntries ?? [],
    options: {},
  };

  let postCallIndex = 0;
  const postResponses = opts.postResponses ?? [okRaw()];
  const postMock = jest.fn().mockImplementation(() =>
    Promise.resolve(postResponses[postCallIndex++ % postResponses.length]),
  );

  const getMock = jest.fn().mockResolvedValue(
    opts.pollResponse ?? makePollResp(),
  );

  // n8n-workflow 2.x helpers stub (httpRequest — used by LynxClient internally).
  // In these tests, LynxClient is constructor-spied and replaced with clientMock,
  // so helpers.httpRequest is never actually called. Declared here for type completeness.
  const helpers = {
    httpRequest: jest.fn(),
  };

  // We inject a pre-built LynxClient mock via constructor spy so we can inspect
  // per-verb (post/get) calls cleanly without going through helpers.httpRequest.
  const clientMock = { post: postMock, get: getMock };

  const ctx = {
    getNode: () => STUB_NODE as never,
    getCredentials: async () => ({ baseUrl: 'http://lm001:8000', apiKey: 'k' }),
    getNodeParameter: (name: string, fallback?: unknown) => {
      return name in params ? params[name] : fallback;
    },
    getWorkflowStaticData: (_scope: string) => staticData,
    helpers,
    // Expose mocks for assertions
    _postMock: postMock,
    _getMock: getMock,
    _staticData: staticData,
    _clientMock: clientMock,
  };

  return ctx;
}

// We need to inject the client mock into the trigger instance.
// Strategy: patch LynxClient constructor to return our mock client.
import * as clientModule from '../../transport/client';

function runPoll(ctx: ReturnType<typeof makeContext>) {
  // Patch LynxClient to return our pre-built mock
  jest
    .spyOn(clientModule, 'LynxClient' as never)
    .mockImplementation(() => ctx._clientMock as never);

  const trigger = new LynxMethodManagerTrigger();
  // Bind context to poll()
  return trigger.poll.call(ctx as never);
}

afterEach(() => {
  jest.restoreAllMocks();
});

// ── Watch registration ────────────────────────────────────────────────────────

describe('LynxMethodManagerTrigger watch registration', () => {
  it('registers method watch on first poll (watchesRegistered undefined)', async () => {
    const ctx = makeContext({ staticData: {} });
    await runPoll(ctx);

    expect(ctx._postMock).toHaveBeenCalledWith(
      '/instrument/watches/method',
      { watch: true },
    );
  });

  it('registers one variable watch per configured variable on first poll', async () => {
    const ctx = makeContext({
      staticData: {},
      watchVariableEntries: [
        { variableName: 'PlateCount' },
        { variableName: 'Volume' },
      ],
      postResponses: [okRaw(), okRaw(), okRaw()], // method watch + 2 variable watches
    });
    await runPoll(ctx);

    expect(ctx._postMock).toHaveBeenCalledWith(
      '/instrument/watches/variable',
      { variable_name: 'PlateCount', watch: true },
    );
    expect(ctx._postMock).toHaveBeenCalledWith(
      '/instrument/watches/variable',
      { variable_name: 'Volume', watch: true },
    );
  });

  it('does NOT register watches on subsequent polls (watchesRegistered: true)', async () => {
    const ctx = makeContext({ staticData: { watchesRegistered: true, since: 10 } });
    await runPoll(ctx);

    expect(ctx._postMock).not.toHaveBeenCalled();
  });

  it('sets staticData.watchesRegistered = true after first poll', async () => {
    const ctx = makeContext({ staticData: {} });
    await runPoll(ctx);

    expect(ctx._staticData.watchesRegistered).toBe(true);
  });

  it('throws NodeOperationError when method watch returns nonzero MM4 error', async () => {
    const ctx = makeContext({
      staticData: {},
      postResponses: [okRaw({ error: 2 })], // ApplicationBlocked
    });

    await expect(runPoll(ctx)).rejects.toThrow(NodeOperationError);
  });
});

// ── Cursor persistence ────────────────────────────────────────────────────────

describe('LynxMethodManagerTrigger cursor persistence', () => {
  it('polls with since=0 on first call', async () => {
    const ctx = makeContext({ staticData: { watchesRegistered: true } });
    await runPoll(ctx);

    expect(ctx._getMock).toHaveBeenCalledWith(
      '/instrument/notifications',
      expect.objectContaining({ since: 0 }),
    );
  });

  it('polls with persisted since value on subsequent calls', async () => {
    const ctx = makeContext({ staticData: { watchesRegistered: true, since: 42 } });
    await runPoll(ctx);

    expect(ctx._getMock).toHaveBeenCalledWith(
      '/instrument/notifications',
      expect.objectContaining({ since: 42 }),
    );
  });

  it('updates staticData.since to latest_sequence after poll', async () => {
    const ctx = makeContext({
      staticData: { watchesRegistered: true, since: 0 },
      pollResponse: makePollResp([], 99),
    });
    await runPoll(ctx);

    expect(ctx._staticData.since).toBe(99);
  });

  it('updates cursor even when items array is empty', async () => {
    const ctx = makeContext({
      staticData: { watchesRegistered: true, since: 5 },
      pollResponse: makePollResp([], 55),
    });
    await runPoll(ctx);

    expect(ctx._staticData.since).toBe(55);
  });
});

// ── Notification filtering ────────────────────────────────────────────────────

describe('LynxMethodManagerTrigger notification filtering', () => {
  it('emits notification_type 1 (MethodComplete)', async () => {
    const item = makeNotificationItem({ notification_type: 1, sequence: 1 });
    const ctx = makeContext({
      staticData: { watchesRegistered: true },
      pollResponse: makePollResp([item], 1),
    });
    const result = await runPoll(ctx);
    expect(result).not.toBeNull();
    expect(result![0]).toHaveLength(1);
  });

  it('emits notification_type 2 (VariableChanged)', async () => {
    const item = makeNotificationItem({ notification_type: 2, item_name: 'Count', item_value: '5', sequence: 1 });
    const ctx = makeContext({
      staticData: { watchesRegistered: true },
      pollResponse: makePollResp([item], 1),
    });
    const result = await runPoll(ctx);
    expect(result![0][0].json).toMatchObject({ notification_type_name: 'VariableChanged' });
  });

  it('emits notification_type 3 (InitializationComplete)', async () => {
    const item = makeNotificationItem({ notification_type: 3, sequence: 1 });
    const ctx = makeContext({
      staticData: { watchesRegistered: true },
      pollResponse: makePollResp([item], 1),
    });
    const result = await runPoll(ctx);
    expect(result).not.toBeNull();
  });

  it('emits notification_type 4 (ConnectionComplete)', async () => {
    const item = makeNotificationItem({ notification_type: 4, sequence: 1 });
    const ctx = makeContext({
      staticData: { watchesRegistered: true },
      pollResponse: makePollResp([item], 1),
    });
    const result = await runPoll(ctx);
    expect(result).not.toBeNull();
  });

  it('silently skips notification_type 5 (unknown)', async () => {
    const item = makeNotificationItem({ notification_type: 5, sequence: 1 });
    const ctx = makeContext({
      staticData: { watchesRegistered: true },
      pollResponse: makePollResp([item], 1),
    });
    const result = await runPoll(ctx);
    expect(result).toBeNull();
  });

  it('silently skips notification_type 0 (Unknown)', async () => {
    const item = makeNotificationItem({ notification_type: 0, sequence: 1 });
    const ctx = makeContext({
      staticData: { watchesRegistered: true },
      pollResponse: makePollResp([item], 1),
    });
    const result = await runPoll(ctx);
    expect(result).toBeNull();
  });
});

// ── MethodComplete sub-method filtering ───────────────────────────────────────

describe('LynxMethodManagerTrigger MethodComplete filtering', () => {
  it('drops MethodComplete with non-matching item_name when filter is set', async () => {
    const item = makeNotificationItem({
      notification_type: 1,
      item_name: 'sub_method',
      sequence: 1,
    });
    const ctx = makeContext({
      staticData: { watchesRegistered: true },
      methodNameFilter: 'prep_mix',
      pollResponse: makePollResp([item], 1),
    });
    const result = await runPoll(ctx);
    expect(result).toBeNull();
  });

  it('emits MethodComplete when item_name matches the filter', async () => {
    const item = makeNotificationItem({
      notification_type: 1,
      item_name: 'prep_mix',
      sequence: 1,
    });
    const ctx = makeContext({
      staticData: { watchesRegistered: true },
      methodNameFilter: 'prep_mix',
      pollResponse: makePollResp([item], 1),
    });
    const result = await runPoll(ctx);
    expect(result).not.toBeNull();
    expect(result![0][0].json).toMatchObject({ item_name: 'prep_mix' });
  });

  it('emits all MethodComplete notifications when filter is empty', async () => {
    const items = [
      makeNotificationItem({ notification_type: 1, item_name: 'sub_a', sequence: 1 }),
      makeNotificationItem({ notification_type: 1, item_name: 'main_method', sequence: 2 }),
    ];
    const ctx = makeContext({
      staticData: { watchesRegistered: true },
      methodNameFilter: '',
      pollResponse: makePollResp(items, 2),
    });
    const result = await runPoll(ctx);
    expect(result![0]).toHaveLength(2);
  });
});

// ── dropped flag ──────────────────────────────────────────────────────────────

describe('LynxMethodManagerTrigger dropped flag', () => {
  it('stamps dropped: true on emitted items when poll response has dropped=true', async () => {
    const item = makeNotificationItem({ notification_type: 1, sequence: 1 });
    const ctx = makeContext({
      staticData: { watchesRegistered: true },
      pollResponse: makePollResp([item], 1, true),
    });
    const result = await runPoll(ctx);
    expect(result![0][0].json).toMatchObject({ dropped: true });
  });

  it('stamps dropped: false when not dropped', async () => {
    const item = makeNotificationItem({ notification_type: 1, sequence: 1 });
    const ctx = makeContext({
      staticData: { watchesRegistered: true },
      pollResponse: makePollResp([item], 1, false),
    });
    const result = await runPoll(ctx);
    expect(result![0][0].json).toMatchObject({ dropped: false });
  });
});

// ── output item structure (FR-34) ─────────────────────────────────────────────

describe('LynxMethodManagerTrigger output item structure', () => {
  it('output item contains all 9 required fields from FR-34', async () => {
    const item = makeNotificationItem({
      notification_type: 1,
      item_name: 'prep_mix',
      item_value: null,
      application_state: 129,
      sequence: 42,
      timestamp: '2026-05-29T10:00:00.000000',
    });
    const ctx = makeContext({
      staticData: { watchesRegistered: true },
      pollResponse: makePollResp([item], 42),
    });
    const result = await runPoll(ctx);
    const json = result![0][0].json;

    expect(json).toMatchObject({
      sequence: 42,
      timestamp: '2026-05-29T10:00:00.000000',
      notification_type: 1,
      notification_type_name: 'MethodComplete',
      item_name: 'prep_mix',
      item_value: null,
      application_state_raw: 129,
      application_state_flags: expect.arrayContaining(['WorkspaceLoaded', 'DevicesReady']),
      dropped: false,
    });
  });
});

// ── null return when no items qualify ────────────────────────────────────────

describe('LynxMethodManagerTrigger null return', () => {
  it('returns null when no items (empty poll)', async () => {
    const ctx = makeContext({
      staticData: { watchesRegistered: true },
      pollResponse: makePollResp([], 0),
    });
    const result = await runPoll(ctx);
    expect(result).toBeNull();
  });

  it('returns null when all items are filtered out', async () => {
    const item = makeNotificationItem({ notification_type: 5, sequence: 1 });
    const ctx = makeContext({
      staticData: { watchesRegistered: true },
      pollResponse: makePollResp([item], 1),
    });
    const result = await runPoll(ctx);
    expect(result).toBeNull();
  });
});
