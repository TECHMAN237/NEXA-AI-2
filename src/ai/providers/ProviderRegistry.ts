import { IAIProvider, AIPrompt, AIProviderOptions, AIProviderOutput } from '../types.js';
import { GeminiProvider } from './GeminiProvider.js';

/**
 * AI Provider Registry managing available AI models/backends.
 * Enables zero-downtime swapping between Gemini Flash, DeepSeek, OpenAI, etc.
 */
export class ProviderRegistry {
  private providers: Map<string, IAIProvider> = new Map();
  private primaryProviderName: string = 'gemini-flash';

  constructor() {
    // Register default Gemini Flash provider
    const gemini = new GeminiProvider();
    this.registerProvider(gemini);
  }

  public registerProvider(provider: IAIProvider): void {
    if (!provider || !provider.name) {
      throw new Error('[ProviderRegistry] Invalid provider instance');
    }
    this.providers.set(provider.name.toLowerCase(), provider);
  }

  public setPrimaryProvider(name: string): void {
    const key = name.toLowerCase();
    if (this.providers.has(key)) {
      this.primaryProviderName = key;
    } else {
      console.warn(`[ProviderRegistry] Provider "${name}" not registered. Keeping "${this.primaryProviderName}".`);
    }
  }

  public getPrimaryProvider(): IAIProvider {
    const provider = this.providers.get(this.primaryProviderName);
    if (provider && provider.isAvailable()) {
      return provider;
    }

    // Fallback to any available registered provider
    for (const p of this.providers.values()) {
      if (p.isAvailable()) {
        return p;
      }
    }

    // Return primary even if offline (will return safe fallback output)
    return provider || new GeminiProvider();
  }

  public getProvider(name: string): IAIProvider | undefined {
    return this.providers.get(name.toLowerCase());
  }

  public async generateResponse(
    prompt: AIPrompt,
    options?: AIProviderOptions,
    preferredProviderName?: string
  ): Promise<AIProviderOutput> {
    const provider = (preferredProviderName && this.getProvider(preferredProviderName)) || this.getPrimaryProvider();
    return provider.generateResponse(prompt, options);
  }
}

export const providerRegistry = new ProviderRegistry();
