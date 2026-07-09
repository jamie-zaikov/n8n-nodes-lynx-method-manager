/**
 * Unit tests for nodes/Lynx/operations/method.ts
 * Run with: npx jest nodes/Lynx/operations/method.test.ts
 */

import { NodeOperationError } from 'n8n-workflow';
import {
  methodRun,
  methodStop,
  methodGetState,
  methodGetLastResult,
} from './method';
import type { LynxClient } from '../../../transport/client';
import type { MM4ResponseModel } from '../../../transport/mm4';

// ── Helpers ───────────────────────────────────────────────────────────────────

const STUB_NODE = {
  id: 'n1',
  name: 'Lynx Method Manager',
  type: 'lynxMethodManager',
  typeVersion: 1,
  position: [0, 0] as [number, number],
  parameters: {},
};

function okRaw(overrides: Partial<MM4ResponseModel> = {}): MM4ResponseModel {
  return {
    error: 0,
    application_state: 129,
    item: null,
    method_state: 1,
    last_method_result: 0,
    result: null,
    command: 1,
    command_name: 'StartMethod',
    ...overrides,
  };
}

function errRaw(errorCode = 9): MM4ResponseModel {
  return okRaw({ error: errorCode });
}

/** Build a minimal IExecuteFunctions stub */
function makeContext(params: Record<string, unknown> = {}) {
  const defaults: Record<string, unknown> = {
    methodName: 'prep_mix',
    'variables.values': [],
    variableName: 'Count',
    variableValue: '5',
    resource: 'method',
    operation: 'run',
    options: {},
  };
  const merged = { ...defaults, ...params };

  return {
    getNode: () => STUB_NODE as never,
    getInputData: () => [{ json: {} }],
    getNodeParameter: (name: string, _i: number, fallback?: unknown) => {
      return name in merged ? merged[name] : fallback;
    },
    continueOnFail: () => false,
  } as never;
}

/** Build a LynxClient mock with controllable responses */
function makeClient(responses: {
  get?: () => Promise<MM4ResponseModel>;
  post?: () => Promise<MM4ResponseModel>;
  put?: () => Promise<MM4ResponseModel>;
}) {
  return {
    get: responses.get ?? jest.fn(),
    post: responses.post ?? jest.fn(),
    put: responses.put ?? jest.fn(),
  } as unknown as LynxClient;
}

// ── methodRun ─────────────────────────────────────────────────────────────────

describe('methodRun', () => {
  it('calls POST methods/start directly when variable list is empty', async () => {
    const postMock = jest.fn().mockResolvedValue(okRaw());
    const client = makeClient({ post: postMock });
    const ctx = makeContext({ 'variables.values': [] });

    await methodRun(ctx, client);

    expect(postMock).toHaveBeenCalledTimes(1);
    expect(postMock).toHaveBeenCalledWith(
      '/instrument/methods/start',
      { method_name: 'prep_mix' },
    );
  });

  it('calls PUT for each variable before POST start', async () => {
    const putMock = jest.fn().mockResolvedValue(okRaw({ command: 6, command_name: 'SetVariable' }));
    const postMock = jest.fn().mockResolvedValue(okRaw());
    const client = makeClient({ put: putMock, post: postMock });

    const vars = [
      { name: 'PlateCount', value: '3' },
      { name: 'Volume', value: '100' },
    ];
    const ctx = makeContext({ 'variables.values': vars });

    await methodRun(ctx, client);

    expect(putMock).toHaveBeenCalledTimes(2);
    expect(putMock).toHaveBeenNthCalledWith(
      1,
      '/instrument/variables/PlateCount',
      { value: '3' },
    );
    expect(putMock).toHaveBeenNthCalledWith(
      2,
      '/instrument/variables/Volume',
      { value: '100' },
    );
    expect(postMock).toHaveBeenCalledWith(
      '/instrument/methods/start',
      { method_name: 'prep_mix' },
    );
  });

  it('aborts and does NOT call POST start when first variable PUT returns nonzero error', async () => {
    const putMock = jest.fn().mockResolvedValue(errRaw(9)); // UnknownVariable
    const postMock = jest.fn();
    const client = makeClient({ put: putMock, post: postMock });

    const vars = [{ name: 'BadVar', value: '1' }];
    const ctx = makeContext({ 'variables.values': vars });

    await expect(methodRun(ctx, client)).rejects.toThrow(NodeOperationError);
    expect(postMock).not.toHaveBeenCalled();
  });

  it('aborts on second variable failure — POST start never called', async () => {
    const putMock = jest
      .fn()
      .mockResolvedValueOnce(okRaw({ command: 6, command_name: 'SetVariable' }))
      .mockResolvedValueOnce(errRaw(10)); // VariableIsReadOnly
    const postMock = jest.fn();
    const client = makeClient({ put: putMock, post: postMock });

    const vars = [
      { name: 'GoodVar', value: '1' },
      { name: 'ReadOnly', value: '2' },
    ];
    const ctx = makeContext({ 'variables.values': vars });

    await expect(methodRun(ctx, client)).rejects.toThrow(NodeOperationError);
    expect(postMock).not.toHaveBeenCalled();
  });

  it('output includes variable_writes summary on success', async () => {
    const putMock = jest.fn().mockResolvedValue(okRaw({ command: 6, command_name: 'SetVariable' }));
    const postMock = jest.fn().mockResolvedValue(okRaw());
    const client = makeClient({ put: putMock, post: postMock });

    const vars = [{ name: 'Count', value: '5' }];
    const ctx = makeContext({ 'variables.values': vars });

    const [[item]] = await methodRun(ctx, client);
    expect(item.json).toMatchObject({
      variable_writes: [{ name: 'Count', value: '5', error_code: 0, error_name: 'OK' }],
    });
  });
});

// ── methodStop ────────────────────────────────────────────────────────────────

describe('methodStop', () => {
  it('calls POST /instrument/methods/stop with empty body', async () => {
    const postMock = jest.fn().mockResolvedValue(okRaw({ command: 2, command_name: 'StopMethod' }));
    const client = makeClient({ post: postMock });

    await methodStop(makeContext(), client);

    expect(postMock).toHaveBeenCalledWith('/instrument/methods/stop', {});
  });

  it('throws NodeOperationError when stop returns a nonzero MM4 error', async () => {
    const postMock = jest.fn().mockResolvedValue(errRaw(17)); // NoMethodRunning
    const client = makeClient({ post: postMock });

    await expect(methodStop(makeContext(), client)).rejects.toThrow(NodeOperationError);
  });
});

// ── methodGetState ────────────────────────────────────────────────────────────

describe('methodGetState', () => {
  it('calls GET /instrument/methods/state', async () => {
    const getMock = jest.fn().mockResolvedValue(okRaw({ method_state: 2, command: 3, command_name: 'GetMethodState' }));
    const client = makeClient({ get: getMock });

    await methodGetState(makeContext(), client);

    expect(getMock).toHaveBeenCalledWith('/instrument/methods/state');
  });

  it('output contains decoded method_state_name', async () => {
    const getMock = jest.fn().mockResolvedValue(okRaw({ method_state: 2 }));
    const client = makeClient({ get: getMock });

    const [[item]] = await methodGetState(makeContext(), client);
    expect(item.json).toMatchObject({ method_state_name: 'Busy', method_state_code: 2 });
  });
});

// ── methodGetLastResult ───────────────────────────────────────────────────────

describe('methodGetLastResult', () => {
  it('calls GET /instrument/methods/last-result', async () => {
    const getMock = jest.fn().mockResolvedValue(okRaw({ last_method_result: 1, command: 4, command_name: 'GetLastMethodResult' }));
    const client = makeClient({ get: getMock });

    await methodGetLastResult(makeContext(), client);

    expect(getMock).toHaveBeenCalledWith('/instrument/methods/last-result');
  });

  it('output contains decoded last_method_result_name', async () => {
    const getMock = jest.fn().mockResolvedValue(okRaw({ last_method_result: 1 }));
    const client = makeClient({ get: getMock });

    const [[item]] = await methodGetLastResult(makeContext(), client);
    expect(item.json).toMatchObject({
      last_method_result_name: 'Success',
      last_method_result_code: 1,
    });
  });

  it('throws on nonzero MM4 error (FR-7 applies universally)', async () => {
    const getMock = jest.fn().mockResolvedValue(errRaw(8)); // MethodAlreadyRunning
    const client = makeClient({ get: getMock });

    await expect(methodGetLastResult(makeContext(), client)).rejects.toThrow(NodeOperationError);
  });
});
