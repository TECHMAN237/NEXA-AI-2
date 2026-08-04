import { IResponseParser, UserIntent, AIToolCall } from './types.js';

/**
 * Parses, sanitizes, and structures raw output from AI providers.
 * Enforces Markdown outputs, strips raw HTML, parses embedded JSON, and extracts tool calls.
 */
export class ResponseParser implements IResponseParser {
  public parseResponse(
    rawResponse: string,
    intent: UserIntent
  ): {
    isValid: boolean;
    structuredData: any;
    markdownText: string;
    toolCalls?: AIToolCall[];
    rawText: string;
    error?: string;
  } {
    if (!rawResponse || typeof rawResponse !== 'string') {
      return {
        isValid: false,
        structuredData: null,
        markdownText: 'I am here to assist you.',
        rawText: '',
        error: 'Empty response string'
      };
    }

    const trimmed = rawResponse.trim();

    // 1. Sanitize raw HTML tags to prevent HTML injection while preserving Markdown
    const sanitizedText = this.sanitizeHtmlTags(trimmed);

    // 2. Extract potential JSON markdown block or raw JSON object
    let structuredData: any = null;
    let jsonMatch = sanitizedText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);

    if (jsonMatch && jsonMatch[1]) {
      try {
        structuredData = JSON.parse(jsonMatch[1].trim());
      } catch (e) {
        // Soft catch if JSON in code block was malformed
      }
    } else if (sanitizedText.startsWith('{') || sanitizedText.startsWith('[')) {
      try {
        structuredData = JSON.parse(sanitizedText);
      } catch (e) {
        // Soft catch
      }
    }

    // 3. Extract future tool calls if present in structuredData
    let toolCalls: AIToolCall[] | undefined = undefined;
    if (structuredData && Array.isArray(structuredData.toolCalls)) {
      toolCalls = structuredData.toolCalls;
    } else if (structuredData && structuredData.toolName && structuredData.toolArgs) {
      toolCalls = [{ name: structuredData.toolName, args: structuredData.toolArgs }];
    }

    // 4. Generate clean Markdown text response
    let markdownText = sanitizedText;

    if (structuredData) {
      if (typeof structuredData.message === 'string' && structuredData.message.trim().length > 0) {
        markdownText = structuredData.message.trim();
      } else if (typeof structuredData.response === 'string' && structuredData.response.trim().length > 0) {
        markdownText = structuredData.response.trim();
      } else if (typeof structuredData.summary === 'string' && structuredData.summary.trim().length > 0) {
        markdownText = structuredData.summary.trim();
      }
    }

    return {
      isValid: true,
      structuredData: structuredData || { intent, rawText: sanitizedText },
      markdownText,
      toolCalls,
      rawText: sanitizedText
    };
  }

  /**
   * Replaces raw unsafe HTML tags while keeping standard text & Markdown intact.
   */
  private sanitizeHtmlTags(str: string): string {
    return str
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<(?:\/)?[a-z1-6]+[^>]*>/gi, '');
  }
}
