import {
  IDataObject,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  IPollFunctions,
} from 'n8n-workflow';

import { LynxClient } from '../../transport/client';
import {
  decodeResponse,
  checkMM4Error,
  MM4NotificationKind,
  MM4AppStateFlags,
  type MM4ResponseModel,
  type NotificationPollResponse,
} from '../../transport/mm4';

// Notification types that the trigger emits (FR-31)
const EMITTED_TYPES = new Set([1, 2, 3, 4]);

// Shape of static data persisted across restarts
interface TriggerStaticData {
  watchesRegistered?: boolean;
  since?: number;
}

export class LynxMethodManagerTrigger implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Lynx Method Manager Trigger',
    name: 'lynxMethodManagerTrigger',
    icon: 'file:node_icon.png',
    group: ['trigger'],
    version: 1,
    description:
      'Fires a workflow when Lynx Method Manager instrument notifications arrive (MethodComplete, VariableChanged, InitializationComplete, ConnectionComplete)',
    defaults: { name: 'Lynx Method Manager Trigger' },
    inputs: [],
    outputs: ['main'],
    credentials: [
      {
        name: 'lynxMethodManagerApi',
        required: true,
      },
    ],
    polling: true,
    properties: [
      // ── Method name filter ──────────────────────────────────────────────
      {
        displayName: 'Method Name Filter',
        name: 'methodNameFilter',
        type: 'string',
        default: '',
        description:
          'If set, only MethodComplete (type 1) notifications whose method name exactly matches this value are emitted. Sub-method completions with non-matching names are silently dropped. Leave blank to emit all MethodComplete notifications.',
        placeholder: 'prep_mix',
      },

      // ── Variable watch list ─────────────────────────────────────────────
      {
        displayName: 'Watch Variables',
        name: 'watchVariables',
        type: 'fixedCollection',
        typeOptions: { multipleValues: true },
        default: {},
        placeholder: 'Add variable to watch',
        description:
          'Variable names to watch for changes. One VariableWatch is registered per entry on first activation. Leave empty to watch only method events.',
        options: [
          {
            displayName: 'Variable',
            name: 'entries',
            values: [
              {
                displayName: 'Variable Name',
                name: 'variableName',
                type: 'string',
                default: '',
                required: true,
                description: 'Name of the workspace variable to watch',
              },
            ],
          },
        ],
      },

      // ── Options ──────────────────────────────────────────────────────────
      {
        displayName: 'Options',
        name: 'options',
        type: 'collection',
        placeholder: 'Add Option',
        default: {},
        options: [
          {
            displayName: 'Timeout (ms)',
            name: 'timeout',
            type: 'number',
            default: 10000,
            description: 'Request timeout in milliseconds (default 10 000)',
          },
        ],
      },
    ],
  };

  // ── poll() ─────────────────────────────────────────────────────────────────

  async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
    const staticData = this.getWorkflowStaticData('node') as TriggerStaticData;

    const credentials = await this.getCredentials('lynxMethodManagerApi');
    const options = this.getNodeParameter('options', {}) as { timeout?: number };
    const timeoutMs = options.timeout ?? 10_000;

    const node = this.getNode();

    const client = new LynxClient(
      credentials.baseUrl as string,
      credentials.apiKey as string,
      timeoutMs,
      this.helpers,
      node,
    );

    // ── Watch registration (exactly once, guarded by staticData) ─────────
    // FR-27: on first activation register method watch + per-variable watches
    if (!staticData.watchesRegistered) {
      const methodWatchRaw = await client.post<MM4ResponseModel>(
        '/instrument/watches/method',
        { watch: true },
      );
      const methodWatchDecoded = decodeResponse(methodWatchRaw);
      checkMM4Error(methodWatchDecoded, node, 'MethodWatch');

      const watchVarEntries = (
        this.getNodeParameter('watchVariables.entries', []) as Array<{
          variableName: string;
        }>
      );

      for (const { variableName } of watchVarEntries) {
        const varWatchRaw = await client.post<MM4ResponseModel>(
          '/instrument/watches/variable',
          { variable_name: variableName, watch: true },
        );
        const varWatchDecoded = decodeResponse(varWatchRaw);
        checkMM4Error(varWatchDecoded, node, `VariableWatch(${variableName})`);
      }

      staticData.watchesRegistered = true;
    }

    // ── Poll for notifications ────────────────────────────────────────────
    // FR-29, FR-30: use persisted cursor; update after every poll
    const since = staticData.since ?? 0;

    const pollResp = await client.get<NotificationPollResponse>(
      '/instrument/notifications',
      { since, max_items: 100 },
    );

    // Always advance cursor — even when items is empty (FR-29)
    staticData.since = pollResp.latest_sequence;

    // ── Filter and emit ───────────────────────────────────────────────────
    const methodNameFilter = (
      this.getNodeParameter('methodNameFilter', '') as string
    ).trim();

    const dropped = pollResp.dropped; // FR-33

    const outputItems: INodeExecutionData[] = [];

    for (const item of pollResp.items) {
      // FR-31: only emit known types 1–4
      if (!EMITTED_TYPES.has(item.notification_type)) continue;

      // FR-32: filter MethodComplete by item_name when filter is configured
      if (
        item.notification_type === 1 &&
        methodNameFilter !== '' &&
        item.item_name !== methodNameFilter
      ) {
        continue;
      }

      // FR-34: full output item structure
      outputItems.push({
        json: {
          sequence: item.sequence,
          timestamp: item.timestamp,
          notification_type: item.notification_type,
          notification_type_name:
            MM4NotificationKind[item.notification_type] ??
            `Unknown(${item.notification_type})`,
          item_name: item.item_name,
          item_value: item.item_value,
          application_state_raw: item.application_state,
          application_state_flags: MM4AppStateFlags.filter(
            (f) => (item.application_state & f.bit) !== 0,
          ).map((f) => f.name),
          dropped, // FR-33: stamp on every item in the cycle
        } satisfies IDataObject,
      });
    }

    // Return null when nothing qualifies — no workflow execution
    return outputItems.length > 0 ? [outputItems] : null;
  }
}
