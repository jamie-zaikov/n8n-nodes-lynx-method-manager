import { INode, NodeOperationError } from 'n8n-workflow';

// ── Enum tables ───────────────────────────────────────────────────────────────
// Source: instrument-control/reference/mm4_enums.md (MM4 protocol docs)
// Cross-checked against Method Manager REST API OpenAPI per scope.md O11.

/** MM4 error codes 0–21 */
export const MM4ErrorCode: Record<number, string> = {
  0: 'OK',
  1: 'NoWorkspace',
  2: 'ApplicationBlocked',
  3: 'EStopEngaged',
  4: 'PermissionLevelNotUser',
  5: 'MethodPermissionLevelNotUser',
  6: 'DevicesNotReady',
  7: 'NotExecutionMode',
  8: 'MethodAlreadyRunning',
  9: 'UnknownVariable',
  10: 'VariableIsReadOnly',
  11: 'UnknownDevice',
  12: 'UnknownWorktable',
  13: 'UnknownQuery',
  14: 'UnknownInput',
  15: 'UnknownMethod',
  16: 'RemoteControlPswdNotValid',
  17: 'NoMethodRunning',
  18: 'BadCommandFormat',
  19: 'ApplicationError',
  20: 'ClientSideError',
  21: 'SubMethodOnly',
};

/** MM4 method state values 0–4 */
export const MM4MethodState: Record<number, string> = {
  0: 'Unknown',
  1: 'NoActiveMethod',
  2: 'Busy',
  3: 'Paused',
  4: 'ErrorPaused',
};

/** MM4 last-method-result values 0–3 */
export const MM4LastMethodResult: Record<number, string> = {
  0: 'None',
  1: 'Success',
  2: 'Interrupted',
  3: 'Error',
};

/** Application-state bitmask flags, ordered LSB-first */
export const MM4AppStateFlags: Array<{ bit: number; name: string }> = [
  { bit: 1, name: 'WorkspaceLoaded' },
  { bit: 2, name: 'SimulationMode' },
  { bit: 4, name: 'MethodRunning' },
  { bit: 8, name: 'MethodPaused' },
  { bit: 16, name: 'MethodErrorPaused' },
  { bit: 32, name: 'ApplicationBlocked' },
  { bit: 64, name: 'EStopEngaged' },
  { bit: 128, name: 'DevicesReady' },
  { bit: 256, name: 'InitializationInProgress' },
];

/** MM4 notification type values 0–4
 *  Source: instrument-control/reference/notifications.md */
export const MM4NotificationKind: Record<number, string> = {
  0: 'Unknown',
  1: 'MethodComplete',
  2: 'VariableChanged',
  3: 'InitializationComplete',
  4: 'ConnectionComplete',
};

// ── TypeScript interfaces ─────────────────────────────────────────────────────

/** Raw JSON shape returned by every Method Manager /instrument/* endpoint
 *  (MM4ResponseModel in the OpenAPI spec — validated per scope.md O11). */
export interface MM4ResponseModel {
  error: number;
  application_state: number;
  item: string | null;
  method_state: number;
  last_method_result: number;
  result: string | null;
  command: number;
  command_name: string;
}

/** Fully decoded MM4 response with human-readable names for every enum/bitmask field. */
export interface DecodedMM4Response {
  error_code: number;
  error_name: string;
  method_state_code: number;
  method_state_name: string;
  last_method_result_code: number;
  last_method_result_name: string;
  application_state_raw: number;
  application_state_flags: string[];
  item: string | null;
  result: string | null;
  command: number;
  command_name: string;
  /** The original raw MM4ResponseModel JSON, passed through unchanged. */
  raw: MM4ResponseModel;
}

/** Single notification item inside a NotificationPollResponse
 *  (NotificationItem in the OpenAPI spec — validated per scope.md O11). */
export interface NotificationItem {
  sequence: number;
  timestamp: string;
  notification_type: number;
  item_name: string | null;
  item_value: string | null;
  application_state: number;
}

/** Shape of GET /instrument/notifications response
 *  (NotificationPollResponse in the OpenAPI spec — validated per scope.md O11). */
export interface NotificationPollResponse {
  items: NotificationItem[];
  latest_sequence: number;
  dropped: boolean;
}

// ── Core decoder ──────────────────────────────────────────────────────────────

/**
 * Decode a raw MM4ResponseModel into human-readable named fields.
 *
 * Falls back to "Unknown(<n>)" for any unrecognised numeric code so the node
 * is forward-compatible with future MM4 additions (FR-8).
 */
export function decodeResponse(raw: MM4ResponseModel): DecodedMM4Response {
  return {
    error_code: raw.error,
    error_name: MM4ErrorCode[raw.error] ?? `Unknown(${raw.error})`,
    method_state_code: raw.method_state,
    method_state_name:
      MM4MethodState[raw.method_state] ?? `Unknown(${raw.method_state})`,
    last_method_result_code: raw.last_method_result,
    last_method_result_name:
      MM4LastMethodResult[raw.last_method_result] ??
      `Unknown(${raw.last_method_result})`,
    application_state_raw: raw.application_state,
    application_state_flags: MM4AppStateFlags.filter(
      (f) => (raw.application_state & f.bit) !== 0,
    ).map((f) => f.name),
    item: raw.item,
    result: raw.result,
    command: raw.command,
    command_name: raw.command_name,
    raw,
  };
}

// ── Error gate ────────────────────────────────────────────────────────────────

/**
 * Throw a NodeOperationError (honoring continueOnFail) if the decoded
 * response carries a non-zero MM4 error code.
 *
 * This implements the MM4-error semantics cross-cutting rule (FR-7):
 * HTTP 2xx with error != 0 is a failure, not a success.
 */
export function checkMM4Error(
  decoded: DecodedMM4Response,
  node: INode,
  context: string,
): void {
  if (decoded.error_code !== 0) {
    throw new NodeOperationError(
      node,
      `MM4 error on ${context}: ${decoded.error_name} (code ${decoded.error_code})`,
      decoded.raw.result != null
        ? { description: decoded.raw.result }
        : undefined,
    );
  }
}
