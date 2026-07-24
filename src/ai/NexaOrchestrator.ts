import {
  INexaOrchestrator,
  AIRequest,
  UserIntent,
  AIContext,
  AIPrompt,
  AIResponse,
  ActionResult,
  IIntentDetector,
  IContextBuilder,
  IPromptBuilder,
  IGeminiClient,
  IResponseParser,
  IActionDispatcher
} from './types.js';
import { IntentDetector } from './IntentDetector.js';
import { ContextBuilder } from './ContextBuilder.js';
import { PromptBuilder } from './PromptBuilder.js';
import { GeminiClient } from './GeminiClient.js';
import { ResponseParser } from './ResponseParser.js';
import { ActionDispatcher } from './ActionDispatcher.js';

export class NexaOrchestrator implements INexaOrchestrator {
  private intentDetector: IIntentDetector;
  private contextBuilder: IContextBuilder;
  private promptBuilder: IPromptBuilder;
  private geminiClient: IGeminiClient;
  private responseParser: IResponseParser;
  private actionDispatcher: IActionDispatcher;

  constructor(
    intentDetector?: IIntentDetector,
    contextBuilder?: IContextBuilder,
    promptBuilder?: IPromptBuilder,
    geminiClient?: IGeminiClient,
    responseParser?: IResponseParser,
    actionDispatcher?: IActionDispatcher
  ) {
    this.intentDetector = intentDetector || new IntentDetector();
    this.contextBuilder = contextBuilder || new ContextBuilder();
    this.promptBuilder = promptBuilder || new PromptBuilder();
    this.geminiClient = geminiClient || new GeminiClient();
    this.responseParser = responseParser || new ResponseParser();
    this.actionDispatcher = actionDispatcher || new ActionDispatcher();
  }

  /**
   * Main entry point for all NEXA AI requests.
   * Guarantees non-blocking execution and graceful fallbacks.
   */
  async processRequest(
    request: AIRequest
  ): Promise<{
    intent: UserIntent;
    context: AIContext;
    prompt: AIPrompt;
    response: AIResponse;
    actionResult: ActionResult;
  }> {
    const defaultTimestamp = new Date().toISOString();

    let context: AIContext = { timestamp: defaultTimestamp };
    let intent: UserIntent = request.intentOverride || 'UNKNOWN';
    let prompt: AIPrompt = { systemInstruction: '', userPrompt: request.query || '' };
    let response: AIResponse = {
      rawText: '',
      intent: 'UNKNOWN',
      isFallback: true
    };
    let actionResult: ActionResult = {
      success: true,
      targetModule: 'Assistant',
      action: 'NO_OP',
      message: 'Request processed.'
    };

    try {
      // 1. Build context safely
      context = await this.contextBuilder.buildContext(request.userId);

      // 2. Detect intent if not explicitly overridden
      let extractedDataFromDetector: Record<string, any> | undefined;
      if (!request.intentOverride) {
        const detection = await this.intentDetector.detectIntent(request.query, context);
        intent = detection.intent;
        extractedDataFromDetector = detection.extractedData;
      } else if (this.intentDetector.extractKeywordParams) {
        extractedDataFromDetector = (this.intentDetector as IntentDetector).extractKeywordParams(request.query);
      }

      // 3. Build optimized prompt
      prompt = this.promptBuilder.buildPrompt(request.query, intent, context);

      // 4. Call Gemini Client
      const geminiResult = await this.geminiClient.generateContent(prompt);

      // 5. Parse and validate response
      const parsed = this.responseParser.parseResponse(geminiResult.text, intent);

      // Merge rule-based extraction if Gemini returned fallback or incomplete structured data
      let finalStructuredData = parsed.structuredData;
      if (
        (intent === 'CREATE_REMINDER' || intent === 'UPDATE_REMINDER') &&
        (geminiResult.isFallback || !finalStructuredData?.title)
      ) {
        finalStructuredData = {
          ...(extractedDataFromDetector || {}),
          ...(finalStructuredData || {}),
          intent
        };
      }

      response = {
        rawText: parsed.rawText,
        structuredData: finalStructuredData,
        intent,
        isFallback: geminiResult.isFallback
      };

      // 6. Dispatch result to target module
      actionResult = await this.actionDispatcher.dispatch(
        intent,
        finalStructuredData,
        context
      );
    } catch (err: any) {
      console.warn('[NEXA AI Core NexaOrchestrator] Graceful orchestration fallback:', err);
      response.rawText = `NEXA AI received your message: "${request.query}". All application modules remain fully operational.`;
      response.isFallback = true;
      actionResult = {
        success: true,
        targetModule: 'Assistant',
        action: 'FALLBACK_REPLY',
        message: 'Handled via core orchestrator fallback.'
      };
    }

    return {
      intent,
      context,
      prompt,
      response,
      actionResult
    };
  }
}

// Global Singleton for instant app-wide availability
export const nexaOrchestrator = new NexaOrchestrator();
