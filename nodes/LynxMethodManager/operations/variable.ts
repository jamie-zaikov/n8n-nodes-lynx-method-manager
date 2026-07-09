import type { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { LynxClient } from '../../../transport/client';
import { decodeResponse, checkMM4Error, type MM4ResponseModel } from '../../../transport/mm4';
import { itemErrorOrThrow } from './errors';

// ── Variable — Get ────────────────────────────────────────────────────────────
// FR-19

export async function variableGet(
  context: IExecuteFunctions,
  client: LynxClient,
): Promise<INodeExecutionData[][]> {
  const items = context.getInputData();
  const outputItems: INodeExecutionData[] = [];
  const node = context.getNode();

  for (let i = 0; i < items.length; i++) {
    try {
      const variableName = context.getNodeParameter('variableName', i) as string;
      const raw = await client.get<MM4ResponseModel>(
        `/instrument/variables/${encodeURIComponent(variableName)}`,
      );
      const decoded = decodeResponse(raw);
      checkMM4Error(decoded, node, `GetVariable(${variableName})`);
      outputItems.push({ json: { ...decoded } });
    } catch (error) {
      outputItems.push(itemErrorOrThrow(context, error, i));
    }
  }

  return [outputItems];
}

// ── Variable — Set ────────────────────────────────────────────────────────────
// FR-20

export async function variableSet(
  context: IExecuteFunctions,
  client: LynxClient,
): Promise<INodeExecutionData[][]> {
  const items = context.getInputData();
  const outputItems: INodeExecutionData[] = [];
  const node = context.getNode();

  for (let i = 0; i < items.length; i++) {
    try {
      const variableName = context.getNodeParameter('variableName', i) as string;
      const variableValue = context.getNodeParameter('variableValue', i) as string;
      const raw = await client.put<MM4ResponseModel>(
        `/instrument/variables/${encodeURIComponent(variableName)}`,
        { value: variableValue },
      );
      const decoded = decodeResponse(raw);
      checkMM4Error(decoded, node, `SetVariable(${variableName})`);
      outputItems.push({ json: { ...decoded } });
    } catch (error) {
      outputItems.push(itemErrorOrThrow(context, error, i));
    }
  }

  return [outputItems];
}
