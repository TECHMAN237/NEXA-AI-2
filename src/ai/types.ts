export type UserIntent =
  | 'CHAT'
  | 'CREATE_REMINDER'
  | 'UPDATE_REMINDER'
  | 'DELETE_REMINDER'
  | 'CREATE_EVENT'
  | 'UPDATE_EVENT'
  | 'GENERATE_PLANNING'
  | 'UPDATE_PLANNING'
  | 'STUDY_COACH'
  | 'AI_MEMORY'
  | 'PROFILE'
  | 'SETTINGS'
  | 'UNKNOWN';

export interface AIRequest {
  query: string;
  userId?: string;
  intentOverride?: UserIntent;
  isVoiceInput?: boolean;
  options?: Record<string, any>;
}

export interface StructuredReminderData {
  intent: 'CREATE_REMINDER' | 'UPDATE_REMINDER' | 'DELETE_REMINDER';
  title: string;
  description?: string;
  date: string; // YYYY-MM-DD
  time?: string; // HH:MM
  priority?: 'low' | 'medium' | 'high' | 'Normal';
  repeat?: 'none' | 'daily' | 'weekly' | 'monthly' | 'None';
  voiceReminder?: boolean;
  category?: string;
  missingFields?: string[];
  clarificationPrompt?: string | null;
}

export interface AIContext {
  profile?: any;
  memories?: any[];
  reminders?: any[];
  plans?: any[];
  tasks?: any[];
  exams?: any[];
  studySessions?: any[];
  events?: any[];
  notificationHistory?: any[];
  connectedApps?: any;
  language?: string;
  voiceGender?: string;
  timestamp: string;
}

export interface AIPrompt {
  systemInstruction: string;
  userPrompt: string;
  responseSchema?: any;
}

export interface AIResponse {
  rawText: string;
  structuredData?: any;
  intent: UserIntent;
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
  buildContext(userId?: string): Promise<AIContext>;
}

export interface IPromptBuilder {
  buildPrompt(
    query: string,
    intent: UserIntent,
    context: AIContext
  ): AIPrompt;
}

export interface IGeminiClient {
  generateContent(
    prompt: AIPrompt
  ): Promise<{ text: string; isFallback: boolean }>;
}

export interface IResponseParser {
  parseResponse(
    rawResponse: string,
    intent: UserIntent
  ): {
    isValid: boolean;
    structuredData: any;
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

export interface INexaOrchestrator {
  processRequest(
    request: AIRequest
  ): Promise<{
    intent: UserIntent;
    context: AIContext;
    prompt: AIPrompt;
    response: AIResponse;
    actionResult: ActionResult;
  }>;
}
