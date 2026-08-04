import { GoogleGenAI } from '@google/genai';
import { IAIProvider, AIPrompt, AIProviderOptions, AIProviderOutput } from '../types.js';

/**
 * Dedicated Gemini AI Provider responsible for communicating with Google Gemini Flash.
 * Completely isolates Gemini-specific SDK calls and handles API secret keys cleanly.
 * Implements IAIProvider to allow seamless swapping with other providers (DeepSeek, OpenAI, etc.).
 */
export class GeminiProvider implements IAIProvider {
  public readonly name = 'gemini-flash';
  private apiKey: string | null = null;
  private aiInstance: GoogleGenAI | null = null;
  private defaultModel = 'gemini-3.6-flash';

  constructor() {
    this.initKey();
  }

  private initKey(): void {
    try {
      let envKey: string | undefined;

      if (typeof process !== 'undefined' && process.env) {
        envKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
      }

      if (!envKey && typeof import.meta !== 'undefined') {
        const metaEnv = (import.meta as any).env;
        if (metaEnv) {
          envKey = metaEnv.VITE_GEMINI_API_KEY || metaEnv.GEMINI_API_KEY;
        }
      }

      if (envKey && envKey.trim().length > 0 && envKey !== 'MY_GEMINI_API_KEY') {
        this.apiKey = envKey.trim();
        this.aiInstance = new GoogleGenAI({
          apiKey: this.apiKey,
          httpOptions: {
            headers: {
              'User-Agent': 'xena-ai-studio'
            }
          }
        });
      }
    } catch (err) {
      console.warn('[GeminiProvider] Key initialization non-critical notice:', err);
    }
  }

  public isAvailable(): boolean {
    if (!this.aiInstance) {
      this.initKey();
    }
    return !!this.aiInstance;
  }

  /**
   * Generates response from Gemini Flash model.
   * Never throws; handles network or credential errors gracefully with structured fallback.
   */
  public async generateResponse(
    prompt: AIPrompt,
    options?: AIProviderOptions
  ): Promise<AIProviderOutput> {
    if (!this.isAvailable() || !this.aiInstance) {
      return {
        text: this.getFallbackResponse(prompt.userPrompt),
        providerName: this.name,
        isFallback: true
      };
    }

    try {
      const model = options?.model || this.defaultModel;
      const config: Record<string, any> = {};

      if (prompt.systemInstruction) {
        config.systemInstruction = prompt.systemInstruction;
      }
      if (typeof options?.temperature === 'number') {
        config.temperature = options.temperature;
      } else if (typeof prompt.temperature === 'number') {
        config.temperature = prompt.temperature;
      }
      if (options?.responseMimeType) {
        config.responseMimeType = options.responseMimeType;
      }
      if (options?.responseSchema) {
        config.responseSchema = options.responseSchema;
      }

      const response = await this.aiInstance.models.generateContent({
        model,
        contents: prompt.userPrompt,
        config: Object.keys(config).length > 0 ? config : undefined
      });

      const textOutput = response.text;
      if (textOutput && textOutput.trim().length > 0) {
        return {
          text: textOutput,
          providerName: this.name,
          isFallback: false,
          rawResponse: response
        };
      }

      return {
        text: this.getFallbackResponse(prompt.userPrompt),
        providerName: this.name,
        isFallback: true
      };
    } catch (err) {
      console.warn('[GeminiProvider] Request failed, using structured fallback:', err);
      return {
        text: this.getFallbackResponse(prompt.userPrompt),
        providerName: this.name,
        isFallback: true
      };
    }
  }

  /**
   * Generates streaming response from Gemini Flash model token by token.
   */
  public async generateStreamResponse(
    prompt: AIPrompt,
    onChunk: (chunk: string) => void,
    options?: AIProviderOptions
  ): Promise<AIProviderOutput> {
    if (!this.isAvailable() || !this.aiInstance) {
      const fallback = this.getFallbackResponse(prompt.userPrompt);
      onChunk(fallback);
      return {
        text: fallback,
        providerName: this.name,
        isFallback: true
      };
    }

    try {
      const model = options?.model || this.defaultModel;
      const config: Record<string, any> = {};

      if (prompt.systemInstruction) {
        config.systemInstruction = prompt.systemInstruction;
      }
      if (typeof options?.temperature === 'number') {
        config.temperature = options.temperature;
      } else if (typeof prompt.temperature === 'number') {
        config.temperature = prompt.temperature;
      }

      const responseStream = await this.aiInstance.models.generateContentStream({
        model,
        contents: prompt.userPrompt,
        config: Object.keys(config).length > 0 ? config : undefined
      });

      let fullText = '';
      for await (const chunk of responseStream) {
        const textChunk = chunk.text;
        if (textChunk) {
          fullText += textChunk;
          onChunk(textChunk);
        }
      }

      if (fullText.trim().length > 0) {
        return {
          text: fullText,
          providerName: this.name,
          isFallback: false
        };
      }

      const fallback = this.getFallbackResponse(prompt.userPrompt);
      onChunk(fallback);
      return {
        text: fallback,
        providerName: this.name,
        isFallback: true
      };
    } catch (err) {
      console.warn('[GeminiProvider] Stream failed, using fallback:', err);
      const fallback = this.getFallbackResponse(prompt.userPrompt);
      onChunk(fallback);
      return {
        text: fallback,
        providerName: this.name,
        isFallback: true
      };
    }
  }

  private getFallbackResponse(query: string): string {
    const lower = query.toLowerCase();

    if (lower.includes('who are you') || lower.includes('your name')) {
      return "I am Xena AI, your personal mobile management agent and assistant.";
    }

    if (lower.includes('remind') || lower.includes('reminder')) {
      return '```json\n' + JSON.stringify({
        intent: "REMINDER",
        title: "New Reminder",
        message: "Xena AI logged your reminder request."
      }, null, 2) + '\n```';
    }

    if (lower.includes('plan') || lower.includes('task') || lower.includes('schedule')) {
      return '```json\n' + JSON.stringify({
        intent: "PLANNING",
        message: "Your schedule has been processed."
      }, null, 2) + '\n```';
    }

    if (lower.includes('study') || lower.includes('exam')) {
      return '```json\n' + JSON.stringify({
        intent: "STUDY",
        message: "Study sessions updated."
      }, null, 2) + '\n```';
    }

    return `I am Xena AI. I received your message: "${query}". I am ready to help you organize your schedule, study, and daily goals. What would you like to plan next?`;
  }
}
