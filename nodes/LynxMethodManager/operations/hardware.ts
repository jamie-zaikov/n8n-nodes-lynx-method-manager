import type { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { LynxClient } from '../../../transport/client';
import { decodeResponse, checkMM4Error, type MM4ResponseModel } from '../../../transport/mm4';
import { itemErrorOrThrow } from './errors';

// ── Hardware — Initialize ─────────────────────────────────────────────────────
// FR-22

export async function hardwareInitialize(
  context: IExecuteFunctions,
  client: LynxClient,
): Promise<INodeExecutionData[][]> {
  const items = context.getInputData();
  const outputItems: INodeExecutionData[] = [];
  const node = context.getNode();

  for (let i = 0; i < items.length; i++) {
    try {
      const raw = await client.post<MM4ResponseModel>(
        '/instrument/hardware/initialize',
        {},
      );
      const decoded = decodeResponse(raw);
      checkMM4Error(decoded, node, 'InitializeHardware');
      outputItems.push({ json: { ...decoded } });
    } catch (error) {
      outputItems.push(itemErrorOrThrow(context, error, i));
    }
  }

  return [outputItems];
}

// ── Hardware — Clear Errors ───────────────────────────────────────────────────
// FR-23

export async function hardwareClearErrors(
  context: IExecuteFunctions,
  client: LynxClient,
): Promise<INodeExecutionData[][]> {
  const items = context.getInputData();
  const outputItems: INodeExecutionData[] = [];
  const node = context.getNode();

  for (let i = 0; i < items.length; i++) {
    try {
      const raw = await client.post<MM4ResponseModel>(
        '/instrument/hardware/clear-errors',
        {},
      );
      const decoded = decodeResponse(raw);
      checkMM4Error(decoded, node, 'ClearErrors');
      outputItems.push({ json: { ...decoded } });
    } catch (error) {
      outputItems.push(itemErrorOrThrow(context, error, i));
    }
  }

  return [outputItems];
}

// ── Hardware — Connect ────────────────────────────────────────────────────────
// FR-24

export async function hardwareConnect(
  context: IExecuteFunctions,
  client: LynxClient,
): Promise<INodeExecutionData[][]> {
  const items = context.getInputData();
  const outputItems: INodeExecutionData[] = [];
  const node = context.getNode();

  for (let i = 0; i < items.length; i++) {
    try {
      const raw = await client.post<MM4ResponseModel>(
        '/instrument/hardware/connect',
        {},
      );
      const decoded = decodeResponse(raw);
      checkMM4Error(decoded, node, 'ConnectHardware');
      outputItems.push({ json: { ...decoded } });
    } catch (error) {
      outputItems.push(itemErrorOrThrow(context, error, i));
    }
  }

  return [outputItems];
}
