import { IActionDispatcher, ActionResult, UserIntent, AIContext } from './types.js';
import { actionExecutionEngine, ActionPayload } from './ActionExecutionEngine.js';

export class ActionDispatcher implements IActionDispatcher {
  /**
   * Routes validated AI responses to the Action Execution Engine.
   */
  async dispatch(
    intent: UserIntent,
    parsedData: any,
    context?: AIContext
  ): Promise<ActionResult> {
    try {
      const intentStr = String(intent);

      // Handle multi-actions array if provided in parsedData
      let actionsToExecute: ActionPayload[] = [];
      if (parsedData?.actions && Array.isArray(parsedData.actions) && parsedData.actions.length > 0) {
        actionsToExecute = parsedData.actions;
      } else {
        actionsToExecute = [{
          intent: intentStr,
          action: parsedData?.action || 'CREATE',
          payload: parsedData?.extractedData || parsedData?.payload || parsedData
        }];
      }

      const execResult = await actionExecutionEngine.execute(
        intentStr,
        actionsToExecute,
        context?.userQuery || parsedData?.cleanedText || ''
      );

      return {
        success: execResult.success,
        targetModule: execResult.results[0]?.targetModule || 'Core',
        action: execResult.results[0]?.action || 'PROCESSED',
        data: execResult.results.length === 1 ? execResult.results[0].data : execResult.results,
        message: execResult.summaryMessage || 'Action executed.'
      };
    } catch (err: any) {
      console.warn('[ActionDispatcher] Exception during execution dispatch:', err);
      return {
        success: false,
        targetModule: 'Core',
        action: 'EXECUTION_ERROR',
        data: parsedData,
        message: err?.message || 'Failed to execute action.'
      };
    }
  }
}
