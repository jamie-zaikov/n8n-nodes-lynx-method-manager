import type { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { LynxClient } from '../../../transport/client';
import { decodeResponse, checkMM4Error, type MM4ResponseModel } from '../../../transport/mm4';
import { itemErrorOrThrow } from './errors';

// ── Variable entry shape as configured in the fixedCollection UI ──────────────
interface VariableEntry {
  name: string;
  value: string;
}

// ── Method — Run (composite: set variables → start) ───────────────────────────
// FR-14, FR-15

export async function methodRun(
  context: IExecuteFunctions,
  client: LynxClient,
): Promise<INodeExecutionData[][]> {
  const items = context.getInputData();
  const outputItems: INodeExecutionData[] = [];
  const node = context.getNode();

  for (let i = 0; i < items.length; i++) {
    try {
      const methodName = context.getNodeParameter('methodName', i) as string;
      const variableEntries = (
        context.getNodeParameter('variables.values', i, []) as VariableEntry[]
      );

      const variableWrites: Array<{
        name: string;
        value: string;
        error_code: number;
        error_name: string;
      }> = [];

      // PUT each variable; abort entire sequence on any non-zero MM4 error (FR-14)
      for (const { name, value } of variableEntries) {
        const raw = await client.put<MM4ResponseModel>(
          `/instrument/variables/${encodeURIComponent(name)}`,
          { value },
        );
        const decoded = decodeResponse(raw);
        checkMM4Error(decoded, node, `SetVariable(${name})`);
        variableWrites.push({ name, value, error_code: 0, error_name: 'OK' });
      }

      // Only reach here if all variable writes succeeded
      const startRaw = await client.post<MM4ResponseModel>(
        '/instrument/methods/start',
        { method_name: methodName },
      );
      const startDecoded = decodeResponse(startRaw);
      checkMM4Error(startDecoded, node, 'StartMethod');

      outputItems.push({
        json: { ...startDecoded, variable_writes: variableWrites },
      });
    } catch (error) {
      outputItems.push(itemErrorOrThrow(context, error, i));
    }
  }

  return [outputItems];
}

// ── Method — Stop ─────────────────────────────────────────────────────────────
// FR-16

export async function methodStop(
  context: IExecuteFunctions,
  client: LynxClient,
): Promise<INodeExecutionData[][]> {
  const items = context.getInputData();
  const outputItems: INodeExecutionData[] = [];
  const node = context.getNode();

  for (let i = 0; i < items.length; i++) {
    try {
      const raw = await client.post<MM4ResponseModel>('/instrument/methods/stop', {});
      const decoded = decodeResponse(raw);
      checkMM4Error(decoded, node, 'StopMethod');
      outputItems.push({ json: { ...decoded } });
    } catch (error) {
      outputItems.push(itemErrorOrThrow(context, error, i));
    }
  }

  return [outputItems];
}

// ── Method — Get State ────────────────────────────────────────────────────────
// FR-17

export async function methodGetState(
  context: IExecuteFunctions,
  client: LynxClient,
): Promise<INodeExecutionData[][]> {
  const items = context.getInputData();
  const outputItems: INodeExecutionData[] = [];
  const node = context.getNode();

  for (let i = 0; i < items.length; i++) {
    try {
      const raw = await client.get<MM4ResponseModel>('/instrument/methods/state');
      const decoded = decodeResponse(raw);
      checkMM4Error(decoded, node, 'GetMethodState');
      outputItems.push({ json: { ...decoded } });
    } catch (error) {
      outputItems.push(itemErrorOrThrow(context, error, i));
    }
  }

  return [outputItems];
}

// ── Method — Get Last Result ──────────────────────────────────────────────────
// FR-18

export async function methodGetLastResult(
  context: IExecuteFunctions,
  client: LynxClient,
): Promise<INodeExecutionData[][]> {
  const items = context.getInputData();
  const outputItems: INodeExecutionData[] = [];
  const node = context.getNode();

  for (let i = 0; i < items.length; i++) {
    try {
      const raw = await client.get<MM4ResponseModel>('/instrument/methods/last-result');
      const decoded = decodeResponse(raw);
      // FR-7 applies universally: any 2xx with nonzero error is a failure
      checkMM4Error(decoded, node, 'GetLastMethodResult');
      outputItems.push({ json: { ...decoded } });
    } catch (error) {
      outputItems.push(itemErrorOrThrow(context, error, i));
    }
  }

  return [outputItems];
}
