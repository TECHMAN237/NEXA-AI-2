import { IPromptBuilder, AIPrompt, UserIntent, AIContext } from './types.js';
import { XenaConstitution } from './XenaConstitution.js';

/**
 * Centralized Prompt Builder for Xena AI.
 * Uses XenaConstitution v1.0 as the single source of truth for personality, reasoning rules, and safety bounds.
 */
export class PromptBuilder implements IPromptBuilder {
  /**
   * Central System Personality Prompt for Xena AI obtained directly from XenaConstitution v1.0.
   */
  public getSystemPersonalityPrompt(): string {
    return XenaConstitution.getConstitutionText();
  }

  /**
   * Generates optimized system instructions and user prompt based on query, voice transcript, intent, and user context.
   */
  public buildPrompt(
    query: string,
    intent: UserIntent,
    context: AIContext,
    voiceTranscript?: string
  ): AIPrompt {
    const constitutionPrompt = XenaConstitution.getSystemPrompt(intent);
    const userName = context.userName || context.profile?.full_name || 'User';
    const language = context.language || context.profile?.language || 'en';
    const timezone = context.timezone || (typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC');

    let contextSummary = `\n\nCURRENT USER CONTEXT:
- User Name: ${userName}
- Preferred Language: ${language}
- Timezone: ${timezone}
- Current Time: ${context.timestamp}`;

    // Append minimal relevant context snippet if provided
    if (context.reminders && context.reminders.length > 0) {
      const topReminders = context.reminders.slice(0, 5).map(r => `- ${r.title} (${r.date}${r.time ? ' ' + r.time : ''})`).join('\n');
      contextSummary += `\n- Active Reminders (${context.reminders.length}):\n${topReminders}`;
    }

    if (context.events && context.events.length > 0) {
      const topEvents = context.events.slice(0, 5).map(e => `- ${e.title} (${e.date}${e.time ? ' ' + e.time : ''})`).join('\n');
      contextSummary += `\n- Upcoming Events (${context.events.length}):\n${topEvents}`;
    }

    if (context.exams && context.exams.length > 0) {
      const topExams = context.exams.slice(0, 3).map(ex => `- ${ex.course} (Exam Date: ${ex.exam_date})`).join('\n');
      contextSummary += `\n- Upcoming Exams (${context.exams.length}):\n${topExams}`;
    }

    if (context.memories && context.memories.length > 0) {
      const topMem = context.memories.slice(0, 3).map(m => `- ${m.text}`).join('\n');
      contextSummary += `\n- User Facts / Memory Vault Snippets:\n${topMem}`;
    }

    const fullSystemInstruction = `${constitutionPrompt}${contextSummary}`;

    // Combine main query with optional voice transcript
    let userPromptText = query.trim();
    if (voiceTranscript && voiceTranscript.trim().length > 0 && voiceTranscript.trim() !== query.trim()) {
      userPromptText = `[User Message]: "${query.trim()}"\n[Voice Transcript]: "${voiceTranscript.trim()}"`;
    }

    const isChat = intent === 'NORMAL_CHAT' || intent === 'CHAT' || intent === 'CONVERSATION' || intent === 'GENERAL_HELP';

    return {
      systemInstruction: fullSystemInstruction,
      userPrompt: userPromptText,
      temperature: isChat ? 0.7 : 0.2
    };
  }
}

