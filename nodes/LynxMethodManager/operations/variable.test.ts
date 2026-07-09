/**
 * Unit tests for nodes/Lynx/operations/variable.ts
 * Run with: npx jest nodes/Lynx/operations/variable.test.ts
 */

import { NodeOperationError } from 'n8n-workflow';
import { variableGet, variableSet } from './variable';
import type { LynxClient } from '../../../transport/client';
import type { MM4ResponseModel } from '../../../transport/mm4';

const STUB_NODE = {
  id: 'n1', name: 'Lynx Method Manager', type: 'lynxMethodManager', typeVersion: 1,
  position: [0, 0] as [number, number], parameters: {},
};

function okRaw(overrides: Partial<MM4ResponseModel> = {}): MM4ResponseModel {
  return {
    error: 0, application_state: 129, item: null, method_state: 1,
    last_method_result: 0, result: null, command: 7, command_name: 'GetVariable',
    ...overrides,
  };
}

function makeContext(variableName = 'PlateCount', variableValue = '42') {
  return {
    getNode: () => STUB_NODE as never,
    getInputData: () => [{ json: {} }],
    getNodeParameter: (name: string) => {
      if (name === 'variableName') return variableName;
      if (name === 'variableValue') return variableValue;
      return undefined;
    },
    continueOnFail: () => false,
  } as never;
}

function makeClient(overrides: Partial<{ get: jest.Mock; put: jest.Mock }> = {}) {
  return {
    get: overrides.get ?? jest.fn().mockResolvedValue(okRaw()),
    put: overrides.put ?? jest.fn().mockResolvedValue(okRaw()),
  } as unknown as LynxClient;
}

// ── variableGet ───────────────────────────────────────────────────────────────

describe('variableGet', () => {
  it('calls GET /instrument/variables/PlateCount', async () => {
    const getMock = jest.fn().mockResolvedValue(okRaw({ item: 'PlateCount', result: '3' }));
    const client = makeClient({ get: getMock });

    await variableGet(makeContext('PlateCount'), client);

    expect(getMock).toHaveBeenCalledWith('/instrument/variables/PlateCount');
  });

  it('output includes the result field (current variable value)', async () => {
    const getMock = jest.fn().mockResolvedValue(okRaw({ item: 'PlateCount', result: '7' }));
    const client = makeClient({ get: getMock });

    const [[item]] = await variableGet(makeContext('PlateCount'), client);
    expect(item.json).toMatchObject({ result: '7' });
  });

  it('URL-encodes variable names with special characters', async () => {
    const getMock = jest.fn().mockResolvedValue(okRaw());
    const client = makeClient({ get: getMock });

    await variableGet(makeContext('Var Name/With Slash'), client);

    const callUrl = getMock.mock.calls[0][0] as string;
    expect(callUrl).toBe('/instrument/variables/Var%20Name%2FWith%20Slash');
  });

  it('throws NodeOperationError on nonzero MM4 error', async () => {
    const getMock = jest.fn().mockResolvedValue(okRaw({ error: 9 })); // UnknownVariable
    const client = makeClient({ get: getMock });

    await expect(variableGet(makeContext(), client)).rejects.toThrow(NodeOperationError);
  });
});

// ── variableSet ───────────────────────────────────────────────────────────────

describe('variableSet', () => {
  it('calls PUT /instrument/variables/PlateCount with body { value }', async () => {
    const putMock = jest.fn().mockResolvedValue(okRaw({ command: 6, command_name: 'SetVariable' }));
    const client = makeClient({ put: putMock });

    await variableSet(makeContext('PlateCount', '42'), client);

    expect(putMock).toHaveBeenCalledWith(
      '/instrument/variables/PlateCount',
      { value: '42' },
    );
  });

  it('URL-encodes variable names', async () => {
    const putMock = jest.fn().mockResolvedValue(okRaw({ command: 6, command_name: 'SetVariable' }));
    const client = makeClient({ put: putMock });

    await variableSet(makeContext('My Var', '1'), client);

    expect(putMock).toHaveBeenCalledWith(
      '/instrument/variables/My%20Var',
      { value: '1' },
    );
  });

  it('throws NodeOperationError on nonzero MM4 error', async () => {
    const putMock = jest.fn().mockResolvedValue(okRaw({ error: 10 })); // VariableIsReadOnly
    const client = makeClient({ put: putMock });

    await expect(variableSet(makeContext(), client)).rejects.toThrow(NodeOperationError);
  });
});
