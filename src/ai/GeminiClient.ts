import { GoogleGenAI } from '@google/genai';
import { IGeminiClient, AIPrompt } from './types.js';

export class GeminiClient implements IGeminiClient {
  private apiKey: string | null = null;
  private aiInstance: GoogleGenAI | null = null;

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

      if (envKey && envKey.trim().length > 0) {
        this.apiKey = envKey.trim();
        this.aiInstance = new GoogleGenAI({
          apiKey: this.apiKey,
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build'
            }
          }
        });
      }
    } catch (err) {
      console.warn('[NEXA AI Core GeminiClient] Key initialization deferred or non-critical error:', err);
    }
  }

  /**
   * Calls Gemini models safely. Returns structured or text output.
   * If Gemini is unavailable or key is missing, provides a graceful mock fallback.
   */
  async generateContent(
    prompt: AIPrompt
  ): Promise<{ text: string; isFallback: boolean }> {
    if (!this.aiInstance) {
      this.initKey();
    }

    if (!this.aiInstance) {
      return {
        text: this.getMockResponse(prompt.userPrompt),
        isFallback: true
      };
    }

    try {
      const response = await this.aiInstance.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: prompt.userPrompt,
        config: {
          systemInstruction: prompt.systemInstruction
        }
      });

      const textOutput = response.text;
      if (textOutput && textOutput.trim().length > 0) {
        return { text: textOutput, isFallback: false };
      }

      return {
        text: this.getMockResponse(prompt.userPrompt),
        isFallback: true
      };
    } catch (err) {
      console.warn('[NEXA AI Core GeminiClient] API call failed, safely falling back to local core handler:', err);
      return {
        text: this.getMockResponse(prompt.userPrompt),
        isFallback: true
      };
    }
  }

  private getMockResponse(userQuery: string): string {
    const lower = userQuery.toLowerCase();
    
    if (lower.includes('remind') || lower.includes('reminder')) {
      return JSON.stringify({
        intent: 'CREATE_REMINDER',
        message: 'I have logged your reminder request.',
        title: 'New Reminder',
        status: 'pending'
      });
    }

    if (lower.includes('plan') || lower.includes('task') || lower.includes('schedule')) {
      return JSON.stringify({
        intent: 'GENERATE_PLANNING',
        message: 'Your schedule has been optimized.',
        planSummary: '3 key focus slots created.'
      });
    }

    if (lower.includes('study') || lower.includes('exam')) {
      return JSON.stringify({
        intent: 'STUDY_COACH',
        message: 'Study session recommendations generated.',
        suggestedHours: 3
      });
    }

    return `NEXA AI Core processed your request: "${userQuery}". All core modules are operating in healthy baseline mode.`;
  }
}
