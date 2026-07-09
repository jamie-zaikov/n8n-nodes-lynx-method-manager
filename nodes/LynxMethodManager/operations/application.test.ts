/**
 * Unit tests for nodes/Lynx/operations/application.ts
 * Run with: npx jest nodes/Lynx/operations/application.test.ts
 */

import { NodeOperationError } from 'n8n-workflow';
import { applicationGetState } from './application';
import type { LynxClient } from '../../../transport/client';
import type { MM4ResponseModel } from '../../../transport/mm4';

const STUB_NODE = {
  id: 'n1', name: 'Lynx Method Manager', type: 'lynxMethodManager', typeVersion: 1,
  position: [0, 0] as [number, number], parameters: {},
};

function okRaw(overrides: Partial<MM4ResponseModel> = {}): MM4ResponseModel {
  return {
    error: 0, application_state: 129, item: null, method_state: 1,
    last_method_result: 0, result: null, command: 5, command_name: 'GetApplicationState',
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

// ── applicationGetState ───────────────────────────────────────────────────────

describe('applicationGetState', () => {
  it('calls GET /instrument/application/state', async () => {
    const getMock = jest.fn().mockResolvedValue(okRaw());
    const client = { get: getMock } as unknown as LynxClient;

    await applicationGetState(makeContext(), client);

    expect(getMock).toHaveBeenCalledWith('/instrument/application/state');
  });

  it('output includes application_state_flags array', async () => {
    // 129 = 1 (WorkspaceLoaded) + 128 (DevicesReady)
    const getMock = jest.fn().mockResolvedValue(okRaw({ application_state: 129 }));
    const client = { get: getMock } as unknown as LynxClient;

    const [[item]] = await applicationGetState(makeContext(), client);
    expect(item.json).toMatchObject({
      application_state_flags: expect.arrayContaining(['WorkspaceLoaded', 'DevicesReady']),
      application_state_raw: 129,
    });
  });

  it('throws NodeOperationError on nonzero MM4 error', async () => {
    const getMock = jest.fn().mockResolvedValue(okRaw({ error: 2 })); // ApplicationBlocked
    const client = { get: getMock } as unknown as LynxClient;

    await expect(applicationGetState(makeContext(), client)).rejects.toThrow(NodeOperationError);
  });
});
