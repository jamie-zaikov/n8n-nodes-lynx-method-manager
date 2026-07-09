import {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  NodeOperationError,
} from 'n8n-workflow';

import { LynxClient } from '../../transport/client';
import { methodRun, methodStop, methodGetState, methodGetLastResult } from './operations/method';
import { variableGet, variableSet } from './operations/variable';
import { applicationGetState } from './operations/application';
import { hardwareInitialize, hardwareClearErrors, hardwareConnect } from './operations/hardware';

export class LynxMethodManager implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Lynx Method Manager',
    name: 'lynxMethodManager',
    icon: 'file:node_icon.png',
    group: ['transform'],
    version: 1,
    description:
      'Control a Dynamic Devices Lynx liquid handler via the Method Manager REST API',
    defaults: { name: 'Lynx Method Manager' },
    inputs: ['main'],
    outputs: ['main'],
    credentials: [
      {
        name: 'lynxMethodManagerApi',
        required: true,
      },
    ],
    properties: [
      // ── Resource selector ─────────────────────────────────────────────────
      {
        displayName: 'Resource',
        name: 'resource',
        type: 'options',
        noDataExpression: true,
        options: [
          { name: 'Method', value: 'method' },
          { name: 'Variable', value: 'variable' },
          { name: 'Application', value: 'application' },
          { name: 'Hardware', value: 'hardware' },
        ],
        default: 'method',
      },

      // ── Method operations ─────────────────────────────────────────────────
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: { show: { resource: ['method'] } },
        options: [
          {
            name: 'Run Method [Destructive]',
            value: 'run',
            description: 'Set variables then start a named method on the instrument',
            action: 'Run a method',
          },
          {
            name: 'Stop Method [Destructive]',
            value: 'stop',
            description: 'Abort the currently running method',
            action: 'Stop the running method',
          },
          {
            name: 'Get State',
            value: 'getState',
            description: 'Read the current method state (Idle, Busy, Paused…)',
            action: 'Get method state',
          },
          {
            name: 'Get Last Result',
            value: 'getLastResult',
            description: 'Read the outcome of the most recently completed method run',
            action: 'Get last method result',
          },
        ],
        default: 'run',
      },

      // ── Variable operations ───────────────────────────────────────────────
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: { show: { resource: ['variable'] } },
        options: [
          {
            name: 'Get Variable',
            value: 'get',
            description: 'Read the current value of a workspace variable',
            action: 'Get a variable',
          },
          {
            name: 'Set Variable [Destructive]',
            value: 'set',
            description: 'Write a value to a workspace variable',
            action: 'Set a variable',
          },
        ],
        default: 'get',
      },

      // ── Application operations ────────────────────────────────────────────
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: { show: { resource: ['application'] } },
        options: [
          {
            name: 'Get State',
            value: 'getState',
            description: 'Read the overall application state bitmask (workspace, devices, run state)',
            action: 'Get application state',
          },
        ],
        default: 'getState',
      },

      // ── Hardware operations ───────────────────────────────────────────────
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: { show: { resource: ['hardware'] } },
        options: [
          {
            name: 'Initialize [Destructive]',
            value: 'initialize',
            description: 'Home axes and bring hardware to a known reference state (physically moves the instrument)',
            action: 'Initialize hardware',
          },
          {
            name: 'Clear Errors [Destructive]',
            value: 'clearErrors',
            description: 'Clear latched fault/error state on the instrument',
            action: 'Clear hardware errors',
          },
          {
            name: 'Connect [Destructive]',
            value: 'connect',
            description: 'Re-establish connection to the underlying device controllers',
            action: 'Connect hardware',
          },
        ],
        default: 'initialize',
      },

      // ── Destructive-operation notices (FR-13) ─────────────────────────────
      {
        displayName:
          'WARNING: Run Method will physically move the instrument. Ensure the deck is clear and no personnel are reaching inside.',
        name: 'noticeRunDestructive',
        type: 'notice',
        default: '',
        displayOptions: { show: { resource: ['method'], operation: ['run'] } },
      },
      {
        displayName:
          'WARNING: Stop Method aborts a running method mid-step and may leave plates in intermediate positions.',
        name: 'noticeStopDestructive',
        type: 'notice',
        default: '',
        displayOptions: { show: { resource: ['method'], operation: ['stop'] } },
      },
      {
        displayName:
          'WARNING: Set Variable writes to a workspace variable. Changes take effect on the next method run.',
        name: 'noticeSetVariableDestructive',
        type: 'notice',
        default: '',
        displayOptions: { show: { resource: ['variable'], operation: ['set'] } },
      },
      {
        displayName:
          'WARNING: Initialize physically homes all axes and tools. Do not issue while labware is on the deck or personnel are inside the instrument.',
        name: 'noticeInitializeDestructive',
        type: 'notice',
        default: '',
        displayOptions: { show: { resource: ['hardware'], operation: ['initialize'] } },
      },
      {
        displayName:
          'WARNING: Clear Errors suppresses safety-relevant fault flags. Only proceed after confirming the underlying physical cause has been resolved.',
        name: 'noticeClearErrorsDestructive',
        type: 'notice',
        default: '',
        displayOptions: { show: { resource: ['hardware'], operation: ['clearErrors'] } },
      },
      {
        displayName:
          'WARNING: Connect re-establishes device controller connections. This does not home axes; run Initialize separately.',
        name: 'noticeConnectDestructive',
        type: 'notice',
        default: '',
        displayOptions: { show: { resource: ['hardware'], operation: ['connect'] } },
      },

      // ── Method — Run fields ───────────────────────────────────────────────
      {
        displayName: 'Method Name',
        name: 'methodName',
        type: 'string',
        required: true,
        default: '',
        placeholder: 'prep_mix',
        description: 'Name of the .met method to run (without extension, relative to the MM4 Methods/ root)',
        displayOptions: { show: { resource: ['method'], operation: ['run'] } },
      },
      {
        displayName: 'Variables',
        name: 'variables',
        type: 'fixedCollection',
        typeOptions: { multipleValues: true },
        default: {},
        placeholder: 'Add variable',
        description: 'Variables to set on the instrument before starting the method. Written in order; any failure aborts the run.',
        displayOptions: { show: { resource: ['method'], operation: ['run'] } },
        options: [
          {
            displayName: 'Variable',
            name: 'values',
            values: [
              {
                displayName: 'Name',
                name: 'name',
                type: 'string',
                default: '',
                required: true,
                description: 'Workspace variable name',
              },
              {
                displayName: 'Value',
                name: 'value',
                type: 'string',
                default: '',
                required: true,
                description: 'Value to write (coerced to the variable\'s declared type by MM4)',
              },
            ],
          },
        ],
      },

      // ── Variable — Get/Set fields ─────────────────────────────────────────
      {
        displayName: 'Variable Name',
        name: 'variableName',
        type: 'string',
        required: true,
        default: '',
        description: 'Name of the workspace variable',
        displayOptions: {
          show: { resource: ['variable'], operation: ['get', 'set'] },
        },
      },
      {
        displayName: 'Variable Value',
        name: 'variableValue',
        type: 'string',
        required: true,
        default: '',
        description: 'Value to write to the variable',
        displayOptions: {
          show: { resource: ['variable'], operation: ['set'] },
        },
      },

      // ── Options (shown for all resources / operations) ────────────────────
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
            description: 'Request timeout in milliseconds (default 10 000). Uses n8n\'s built-in Retry On Fail for retries.',
          },
        ],
      },
    ],
  };

  // ── execute() ──────────────────────────────────────────────────────────────

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const credentials = await this.getCredentials('lynxMethodManagerApi');
    const options = this.getNodeParameter('options', 0, {}) as { timeout?: number };
    const timeoutMs = options.timeout ?? 10_000;

    const client = new LynxClient(
      credentials.baseUrl as string,
      credentials.apiKey as string,
      timeoutMs,
      this.helpers,
      this.getNode(),
    );

    const resource = this.getNodeParameter('resource', 0) as string;
    const operation = this.getNodeParameter('operation', 0) as string;

    switch (`${resource}.${operation}`) {
      case 'method.run':
        return methodRun(this, client);
      case 'method.stop':
        return methodStop(this, client);
      case 'method.getState':
        return methodGetState(this, client);
      case 'method.getLastResult':
        return methodGetLastResult(this, client);
      case 'variable.get':
        return variableGet(this, client);
      case 'variable.set':
        return variableSet(this, client);
      case 'application.getState':
        return applicationGetState(this, client);
      case 'hardware.initialize':
        return hardwareInitialize(this, client);
      case 'hardware.clearErrors':
        return hardwareClearErrors(this, client);
      case 'hardware.connect':
        return hardwareConnect(this, client);
      default:
        throw new NodeOperationError(
          this.getNode(),
          `Unknown resource/operation: ${resource}.${operation}`,
        );
    }
  }
}
