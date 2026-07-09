import type { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { LynxClient } from '../../../transport/client';
import { decodeResponse, checkMM4Error, type MM4ResponseModel } from '../../../transport/mm4';
import { itemErrorOrThrow } from './errors';

// ── Application — Get State ───────────────────────────────────────────────────
// FR-21

export async function applicationGetState(
  context: IExecuteFunctions,
  client: LynxClient,
): Promise<INodeExecutionData[][]> {
  const items = context.getInputData();
  const outputItems: INodeExecutionData[] = [];
  const node = context.getNode();

  for (let i = 0; i < items.length; i++) {
    try {
      const raw = await client.get<MM4ResponseModel>('/instrument/application/state');
      const decoded = decodeResponse(raw);
      checkMM4Error(decoded, node, 'GetApplicationState');
      // application_state_flags is the primary signal (FR-21)
      outputItems.push({ json: { ...decoded } });
    } catch (error) {
      outputItems.push(itemErrorOrThrow(context, error, i));
    }
  }

  return [outputItems];
}
