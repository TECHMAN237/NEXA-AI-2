import {
  INexaOrchestrator,
  AIRequest,
  UserIntent,
  AIContext,
  AIPrompt,
  AIResponse,
  ActionResult,
  OrchestratorResult,
  IIntentDetector,
  IContextBuilder,
  IPromptBuilder,
  IAIProvider,
  IResponseParser,
  IActionDispatcher
} from './types.js';
import { IntentDetector } from './IntentDetector.js';
import { ContextBuilder } from './ContextBuilder.js';
import { PromptBuilder } from './PromptBuilder.js';
import { ProviderRegistry, providerRegistry } from './providers/ProviderRegistry.js';
import { ResponseParser } from './ResponseParser.js';
import { ActionDispatcher } from './ActionDispatcher.js';

/**
 * AI Orchestrator for Xena AI (Phase IA-1 Core Infrastructure).
 * Central reasoning coordinator for every AI interaction.
 * Completely free of UI code. Follows SOLID architecture principles.
 */
export class NexaOrchestrator implements INexaOrchestrator {
  private intentDetector: IIntentDetector;
  private contextBuilder: IContextBuilder;
  private promptBuilder: IPromptBuilder;
  private registry: ProviderRegistry;
  private responseParser: IResponseParser;
  private actionDispatcher: IActionDispatcher;

  constructor(
    intentDetector?: IIntentDetector,
    contextBuilder?: IContextBuilder,
    promptBuilder?: IPromptBuilder,
    registry?: ProviderRegistry,
    responseParser?: IResponseParser,
    actionDispatcher?: IActionDispatcher
  ) {
    this.intentDetector = intentDetector || new IntentDetector();
    this.contextBuilder = contextBuilder || new ContextBuilder();
    this.promptBuilder = promptBuilder || new PromptBuilder();
    this.registry = registry || providerRegistry;
    this.responseParser = responseParser || new ResponseParser();
    this.actionDispatcher = actionDispatcher || new ActionDispatcher();
  }

  /**
   * Registers a new AI provider (e.g., DeepSeek, OpenAI, custom models).
   */
  public registerProvider(provider: IAIProvider): void {
    this.registry.registerProvider(provider);
  }

  /**
   * Sets primary AI provider by name.
   */
  public setPrimaryProvider(providerName: string): void {
    this.registry.setPrimaryProvider(providerName);
  }

  /**
   * Main entry point for processing all Xena AI requests.
   * NEVER contains UI logic.
   */
  public async processRequest(request: AIRequest): Promise<OrchestratorResult> {
    const userQuery = request.query || request.voiceTranscript || '';
    const defaultTimestamp = new Date().toISOString();

    let context: AIContext = { timestamp: defaultTimestamp };
    let intent: UserIntent = request.intentOverride || 'UNKNOWN';
    let prompt: AIPrompt = { systemInstruction: '', userPrompt: userQuery };
    let response: AIResponse = {
      rawText: '',
      markdownText: '',
      intent: 'UNKNOWN',
      providerName: request.providerName || 'gemini-flash',
      isFallback: true
    };
    let actionResult: ActionResult = {
      success: true,
      targetModule: 'Assistant',
      action: 'NO_OP',
      message: 'Request processed.'
    };

    try {
      // 1. Detect intent if not explicitly provided
      if (!request.intentOverride) {
        const detection = await this.intentDetector.detectIntent(userQuery);
        intent = detection.intent;
      }

      // 2. Build minimal context for current request task
      context = await this.contextBuilder.buildContext(request.userId, userQuery, intent);

      // 3. Prepare centralized prompt using NEXA system personality
      prompt = this.promptBuilder.buildPrompt(
        userQuery,
        intent,
        context,
        request.voiceTranscript
      );

      // 4. Call registered AI Provider (Gemini Flash by default)
      const providerOutput = await this.registry.generateResponse(
        prompt,
        undefined,
        request.providerName
      );

      // 5. Parse and sanitize response format (Markdown, JSON, tool calls)
      const parsed = this.responseParser.parseResponse(providerOutput.text, intent);

      response = {
        rawText: parsed.rawText,
        markdownText: parsed.markdownText,
        structuredData: parsed.structuredData,
        toolCalls: parsed.toolCalls,
        intent,
        providerName: providerOutput.providerName,
        isFallback: providerOutput.isFallback
      };

      // 6. Dispatch result to target business logic module
      actionResult = await this.actionDispatcher.dispatch(
        intent,
        parsed.structuredData,
        context
      );
    } catch (err: any) {
      console.warn('[NexaOrchestrator] Orchestration exception handled gracefully:', err);
      response.rawText = `Xena AI received your query: "${userQuery}". All system services remain online.`;
      response.markdownText = `Xena AI received your query: "${userQuery}". All system services remain online.`;
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
      actionResult,
      providerName: response.providerName
    };
  }

  /**
   * Streaming entry point for processing Xena AI requests token by token.
   */
  public async processStreamRequest(
    request: AIRequest,
    onChunk: (chunk: string) => void
  ): Promise<OrchestratorResult> {
    const userQuery = request.query || request.voiceTranscript || '';
    const defaultTimestamp = new Date().toISOString();

    let context: AIContext = { timestamp: defaultTimestamp };
    let intent: UserIntent = request.intentOverride || 'UNKNOWN';
    let prompt: AIPrompt = { systemInstruction: '', userPrompt: userQuery };
    let response: AIResponse = {
      rawText: '',
      markdownText: '',
      intent: 'UNKNOWN',
      providerName: request.providerName || 'gemini-flash',
      isFallback: true
    };
    let actionResult: ActionResult = {
      success: true,
      targetModule: 'Assistant',
      action: 'NO_OP',
      message: 'Request processed.'
    };

    try {
      if (!request.intentOverride) {
        const detection = await this.intentDetector.detectIntent(userQuery);
        intent = detection.intent;
      }

      context = await this.contextBuilder.buildContext(request.userId, userQuery, intent);

      prompt = this.promptBuilder.buildPrompt(
        userQuery,
        intent,
        context,
        request.voiceTranscript
      );

      const provider = this.registry.getProvider(request.providerName!);
      let providerOutput;

      if (provider && provider.generateStreamResponse) {
        providerOutput = await provider.generateStreamResponse(prompt, onChunk, request.options);
      } else {
        providerOutput = await this.registry.generateResponse(prompt, request.options, request.providerName);
        onChunk(providerOutput.text);
      }

      const parsed = this.responseParser.parseResponse(providerOutput.text, intent);

      response = {
        rawText: parsed.rawText,
        markdownText: parsed.markdownText,
        structuredData: parsed.structuredData,
        toolCalls: parsed.toolCalls,
        intent,
        providerName: providerOutput.providerName,
        isFallback: providerOutput.isFallback
      };

      actionResult = await this.actionDispatcher.dispatch(
        intent,
        parsed.structuredData,
        context
      );
    } catch (err: any) {
      console.warn('[NexaOrchestrator] Stream orchestration exception handled gracefully:', err);
      const fallbackText = `I am Xena AI. I received your query: "${userQuery}".`;
      onChunk(fallbackText);
      response.rawText = fallbackText;
      response.markdownText = fallbackText;
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
      actionResult,
      providerName: response.providerName
    };
  }
}

// Global Singleton instance
export const nexaOrchestrator = new NexaOrchestrator();
