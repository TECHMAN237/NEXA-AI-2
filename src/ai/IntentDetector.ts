import { IIntentDetector, UserIntent, AIContext } from './types.js';
import { extractTimeFromText } from '../utils/timeUtils.js';

export class IntentDetector implements IIntentDetector {
  /**
   * Detects the user's intent from query text and context.
   */
  async detectIntent(
    query: string,
    _context?: AIContext
  ): Promise<{
    intent: UserIntent;
    confidence: number;
    extractedData?: Record<string, any>;
  }> {
    if (!query || typeof query !== 'string') {
      return { intent: 'UNKNOWN', confidence: 0 };
    }

    const lower = query.toLowerCase().trim();

    // 1. Reminder intents
    if (
      lower.includes('delete reminder') ||
      lower.includes('remove reminder') ||
      lower.includes('cancel reminder')
    ) {
      return {
        intent: 'DELETE_REMINDER',
        confidence: 0.9,
        extractedData: this.extractKeywordParams(query)
      };
    }

    if (
      lower.includes('update reminder') ||
      lower.includes('edit reminder') ||
      lower.includes('change reminder') ||
      lower.includes('postpone reminder')
    ) {
      return {
        intent: 'UPDATE_REMINDER',
        confidence: 0.85,
        extractedData: this.extractKeywordParams(query)
      };
    }

    if (
      lower.includes('remind me') ||
      lower.includes('create reminder') ||
      lower.includes('add reminder') ||
      lower.includes('set a reminder') ||
      lower.includes('new reminder') ||
      lower.includes('i have to') ||
      lower.includes('i must') ||
      lower.includes('i need to') ||
      lower.includes('interview at') ||
      lower.includes('pay my rent') ||
      lower.includes('submit my')
    ) {
      return {
        intent: 'CREATE_REMINDER',
        confidence: 0.9,
        extractedData: this.extractKeywordParams(query)
      };
    }

    // 2. Event intents
    if (
      lower.includes('update event') ||
      lower.includes('edit event') ||
      lower.includes('change event')
    ) {
      return {
        intent: 'UPDATE_EVENT',
        confidence: 0.85,
        extractedData: this.extractKeywordParams(query)
      };
    }

    if (
      lower.includes('create event') ||
      lower.includes('add event') ||
      lower.includes('schedule event') ||
      lower.includes('new event') ||
      lower.includes('meeting') ||
      lower.includes('appointment')
    ) {
      return {
        intent: 'CREATE_EVENT',
        confidence: 0.85,
        extractedData: this.extractKeywordParams(query)
      };
    }

    // 3. Planning intents
    if (
      lower.includes('update plan') ||
      lower.includes('edit task') ||
      lower.includes('update planning') ||
      lower.includes('complete task')
    ) {
      return {
        intent: 'UPDATE_PLANNING',
        confidence: 0.85,
        extractedData: this.extractKeywordParams(query)
      };
    }

    if (
      lower.includes('generate plan') ||
      lower.includes('create plan') ||
      lower.includes('schedule my day') ||
      lower.includes('planning') ||
      lower.includes('organize my tasks')
    ) {
      return {
        intent: 'GENERATE_PLANNING',
        confidence: 0.85,
        extractedData: this.extractKeywordParams(query)
      };
    }

    // 4. Study Coach intents
    if (
      lower.includes('study') ||
      lower.includes('exam') ||
      lower.includes('revision') ||
      lower.includes('coach') ||
      lower.includes('course') ||
      lower.includes('quiz')
    ) {
      return {
        intent: 'STUDY_COACH',
        confidence: 0.8,
        extractedData: this.extractKeywordParams(query)
      };
    }

    // 5. Memory Vault vs AI Memory intents
    if (
      lower.includes('vault') ||
      lower.includes('my car is') ||
      lower.includes('parked') ||
      lower.includes('store in vault') ||
      lower.includes('vault note') ||
      lower.includes('safe note')
    ) {
      return {
        intent: 'MEMORY_VAULT',
        confidence: 0.9,
        extractedData: this.extractKeywordParams(query)
      };
    }

    if (
      lower.includes('remember') ||
      lower.includes('memory') ||
      lower.includes('keep in mind') ||
      lower.includes('forget that') ||
      lower.includes('what do you know about me') ||
      lower.includes('my preference')
    ) {
      return {
        intent: 'AI_MEMORY',
        confidence: 0.85,
        extractedData: this.extractKeywordParams(query)
      };
    }

    // 6. Profile intents
    if (
      lower.includes('profile') ||
      lower.includes('my name') ||
      lower.includes('account info') ||
      lower.includes('who am i')
    ) {
      return {
        intent: 'PROFILE',
        confidence: 0.8,
        extractedData: this.extractKeywordParams(query)
      };
    }

    // 7. Settings intents
    if (
      lower.includes('setting') ||
      lower.includes('permission') ||
      lower.includes('dark mode') ||
      lower.includes('theme') ||
      lower.includes('connected app')
    ) {
      return {
        intent: 'SETTINGS',
        confidence: 0.8,
        extractedData: this.extractKeywordParams(query)
      };
    }

    // 8. General Help
    if (
      lower.includes('how do i use') ||
      lower.includes('what can you do') ||
      lower.includes('help me with xena') ||
      lower.includes('capabilities')
    ) {
      return {
        intent: 'GENERAL_HELP',
        confidence: 0.85,
        extractedData: { query }
      };
    }

    // 9. Normal Chat / Assistant
    if (
      lower.startsWith('hi') ||
      lower.startsWith('hello') ||
      lower.includes('help') ||
      lower.length > 0
    ) {
      return {
        intent: 'NORMAL_CHAT',
        confidence: 0.7,
        extractedData: { query }
      };
    }

    return {
      intent: 'UNKNOWN',
      confidence: 0.1
    };
  }

  public extractKeywordParams(query: string): Record<string, any> {
    const rawQuery = query;

    // 1. Voice transcription cleaning: remove hesitations & stutters
    let cleanedText = query
      .replace(/\b(um+|uh+|err+|ah+|like|you know|please|so|well)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    const lower = cleanedText.toLowerCase();
    const now = new Date();
    let calculatedDate = now.toISOString().split('T')[0]; // Default today
    let calculatedTime = '09:00';
    let repeat: 'none' | 'daily' | 'weekly' | 'monthly' = 'none';

    // 2. Repeat detection
    if (lower.includes('every monday')) {
      repeat = 'weekly';
      // calculate next monday
      const day = now.getDay();
      const diff = (1 + 7 - day) % 7 || 7;
      const nextMonday = new Date(now);
      nextMonday.setDate(now.getDate() + diff);
      calculatedDate = nextMonday.toISOString().split('T')[0];
    } else if (lower.includes('every day') || lower.includes('daily')) {
      repeat = 'daily';
    } else if (lower.includes('first day of every month') || lower.includes('every month')) {
      repeat = 'monthly';
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      calculatedDate = nextMonth.toISOString().split('T')[0];
    } else if (lower.includes('tomorrow')) {
      const tomorrow = new Date(now);
      tomorrow.setDate(now.getDate() + 1);
      calculatedDate = tomorrow.toISOString().split('T')[0];
    } else if (lower.includes('next friday')) {
      const day = now.getDay();
      const diff = (5 + 7 - day) % 7 || 7;
      const nextFriday = new Date(now);
      nextFriday.setDate(now.getDate() + diff);
      calculatedDate = nextFriday.toISOString().split('T')[0];
    }

    // 3. Time extraction
    const extractedTime = extractTimeFromText(cleanedText) || extractTimeFromText(rawQuery);
    if (extractedTime) {
      calculatedTime = extractedTime;
    }

    // 4. Title extraction & cleaning
    let title = cleanedText;
    title = title.replace(/^remind me (to|about|that)?/i, '');
    title = title.replace(/^i have to/i, '');
    title = title.replace(/^i must/i, '');
    title = title.replace(/^i need to/i, '');
    title = title.replace(/^please remind me (to|every)?/i, '');
    title = title.replace(/\b(tomorrow|next friday|every monday|on the first day of every month|at \d{1,2}\s?(am|pm)|\d{1,2}:\d{2})\b/gi, '');
    title = title.replace(/\s+/g, ' ').trim();

    if (title.length > 0) {
      title = title.charAt(0).toUpperCase() + title.slice(1);
    } else {
      title = cleanedText;
    }

    return {
      rawQuery,
      cleanedText,
      title,
      date: calculatedDate,
      time: calculatedTime,
      repeat,
      voiceReminder: true
    };
  }
}
