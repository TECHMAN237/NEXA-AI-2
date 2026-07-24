import { IPromptBuilder, AIPrompt, UserIntent, AIContext } from './types.js';

export class PromptBuilder implements IPromptBuilder {
  /**
   * Generates optimized system instructions and prompts based on user query, intent, and application context.
   */
  buildPrompt(
    query: string,
    intent: UserIntent,
    context: AIContext
  ): AIPrompt {
    const userName = context.profile?.full_name || 'User';
    const activeRemindersCount = context.reminders?.filter((r) => r.active)?.length || 0;
    const pendingTasksCount = context.tasks?.filter((t) => t.status !== 'completed')?.length || 0;
    const upcomingExamsCount = context.exams?.length || 0;

    let systemInstruction = `You are NEXA AI, an advanced intelligent personal assistant and orchestrator.
User Name: ${userName}
Current Time: ${context.timestamp}
System Snapshot: ${activeRemindersCount} active reminders, ${pendingTasksCount} pending tasks, ${upcomingExamsCount} upcoming exams.

Be concise, clear, encouraging, and helpful. Always maintain context safety and structured responses when needed.`;

    // Intent specific tuning
    switch (intent) {
      case 'CREATE_REMINDER':
      case 'UPDATE_REMINDER':
      case 'DELETE_REMINDER':
        systemInstruction += `\nYour primary focus is NATURAL LANGUAGE REMINDER UNDERSTANDING.
CRITICAL INSTRUCTIONS FOR REMINDER EXTRACTION:
1. VOICE & TRANSCRIPTION CLEANING: If input is a voice transcript or raw natural language, FIRST correct transcription typos, remove hesitations ("um", "uh", "like", "you know", "err", "ah"), reconstruct incomplete sentences, and infer real intention. NEVER output raw uncleaned speech.
2. DATES & REPEAT CALCULATIONS:
   - Calculate dates relative to current time: ${context.timestamp}.
   - "tomorrow" = next calendar day in YYYY-MM-DD.
   - "next Friday" = the upcoming Friday.
   - "every Monday" = repeat: "weekly", set date to next Monday.
   - "first day of every month" = repeat: "monthly", set date to YYYY-MM-01.
3. VALIDATION:
   - Check if "title" and "date" exist.
   - If time is mentioned (e.g. "8 AM", "2 PM", "at 18:00"), format as "HH:MM" (e.g. "08:00", "14:00", "18:00").
   - If title or date is completely missing or ambiguous, list the missing field in "missingFields" and provide a helpful question in "clarificationPrompt" (e.g. "What time should I set for your reminder?").
4. STRUCTURED RESPONSE: You MUST respond ONLY with a JSON object in markdown block \`\`\`json ... \`\`\` adhering to this schema:
{
  "intent": "${intent}",
  "title": "string (cleaned title)",
  "description": "string (optional extra context)",
  "date": "YYYY-MM-DD",
  "time": "HH:MM (optional, e.g. 09:00)",
  "priority": "low" | "medium" | "high",
  "repeat": "none" | "daily" | "weekly" | "monthly",
  "voiceReminder": true,
  "missingFields": ["string"],
  "clarificationPrompt": "string or null"
}`;
        break;

      case 'CREATE_EVENT':
      case 'UPDATE_EVENT':
        systemInstruction += `\nYour primary focus for this request is EVENT SCHEDULING. Identify title, date, location, and participants.`;
        break;

      case 'GENERATE_PLANNING':
      case 'UPDATE_PLANNING':
        systemInstruction += `\nYour primary focus for this request is TASK & DAY PLANNING. Help breakdown tasks and structure a balanced daily plan.`;
        break;

      case 'STUDY_COACH':
        systemInstruction += `\nYour primary focus for this request is ACADEMIC STUDY COACHING. Assist with revision strategies, exam countdowns, and active recall suggestions.`;
        break;

      case 'AI_MEMORY':
        systemInstruction += `\nYour primary focus for this request is PERSONAL AI MEMORY & PREFERENCES. Explicitly state what facts you remember or update.`;
        break;

      case 'PROFILE':
      case 'SETTINGS':
        systemInstruction += `\nYour primary focus for this request is USER PROFILE & SYSTEM CONFIGURATION. Provide precise guidance on account settings and integrations.`;
        break;

      case 'CHAT':
      default:
        systemInstruction += `\nEngage in natural, friendly conversation as NEXA AI. Answer questions accurately based on user context.`;
        break;
    }

    // Build context summary snippet
    let contextSnippet = '';
    if (context.memories && context.memories.length > 0) {
      const topMemories = context.memories.slice(0, 5).map((m) => `- ${m.text}`).join('\n');
      contextSnippet += `\n\nKey Memorized Facts:\n${topMemories}`;
    }

    const userPrompt = `${query}${contextSnippet}`;

    return {
      systemInstruction,
      userPrompt
    };
  }
}
