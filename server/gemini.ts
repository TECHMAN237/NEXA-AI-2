import { GoogleGenAI, Type } from "@google/genai";
import { dbService } from "./db.js";
import { IntentClassification } from "../src/types.js";
import { extractTimeFromText, normalizeTimeString } from "../src/utils/timeUtils.js";
import { cleanReminderTitle, resolveRelativeDate, extractReminderParams } from "../src/utils/reminderParser.js";
import { normalizeUserInput, extractVaultContent } from "./contextualNormalizer.js";

// Helper to clean JSON response from markdown code fences or surrounding whitespace
function cleanJsonResponse(text: string): string {
  if (!text) return "{}";
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  }
  return cleaned;
}

const GEMINI_MODELS = ["gemini-3.5-flash", "gemini-2.0-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3-flash-preview"];

async function generateContentWithFallback(ai: GoogleGenAI, params: any) {
  let lastError: any = null;
  for (const model of GEMINI_MODELS) {
    try {
      return await ai.models.generateContent({
        ...params,
        model
      });
    } catch (err: any) {
      lastError = err;
      const isQuotaOr429 = err?.status === 429 || err?.message?.includes('429') || err?.message?.includes('RESOURCE_EXHAUSTED');
      const isUnavailableOrInternal = err?.status === 503 || err?.status === 500 || err?.status === 504 || err?.message?.includes('UNAVAILABLE') || err?.message?.includes('INTERNAL');
      const isBadRequestOrInvalid = err?.status === 400 || err?.message?.includes('400') || err?.message?.includes('INVALID_ARGUMENT');
      console.warn(`[GEMINI_MODEL_FALLBACK] Model ${model} failed (${err?.status || 'Error'}). Trying next fallback...`, err?.message || err);
      if (!isQuotaOr429 && !isUnavailableOrInternal && !isBadRequestOrInvalid && !err?.message?.includes('not found')) {
        throw err;
      }
    }
  }
  throw lastError;
}

async function generateContentStreamWithFallback(ai: GoogleGenAI, params: any) {
  let lastError: any = null;
  for (const model of GEMINI_MODELS) {
    try {
      return await ai.models.generateContentStream({
        ...params,
        model
      });
    } catch (err: any) {
      lastError = err;
      const isQuotaOr429 = err?.status === 429 || err?.message?.includes('429') || err?.message?.includes('RESOURCE_EXHAUSTED');
      const isUnavailableOrInternal = err?.status === 503 || err?.status === 500 || err?.status === 504 || err?.message?.includes('UNAVAILABLE') || err?.message?.includes('INTERNAL');
      const isBadRequestOrInvalid = err?.status === 400 || err?.message?.includes('400') || err?.message?.includes('INVALID_ARGUMENT');
      console.warn(`[GEMINI_STREAM_FALLBACK] Model ${model} failed. Trying next...`, err?.message || err);
      if (!isQuotaOr429 && !isUnavailableOrInternal && !isBadRequestOrInvalid && !err?.message?.includes('not found')) {
        throw err;
      }
    }
  }
  throw lastError;
}

function safeJsonParse<T>(text: string, fallback: T): T {
  if (!text) return fallback;
  const cleaned = cleanJsonResponse(text);
  try {
    return JSON.parse(cleaned) as T;
  } catch (e) {
    console.warn("[SAFE_JSON_PARSE_WARN] Failed to parse JSON, attempting repair...", e);
    try {
      let repaired = cleaned
        .replace(/,\s*([}\]])/g, '$1')
        .replace(/\\"/g, '"');
      if (!repaired.endsWith('}')) {
        repaired += '}';
      }
      return JSON.parse(repaired) as T;
    } catch (e2) {
      console.error("[SAFE_JSON_PARSE_ERROR] JSON parsing failed permanently:", e2);
      return fallback;
    }
  }
}

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

/**
 * High-Precision Speech-To-Text Transcription using Gemini Multimodal Audio Model
 */
export async function transcribeAudioWithGemini(
  audioBase64: string,
  mimeType: string = 'audio/webm',
  profileName?: string,
  userContextTerms?: string[]
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    console.warn("Gemini STT: API Key missing or placeholder. Skipping cloud STT.");
    return "";
  }

  const ai = getGemini();

  try {
    const cleanMime = mimeType.split(';')[0] || 'audio/webm';
    console.log(`[GEMINI_STT] Transcribing audio chunk. Mime: ${cleanMime}, Base64 length: ${audioBase64.length}`);

    const contextStr = userContextTerms && userContextTerms.length > 0
      ? `Known User Entities, Course Codes & Reminders: ${userContextTerms.filter(Boolean).join(', ')}`
      : 'Known Course Codes: CS-305';

    const generatePromise = generateContentWithFallback(ai, {
      contents: [
        {
          inlineData: {
            mimeType: cleanMime,
            data: audioBase64
          }
        },
        {
          text: "Transcribe the spoken audio into text with high precision and intelligent contextual refinement."
        }
      ],
      config: {
        maxOutputTokens: 250,
        temperature: 0.1,
        systemInstruction: `You are the dedicated, high-precision Speech-To-Text (STT) transcription and contextual refinement engine for Xena AI.

TASK:
Transcribe the audio recording accurately into text, applying intelligent contextual refinement and self-correction resolution.

CONTEXTUAL INFORMATION & APPLICATION VOCABULARY:
- User Profile Name: ${profileName || 'Zialy'}
- ${contextStr}
- Application Vocabulary Terms:
  * Xena (never Zena, Zina, Sena)
  * Vault (never Volts, Bolts, Faults, Valts)
  * Study Tracking (never Study Tracker)
  * My Items, Organizer, Reminder, Event, Planning

CRITICAL RULES:
1. Return ONLY the final transcribed and refined text. Do NOT add greetings, quotation marks, explanations, or commentary.
2. INTELLIGENT SELF-CORRECTION:
   - If the speaker corrects themselves mid-sentence (e.g. "CEE-305... I mean CS-305", "at 7 PM... actually 8 PM", "John... sorry, James", "Tomorrow... no, Saturday"), resolve the utterance to reflect the speaker's FINAL INTENDED MEANING.
   - Example input speech: "Create a reminder for CEE-305 I mean CS-305 tomorrow" -> output: "Create a reminder for CS-305 tomorrow."
   - Example input speech: "Remind me tomorrow at 7 PM actually 8 PM" -> output: "Remind me tomorrow at 8 PM."
   - Example input speech: "My Java exam is on Friday, sorry, Thursday" -> output: "My Java exam is on Thursday."
3. CONTEXTUAL DISAMBIGUATION:
   - If speech sounds phonetically like an ambiguous code or term (e.g. "CEE 305" vs "CS 305") and a known user course code exists (e.g. "CS-305"), resolve to the matching course code/entity.
   - If the user states "My name is [name]" or similar, and it sounds close to "${profileName || 'Zialy'}", transcribe as "${profileName || 'Zialy'}".
4. Correct natural speech hesitations ("um", "uh") while preserving all intended spoken content.
5. If there is no speech or only silence/background noise in the audio, return the exact text "[SILENCE]".`
      }
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Gemini STT timeout after 30000ms")), 30000);
    });

    const response = await Promise.race([generatePromise, timeoutPromise]);

    const resultText = (response.text || "").trim();
    console.log(`[GEMINI_STT] Result: "${resultText}"`);

    if (resultText === "[SILENCE]" || !resultText) {
      return "";
    }

    const normalized = normalizeUserInput(resultText);
    return normalized.finalTranscript;
  } catch (err) {
    console.error("[GEMINI_STT_ERROR]", err);
    return "";
  }
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

export function isConversationalText(text: string): boolean {
  if (!text) return false;
  const lower = text.trim().toLowerCase();

  // If query starts with or contains an explicit action verb:
  const isExplicitAction = /^(remind me to|create a|create me|add a|schedule|save to vault|vault |delete memory|delete event|delete task|update event|change event)/i.test(lower);
  if (isExplicitAction) {
    return false;
  }

  // Greetings
  const greetings = [
    'good morning', 'good afternoon', 'good evening', 'good night',
    'hello', 'hi', 'hey', 'greetings', 'bonjour', 'salut', 'hola', 'coucou',
    'hello xena', 'hi xena', 'hey xena', 'dear xena'
  ];
  if (greetings.includes(lower) || greetings.some(g => lower === g || lower.startsWith(g + ',') || lower.startsWith(g + '!'))) {
    return true;
  }

  // Inquiry about well-being
  if (
    lower.includes('how are you') ||
    lower.includes('how are you doing') ||
    lower.includes("how's it going") ||
    lower.includes('how do you do') ||
    lower.includes('how is everything') ||
    lower.includes("how's your day") ||
    lower.includes('how are you today')
  ) {
    return true;
  }

  // Gratitude / Casual acknowledgements
  if (
    lower === 'thanks' || lower === 'thank you' || lower === 'thanks a lot' ||
    lower === 'thank you xena' || lower === 'merci' || lower === 'cool' ||
    lower === 'awesome' || lower === 'great' || lower === 'nice' ||
    lower === 'ok' || lower === 'okay' || lower === 'got it'
  ) {
    return true;
  }

  // Questions about Xena / Identity / Capabilities / General Questions
  if (
    lower.includes('who are you') ||
    lower.includes('what is your name') ||
    lower.includes("what's your name") ||
    lower.includes('what can you do') ||
    lower.includes('what can you help') ||
    lower.includes('who made you') ||
    lower.includes('who created you') ||
    lower.includes('what is xena') ||
    lower.includes("what's xena") ||
    lower.includes('tell me about yourself') ||
    lower.includes('tell me a joke') ||
    lower.includes('tell me a story') ||
    lower.includes("what's my name") ||
    lower.includes('what is my name') ||
    lower.includes('difference between') ||
    lower.includes('how do reminders work') ||
    lower.includes('how do events work') ||
    lower.includes('can you create reminders') ||
    lower.includes('can you help me plan')
  ) {
    return true;
  }

  return false;
}

export function extractEventParams(text: string) {
  const todayStr = new Date().toISOString().split('T')[0];
  const hasExplicitDate = /\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|\d{1,2}\/\d{1,2}|\d{4}-\d{2}-\d{2})\b/i.test(text);
  const date = hasExplicitDate ? resolveRelativeDate(null, text) : todayStr;
  const explicitTime = extractTimeFromText(text);
  const time = explicitTime ? explicitTime : '12:00';

  let title = text;
  const isCalledMatch = text.match(/(?:called|named)\s+(.+)/i);
  if (isCalledMatch && isCalledMatch[1]) {
    title = isCalledMatch[1].replace(/[.]$/, '').trim();
  } else {
    title = title
      .replace(/^(I\s+(have|got)\s+(an\s+)?(event|meeting|appointment|gathering)\s+)/i, '')
      .replace(/\s+(on|this|next)?\s*(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today).*$/i, '')
      .replace(/\s+(at)\s+\d{1,2}(:\d{2})?\s*(am|pm)?.*$/i, '')
      .trim();
    if (title) {
      title = title.split(/\s+/).map(w => w.length > 0 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : '').join(' ');
    }
    if (!title) title = 'Saved Event';
  }
  return { title, date, time, description: text };
}

export function generateConversationalResponse(userText: string, profileName?: string): string {
  const lower = userText.trim().toLowerCase();
  const name = profileName || 'Zialy';

  // Well-being & Greetings combined (e.g., "Good morning, how are you doing?")
  if (lower.includes('good morning') && (lower.includes('how are you') || lower.includes('how are you doing'))) {
    return "Good morning! I'm doing great, thanks for asking. How can I help you today?";
  }
  if (lower.includes('good morning')) {
    return "Good morning! How are you doing today?";
  }
  if (lower.includes('good afternoon')) {
    return "Good afternoon! I'm doing well, thank you. How can I assist you today?";
  }
  if (lower.includes('good evening')) {
    return "Good evening! Everything is going great. How can I assist you tonight?";
  }
  if (lower.includes('good night')) {
    return "Good night! Have a peaceful rest.";
  }

  // Inquiry about well-being
  if (lower.includes('how are you') || lower.includes('how are you doing') || lower.includes("how's it going") || lower.includes('how do you do')) {
    return "I'm doing great, thanks for asking! How are you doing today?";
  }

  // Greetings
  if (lower.startsWith('hello') || lower.startsWith('hi') || lower.startsWith('hey') || lower.startsWith('greetings') || lower.startsWith('bonjour')) {
    return "Hello! I'm doing really well. How can I assist you today?";
  }

  // Gratitude
  if (lower.includes('thank') || lower.includes('merci') || lower === 'thanks') {
    return "You're very welcome! Let me know if you need anything else.";
  }

  // Capability & Assistance Questions
  if (lower.includes('what can you do') || lower.includes('what can you help') || lower.includes('can you create reminders') || lower.includes('can you help me plan')) {
    return "I can help you create reminders with voice alerts, schedule calendar events, organize daily plans, track exam study progress, and save notes to your Vault Memory. What would you like to do?";
  }

  // Identity
  if (lower.includes('who are you') || lower.includes('what is xena') || lower.includes("what's xena") || lower.includes('what is your name') || lower.includes("what's your name") || lower.includes('who made you') || lower.includes('who created you')) {
    return "I am Xena AI, your personal mobile management agent. I help organize your schedule, reminders, study tracking, and vault memories.";
  }

  // User Name
  if (lower.includes("what's my name") || lower.includes('what is my name')) {
    return `Your name is ${name}. How can I help you today?`;
  }

  // Jokes
  if (lower.includes('joke')) {
    return "Why don't programmers like nature? It has too many bugs!";
  }

  return "I'm doing well! How can I help you today?";
}

/**
 * Fast-path check for simple greetings to skip model roundtrip and minimize latency.
 */
function getFastPathIntent(text: string): IntentClassification | null {
  if (isConversationalText(text)) {
    return {
      intent: 'NORMAL_CHAT',
      intents: ['NORMAL_CHAT'],
      actions: [{ intent: 'NORMAL_CHAT', action: 'NO_OP', payload: {} }],
      explanation: 'Conversational request — routing directly to assistant conversation.'
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

  // 0. Conversational Explanatory Questions check (MUST NOT trigger actions)
  if (
    lower.includes('difference between') ||
    lower.includes('what is the difference') ||
    lower.includes("what's the difference") ||
    lower.includes('how do reminders work') ||
    lower.includes('how do events work') ||
    lower.includes('what can you do') ||
    lower.includes('who are you') ||
    (lower.startsWith('what is') && (lower.includes('reminder') || lower.includes('event') || lower.includes('plan'))) ||
    (lower.startsWith("what's") && (lower.includes('reminder') || lower.includes('event') || lower.includes('plan')))
  ) {
    return {
      intent: 'NORMAL_CHAT',
      intents: ['NORMAL_CHAT'],
      actions: [{ intent: 'NORMAL_CHAT', action: 'NO_OP', payload: {} }],
      explanation: 'Conversational question — routing to normal chat response.'
    };
  }

  // 1. Memory Vault & Saved Information check
  // 1a. Query / Read Memories
  const isMemoryQuery = (
    lower.includes('what did i ask you to remember') ||
    lower.includes('what did i ask to remember') ||
    lower.includes('what memories do i have') ||
    lower.includes('what information have i saved') ||
    lower.includes('what do you remember') ||
    lower.includes('what did i tell you to remember') ||
    lower.includes('show my memories') ||
    lower.includes('show my saved information') ||
    lower.includes('list my memories') ||
    lower.includes('what is stored in my memory') ||
    lower.includes('what have i saved') ||
    lower.includes('do you remember what i told you') ||
    lower.includes("what's the thing i asked you to keep") ||
    lower.includes('what did i ask you to keep')
  );

  if (isMemoryQuery) {
    return {
      intent: 'MEMORY_VAULT',
      intents: ['MEMORY_VAULT'],
      actions: [{
        intent: 'MEMORY_VAULT',
        action: 'READ',
        payload: { query: cleanText }
      }],
      extractedData: { query: cleanText },
      explanation: `Querying saved memories for "${cleanText}".`
    };
  }

  // 1b. Delete Memory
  const isMemoryDelete = (
    lower.startsWith('delete memory') ||
    lower.startsWith('delete the memory') ||
    lower.includes('delete memory about') ||
    lower.includes('delete the memory about') ||
    lower.includes('delete my memory about') ||
    lower.includes('forget about my') ||
    lower.includes('forget about the') ||
    lower.includes('remove the memory about') ||
    lower.includes('remove memory about') ||
    lower.includes('delete saved note') ||
    lower.includes('delete note about')
  );

  if (isMemoryDelete) {
    const targetTopic = cleanText
      .replace(/^(delete\s+(the\s+|my\s+)?memory\s+(about|on|for)?|forget\s+about\s+(my\s+|the\s+)?|remove\s+(the\s+|my\s+)?memory\s+(about|on|for)?)\s*/i, '')
      .trim();

    return {
      intent: 'MEMORY_VAULT',
      intents: ['MEMORY_VAULT'],
      actions: [{
        intent: 'MEMORY_VAULT',
        action: 'DELETE',
        payload: { title: targetTopic, content: targetTopic }
      }],
      extractedData: { title: targetTopic },
      explanation: `Deleting memory about "${targetTopic}".`
    };
  }

  // 1c. Explicit Vault Command (Create Memory)
  if (/^(vault|volt|volts|vaults|valts)\b/i.test(cleanText.trim())) {
    const extracted = extractVaultContent(cleanText);

    if (!extracted.content) {
      return {
        intent: 'MEMORY_VAULT',
        intents: ['MEMORY_VAULT'],
        actions: [{
          intent: 'MEMORY_VAULT',
          action: 'NO_OP',
          payload: { empty: true }
        }],
        extractedData: { empty: true },
        explanation: 'Empty Vault command received — requesting user clarification.'
      };
    }

    return {
      intent: 'MEMORY_VAULT',
      intents: ['MEMORY_VAULT'],
      actions: [{
        intent: 'MEMORY_VAULT',
        action: 'CREATE',
        payload: { title: extracted.title, content: extracted.content, category: 'Personal' }
      }],
      extractedData: { title: extracted.title, content: extracted.content, category: 'Personal' },
      explanation: `Saving Vault memory: "${extracted.content}".`
    };
  }

  // 2. Planning check
  const isPlanningQuery = (
    lower.includes('create my plan') ||
    lower.includes('create a plan') ||
    lower.includes('plan my day') ||
    lower.includes('plan for tomorrow') ||
    lower.includes('plan for today') ||
    lower.includes('organize my day') ||
    lower.includes('daily plan') ||
    lower.includes('organize my schedule') ||
    lower.includes('schedule my day') ||
    lower.includes('make a plan') ||
    lower.includes('generate a plan') ||
    lower.includes('generate my plan') ||
    lower.includes('help me plan') ||
    lower.includes('help me to plan') ||
    lower.includes('plan my activities') ||
    lower.includes('create a schedule') ||
    lower.includes('organize my revision') ||
    (lower.includes('plan') && (lower.includes('football') || lower.includes('dance') || lower.includes('study') || lower.includes('eat') || lower.includes('tasks') || lower.includes('activities') || lower.includes('day') || lower.includes('today') || lower.includes('tomorrow'))) ||
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

  // 3.8 Event UPDATE check (EXPLICIT UPDATE ONLY)
  const isEventUpdateQuery = (
    lower.startsWith('change ') ||
    lower.startsWith('update ') ||
    lower.startsWith('modify ') ||
    lower.startsWith('edit ') ||
    lower.startsWith('move ') ||
    lower.startsWith('reschedule ') ||
    lower.includes('change the time') ||
    lower.includes('change the date') ||
    lower.includes('change the location') ||
    lower.includes('reschedule the') ||
    lower.includes('move my') ||
    lower.includes('change my')
  );

  if (isEventUpdateQuery) {
    const explicitTime = extractTimeFromText(cleanText);
    const hasExplicitDate = /\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|\d{1,2}\/\d{1,2}|\d{4}-\d{2}-\d{2})\b/i.test(cleanText);
    const date = hasExplicitDate ? resolveRelativeDate(null, cleanText) : undefined;

    let location = undefined;
    const locMatch = cleanText.match(/\b(at|in|to)\s+([A-Z0-9][a-zA-Z0-9\s,]{2,30})/);
    if (locMatch && !/saturday|sunday|monday|tuesday|wednesday|thursday|friday|today|tomorrow|events|my events/i.test(locMatch[2])) {
      location = locMatch[2].trim();
    }

    let targetTitle = cleanText
      .replace(/^(change|update|modify|edit|move|reschedule)\s+(the|my)?\s*/i, '')
      .replace(/\s+(time|date|location)\s+(of|for)\s+/i, '')
      .replace(/\s+(to|at|on)\s+.*$/i, '')
      .trim();

    return {
      intent: 'EVENT',
      intents: ['EVENT'],
      actions: [{
        intent: 'EVENT',
        action: 'UPDATE',
        payload: {
          title: targetTitle,
          time: explicitTime || undefined,
          date: date || undefined,
          location: location || undefined
        }
      }],
      extractedData: { title: targetTitle, time: explicitTime, date, location },
      explanation: `Updating event "${targetTitle}".`
    };
  }

  // 4. Event check (CREATE)
  const eventKeywords = ['event', 'bootcamp', 'conference', 'workshop', 'webinar', 'seminar', 'meeting', 'appointment', 'church service', 'summit', 'gala', 'wedding', 'party', 'concert', 'festival', 'match', 'game'];
  const hasEventKeyword = eventKeywords.some(kw => lower.includes(kw));

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
    (lower.startsWith('add ') && (lower.includes('event') || lower.includes('meeting') || lower.includes('service') || lower.includes('conference') || lower.includes('workshop') || lower.includes('webinar') || lower.includes('bootcamp'))) ||
    (lower.includes('remind me') && (lower.includes('in my events') || lower.includes('to my events') || lower.includes('save it in my events') || lower.includes('as an event'))) ||
    (hasEventKeyword && (
      lower.includes('add ') ||
      lower.includes('schedule ') ||
      lower.includes('create ') ||
      lower.includes('save ') ||
      lower.includes('put in calendar') ||
      lower.includes('add to calendar')
    ))
  );

  if (isEventQuery) {
    const hasExplicitDate = /\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|\d{1,2}\/\d{1,2}|\d{4}-\d{2}-\d{2})\b/i.test(cleanText);
    const date = hasExplicitDate ? resolveRelativeDate(null, cleanText) : 'Not specified';

    const explicitTime = extractTimeFromText(cleanText);
    const time = explicitTime ? explicitTime : 'Not specified';

    let location = 'Not specified';
    const locMatch = cleanText.match(/\b(at|in)\s+([A-Z0-9][a-zA-Z0-9\s,]{2,30})/i);
    if (locMatch && !/\b(saturday|sunday|monday|tuesday|wednesday|thursday|friday|today|tomorrow|events|my events|am|pm)\b/i.test(locMatch[2]) && !/^\d+\s*(am|pm)?$/i.test(locMatch[2])) {
      location = locMatch[2].trim();
    }

    let title = cleanText;
    const isCalledMatch = cleanText.match(/(?:called|named)\s+(.+)/i);
    if (isCalledMatch && isCalledMatch[1]) {
      title = isCalledMatch[1].replace(/[.]$/, '').trim();
    } else {
      title = title
        .replace(/^(I\s+(would\s+like|want)\s+(you\s+)?to\s+)?(please\s+)?(remind\s+me\s+of\s+the|remind\s+me\s+about\s+the|remind\s+me\s+of|remind\s+me\s+about|remind\s+me\s+to|remind\s+me|save\s+my|save\s+the|save\s+it\s+in|save\s+in|save\s+to|save|add\s+my|add\s+the|add|schedule\s+my|schedule\s+the|schedule|create\s+my|create\s+the|create|i\s+have\s+an)\s+/i, '')
        .replace(/\s+(that\s+will\s+happen|which\s+is\s+happening|happening|taking\s+place).*$/i, '')
        .replace(/\s+(and\s+)?(save\s+it\s+(inside|in)|add\s+it\s+to|save\s+to)\s+(my\s+)?events.*$/i, '')
        .replace(/\s+(inside|in|to)\s+(my\s+)?events.*$/i, '')
        .replace(/\s+as\s+an?\s+event.*$/i, '')
        .replace(/\s+(on|this|next)?\s*(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today).*$/i, '')
        .replace(/\s+(on|at)\s+\d{1,2}(:\d{2})?\s*(am|pm)?.*$/i, '')
        .trim();
        
      if (title) {
        title = title.split(/\s+/).map(w => w.length > 0 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : '').join(' ');
      }
      if (!title) title = 'Scheduled Event';
    }

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
    lower.includes('study tracker') ||
    lower.includes('study tracking') ||
    lower.includes('study plan') ||
    lower.includes('revision schedule') ||
    lower.includes('prepare for my exam') ||
    lower.includes('prepare for exam') ||
    lower.includes('track my study') ||
    (lower.includes('exam') && (
      lower.includes('august') || lower.includes('september') || lower.includes('october') || 
      lower.includes('november') || lower.includes('december') || lower.includes('january') || 
      lower.includes('february') || lower.includes('march') || lower.includes('april') || 
      lower.includes('may') || lower.includes('june') || lower.includes('july') ||
      lower.includes('date') || lower.includes('change') || lower.includes('update') || 
      lower.includes('reschedule') || lower.includes('add') || lower.includes('create') ||
      lower.includes('csc301') || lower.includes('architecture') || lower.includes('algorithms') ||
      lower.includes('math') || lower.includes('weeks') || lower.includes('days')
    ))
  );

  if (isStudyQuery) {
    const isUpdate = (
      lower.startsWith('change ') ||
      lower.startsWith('update ') ||
      lower.startsWith('modify ') ||
      lower.startsWith('edit ') ||
      lower.startsWith('reschedule ') ||
      lower.includes('change my') ||
      lower.includes('update my') ||
      lower.includes('reschedule my') ||
      lower.includes('change the exam date') ||
      lower.includes('update the exam date')
    );

    // Course Extraction
    let course = '';
    if (lower.includes('csc301')) course = 'CSC301';
    else if (lower.includes('computer architecture')) course = 'Computer Architecture';
    else if (lower.includes('algorithms')) course = 'Algorithms';
    else if (lower.includes('mathematics') || lower.includes('math')) course = 'Mathematics';
    else if (lower.includes('physics')) course = 'Physics';
    else if (lower.includes('chemistry')) course = 'Chemistry';
    else {
      const courseMatch = cleanText.match(/(?:study\s+tracker\s+(?:for|on)?|study\s+plan\s+(?:for|on)?|exam\s+(?:for|on)?|tracker\s+for|my)\s+([A-Za-z0-9\s\-]+?)(?=\s+(?:exam|on|date|is|for|it's|difficult|easy|with|and|\d|$))/i);
      if (courseMatch && courseMatch[1].trim()) {
        course = courseMatch[1].trim();
      }
    }

    // Exam Date Extraction
    let examDate = '';
    const dateMatch = cleanText.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})\b/i);
    if (dateMatch) {
      const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
      const mIdx = monthNames.indexOf(dateMatch[1].toLowerCase());
      const dayNum = parseInt(dateMatch[2], 10);
      const year = new Date().getFullYear();
      const mStr = String(mIdx + 1).padStart(2, '0');
      const dStr = String(dayNum).padStart(2, '0');
      examDate = `${year}-${mStr}-${dStr}`;
    } else {
      examDate = resolveRelativeDate(null, cleanText);
    }

    // Check if missing required fields for creation
    if (!isUpdate && (!course || !examDate || cleanText.trim().toLowerCase() === 'create a study tracker' || cleanText.trim().toLowerCase() === 'add a study tracker')) {
      if (!course && !examDate) {
        return {
          intent: 'STUDY_TRACKING',
          intents: ['STUDY_TRACKING'],
          actions: [{
            intent: 'STUDY_TRACKING',
            action: 'NO_OP',
            payload: { missing_fields: ['course', 'exam_date'] }
          }],
          extractedData: {},
          explanation: 'Missing course subject and exam date for study tracker.'
        };
      }
    }

    // Difficulty
    let difficulty: 'low' | 'medium' | 'high' = 'medium';
    if (lower.includes('difficult') || lower.includes('hard') || lower.includes('high difficulty')) difficulty = 'high';
    else if (lower.includes('easy') || lower.includes('low difficulty')) difficulty = 'low';

    // Hours per day
    let hoursPerDay = 3;
    const hoursMatch = lower.match(/(\d{1,2})\s*(?:hours|hr|hrs|h)\s*(?:a\s*day|per\s*day|every\s*day)?/i);
    if (hoursMatch) {
      hoursPerDay = parseInt(hoursMatch[1], 10) || 3;
    }

    // Study Timings
    let prefTime = '20:00 - 23:00';
    const timeRangeMatch = lower.match(/(?:from\s+)?(\d{1,2}\s*(?:pm|am)?)\s+(?:to|till|-)\s+(\d{1,2}\s*(?:pm|am)?)/i);
    if (timeRangeMatch) {
      const parseHourStr = (str: string) => {
        const isPm = str.toLowerCase().includes('pm');
        let h = parseInt(str.replace(/[^0-9]/g, ''), 10);
        if (isPm && h < 12) h += 12;
        if (!isPm && str.toLowerCase().includes('am') && h === 12) h = 0;
        return String(h).padStart(2, '0') + ':00';
      };
      prefTime = `${parseHourStr(timeRangeMatch[1])} - ${parseHourStr(timeRangeMatch[2])}`;
    }

    // Available Days
    let availableDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    if (lower.includes('monday') || lower.includes('wednesday') || lower.includes('friday') || lower.includes('tuesday') || lower.includes('thursday') || lower.includes('saturday') || lower.includes('sunday')) {
      const extracted: string[] = [];
      if (lower.includes('monday') || lower.includes('mon')) extracted.push('Mon');
      if (lower.includes('tuesday') || lower.includes('tue')) extracted.push('Tue');
      if (lower.includes('wednesday') || lower.includes('wed')) extracted.push('Wed');
      if (lower.includes('thursday') || lower.includes('thu')) extracted.push('Thu');
      if (lower.includes('friday') || lower.includes('fri')) extracted.push('Fri');
      if (lower.includes('saturday') || lower.includes('sat')) extracted.push('Sat');
      if (lower.includes('sunday') || lower.includes('sun')) extracted.push('Sun');
      if (extracted.length > 0) availableDays = extracted;
    }

    return {
      intent: 'STUDY_TRACKING',
      intents: ['STUDY_TRACKING'],
      actions: [{
        intent: 'STUDY_TRACKING',
        action: isUpdate ? 'UPDATE' : 'CREATE',
        payload: {
          course: course || 'CSC301',
          exam_date: examDate || resolveRelativeDate(null, cleanText),
          difficulty,
          study_hours_per_day: hoursPerDay,
          preferred_study_time: prefTime,
          available_days: availableDays
        }
      }],
      extractedData: { course, date: examDate, difficulty, hoursPerDay, prefTime, availableDays },
      explanation: isUpdate 
        ? `Updating study tracker for ${course} to exam date ${examDate}.`
        : `Activating study tracking for ${course} exam on ${examDate}.`
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
    if (
      lower.includes('can you do that') ||
      lower.includes('can you create') ||
      lower.includes('can you set') ||
      lower.includes('is that possible') ||
      lower.includes('how do you') ||
      lower.includes('what can you do')
    ) {
      return {
        intent: 'NORMAL_CHAT',
        intents: ['NORMAL_CHAT'],
        actions: [{ intent: 'NORMAL_CHAT', action: 'NO_OP', payload: {} }],
        explanation: 'Capability question regarding reminders — routing to chat response.'
      };
    }

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
export async function routeUserIntent(text: string, recentMessages: any[] = []): Promise<IntentClassification> {
  const cleanText = text.trim();
  const cacheKey = cleanText.toLowerCase();

  // 1. Fast path for trivial greetings
  const fastPath = getFastPathIntent(cleanText);
  if (fastPath) return fastPath;

  // 2. Deterministic Rule-Based Pre-check for explicit commands (Reminders, Memory Vault, etc.)
  if (cleanText.toLowerCase().includes('just told you') || cleanText.toLowerCase().includes('save that') || cleanText.toLowerCase().includes('save this event') || cleanText.toLowerCase().includes('save it')) {
    // Bypass rule-based for contextual commands
  } else {
    const ruleMatch = parseRuleBasedIntent(cleanText);
    if (ruleMatch) {
      console.log('[INTENT_RULE_MATCH]', ruleMatch);
      intentCache.set(cacheKey, ruleMatch, 60000);
      return ruleMatch;
    }
  }

  // 3. Check cache for repeated query
  const cached = intentCache.get(cacheKey);
  if (cached) return cached;

  const apiKey = process.env.GEMINI_API_KEY;
  const todayStr = new Date().toISOString().split('T')[0];

  const defaultFallbackResult: IntentClassification = {
    intent: 'NORMAL_CHAT',
    intents: ['NORMAL_CHAT'],
    actions: [{ intent: 'NORMAL_CHAT', action: 'NO_OP', payload: {} }],
    explanation: 'Defaulting to general assistant chat in local mode.'
  };

  // Local Contextual Save Fallback
  if (cleanText.toLowerCase().includes('just told you') || cleanText.toLowerCase().includes('save that') || cleanText.toLowerCase().includes('save this event') || cleanText.toLowerCase().includes('save it')) {
    const lastUserMsg = recentMessages.slice().reverse().find(m => m.sender === 'user' && m.text !== text);
    if (lastUserMsg) {
       const eventParams = extractEventParams(lastUserMsg.text);
       return {
         intent: 'EVENT',
         intents: ['EVENT'],
         actions: [{
           intent: 'EVENT',
           action: 'CREATE',
           payload: eventParams
         }],
         extractedData: eventParams,
         explanation: `Saving event "${eventParams.title}" from previous message.`
       };
    }
  }

  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    return defaultFallbackResult;
  }

  const ai = getGemini();

  let contextStr = "";
  if (recentMessages && recentMessages.length > 0) {
    contextStr = "\n\nRecent Conversation Context:\n" + recentMessages.map(m => `${m.sender.toUpperCase()}: ${m.text}`).join("\n");
  }

  try {
    const response = await generateContentWithFallback(ai, {
      contents: `Classify user request, detect single or multi-intents, and extract structured actions: "${cleanText}"${contextStr}`,
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
   - CREATE_REMINDER (intent: "REMINDER", action: "CREATE"): User asks to create a NEW personal reminder notification or task (e.g. "Remind me to call John at 8pm").
   - CREATE_EVENT (intent: "EVENT", action: "CREATE"): User asks to add or schedule a NEW calendar event, meeting, appointment, ceremony, etc. (e.g. "Add church service Sunday at 9am"). If the user explicitly mentions an "event" (e.g. "I have an event..."), it MUST be an EVENT, not a REMINDER.
   - VIEW_UPCOMING_EVENTS (intent: "VIEW_UPCOMING_EVENTS", action: "READ"): User asks to check, retrieve, or list existing events on their calendar (e.g. "What events do I have coming up?", "Remind me what events I have coming up"). The word "remind" in "Remind me what events I have coming up" means RETRIEVING existing events — DO NOT create a reminder or event!
2. VOICE CLEANING: Clean speech hesitations ("um", "uh", "you know", "like", "err") and correct obvious speech typos.
3. MULTI-INTENT DETECTION: A single message may contain multiple independent intentions!
   Example: "My exam is on August 20. Create a study plan. Remind me three days before."
   Detects: EVENT/STUDY_TRACKING, PLANNING, and REMINDER! Return ALL detected intents in "intents" array and generate corresponding "actions".
4. DATES & TIMES: "tomorrow" = today + 1 day (${todayStr}). Always format time as 24-hour HH:MM.
5. AMBIGUITY & INCOMPLETE REQUESTS: If a reminder or event request is missing vital detail (like missing title for "remind me tomorrow" or "I want you to create me a reminder"), set intent to "AMBIGUOUS", provide missingFields and a clear clarificationPrompt.
6. REMINDER TITLE EXTRACTION: For REMINDER intent, 'title' MUST contain ONLY the concise, actionable task (e.g. 'Study CSC305', 'Call John', 'Submit project'). NEVER use the entire conversational sentence. Strip greetings ('Hello Xena', 'hope you are fine'), politeness ('please'), command language ('create me a reminder to', 'remind me to'), and date/time expressions ('at 3 PM', 'tomorrow') from the title.
7. NEVER INVENT INFORMATION: Do NOT invent missing fields (e.g. do not invent 09:00, or a default title like "Reminder", or a location). Only extract what the user explicitly said.
8. CONTEXTUAL COMMANDS: If the user says "Save the event I just told you" or "Save that", set intent="EVENT", action="CREATE". Do not invent the title; it will be resolved from the conversation context.`,
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

    const classification = safeJsonParse<IntentClassification>(response.text || "{}", defaultFallbackResult);
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
    const response = await generateContentWithFallback(ai, {
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
            category: { type: Type.STRING, enum: ["Preference", "Schedule", "Milestone", "Setting", "General"], description: "Category of memory." }
          },
          required: ["fact", "category"]
        }
      }
    });

    const data = safeJsonParse<{ fact?: string; category?: string }>(response.text || "{}", {});
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
/**
 * Helper to generate structured fallback Markdown responses when Gemini API is unavailable or offline.
 */
function generateLocalFormattedResponse(
  userText: string,
  actionResults?: any[],
  reminders: any[] = [],
  exams: any[] = [],
  events: any[] = [],
  memories: any[] = []
): string {
  const lower = userText.toLowerCase();

  if (actionResults && actionResults.length > 0) {
    const successful = actionResults.filter(a => a.success);
    const failed = actionResults.filter(a => !a.success);

    let output = '';

    if (successful.length > 0) {
      for (const res of successful) {
        if (res.data?.pending) {
          output += `${res.summary}\n\n`;
        } else if (res.data?.followUpText) {
          output += `${res.data.followUpText}\n\n`;
        } else if (res.targetModule === 'Reminder') {
          const d = res.data || {};
          output += `**Reminder Created**\n\n`;
          output += `- **Task**: ${d.title || 'Reminder'}\n`;
          output += `- **Date**: ${d.date || 'Today'}\n`;
          output += `- **Time**: ${d.time || '09:00'}\n`;
          output += `- **Notifications**: Voice & Push Enabled\n\n`;
        } else if (res.targetModule === 'Event') {
          const d = res.data || {};
          output += `**Event Scheduled**\n\n`;
          output += `- **Event**: ${d.title || 'Event'}\n`;
          output += `- **When**: ${d.date || 'Today'} at ${d.time || '09:00'}\n`;
          if (d.location && d.location !== 'Not specified') {
            output += `- **Location**: ${d.location}\n`;
          }
          output += `\n`;
        } else if (res.targetModule === 'StudyTracking') {
          const d = res.data || {};
          output += `**Study Tracking Updated**\n\n`;
          if (d.course || d.study_tracking) {
            output += `${res.summary}\n\n`;
          } else {
            output += `${res.summary}\n\n`;
          }
        } else if (res.targetModule === 'MemoryVault') {
          output += `**Saved to Vault Memory**\n\n`;
          output += `Recorded: "${res.data?.content || res.summary.replace(/^✓\s*/, '')}"\n\n`;
        } else if (res.targetModule === 'Planning') {
          output += `**Daily Schedule Planned**\n\n`;
          output += `${res.summary}\n\n`;
        } else {
          output += `${res.summary}\n\n`;
        }
      }
    }

    if (failed.length > 0) {
      for (const res of failed) {
        output += `⚠️ **Action Failed**\n\n${res.error || res.summary || 'I couldn\'t save that. Please try again.'}\n\n`;
      }
    }

    return output.trim();
  }

  // Educational or comparative queries
  if (lower.includes('difference between planning and reminder') || lower.includes('planning vs reminder') || lower.includes('difference between reminder and planning')) {
    return `## Planning vs. Reminder

### 📅 Planning
- **Purpose**: Micro-scheduling daily timelines and focus blocks.
- **Format**: Time-blocked task sequences (e.g., 09:00 AM - 10:30 AM Study Session).
- **Best for**: Structuring your day, managing study goals, and balancing workload.

### 🔔 Reminder
- **Purpose**: Time-sensitive alerts for specific actions.
- **Format**: Precise date and time notifications with optional voice alerts.
- **Best for**: Immediate prompts (e.g., "Submit Java assignment on Monday at 9:00 AM").`;
  }

  // Study plan query
  if (lower.includes('study plan') || lower.includes('study tracking') || lower.includes('my study')) {
    if (exams.length > 0) {
      let text = `## Your Study Plan & Tracking\n\n`;
      text += `| Course | Exam Date | Progress | Daily Target |\n`;
      text += `|:---|:---|:---:|:---:|\n`;
      exams.forEach(e => {
        text += `| **${e.course}** | ${e.exam_date} | ${e.progress}% | ${e.study_hours_per_day || 2} hrs/day |\n`;
      });
      text += `\n### 💡 Next Actions\n- Focus on subjects with readiness under 50% first.\n- Use **Planning** to schedule dedicated study slots.`;
      return text;
    }
    return `## Study Tracking\n\nYou haven't recorded any study goals yet. Try saying: *"Add Java exam on August 20"* or *"Track Mathematics at 30%"*.`;
  }

  // Events query
  if (lower.includes('upcoming events') || lower.includes('my events') || lower.includes('schedule')) {
    if (events.length > 0) {
      let text = `## Upcoming Events\n\n`;
      events.forEach(ev => {
        text += `- **${ev.title}**: ${ev.date} at ${ev.time}${ev.location ? ` (${ev.location})` : ''}\n`;
      });
      return text;
    }
    return `## Upcoming Events\n\nNo upcoming events scheduled. You can say: *"Add event Team Sync on Friday at 3 PM"* to record one.`;
  }

  // Reminders query
  if (lower.includes('reminders') || lower.includes('active reminders')) {
    if (reminders.length > 0) {
      let text = `## Active Reminders\n\n`;
      reminders.forEach(r => {
        text += `- **${r.title}**: ${r.date} at ${r.time}\n`;
      });
      return text;
    }
    return `## Active Reminders\n\nYou have no active reminders right now. What would you like me to remind you about?`;
  }

  // Vault memory query
  if (lower.includes('vault') || lower.includes('saved memory') || lower.includes('what did i save')) {
    if (memories.length > 0) {
      let text = `## Saved Vault Memories\n\n`;
      memories.forEach(m => {
        text += `- **${m.text}**\n`;
      });
      return text;
    }
    return `## Vault Memory\n\nNo saved items in your Vault Memory yet. Prefix any message with **Vault** (e.g., *"Vault I prefer studying at night"*) to record facts.`;
  }

  if (isConversationalText(userText)) {
    return generateConversationalResponse(userText);
  }

  return `Hello! I am **Xena AI**, your personal mobile management agent. How can I assist you with your schedule, reminders, study goals, or saved vault items today?`;
}

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
  const history = dbService.getMessages(conversationId).slice(-6);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    return generateLocalFormattedResponse(userText, actionResults, reminders, exams, events, memories);
  }

  const ai = getGemini();

  const activeReminders = reminders.filter(r => r.active !== false).slice(0, 5);
  const activeExams = exams.slice(0, 5);
  const activeEvents = events.slice(0, 5);
  const activeMemories = memories.slice(0, 5);

  const contextParts: string[] = [
    `Current Date: ${new Date().toISOString().split('T')[0]}`
  ];

  if (actionResults && actionResults.length > 0) {
    const actionLogs = actionResults.map(r => `[Module: ${r.targetModule} | Action: ${r.action} | Success: ${r.success}] ${r.summary}`).join('\n');
    contextParts.push(`[ACTION EXECUTION RESULTS FROM DATABASE]\n${actionLogs}`);
  }

  if (activeReminders.length > 0) {
    contextParts.push(`Active Reminders:\n${activeReminders.map(r => `- ${r.title} (${r.date} ${r.time})`).join('\n')}`);
  }
  if (activeExams.length > 0) {
    contextParts.push(`Tracked Exams:\n${activeExams.map(e => `- ${e.course}: Date ${e.exam_date}, Readiness ${e.progress}%`).join('\n')}`);
  }
  if (activeEvents.length > 0) {
    contextParts.push(`Upcoming Events:\n${activeEvents.map(ev => `- ${ev.title} (${ev.date} ${ev.time})`).join('\n')}`);
  }
  if (activeMemories.length > 0) {
    contextParts.push(`Vault Memories:\n${activeMemories.map(m => `- ${m.text}`).join('\n')}`);
  }
  if (history.length > 0) {
    contextParts.push(`Recent Conversation History:\n${history.map(h => `${h.sender === 'user' ? 'User' : 'Xena'}: ${h.text}`).join('\n')}`);
  }

  const contextPrompt = `[USER CONTEXT & DATABASE STATE]\n${contextParts.join('\n\n')}\n\n[CURRENT USER MESSAGE]\n"${userText}"`;

  try {
    const response = await generateContentWithFallback(ai, {
      contents: contextPrompt,
      config: {
        maxOutputTokens: 600,
        systemInstruction: `You are Xena AI, a modern AI assistant for students and mobile users.

CORE RULES:
1. FOCUS ON THE CURRENT USER MESSAGE: Address ONLY what the user is asking right now in [CURRENT USER MESSAGE]. Do not repeat or linger on past conversation questions.
2. NO INTRODUCTORY FLUFF: Never start responses with generic intro phrases like "Sure!", "Of course!", "Certainly!", "I'd be happy to help!". Start directly with clear content or Markdown headings.
3. VISUAL HIERARCHY & MARKDOWN:
   - Use Markdown headings (## or ###) for multi-part responses.
   - Use bold text (**key terms**) for key concepts, dates, numbers, or actions.
   - Use bullet points (- ) or numbered lists (1. ) for steps.
   - Use Markdown tables (| Col 1 | Col 2 |) when presenting structured comparisons or plans.
4. ACCURATE ACTION CONFIRMATIONS:
   - If database actions were executed in [ACTION EXECUTION RESULTS FROM DATABASE], summarize what was accomplished cleanly using formatted Markdown (e.g. **Reminder Created**, **Saved to Vault Memory**, **Study Tracking Updated**).
   - If an action failed, explain what failed honestly and politely — NEVER claim a failed action succeeded.
5. SELF-IDENTIFICATION: Always state "I am Xena AI" when asked your identity.`
      }
    });

    const reply = response.text?.trim();
    if (reply && reply.length > 0) {
      return reply;
    }

    return generateLocalFormattedResponse(userText, actionResults, reminders, exams, events, memories);
  } catch (error) {
    console.error("Gemini Chat failed, using fallback:", error);
    return generateLocalFormattedResponse(userText, actionResults, reminders, exams, events, memories);
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
  const apiKey = process.env.GEMINI_API_KEY;
  const reminders = dbService.getReminders(userId);
  const exams = dbService.getExams(userId);
  const events = dbService.getEvents(userId);
  const memories = dbService.getMemories(userId);

  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    const text = generateLocalFormattedResponse(userText, actionResults, reminders, exams, events, memories);
    // Stream local text in small clean chunks for smooth UX
    const words = text.split(' ');
    let current = '';
    for (let i = 0; i < words.length; i++) {
      const chunk = (i === 0 ? '' : ' ') + words[i];
      current += chunk;
      onChunk(chunk);
    }
    return text;
  }

  const history = dbService.getMessages(conversationId).slice(-6);
  const ai = getGemini();

  const activeReminders = reminders.filter(r => r.active !== false).slice(0, 5);
  const activeExams = exams.slice(0, 5);
  const activeEvents = events.slice(0, 5);
  const activeMemories = memories.slice(0, 5);

  const contextParts: string[] = [
    `Current Date: ${new Date().toISOString().split('T')[0]}`
  ];

  if (actionResults && actionResults.length > 0) {
    const actionLogs = actionResults.map(r => `[Module: ${r.targetModule} | Action: ${r.action} | Success: ${r.success}] ${r.summary}`).join('\n');
    contextParts.push(`[ACTION EXECUTION RESULTS FROM DATABASE]\n${actionLogs}`);
  }

  if (activeReminders.length > 0) {
    contextParts.push(`Active Reminders:\n${activeReminders.map(r => `- ${r.title} (${r.date} ${r.time})`).join('\n')}`);
  }
  if (activeExams.length > 0) {
    contextParts.push(`Tracked Exams:\n${activeExams.map(e => `- ${e.course}: Date ${e.exam_date}, Readiness ${e.progress}%`).join('\n')}`);
  }
  if (activeEvents.length > 0) {
    contextParts.push(`Upcoming Events:\n${activeEvents.map(ev => `- ${ev.title} (${ev.date} ${ev.time})`).join('\n')}`);
  }
  if (activeMemories.length > 0) {
    contextParts.push(`Vault Memories:\n${activeMemories.map(m => `- ${m.text}`).join('\n')}`);
  }
  if (history.length > 0) {
    contextParts.push(`Recent History:\n${history.map(h => `${h.sender === 'user' ? 'User' : 'Xena'}: ${h.text}`).join('\n')}`);
  }

  const contextPrompt = `[USER CONTEXT & DATABASE STATE]\n${contextParts.join('\n\n')}\n\n[CURRENT USER MESSAGE]\n"${userText}"`;

  try {
    const stream = await generateContentStreamWithFallback(ai, {
      contents: contextPrompt,
      config: {
        maxOutputTokens: 600,
        systemInstruction: `You are Xena AI, a modern AI assistant for students and mobile users.

CORE RULES:
1. FOCUS ON THE CURRENT USER MESSAGE: Address ONLY what the user is asking right now in [CURRENT USER MESSAGE].
2. NO INTRODUCTORY FLUFF: Never start responses with "Sure!", "Of course!", "Certainly!". Begin directly with the answer or Markdown heading.
3. VISUAL HIERARCHY & MARKDOWN:
   - Use Markdown headings (## or ###) for sections.
   - Use bold text (**key terms**) for emphasis.
   - Use bullet points (- ) or numbered lists for steps.
   - Use Markdown tables (| Col 1 | Col 2 |) when comparing options or summarizing structured data.
4. ACCURATE ACTION CONFIRMATIONS:
   - If database actions were executed, confirm what was saved/updated clearly (e.g. **Reminder Created**, **Saved to Vault Memory**, **Study Tracking Updated**).
   - If an action failed, state the failure accurately — NEVER claim success on a failed action.
5. SELF-IDENTIFICATION: Always state "I am Xena AI" when asked identity.`
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
      const fallback = generateLocalFormattedResponse(userText, actionResults, reminders, exams, events, memories);
      onChunk(fallback);
      return fallback;
    }

    return fullText;
  } catch (error) {
    console.error("Gemini Chat Stream failed, using fallback:", error);
    const fallback = generateLocalFormattedResponse(userText, actionResults, reminders, exams, events, memories);
    onChunk(fallback);
    return fallback;
  }
}

/**
 * Fast, Voice-Optimized Response Generator for Live Conversational Mode (1-3 sentences max)
 */
export function generateLocalVoiceResponse(
  userText: string,
  actionResults?: any[],
  reminders: any[] = [],
  exams: any[] = [],
  events: any[] = [],
  memories: any[] = [],
  tasks: any[] = []
): string {
  const lower = userText.toLowerCase();

  // 1. Action Results Summaries
  if (actionResults && actionResults.length > 0) {
    const successful = actionResults.filter(a => a.success);
    if (successful.length > 0) {
      const parts: string[] = [];
      for (const res of successful) {
        if (res.data?.followUpText) {
          parts.push(res.data.followUpText);
        } else if (res.targetModule === 'Reminder') {
          const d = res.data || {};
          parts.push(`I've set a reminder for "${d.title || 'your task'}" on ${d.date || 'today'} at ${d.time || '09:00'}.`);
        } else if (res.targetModule === 'Event') {
          const d = res.data || {};
          parts.push(`I've scheduled the event "${d.title || 'Event'}" for ${d.date || 'today'} at ${d.time || '09:00'}${d.location && d.location !== 'Not specified' ? ` at ${d.location}` : ''}.`);
        } else if (res.targetModule === 'StudyTracking') {
          const d = res.data || {};
          parts.push(`I've updated your study tracking for ${d.course || 'your course'}.`);
        } else if (res.targetModule === 'MemoryVault') {
          parts.push(`I've saved "${res.data?.content || 'your note'}" to your Vault Memory.`);
        } else if (res.targetModule === 'Planning') {
          parts.push(`I've organized your daily schedule.`);
        } else {
          parts.push(res.summary.replace(/^✓\s*/, ''));
        }
      }
      return parts.join(' ');
    }
  }

  // 2. Direct Query Answers
  // Tasks query
  if (lower.includes('tasks today') || lower.includes('my tasks') || lower.includes('tasks')) {
    const todayStr = new Date().toISOString().split('T')[0];
    const todayTasks = tasks.filter(t => t.date === todayStr || !t.date || t.date === 'Not specified');
    if (todayTasks.length > 0) {
      const taskList = todayTasks.slice(0, 3).map(t => `${t.title}${t.time ? ` at ${t.time}` : ''}`).join(', ');
      return `You have ${todayTasks.length} task${todayTasks.length > 1 ? 's' : ''} scheduled for today: ${taskList}.`;
    }
    return "You don't have any tasks scheduled for today.";
  }

  // Next Event query
  if (lower.includes('next event') || lower.includes('upcoming event') || lower.includes('my events')) {
    if (events.length > 0) {
      const first = events[0];
      return `Your next event is "${first.title}" on ${first.date} at ${first.time}${first.location && first.location !== 'Not specified' ? ` at ${first.location}` : ''}.`;
    }
    return "You don't have any upcoming events scheduled.";
  }

  // Study Plan query
  if (lower.includes('study plan') || lower.includes('study tracking') || lower.includes('my study')) {
    if (exams.length > 0) {
      const examSummary = exams.map(e => `${e.course} exam on ${e.exam_date} with ${e.progress}% readiness`).join('; ');
      return `Here is your study tracking summary: ${examSummary}.`;
    }
    return "You haven't set up any study trackers yet. You can tell me to add an exam date anytime.";
  }

  // Active Reminders query
  if (lower.includes('reminders') || lower.includes('active reminders')) {
    const active = reminders.filter(r => r.active !== false);
    if (active.length > 0) {
      const remList = active.slice(0, 3).map(r => `${r.title} at ${r.time}`).join(', ');
      return `You have ${active.length} active reminder${active.length > 1 ? 's' : ''}: ${remList}.`;
    }
    return "You have no active reminders right now.";
  }

  // Vault memory query
  if (lower.includes('vault') || lower.includes('saved memory') || lower.includes('what did i save')) {
    if (memories.length > 0) {
      const memList = memories.slice(0, 3).map(m => m.text).join('; ');
      return `Here are your recent Vault memories: ${memList}.`;
    }
    return "No saved items in your Vault Memory yet.";
  }

  if (isConversationalText(userText)) {
    return generateConversationalResponse(userText);
  }

  return "I'm doing well! How can I help you today?";
}

/**
 * Fast AI Voice Response Generator for Live Mode with 2s Hard Timeout
 */
export async function chatWithXenaLive(
  userId: string,
  conversationId: string,
  userText: string,
  actionResults?: any[]
): Promise<string> {
  const reminders = dbService.getReminders(userId);
  const exams = dbService.getExams(userId);
  const events = dbService.getEvents(userId);
  const memories = dbService.getMemories(userId);
  const tasks = dbService.getTasks(userId);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    return generateLocalVoiceResponse(userText, actionResults, reminders, exams, events, memories, tasks);
  }

  // Fast path if local action results can be directly verbalized
  if (actionResults && actionResults.length > 0 && actionResults.every(a => a.success)) {
    const localRes = generateLocalVoiceResponse(userText, actionResults, reminders, exams, events, memories, tasks);
    if (localRes && !localRes.startsWith("I am Xena AI")) {
      return localRes;
    }
  }

  const history = dbService.getMessages(conversationId).slice(-3); // Keep context lightweight (last 3 messages)
  const ai = getGemini();

  const activeReminders = reminders.filter(r => r.active !== false).slice(0, 3);
  const activeExams = exams.slice(0, 3);
  const activeEvents = events.slice(0, 3);

  const contextParts: string[] = [
    `Current Date: ${new Date().toISOString().split('T')[0]}`
  ];

  if (actionResults && actionResults.length > 0) {
    const actionLogs = actionResults.map(r => `[Module: ${r.targetModule} | Action: ${r.action} | Success: ${r.success}] ${r.summary}`).join('\n');
    contextParts.push(`[ACTION RESULTS]\n${actionLogs}`);
  }

  if (activeReminders.length > 0) {
    contextParts.push(`Active Reminders: ${activeReminders.map(r => `${r.title} (${r.date} ${r.time})`).join(', ')}`);
  }
  if (activeExams.length > 0) {
    contextParts.push(`Exams: ${activeExams.map(e => `${e.course} on ${e.exam_date}`).join(', ')}`);
  }
  if (activeEvents.length > 0) {
    contextParts.push(`Events: ${activeEvents.map(ev => `${ev.title} on ${ev.date} at ${ev.time}`).join(', ')}`);
  }
  if (history.length > 0) {
    contextParts.push(`Recent Context: ${history.map(h => `${h.sender}: ${h.text}`).join(' | ')}`);
  }

  const prompt = `[CONTEXT]\n${contextParts.join('\n')}\n\n[USER]\n"${userText}"`;

  try {
    const generatePromise = generateContentWithFallback(ai, {
      contents: prompt,
      config: {
        maxOutputTokens: 120,
        temperature: 0.2,
        systemInstruction: `You are Xena AI speaking live over voice in conversational mode.
Provide a CONCISE, NATURAL, SPOKEN-FRIENDLY response (1 to 3 short sentences maximum).
DO NOT use markdown headings, tables, or lists. Speak directly, clearly, and politely so it sounds natural when spoken aloud.`
      }
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Fast AI Live response timeout after 2000ms")), 2000);
    });

    const response = await Promise.race([generatePromise, timeoutPromise]);
    const reply = response.text?.trim();

    if (reply && reply.length > 0) {
      // Strip markdown code fences or asterisks if any
      const cleanReply = reply.replace(/#+\s+/g, '').replace(/\*+/g, '').trim();
      return cleanReply;
    }

    return generateLocalVoiceResponse(userText, actionResults, reminders, exams, events, memories, tasks);
  } catch (err) {
    console.warn("[LIVE_VOICE_AI_FAST_FALLBACK]", err);
    return generateLocalVoiceResponse(userText, actionResults, reminders, exams, events, memories, tasks);
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
    const response = await generateContentWithFallback(ai, {
      contents: prompt,
      config: {
        systemInstruction: `Create an elegant, highly optimized daily planner timeline.
CRITICAL MANDATES:
1. DISTINGUISH TASKS FROM INSTRUCTIONS: Meta-instructions to Xena (e.g., "Generate my plan", "Plan my day", "Organize these tasks", "Create my plan", "For that") MUST NEVER appear as tasks or blocks in the generated plan.
2. USE ONLY USER'S ACTUAL TASKS: Build the timeline exclusively around the specific tasks requested by the user. Do NOT invent unrelated activities (e.g., Exercise, Meditation, Morning walk, Reading) unless explicitly asked by the user.
3. TITLE PRESERVATION: Preserve user-provided task names exactly as written (e.g. CSC305, Java Assignment).
4. Output a structured array of chronological timeline blocks from morning to evening.
5. Include a 'suggestions' field with at most 1 concise habit suggestion.`,
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

    const data = safeJsonParse<{ timeline?: any[]; suggestions?: string }>(response.text || "{}", {});
    if (data.timeline && Array.isArray(data.timeline)) {
      return {
        timeline: data.timeline.map((item: any, index: number) => ({
          id: `gen-item-${index}-${Date.now()}`,
          ...item
        })),
        suggestions: data.suggestions || "Your personalized timeline is ready."
      };
    }
    throw new Error("Invalid timeline format");
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
    const response = await generateContentWithFallback(ai, {
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

