export type UserIntent =
  | 'NORMAL_CHAT'
  | 'CHAT'
  | 'CONVERSATION'
  | 'REMINDER'
  | 'CREATE_REMINDER'
  | 'UPDATE_REMINDER'
  | 'DELETE_REMINDER'
  | 'EVENT'
  | 'CREATE_EVENT'
  | 'UPDATE_EVENT'
  | 'PLANNING'
  | 'GENERATE_PLANNING'
  | 'UPDATE_PLANNING'
  | 'STUDY'
  | 'STUDY_COACH'
  | 'STUDY_TRACKING'
  | 'AI_MEMORY'
  | 'MEMORY_VAULT'
  | 'PROFILE'
  | 'SETTINGS'
  | 'GENERAL_HELP'
  | 'UNKNOWN';

export interface AIRequest {
  query: string;
  voiceTranscript?: string;
  userId?: string;
  intentOverride?: UserIntent;
  isVoiceInput?: boolean;
  options?: Record<string, any>;
  providerName?: string;
}

export interface AIContext {
  userQuery?: string;
  userName?: string;
  language?: string;
  timezone?: string;
  profile?: {
    full_name?: string;
    email?: string;
    language?: string;
    theme?: string;
    voice_gender?: string;
  };
  reminders?: Array<{ id: string; title: string; date: string; time?: string; priority?: string }>;
  events?: Array<{ id: string; title: string; date: string; time?: string; location?: string }>;
  exams?: Array<{ id: string; course: string; exam_date: string; progress?: number }>;
  tasks?: Array<{ id: string; title: string; status: string }>;
  memories?: Array<{ id: string; text: string }>;
  timestamp: string;
  contextScope?: 'minimal' | 'reminder' | 'event' | 'planning' | 'study' | 'profile' | 'full';
}

export interface AIPrompt {
  systemInstruction: string;
  userPrompt: string;
  responseSchema?: any;
  temperature?: number;
}

export interface AIToolCall {
  name: string;
  args: Record<string, any>;
}

export interface AIProviderOutput {
  text: string;
  structuredData?: any;
  toolCalls?: AIToolCall[];
  providerName: string;
  isFallback: boolean;
  rawResponse?: any;
}

export interface AIProviderOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  responseMimeType?: string;
  responseSchema?: any;
}

export interface IAIProvider {
  readonly name: string;
  generateResponse(prompt: AIPrompt, options?: AIProviderOptions): Promise<AIProviderOutput>;
  generateStreamResponse?(
    prompt: AIPrompt,
    onChunk: (chunk: string) => void,
    options?: AIProviderOptions
  ): Promise<AIProviderOutput>;
  isAvailable(): boolean;
}

export interface AIResponse {
  rawText: string;
  markdownText: string;
  structuredData?: any;
  toolCalls?: AIToolCall[];
  intent: UserIntent;
  providerName: string;
  confidence?: number;
  isFallback?: boolean;
}

export interface ActionResult {
  success: boolean;
  targetModule: string;
  action: string;
  data?: any;
  message?: string;
}

export interface IIntentDetector {
  detectIntent(
    query: string,
    context?: AIContext
  ): Promise<{
    intent: UserIntent;
    confidence: number;
    extractedData?: Record<string, any>;
  }>;
  extractKeywordParams?(query: string): Record<string, any>;
}

export interface IContextBuilder {
  buildContext(userId?: string, query?: string, intentHint?: UserIntent): Promise<AIContext>;
}

export interface IPromptBuilder {
  buildPrompt(
    query: string,
    intent: UserIntent,
    context: AIContext,
    voiceTranscript?: string
  ): AIPrompt;
  getSystemPersonalityPrompt(): string;
}

export interface IResponseParser {
  parseResponse(
    rawResponse: string,
    intent: UserIntent
  ): {
    isValid: boolean;
    structuredData: any;
    markdownText: string;
    toolCalls?: AIToolCall[];
    rawText: string;
    error?: string;
  };
}

export interface IActionDispatcher {
  dispatch(
    intent: UserIntent,
    parsedData: any,
    context?: AIContext
  ): Promise<ActionResult>;
}

export interface OrchestratorResult {
  intent: UserIntent;
  context: AIContext;
  prompt: AIPrompt;
  response: AIResponse;
  actionResult: ActionResult;
  providerName: string;
}

export interface INexaOrchestrator {
  processRequest(request: AIRequest): Promise<OrchestratorResult>;
  registerProvider(provider: IAIProvider): void;
  setPrimaryProvider(providerName: string): void;
}
