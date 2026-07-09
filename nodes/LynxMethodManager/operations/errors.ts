import type { IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';

/**
 * continueOnFail gate for a single input item.
 *
 * If the node has "Continue On Fail" enabled, return an error output item for
 * this input index (so the workflow keeps going); otherwise rethrow so the
 * whole node fails. This is the standard n8n per-item error pattern and is what
 * makes the FR-7 "honor continueOnFail" guarantee actually hold.
 */
export function itemErrorOrThrow(
  context: IExecuteFunctions,
  error: unknown,
  itemIndex: number,
): INodeExecutionData {
  if (context.continueOnFail()) {
    const message = error instanceof Error ? error.message : String(error);
    return { json: { error: message }, pairedItem: { item: itemIndex } };
  }
  throw error;
}
