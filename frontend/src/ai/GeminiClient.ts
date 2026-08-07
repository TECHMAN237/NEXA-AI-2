import { AIPrompt } from './types.js';
import { GeminiProvider } from './providers/GeminiProvider.js';

/**
 * Legacy GeminiClient wrapper delegating directly to GeminiProvider.
 * Maintained for backward compatibility.
 */
export class GeminiClient {
  private provider: GeminiProvider;

  constructor() {
    this.provider = new GeminiProvider();
  }

  async generateContent(
    prompt: AIPrompt
  ): Promise<{ text: string; isFallback: boolean }> {
    const res = await this.provider.generateResponse(prompt);
    return {
      text: res.text,
      isFallback: res.isFallback
    };
  }
}
