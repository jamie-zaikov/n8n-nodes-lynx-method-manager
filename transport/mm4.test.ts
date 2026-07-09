/**
 * Unit tests for transport/mm4.ts — enum tables, decodeResponse(), checkMM4Error().
 * Run with: npx jest transport/mm4.test.ts
 */

import { NodeOperationError } from 'n8n-workflow';
import {
  decodeResponse,
  checkMM4Error,
  MM4ErrorCode,
  MM4MethodState,
  MM4LastMethodResult,
  MM4AppStateFlags,
  MM4NotificationKind,
  type MM4ResponseModel,
  type DecodedMM4Response,
} from './mm4';

// ── Minimal INode stub ────────────────────────────────────────────────────────

const STUB_NODE = {
  id: 'test-node',
  name: 'Test',
  type: 'lynxMethodManager',
  typeVersion: 1,
  position: [0, 0] as [number, number],
  parameters: {},
};

// ── Helper: build a minimal raw response ─────────────────────────────────────

function rawResponse(overrides: Partial<MM4ResponseModel> = {}): MM4ResponseModel {
  return {
    error: 0,
    application_state: 0,
    item: null,
    method_state: 1,
    last_method_result: 0,
    result: null,
    command: 1,
    command_name: 'StartMethod',
    ...overrides,
  };
}

// ── Enum table completeness ───────────────────────────────────────────────────

describe('MM4ErrorCode enum table', () => {
  it('has 22 entries (0–21)', () => {
    expect(Object.keys(MM4ErrorCode)).toHaveLength(22);
  });
  it('code 0 → OK', () => expect(MM4ErrorCode[0]).toBe('OK'));
  it('code 9 → UnknownVariable', () => expect(MM4ErrorCode[9]).toBe('UnknownVariable'));
  it('code 21 → SubMethodOnly', () => expect(MM4ErrorCode[21]).toBe('SubMethodOnly'));
});

describe('MM4MethodState enum table', () => {
  it('has 5 entries (0–4)', () => {
    expect(Object.keys(MM4MethodState)).toHaveLength(5);
  });
  it('value 2 → Busy', () => expect(MM4MethodState[2]).toBe('Busy'));
  it('value 1 → NoActiveMethod', () => expect(MM4MethodState[1]).toBe('NoActiveMethod'));
});

describe('MM4LastMethodResult enum table', () => {
  it('has 4 entries (0–3)', () => {
    expect(Object.keys(MM4LastMethodResult)).toHaveLength(4);
  });
  it('value 1 → Success', () => expect(MM4LastMethodResult[1]).toBe('Success'));
  it('value 3 → Error', () => expect(MM4LastMethodResult[3]).toBe('Error'));
});

describe('MM4AppStateFlags bitmask table', () => {
  it('has 9 entries', () => expect(MM4AppStateFlags).toHaveLength(9));
  it('WorkspaceLoaded bit = 1', () => {
    expect(MM4AppStateFlags.find((f) => f.name === 'WorkspaceLoaded')?.bit).toBe(1);
  });
  it('DevicesReady bit = 128', () => {
    expect(MM4AppStateFlags.find((f) => f.name === 'DevicesReady')?.bit).toBe(128);
  });
  it('InitializationInProgress bit = 256', () => {
    expect(
      MM4AppStateFlags.find((f) => f.name === 'InitializationInProgress')?.bit,
    ).toBe(256);
  });
});

describe('MM4NotificationKind enum table', () => {
  it('value 1 → MethodComplete', () => expect(MM4NotificationKind[1]).toBe('MethodComplete'));
  it('value 2 → VariableChanged', () => expect(MM4NotificationKind[2]).toBe('VariableChanged'));
  it('value 3 → InitializationComplete', () => expect(MM4NotificationKind[3]).toBe('InitializationComplete'));
  it('value 4 → ConnectionComplete', () => expect(MM4NotificationKind[4]).toBe('ConnectionComplete'));
});

// ── decodeResponse() ──────────────────────────────────────────────────────────

describe('decodeResponse', () => {
  it('error 0 → error_name OK', () => {
    const d = decodeResponse(rawResponse({ error: 0 }));
    expect(d.error_code).toBe(0);
    expect(d.error_name).toBe('OK');
  });

  it('error 9 → error_name UnknownVariable', () => {
    const d = decodeResponse(rawResponse({ error: 9 }));
    expect(d.error_code).toBe(9);
    expect(d.error_name).toBe('UnknownVariable');
  });

  it('unknown error code → error_name Unknown(99)', () => {
    const d = decodeResponse(rawResponse({ error: 99 }));
    expect(d.error_name).toBe('Unknown(99)');
  });

  it('method_state 2 → method_state_name Busy', () => {
    const d = decodeResponse(rawResponse({ method_state: 2 }));
    expect(d.method_state_code).toBe(2);
    expect(d.method_state_name).toBe('Busy');
  });

  it('unknown method_state → Unknown(7)', () => {
    const d = decodeResponse(rawResponse({ method_state: 7 }));
    expect(d.method_state_name).toBe('Unknown(7)');
  });

  it('last_method_result 1 → last_method_result_name Success', () => {
    const d = decodeResponse(rawResponse({ last_method_result: 1 }));
    expect(d.last_method_result_code).toBe(1);
    expect(d.last_method_result_name).toBe('Success');
  });

  it('application_state 0 → empty flags array', () => {
    const d = decodeResponse(rawResponse({ application_state: 0 }));
    expect(d.application_state_raw).toBe(0);
    expect(d.application_state_flags).toEqual([]);
  });

  it('application_state 129 (1+128) → [WorkspaceLoaded, DevicesReady]', () => {
    const d = decodeResponse(rawResponse({ application_state: 129 }));
    expect(d.application_state_flags).toEqual(['WorkspaceLoaded', 'DevicesReady']);
  });

  it('application_state 133 (1+4+128) → [WorkspaceLoaded, MethodRunning, DevicesReady]', () => {
    const d = decodeResponse(rawResponse({ application_state: 133 }));
    expect(d.application_state_flags).toContain('WorkspaceLoaded');
    expect(d.application_state_flags).toContain('MethodRunning');
    expect(d.application_state_flags).toContain('DevicesReady');
    expect(d.application_state_flags).toHaveLength(3);
  });

  it('all 9 flags set (511) → all 9 flag names', () => {
    const d = decodeResponse(rawResponse({ application_state: 511 }));
    expect(d.application_state_flags).toHaveLength(9);
  });

  it('raw field is the original object (referential equality)', () => {
    const original = rawResponse({ error: 3 });
    const d = decodeResponse(original);
    expect(d.raw).toBe(original);
  });

  it('passes through item and result fields', () => {
    const d = decodeResponse(rawResponse({ item: 'MyVar', result: '42' }));
    expect(d.item).toBe('MyVar');
    expect(d.result).toBe('42');
  });

  it('passes through command and command_name', () => {
    const d = decodeResponse(rawResponse({ command: 7, command_name: 'GetVariable' }));
    expect(d.command).toBe(7);
    expect(d.command_name).toBe('GetVariable');
  });
});

// ── checkMM4Error() ───────────────────────────────────────────────────────────

describe('checkMM4Error', () => {
  function decode(overrides: Partial<MM4ResponseModel> = {}): DecodedMM4Response {
    return decodeResponse(rawResponse(overrides));
  }

  it('does NOT throw when error_code is 0', () => {
    expect(() =>
      checkMM4Error(decode({ error: 0 }), STUB_NODE as never, 'TestOp'),
    ).not.toThrow();
  });

  it('throws NodeOperationError when error_code is non-zero', () => {
    expect(() =>
      checkMM4Error(decode({ error: 9 }), STUB_NODE as never, 'TestOp'),
    ).toThrow(NodeOperationError);
  });

  it('error message contains the decoded error name', () => {
    try {
      checkMM4Error(decode({ error: 9 }), STUB_NODE as never, 'SetVariable(Count)');
      fail('expected to throw');
    } catch (e) {
      expect((e as Error).message).toContain('UnknownVariable');
    }
  });

  it('error message contains the numeric code', () => {
    try {
      checkMM4Error(decode({ error: 9 }), STUB_NODE as never, 'SetVariable(Count)');
      fail('expected to throw');
    } catch (e) {
      expect((e as Error).message).toContain('code 9');
    }
  });

  it('error message contains the context string', () => {
    try {
      checkMM4Error(decode({ error: 6 }), STUB_NODE as never, 'InitializeHardware');
      fail('expected to throw');
    } catch (e) {
      expect((e as Error).message).toContain('InitializeHardware');
    }
  });

  it('includes raw.result as description when non-null', () => {
    // NodeOperationError stores description; we verify it is set by checking
    // that the constructor receives the right options object.
    const decoded = decode({ error: 19, result: 'Device homing failed' });
    // Spy on NodeOperationError constructor to capture options
    const spy = jest.spyOn(global, 'Error');
    try {
      checkMM4Error(decoded, STUB_NODE as never, 'InitializeHardware');
    } catch (e) {
      // The description should be attached to the error
      expect((e as NodeOperationError).description).toBe('Device homing failed');
    }
    spy.mockRestore();
  });

  it('does NOT include description when raw.result is null', () => {
    const decoded = decode({ error: 6, result: null });
    try {
      checkMM4Error(decoded, STUB_NODE as never, 'InitializeHardware');
    } catch (e) {
      // description should be undefined/absent when result is null
      expect((e as NodeOperationError).description).toBeUndefined();
    }
  });
});
