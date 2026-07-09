/**
 * Unit tests for nodes/Lynx/operations/hardware.ts
 * Run with: npx jest nodes/Lynx/operations/hardware.test.ts
 */

import { NodeOperationError } from 'n8n-workflow';
import { hardwareInitialize, hardwareClearErrors, hardwareConnect } from './hardware';
import type { LynxClient } from '../../../transport/client';
import type { MM4ResponseModel } from '../../../transport/mm4';

const STUB_NODE = {
  id: 'n1', name: 'Lynx Method Manager', type: 'lynxMethodManager', typeVersion: 1,
  position: [0, 0] as [number, number], parameters: {},
};

function okRaw(overrides: Partial<MM4ResponseModel> = {}): MM4ResponseModel {
  return {
    error: 0, application_state: 129, item: null, method_state: 1,
    last_method_result: 0, result: null, command: 14, command_name: 'InitializeHardware',
    ...overrides,
  };
}

function makeContext() {
  return {
    getNode: () => STUB_NODE as never,
    getInputData: () => [{ json: {} }],
    getNodeParameter: () => undefined,
    continueOnFail: () => false,
  } as never;
}

function makePostClient(mock: jest.Mock) {
  return { post: mock } as unknown as LynxClient;
}

// Context with continueOnFail enabled and a multi-item input, for the
// per-item error-item path (FR-7 / continueOnFail).
function makeContinueContext(itemCount = 2) {
  return {
    getNode: () => STUB_NODE as never,
    getInputData: () => Array.from({ length: itemCount }, () => ({ json: {} })),
    getNodeParameter: () => undefined,
    continueOnFail: () => true,
  } as never;
}

// ── hardwareInitialize ────────────────────────────────────────────────────────

describe('hardwareInitialize', () => {
  it('calls POST /instrument/hardware/initialize with empty body', async () => {
    const postMock = jest.fn().mockResolvedValue(okRaw());
    await hardwareInitialize(makeContext(), makePostClient(postMock));
    expect(postMock).toHaveBeenCalledWith('/instrument/hardware/initialize', {});
  });

  it('throws NodeOperationError on nonzero MM4 error', async () => {
    const postMock = jest.fn().mockResolvedValue(okRaw({ error: 6 })); // DevicesNotReady
    await expect(
      hardwareInitialize(makeContext(), makePostClient(postMock)),
    ).rejects.toThrow(NodeOperationError);
  });

  it('honors continueOnFail: emits an error item per failed item instead of throwing', async () => {
    const postMock = jest.fn().mockResolvedValue(okRaw({ error: 6 })); // DevicesNotReady
    const result = await hardwareInitialize(makeContinueContext(2), makePostClient(postMock));
    // Two input items → two error items, no throw
    expect(result[0]).toHaveLength(2);
    expect(result[0][0].json.error).toContain('DevicesNotReady');
    expect(result[0][0].pairedItem).toEqual({ item: 0 });
    expect(result[0][1].pairedItem).toEqual({ item: 1 });
  });

  it('honors continueOnFail for transport-style rejections too', async () => {
    const postMock = jest.fn().mockRejectedValue(new Error('Method Manager request failed: POST … — no response within 10000 ms'));
    const result = await hardwareInitialize(makeContinueContext(1), makePostClient(postMock));
    expect(result[0]).toHaveLength(1);
    expect(result[0][0].json.error).toContain('no response within 10000 ms');
  });
});

// ── hardwareClearErrors ───────────────────────────────────────────────────────

describe('hardwareClearErrors', () => {
  it('calls POST /instrument/hardware/clear-errors with empty body', async () => {
    const postMock = jest.fn().mockResolvedValue(okRaw({ command: 15, command_name: 'ClearErrors' }));
    await hardwareClearErrors(makeContext(), makePostClient(postMock));
    expect(postMock).toHaveBeenCalledWith('/instrument/hardware/clear-errors', {});
  });

  it('throws NodeOperationError on nonzero MM4 error', async () => {
    const postMock = jest.fn().mockResolvedValue(okRaw({ error: 3 })); // EStopEngaged
    await expect(
      hardwareClearErrors(makeContext(), makePostClient(postMock)),
    ).rejects.toThrow(NodeOperationError);
  });
});

// ── hardwareConnect ───────────────────────────────────────────────────────────

describe('hardwareConnect', () => {
  it('calls POST /instrument/hardware/connect with empty body', async () => {
    const postMock = jest.fn().mockResolvedValue(okRaw({ command: 16, command_name: 'ConnectHardware' }));
    await hardwareConnect(makeContext(), makePostClient(postMock));
    expect(postMock).toHaveBeenCalledWith('/instrument/hardware/connect', {});
  });

  it('throws NodeOperationError on nonzero MM4 error', async () => {
    const postMock = jest.fn().mockResolvedValue(okRaw({ error: 1 })); // NoWorkspace
    await expect(
      hardwareConnect(makeContext(), makePostClient(postMock)),
    ).rejects.toThrow(NodeOperationError);
  });
});
