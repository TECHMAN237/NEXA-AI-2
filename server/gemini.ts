import { GoogleGenAI, Type } from "@google/genai";
import { dbService } from "./db.js";
import { IntentClassification } from "../src/types.js";
import { extractTimeFromText, normalizeTimeString } from "../src/utils/timeUtils.js";
import { cleanReminderTitle, resolveRelativeDate, extractReminderParams } from "../src/utils/reminderParser.js";

// Helper to safely get the API key
function getGeminiApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === "MY_GEMINI_API_KEY") {
    console.warn("Notice: GEMINI_API_KEY environment variable is not set or is set to placeholder.");
  }
  return key || "";
}

// Lazy load Gemini client
let aiClient: GoogleGenAI | null = null;

export function getGemini(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = getGeminiApiKey();
    aiClient = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

// In-memory LRU/TTL Cache for performance optimization
class MemoryCache<T> {
  private cache = new Map<string, { value: T; expiresAt: number }>();
  
  get(key: string): T | null {
    const item = this.cache.get(key);
    if (!item) return null;
    if (Date.now() > item.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return item.value;
  }

  set(key: string, value: T, ttlMs: number = 60000): void {
    if (this.cache.size > 200) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  }
}

const intentCache = new MemoryCache<IntentClassification>();
const reformulateCache = new MemoryCache<string>();

/**
 * Fast-path check for simple greetings to skip model roundtrip and minimize latency.
 */
function getFastPathIntent(text: string): IntentClassification | null {
  const clean = text.toLowerCase().trim();
  const simpleChatGreetings = [
    'hi', 'hello', 'hey', 'who are you', 'what is your name',
    'what can you do', 'help', 'bonjour', 'salut', 'coucou', 'hola'
  ];
  if (simpleChatGreetings.includes(clean)) {
    return {
      intent: 'NORMAL_CHAT',
      intents: ['NORMAL_CHAT'],
      actions: [{ intent: 'NORMAL_CHAT', action: 'NO_OP', payload: {} }],
      explanation: 'Greeting detected — routing directly to assistant conversation.'
    };
  }
  return null;
}

/**
 * Deterministic Rule-Based Intent Parser for explicit commands (Reminders, Memory Vault, etc.).
 */
export function parseRuleBasedIntent(cleanText: string): IntentClassification | null {
  const lower = cleanText.toLowerCase().trim();
  const todayStr = new Date().toISOString().split('T')[0];

  // 1. Memory Vault check
  if (
    lower.includes('passport') ||
    lower.includes('parked at') ||
    lower.includes('blue drawer') ||
    lower.includes('my idea is') ||
    lower.includes('store in vault') ||
    lower.includes('vault note') ||
    lower.includes('save in vault') ||
    lower.includes('keep this information') ||
    (lower.includes('remember that') && !lower.includes('remind me'))
  ) {
    const cleanContent = cleanText.replace(/^(remember that|save in vault|store in vault|vault note:?|keep this information:?)\s*/i, '').trim();
    let title = 'Saved Note';
    if (lower.includes('passport')) title = 'Passport Location';
    else if (lower.includes('parked')) title = 'Parking Spot';
    else if (lower.includes('idea')) title = 'Startup Idea';
    else title = cleanContent.slice(0, 30);

    return {
      intent: 'MEMORY_VAULT',
      intents: ['MEMORY_VAULT'],
      actions: [{
        intent: 'MEMORY_VAULT',
        action: 'CREATE',
        payload: { title, content: cleanContent, category: 'Personal' }
      }],
      extractedData: { title, content: cleanContent, category: 'Personal' },
      explanation: `Stored note "${title}" in Memory Vault.`
    };
  }

  // 2. Planning check
  const isPlanningQuery = (
    lower.includes('create my plan') ||
    lower.includes('create a plan') ||
    lower.includes('plan my day') ||
    lower.includes('plan for tomorrow') ||
    lower.includes('organize my day') ||
    lower.includes('daily plan') ||
    lower.includes('organize my schedule') ||
    lower.includes('schedule my day') ||
    lower.includes('make a plan') ||
    lower.includes('organize my revision') ||
    (lower.includes('class at') && (lower.includes('study') || lower.includes('project') || lower.includes('finish'))) ||
    (lower.includes('need to study') && lower.includes('hours')) ||
    (lower.includes('need to') && lower.includes('plan'))
  );

  if (isPlanningQuery) {
    const date = resolveRelativeDate(null, cleanText);
    return {
      intent: 'PLANNING',
      intents: ['PLANNING'],
      actions: [{
        intent: 'PLANNING',
        action: 'CREATE',
        payload: {
          title: cleanText,
          content: cleanText,
          date
        }
      }],
      extractedData: {
        title: cleanText,
        date
      },
      explanation: `Creating structured schedule plan for ${date}.`
    };
  }

  // 3. View / Query Upcoming Events check (placed before CREATE_EVENT and CREATE_REMINDER)
  const isEventQueryView = (
    lower.includes('what events') ||
    lower.includes('upcoming events') ||
    lower.includes('events coming up') ||
    lower.includes('events do i have') ||
    lower.includes('events i have') ||
    lower.includes('events this week') ||
    lower.includes('events today') ||
    lower.includes('events tomorrow') ||
    lower.includes('events on my calendar') ||
    lower.includes('on my calendar') ||
    lower.includes('do i have any events') ||
    lower.includes('tell me about my upcoming events') ||
    lower.includes('tell me about my events') ||
    lower.includes('remind me what events') ||
    lower.includes('remind me about the events') ||
    lower.includes('remind me of my events') ||
    lower.includes('remind me my events') ||
    lower.includes('show my events') ||
    lower.includes('show me my events') ||
    lower.includes('list my events') ||
    lower.includes('view my events') ||
    lower.includes('check my events') ||
    lower.includes('check my schedule') ||
    lower.includes("what's on my schedule") ||
    lower.includes("what is on my schedule") ||
    (lower.includes('remind me') && (lower.includes('what event') || lower.includes('what meeting') || lower.includes('what schedule')))
  );

  if (isEventQueryView) {
    const date = resolveRelativeDate(null, cleanText);
    return {
      intent: 'VIEW_UPCOMING_EVENTS',
      intents: ['VIEW_UPCOMING_EVENTS'],
      actions: [{
        intent: 'VIEW_UPCOMING_EVENTS',
        action: 'READ',
        payload: {
          query: cleanText,
          date
        }
      }],
      extractedData: { query: cleanText, date },
      explanation: `Querying existing events for "${cleanText}".`
    };
  }

  // 4. Event check (CREATE)
  const isEventQuery = (
    lower.includes('save it in my events') ||
    lower.includes('in my events') ||
    lower.includes('to my events') ||
    lower.includes('as an event') ||
    lower.includes('add event') ||
    lower.includes('create event') ||
    lower.includes('schedule event') ||
    lower.includes('add meeting') ||
    lower.includes('schedule meeting') ||
    lower.includes('church service') ||
    lower.includes('tech conference') ||
    lower.includes('doctor appointment') ||
    lower.includes('conference on') ||
    lower.includes('bootcamp') ||
    (lower.startsWith('add ') && (lower.includes('event') || lower.includes('meeting') || lower.includes('service') || lower.includes('conference') || lower.includes('workshop') || lower.includes('webinar'))) ||
    (lower.includes('remind me') && (lower.includes('in my events') || lower.includes('to my events') || lower.includes('save it in my events') || lower.includes('as an event')))
  );

  if (isEventQuery) {
    const hasExplicitDate = /\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|\d{1,2}\/\d{1,2}|\d{4}-\d{2}-\d{2})\b/i.test(cleanText);
    const date = hasExplicitDate ? resolveRelativeDate(null, cleanText) : 'Not specified';

    const explicitTime = extractTimeFromText(cleanText);
    const time = explicitTime ? explicitTime : 'Not specified';

    let location = 'Not specified';
    const locMatch = cleanText.match(/\b(at|in)\s+([A-Z0-9][a-zA-Z0-9\s,]{2,30})/);
    if (locMatch && !/saturday|sunday|monday|tuesday|wednesday|thursday|friday|today|tomorrow|events|my events/i.test(locMatch[2])) {
      location = locMatch[2].trim();
    }

    let title = cleanText
      .replace(/^(I\s+(would\s+like|want)\s+(you\s+)?to\s+)?(remind\s+me\s+of\s+the|remind\s+me\s+about\s+the|remind\s+me\s+of|remind\s+me\s+about|remind\s+me\s+to|remind\s+me|save\s+my|save\s+the|save\s+it\s+in|save\s+in|save\s+to|save|add\s+my|add\s+the|add|schedule\s+my|schedule\s+the|schedule|create\s+my|create\s+the|create)\s+/i, '')
      .replace(/\s+(that\s+will\s+happen|which\s+is\s+happening|happening|taking\s+place).*$/i, '')
      .replace(/\s+(and\s+)?(save\s+it\s+(inside|in)|add\s+it\s+to|save\s+to)\s+(my\s+)?events.*$/i, '')
      .replace(/\s+(inside|in|to)\s+(my\s+)?events.*$/i, '')
      .replace(/\s+as\s+an?\s+event.*$/i, '')
      .replace(/\s+(this|next)?\s*(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today).*$/i, '')
      .replace(/\s+(on|at)\s+\d{1,2}(:\d{2})?\s*(am|pm)?.*$/i, '')
      .trim();

    if (title) {
      title = title.split(/\s+/).map(w => w.length > 0 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : '').join(' ');
    }
    if (!title) title = 'Scheduled Event';

    return {
      intent: 'EVENT',
      intents: ['EVENT'],
      actions: [{
        intent: 'EVENT',
        action: 'CREATE',
        payload: {
          title,
          date,
          time,
          location,
          description: cleanText
        }
      }],
      extractedData: { title, date, time, location },
      explanation: `Scheduling event "${title}".`
    };
  }

  // 4. Study Tracking check
  const isStudyQuery = (
    lower.includes('algorithms exam') ||
    lower.includes('exam in') ||
    lower.includes('prepare for my exam') ||
    lower.includes('track my study') ||
    lower.includes('study tracking') ||
    (lower.includes('exam') && (lower.includes('weeks') || lower.includes('days') || lower.includes('revision')))
  );

  if (isStudyQuery) {
    let course = 'Algorithms';
    if (lower.includes('algorithms')) course = 'Algorithms';
    else if (lower.includes('math')) course = 'Mathematics';
    else if (lower.includes('physics')) course = 'Physics';

    let examDate = resolveRelativeDate(null, cleanText);
    if (lower.includes('two weeks') || lower.includes('2 weeks')) {
      const d = new Date();
      d.setDate(d.getDate() + 14);
      examDate = d.toISOString().split('T')[0];
    } else if (lower.includes('one week') || lower.includes('1 week')) {
      const d = new Date();
      d.setDate(d.getDate() + 7);
      examDate = d.toISOString().split('T')[0];
    }

    return {
      intent: 'STUDY_TRACKING',
      intents: ['STUDY_TRACKING'],
      actions: [{
        intent: 'STUDY_TRACKING',
        action: 'CREATE',
        payload: {
          course,
          exam_date: examDate,
          topics: ['Sorting', 'Trees', 'Graphs'],
          target_score: 90,
          daily_hours: 2
        }
      }],
      extractedData: { course, date: examDate },
      explanation: `Activating study tracking for ${course} exam on ${examDate}.`
    };
  }

  // 5. Reminder check
  const isReminderQuery = (
    lower.includes('remind me') ||
    lower.includes('reminder') ||
    lower.includes('i have to') ||
    lower.includes('i must') ||
    lower.includes('interview at') ||
    lower.includes('pay my rent') ||
    lower.includes('submit my')
  );

  if (isReminderQuery) {
    const params = extractReminderParams({}, cleanText);
    if (!params.title || params.title.trim().length === 0) {
      return {
        intent: 'AMBIGUOUS',
        intents: ['AMBIGUOUS'],
        explanation: 'User requested a reminder but did not provide what to be reminded about.',
        clarificationPrompt: 'What would you like me to remind you about?'
      };
    }

    return {
      intent: 'REMINDER',
      intents: ['REMINDER'],
      actions: [{
        intent: 'REMINDER',
        action: 'CREATE',
        payload: {
          title: params.title,
          date: params.date,
          time: params.time,
          repeat: params.repeat,
          priority: params.priority,
          voiceReminder: params.voiceReminder,
          description: params.description || '',
          category: params.category || 'General'
        }
      }],
      extractedData: {
        title: params.title,
        date: params.date,
        time: params.time,
        repeat: params.repeat,
        priority: params.priority,
        voiceReminder: params.voiceReminder
      },
      explanation: `Parsed reminder "${params.title}" for ${params.time} on ${params.date}.`
    };
  }

  return null;
}

/**
 * Route User Intent: Simple & robust intent classification using Gemini JSON schema.
 */
export async function routeUserIntent(text: string): Promise<IntentClassification> {
  const cleanText = text.trim();
  const cacheKey = cleanText.toLowerCase();

  // 1. Fast path for trivial greetings
  const fastPath = getFastPathIntent(cleanText);
  if (fastPath) return fastPath;

  // 2. Deterministic Rule-Based Pre-check for explicit commands (Reminders, Memory Vault, etc.)
  const ruleMatch = parseRuleBasedIntent(cleanText);
  if (ruleMatch) {
    console.log('[INTENT_RULE_MATCH]', ruleMatch);
    intentCache.set(cacheKey, ruleMatch, 60000);
    return ruleMatch;
  }

  // 3. Check cache for repeated query
  const cached = intentCache.get(cacheKey);
  if (cached) return cached;

  const apiKey = process.env.GEMINI_API_KEY;
  const todayStr = new Date().toISOString().split('T')[0];

  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    const fallbackResult: IntentClassification = {
      intent: 'NORMAL_CHAT',
      intents: ['NORMAL_CHAT'],
      actions: [{ intent: 'NORMAL_CHAT', action: 'NO_OP', payload: {} }],
      explanation: 'Defaulting to general assistant chat in local mode.'
    };
    return fallbackResult;
  }

  const ai = getGemini();

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: `Classify user request, detect single or multi-intents, and extract structured actions: "${cleanText}"`,
      config: {
        systemInstruction: `You are Xena AI's Intent Classifier, Multi-Intent Detector, and Action Formatter.
Current date: ${todayStr}.

Supported Intents:
- NORMAL_CHAT: General conversation, greetings, questions.
- REMINDER: Setting reminders, to-dos, alarm tasks with dates/times.
- PLANNING: Creating daily schedules, timelines, task blocks.
- EVENT: Creating calendar events, meetings, appointments with location/time.
- VIEW_UPCOMING_EVENTS: Retrieving, listing, or asking about existing upcoming events or calendar items (e.g., "What events do I have coming up?", "Remind me what events I have coming up").
- STUDY_TRACKING: Exam dates, course study sessions, chapter revisions.
- MEMORY_VAULT: Preserving user facts/notes intentionally stored for reference (e.g., "My passport is inside the blue drawer", "I parked at B2", "My startup idea is...").
- PROFILE: User profile info, account details, full name changes.
- SETTINGS: Theme, notification preferences, connected apps.
- GENERAL_HELP: Questions on how to use Xena AI or app capabilities.
- AMBIGUOUS: User intent requires mandatory missing information (e.g. "Remind me tomorrow" without stating what to remind).

CRITICAL INSTRUCTIONS:
1. EVENT VS REMINDER VS QUERY:
   - CREATE_REMINDER (intent: "REMINDER", action: "CREATE"): User asks to create a NEW reminder notification (e.g. "Remind me to call John at 8pm").
   - CREATE_EVENT (intent: "EVENT", action: "CREATE"): User asks to add or schedule a NEW calendar event (e.g. "Add church service Sunday at 9am").
   - VIEW_UPCOMING_EVENTS (intent: "VIEW_UPCOMING_EVENTS", action: "READ"): User asks to check, retrieve, or list existing events on their calendar (e.g. "What events do I have coming up?", "Remind me what events I have coming up"). The word "remind" in "Remind me what events I have coming up" means RETRIEVING existing events — DO NOT create a reminder or event!
2. VOICE CLEANING: Clean speech hesitations ("um", "uh", "you know", "like", "err") and correct obvious speech typos.
3. MULTI-INTENT DETECTION: A single message may contain multiple independent intentions!
   Example: "My exam is on August 20. Create a study plan. Remind me three days before."
   Detects: EVENT/STUDY_TRACKING, PLANNING, and REMINDER! Return ALL detected intents in "intents" array and generate corresponding "actions".
4. DATES & TIMES: "tomorrow" = today + 1 day (${todayStr}). Always format time as 24-hour HH:MM.
5. AMBIGUITY: If a reminder or event request is missing vital detail (like missing title for "remind me tomorrow"), set intent to "AMBIGUOUS", provide missingFields and a clear clarificationPrompt.`,
        responseMimeType: "application/json",
        maxOutputTokens: 500,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            intent: {
              type: Type.STRING,
              enum: [
                "NORMAL_CHAT", "REMINDER", "PLANNING", "EVENT", "VIEW_UPCOMING_EVENTS",
                "STUDY_TRACKING", "MEMORY_VAULT", "PROFILE", 
                "SETTINGS", "GENERAL_HELP", "AMBIGUOUS"
              ],
              description: "Primary classified user intention."
            },
            intents: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "All detected intentions in multi-intent requests."
            },
            actions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  intent: { type: Type.STRING },
                  action: { type: Type.STRING, enum: ["CREATE", "READ", "UPDATE", "DELETE", "SEARCH", "NO_OP"] },
                  payload: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING },
                      content: { type: Type.STRING },
                      date: { type: Type.STRING },
                      time: { type: Type.STRING },
                      course: { type: Type.STRING },
                      location: { type: Type.STRING },
                      priority: { type: Type.STRING },
                      category: { type: Type.STRING }
                    }
                  }
                }
              },
              description: "Structured actions to execute across application modules."
            },
            extractedData: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                content: { type: Type.STRING },
                date: { type: Type.STRING },
                time: { type: Type.STRING },
                course: { type: Type.STRING },
                location: { type: Type.STRING },
                category: { type: Type.STRING },
                priority: { type: Type.STRING }
              }
            },
            explanation: { type: Type.STRING },
            clarificationPrompt: { type: Type.STRING },
            missingFields: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          },
          required: ["intent", "explanation"]
        }
      }
    });

    const resultText = response.text || "{}";
    const classification = JSON.parse(resultText) as IntentClassification;
    if (classification.explanation) {
      classification.explanation = classification.explanation.replace(/NEXA/gi, 'Xena');
    }

    if (classification.intent === 'REMINDER' || (classification.intents && classification.intents.includes('REMINDER'))) {
      if (classification.extractedData) {
        const params = extractReminderParams(classification.extractedData, cleanText);
        classification.extractedData.title = params.title;
        classification.extractedData.date = params.date;
        classification.extractedData.time = params.time;
      }

      if (classification.actions) {
        classification.actions.forEach(act => {
          if (act.intent === 'REMINDER' && act.payload) {
            const params = extractReminderParams(act.payload, cleanText);
            act.payload.title = params.title;
            act.payload.date = params.date;
            act.payload.time = params.time;
          }
        });
      }
    } else if (classification.extractedData) {
      const explicitTimeInText = extractTimeFromText(cleanText);
      if (explicitTimeInText) {
        classification.extractedData.time = explicitTimeInText;
      } else if (classification.extractedData.time) {
        classification.extractedData.time = normalizeTimeString(classification.extractedData.time) || classification.extractedData.time;
      }
    }

    if (!classification.intents || classification.intents.length === 0) {
      classification.intents = [classification.intent];
    }

    intentCache.set(cacheKey, classification, 60000);
    return classification;
  } catch (error) {
    console.error("Intent routing failed, attempting rule-based fallback:", error);
    const fallbackRule = parseRuleBasedIntent(cleanText);
    if (fallbackRule) {
      return fallbackRule;
    }
    return {
      intent: 'NORMAL_CHAT',
      intents: ['NORMAL_CHAT'],
      actions: [{ intent: 'NORMAL_CHAT', action: 'NO_OP', payload: {} }],
      explanation: 'General chat response.'
    };
  }
}

/**
 * Extract Personal Memories: Analyzes message to see if there's any long-term preference to memorize.
 */
export async function checkAndMemorize(userId: string, text: string): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") return null;

  const ai = getGemini();

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: `Check if this sentence contains personal facts, habits, or details about the user that are worth remembering: "${text}"`,
      config: {
        systemInstruction: `You are Xena's memory logger.
Analyze if the statement expresses a personal preference, habit, study routine, key milestone, or constraint (e.g., 'I study better at night', 'I prefer study sessions on Saturdays', 'My exam is on August 20', 'I prefer English').
If so, extract the exact concise fact as a single sentence.
If there is nothing useful to remember, return an empty string.`,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            fact: { type: Type.STRING, description: "The extracted personal fact, or empty string." },
            category: { type: Type.STRING, enum: ["Preference", "Schedule", "Milestone", "Setting", ""], description: "Category of memory." }
          },
          required: ["fact", "category"]
        }
      }
    });

    const data = JSON.parse(response.text || "{}");
    if (data.fact && data.fact.trim() !== "") {
      const memory = dbService.createMemory(userId, {
        text: data.fact,
        category: data.category || "Preference"
      });
      return memory.text;
    }
  } catch (e) {
    console.error("Memory parsing failed:", e);
  }
  return null;
}

/**
 * Core AI Assistant Chat: Generates rich response with context from reminders, exams, events and memories.
 */
export async function chatWithNexa(
  userId: string, 
  conversationId: string, 
  userText: string,
  actionResults?: any[]
): Promise<string> {
  const reminders = dbService.getReminders(userId);
  const exams = dbService.getExams(userId);
  const events = dbService.getEvents(userId);
  const memories = dbService.getMemories(userId);
  const history = dbService.getMessages(conversationId).slice(-10);

  if (actionResults && actionResults.length > 0) {
    const successfulAction = actionResults.find((a: any) => a.success);
    if (successfulAction) {
      if (successfulAction.data?.followUpText) {
        console.log('[FOLLOW_UP_RENDERED]', successfulAction.data.followUpText);
        return successfulAction.data.followUpText;
      }

      const mod = successfulAction.targetModule;
      const data = successfulAction.data || {};

      if (data && data.followUpText) {
        console.log('[FOLLOW_UP_RENDERED]', data.followUpText);
        return data.followUpText;
      }

      if (mod === 'Reminder') {
        const title = data.title || 'Reminder';
        const date = data.date || 'today';
        const time = data.time || '09:00';
        const text = `Done — I've set a reminder to ${title} for ${date} at ${time}.`;
        console.log('[FOLLOW_UP_RENDERED]', text);
        return text;
      }

      if (mod === 'Planning') {
        const date = data.date || 'today';
        const blocksCount = data.timeline?.length || 0;
        let response = `Done — I've created a structured daily schedule for ${date} with ${blocksCount} time blocks:\n\n`;
        if (data.timeline && data.timeline.length > 0) {
          data.timeline.forEach((b: any) => {
            response += `• **${b.time}**: ${b.title}\n`;
          });
        }
        response += `\nYour schedule is now saved and available under Planning in My Items.`;
        console.log('[FOLLOW_UP_RENDERED]', response);
        return response;
      }

      if (mod === 'Event') {
        const title = data.title || 'Event';
        const date = data.date || 'today';
        const time = data.time || '09:00';
        const loc = data.location ? ` (${data.location})` : '';
        const response = `Done — I've scheduled '${title}' for ${date} at ${time}${loc}. Notification reminders have been configured.`;
        console.log('[FOLLOW_UP_RENDERED]', response);
        return response;
      }

      if (mod === 'StudyTracking') {
        const course = data.course || 'Study Course';
        const date = data.exam_date || 'upcoming';
        const response = `Done — I've activated study tracking for ${course}. Exam date recorded for ${date}, and your revision plan is now active in Study Tracking.`;
        console.log('[FOLLOW_UP_RENDERED]', response);
        return response;
      }

      if (mod === 'MemoryVault') {
        const title = data.title || 'Saved Note';
        const response = `Done — I've saved "${title}" in your Memory Vault for future reference.`;
        console.log('[FOLLOW_UP_RENDERED]', response);
        return response;
      }

      return `Done — ${successfulAction.summary}`;
    }

    const failedAction = actionResults.find((a: any) => !a.success);
    if (failedAction) {
      return failedAction.summary || failedAction.error || "I encountered an issue processing your request.";
    }
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    if (actionResults && actionResults.length > 0) {
      const summaries = actionResults.map(a => a.summary).join(' ');
      return `Done — ${summaries} Would you like to add anything else?`;
    }
    const lower = userText.toLowerCase();
    if (lower.includes('remind') || lower.includes('reminder')) {
      if (reminders.length > 0) {
        return `Here are your current active reminders:\n\n` + reminders.map(r => `• **${r.title}** scheduled for ${r.date} at ${r.time}`).join('\n');
      }
      return "You have no active reminders right now. What would you like me to remind you about?";
    }
    if (lower.includes('exam') || lower.includes('study')) {
      if (exams.length > 0) {
        return `Here are your tracked exams and study progress:\n\n` + exams.map(e => `• **${e.course}** on ${e.exam_date} (${e.progress}% ready)`).join('\n');
      }
      return "No study goals or exams recorded yet. You can add one in the Study Tracking panel!";
    }
    return `Hello! I am **Xena AI**. I can help you manage reminders, track study schedules, and plan your days. What would you like to do?`;
  }

  const ai = getGemini();

  const activeReminders = reminders.filter(r => r.active !== false).slice(0, 3);
  const activeExams = exams.slice(0, 3);
  const activeEvents = events.slice(0, 3);
  const activeMemories = memories.slice(0, 3);

  const contextParts: string[] = [
    `Current Date: ${new Date().toISOString().split('T')[0]}`
  ];

  if (actionResults && actionResults.length > 0) {
    const actionLogs = actionResults.map(r => r.summary).join('\n');
    contextParts.push(`[ACTION EXECUTION RESULTS FROM DATABASE]\n${actionLogs}`);
  }

  if (activeReminders.length > 0) {
    contextParts.push(`Active Reminders:\n${activeReminders.map(r => `- ${r.title} at ${r.date} ${r.time}`).join('\n')}`);
  }
  if (activeExams.length > 0) {
    contextParts.push(`Tracked Exams:\n${activeExams.map(e => `- ${e.course} on ${e.exam_date}`).join('\n')}`);
  }
  if (activeEvents.length > 0) {
    contextParts.push(`Upcoming Events:\n${activeEvents.map(ev => `- ${ev.title} on ${ev.date} at ${ev.time}`).join('\n')}`);
  }
  if (activeMemories.length > 0) {
    contextParts.push(`User Facts:\n${activeMemories.map(m => `- ${m.text}`).join('\n')}`);
  }
  if (history.length > 0) {
    contextParts.push(`Recent Messages:\n${history.map(h => `${h.sender === 'user' ? 'User' : 'Assistant'}: ${h.text}`).join('\n')}`);
  }

  const contextPrompt = `[USER CONTEXT]\n${contextParts.join('\n\n')}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: `${contextPrompt}\n\nUser Message: "${userText}"`,
      config: {
        maxOutputTokens: 500,
        systemInstruction: `You are Xena AI, an intelligent personal mobile management agent for students and general users.
Self-Introduction Rule: When introducing yourself, always state: "I am Xena AI." Never refer to yourself as NEXA AI.
REMINDER FLOW MANDATE:
If [ACTION EXECUTION RESULTS FROM DATABASE] show a NEW reminder creation:
- State a single concise confirmation:
  "Done — I've set a reminder to [title] [date] at [time], with notification and voice reminders enabled."
- Follow up immediately with ONE concise question asking about optional information:
  "Would you like to add a note, recurrence, priority, or anything else?"
If [ACTION EXECUTION RESULTS FROM DATABASE] show a reminder UPDATE:
- Confirm concisely: "Done — Updated your reminder "[title]"."
Keep your answers elegant, clean, concise, and helpful. Do not output empty messages.`
      }
    });

    const reply = response.text?.trim();
    if (reply && reply.length > 0) {
      return reply;
    }

    if (actionResults && actionResults.length > 0) {
      const remAction = actionResults.find((a: any) => a.targetModule === 'Reminder' && a.success);
      if (remAction && remAction.action === 'CREATE') {
        const data = remAction.data;
        return `Done — I've set a reminder to ${data.title} for ${data.date} at ${data.time}, with notification and voice reminders enabled.\n\nWould you like to add a note, recurrence, priority, or anything else?`;
      }
    }
    return "I am Xena AI. Your request has been processed successfully.";
  } catch (error) {
    console.error("Gemini Chat failed:", error);
    if (actionResults && actionResults.length > 0) {
      const remAction = actionResults.find((a: any) => a.targetModule === 'Reminder' && a.success);
      if (remAction && remAction.action === 'CREATE') {
        const data = remAction.data;
        return `Done — I've set a reminder to ${data.title} for ${data.date} at ${data.time}, with notification and voice reminders enabled.\n\nWould you like to add a note, recurrence, priority, or anything else?`;
      }
    }
    return `Hello! I am **Xena AI**. I've processed your request. How else can I assist you?`;
  }
}

export const chatWithXena = chatWithNexa;

/**
 * Streaming version of chatWithXena for immediate token streaming.
 */
export async function chatWithXenaStream(
  userId: string,
  conversationId: string,
  userText: string,
  onChunk: (chunk: string) => void,
  actionResults?: any[]
): Promise<string> {
  if (actionResults && actionResults.length > 0) {
    const text = await chatWithNexa(userId, conversationId, userText, actionResults);
    onChunk(text);
    return text;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    const fallback = await chatWithNexa(userId, conversationId, userText, actionResults);
    onChunk(fallback);
    return fallback;
  }

  const reminders = dbService.getReminders(userId);
  const exams = dbService.getExams(userId);
  const events = dbService.getEvents(userId);
  const memories = dbService.getMemories(userId);
  const history = dbService.getMessages(conversationId).slice(-6);

  const ai = getGemini();

  const activeReminders = reminders.filter(r => r.active !== false).slice(0, 3);
  const activeExams = exams.slice(0, 3);
  const activeEvents = events.slice(0, 3);
  const activeMemories = memories.slice(0, 3);

  const contextParts: string[] = [
    `Current Date: ${new Date().toISOString().split('T')[0]}`
  ];

  if (actionResults && actionResults.length > 0) {
    const actionLogs = actionResults.map(r => r.summary).join('\n');
    contextParts.push(`[ACTION EXECUTION RESULTS FROM DATABASE]\n${actionLogs}`);
  }

  if (activeReminders.length > 0) {
    contextParts.push(`Active Reminders: ${activeReminders.map(r => `${r.title} (${r.date} ${r.time})`).join('; ')}`);
  }
  if (activeExams.length > 0) {
    contextParts.push(`Tracked Exams: ${activeExams.map(e => `${e.course} (${e.exam_date})`).join('; ')}`);
  }
  if (activeEvents.length > 0) {
    contextParts.push(`Upcoming Events: ${activeEvents.map(ev => `${ev.title} (${ev.date} ${ev.time})`).join('; ')}`);
  }
  if (activeMemories.length > 0) {
    contextParts.push(`Memories: ${activeMemories.map(m => m.text).join('; ')}`);
  }
  if (history.length > 0) {
    contextParts.push(`Recent History: ${history.map(h => `${h.sender}: ${h.text}`).join(' | ')}`);
  }

  const contextPrompt = `[USER CONTEXT]\n${contextParts.join('\n')}`;

  try {
    const stream = await ai.models.generateContentStream({
      model: "gemini-3.6-flash",
      contents: `${contextPrompt}\n\nUser Message: "${userText}"`,
      config: {
        maxOutputTokens: 500,
        systemInstruction: `You are Xena AI, an intelligent personal mobile management agent.
Self-Introduction Rule: When introducing yourself, always state: "I am Xena AI."
REMINDER FLOW MANDATE:
If [ACTION EXECUTION RESULTS FROM DATABASE] show a NEW reminder creation:
- State a single concise confirmation:
  "Done — I've set a reminder to [title] [date] at [time], with notification and voice reminders enabled."
- Follow up immediately with ONE concise question asking about optional information:
  "Would you like to add a note, recurrence, priority, or anything else?"
If [ACTION EXECUTION RESULTS FROM DATABASE] show a reminder UPDATE:
- Confirm concisely: "Done — Updated your reminder "[title]"."
Keep your answers clean, concise, elegant, and helpful.`
      }
    });

    let fullText = '';
    for await (const chunk of stream) {
      const chunkText = chunk.text;
      if (chunkText) {
        fullText += chunkText;
        onChunk(chunkText);
      }
    }

    if (!fullText.trim()) {
      const fallback = await chatWithNexa(userId, conversationId, userText, actionResults);
      onChunk(fallback);
      return fallback;
    }

    return fullText;
  } catch (error) {
    console.error("Gemini Chat Stream failed:", error);
    const fallback = await chatWithNexa(userId, conversationId, userText, actionResults);
    onChunk(fallback);
    return fallback;
  }
}

/**
 * Generate AI suggested Planning timeline
 */
export async function generateAILinePlanning(userId: string, date: string, customPrompt?: string): Promise<{ timeline: any[], suggestions: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    return {
      timeline: [
        { id: '1', time: '08:00 - 10:00', title: 'Study Computer Architecture', duration: '2h', color: 'blue' },
        { id: '2', time: '10:30 - 12:30', title: 'Project Work', duration: '2h', color: 'purple' },
        { id: '3', time: '12:30 - 13:30', title: 'Lunch Break', duration: '1h', color: 'slate' },
        { id: '4', time: '14:00 - 16:00', title: 'Data Structures Revision', duration: '2h', color: 'teal' },
        { id: '5', time: '17:00 - 18:00', title: 'Cardio Workout / Gym', duration: '1h', color: 'green' },
        { id: '6', time: '20:00 - 21:30', title: 'Review Today\'s Notes', duration: '1.5h', color: 'orange' }
      ],
      suggestions: customPrompt 
        ? `Simulated schedule for: "${customPrompt}"`
        : "Showing optimized default schedule for study-heavy days."
    };
  }

  const ai = getGemini();
  const memories = dbService.getMemories(userId);
  const tasks = dbService.getTasks(userId).filter(t => t.date === date);

  const prompt = `Generate a daily planner timeline for ${date}.
${customPrompt ? `User's explicit schedule or title request: "${customPrompt}"` : ''}
Existing tasks specified by the user to preserve exactly: ${tasks.map(t => `${t.title} (${t.duration_hours}h at ${t.time})`).join(', ')}
User memories & habits: ${memories.map(m => m.text).join(', ')}`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: prompt,
      config: {
        systemInstruction: `Create an elegant, highly optimized daily planner timeline.
CRITICAL MANDATES:
1. TITLE PRESERVATION: You must strictly preserve any user-provided titles, schedules, or task names (e.g. "My Monday Schedule", specific task titles) exactly as written. Do not summarize, reword, translate, or replace them.
2. SMART GENERATION: Incorporate existing tasks and build directly on top of the user's existing plans. Do NOT invent a completely different layout or lose the user's input.
3. Output a structured array of 4-7 timeline blocks from 08:00 to 22:00.
4. Include a 'suggestions' field with at most 1-2 concise, high-value habit suggestions.`,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            timeline: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  time: { type: Type.STRING, description: "e.g., '09:00 - 11:00'" },
                  title: { type: Type.STRING, description: "Block title - MUST preserve user titles" },
                  duration: { type: Type.STRING, description: "e.g., '2h'" },
                  color: { type: Type.STRING, enum: ["blue", "purple", "slate", "teal", "green", "orange", "indigo"], description: "Color style" }
                },
                required: ["time", "title", "duration"]
              }
            },
            suggestions: { type: Type.STRING }
          },
          required: ["timeline", "suggestions"]
        },
        maxOutputTokens: 600
      }
    });

    const data = JSON.parse(response.text || "{}");
    return {
      timeline: data.timeline.map((item: any, index: number) => ({
        id: `gen-item-${index}-${Date.now()}`,
        ...item
      })),
      suggestions: data.suggestions || "Your personalized timeline is ready."
    };
  } catch (error) {
    console.error("AI Timeline generation failed:", error);
    return {
      timeline: [
        { id: 'fallback-1', time: '09:00 - 11:00', title: 'Study Session', duration: '2h', color: 'blue' }
      ],
      suggestions: "Showing standard outline."
    };
  }
}

/**
 * Reformulates a reminder's title and description into a natural-sounding spoken sentence.
 */
export async function reformulateReminder(title: string, description: string, userName?: string): Promise<string> {
  const cacheKey = `${title.trim()}|${(description || '').trim()}|${(userName || '').trim()}`;
  const cached = reformulateCache.get(cacheKey);
  if (cached) return cached;

  const apiKey = process.env.GEMINI_API_KEY;
  const nameSalutation = userName && userName.trim() ? `Hello ${userName.trim()}.` : "Hello.";
  const defaultText = `${nameSalutation} This is Xena AI. I'm reminding you that you have scheduled "${title}" now.${description ? ' ' + description : ''}`;

  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    let content = description ? description.trim() : title.trim();
    let reformulated = "";
    if (description && description.trim()) {
      const titleLower = title.toLowerCase().trim();
      const descLower = description.toLowerCase().trim();
      if (descLower.includes(titleLower)) {
        reformulated = description.trim();
      } else {
        reformulated = `it's time to focus on "${title.trim()}". ${description.trim()}`;
      }
    } else {
      reformulated = `it's time for your scheduled task: "${title.trim()}"`;
    }

    if (!/[.!?]$/.test(reformulated)) {
      reformulated += ".";
    }

    const result = `${nameSalutation} This is Xena AI. I'm reminding you that ${reformulated}`;
    reformulateCache.set(cacheKey, result, 600000);
    return result;
  }

  const ai = getGemini();
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: `Reminder Title: "${title}"\nReminder Description: "${description || 'No description provided'}"`,
      config: {
        maxOutputTokens: 150,
        systemInstruction: `You are Xena AI's voice synthesis helper.
Your job is to reformulate the reminder title and description into a single short, natural, friendly, and concise spoken sentence.
The user's greeting is handled separately. You only need to generate the "{reformulated reminder}" part, which will fit into this structure:
"Hello {UserName}. This is Xena AI. I'm reminding you that {your_output_goes_here}"

Rules:
1. Speak in the active voice as a helpful personal assistant.
2. Intelligently combine the title and description.
3. Keep it natural, friendly, and concise.
4. Do not read raw database field names, labels, brackets, or technical IDs.
5. Never start with "Description:" or "Title:" or "Reminder detected...".
6. End with a polite closing like "Good luck with your studies.", "Have a wonderful session.", or similar if appropriate, or keep it short.
7. Return ONLY the reformulated reminder text (e.g. "it's time to review Binary Trees for your CSC301 class before tomorrow's lecture. Good luck with your studies."). No conversational wrapper or quotes around the whole text.`
      }
    });
    const generated = (response.text || "").trim();
    if (generated) {
      let cleanGenerated = generated.replace(/^["']|["']$/g, '').trim();
      cleanGenerated = cleanGenerated.replace(/^I'm reminding you that\s+/i, '');
      const finalResult = `${nameSalutation} This is Xena AI. I'm reminding you that ${cleanGenerated}`;
      reformulateCache.set(cacheKey, finalResult, 600000);
      return finalResult;
    }
  } catch (err) {
    console.error("Gemini reformulation failed:", err);
  }
  return defaultText;
}

