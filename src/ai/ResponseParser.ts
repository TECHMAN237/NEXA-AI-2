import { IResponseParser, UserIntent } from './types.js';

export class ResponseParser implements IResponseParser {
  /**
   * Validates and parses raw text responses from Gemini or fallback engines.
   */
  parseResponse(
    rawResponse: string,
    intent: UserIntent
  ): {
    isValid: boolean;
    structuredData: any;
    rawText: string;
    error?: string;
  } {
    if (!rawResponse || typeof rawResponse !== 'string') {
      return {
        isValid: false,
        structuredData: null,
        rawText: '',
        error: 'Empty or invalid response string'
      };
    }

    const trimmed = rawResponse.trim();

    // 1. Check if response is enclosed in JSON markdown blocks
    let jsonContent: string | null = null;
    const markdownMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (markdownMatch && markdownMatch[1]) {
      jsonContent = markdownMatch[1].trim();
    } else if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      jsonContent = trimmed;
    }

    // 2. Attempt JSON parse if candidate exists
    if (jsonContent) {
      try {
        const parsed = JSON.parse(jsonContent);
        return {
          isValid: true,
          structuredData: parsed,
          rawText: trimmed
        };
      } catch (err) {
        console.warn('[NEXA AI Core ResponseParser] JSON parsing attempt failed, converting to wrapped fallback:', err);
      }
    }

    // 3. Fallback: Wrap raw text into standard response structure
    return {
      isValid: true,
      structuredData: {
        intent,
        message: trimmed,
        rawText: trimmed
      },
      rawText: trimmed
    };
  }
}
