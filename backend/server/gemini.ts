import { GoogleGenAI, Type, Modality, ThinkingLevel } from "@google/genai";
import { dbService } from "./db.js";
import { IntentClassification } from "../types/index.js";
import { extractTimeFromText, normalizeTimeString, formatReadableDate, formatReadableTime } from "../utils/timeUtils.js";
import { cleanReminderTitle, resolveRelativeDate, extractReminderParams, extractEventParams as parseStructuredEventParams, extractExplicitDateFromText } from "../utils/reminderParser.js";
import { extractStudyParams } from "../utils/studyPlanGenerator.js";
import { normalizeUserInput, extractVaultContent } from "./contextualNormalizer.js";
import { 
  classifyIdentityOrCapability, 
  generateAuthoritativeIdentityResponse, 
  isQuestionOrInquiry,
  XENA_OFFICIAL_IDENTITY,
  XENA_CONVERSATIONAL_POLICY,
  XENA_CAPABILITY_REGISTRY
} from "./XenaIdentity.js";
import { DailyScheduleEngine } from "../services/DailyScheduleEngine.js";
import { PersonalContextEngine } from "../services/PersonalContextEngine.js";

// Helper to clean JSON response from markdown code fences or surrounding whitespace
function cleanJsonResponse(text: string): string {
  if (!text) return "{}";
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  }
  return cleaned;
}

const GEMINI_MODELS = [
  "gemini-3.1-flash-lite",
  "gemini-flash-latest",
  "gemini-3.8-flash"
];

// In-memory model circuit breaker to avoid calling models with exhausted quotas
const modelExhaustionMap = new Map<string, number>();

export function isModelQuarantined(model: string): boolean {
  const until = modelExhaustionMap.get(model);
  if (!until) return false;
  if (Date.now() > until) {
    modelExhaustionMap.delete(model);
    return false;
  }
  return true;
}

export function quarantineModel(model: string, retryInfo?: number | string) {
  let durationSec = 3600;
  if (typeof retryInfo === 'number' && !isNaN(retryInfo) && retryInfo > 0) {
    durationSec = retryInfo;
  } else if (typeof retryInfo === 'string') {
    const secMatch = retryInfo.match(/(\d+)\s*s\b/);
    if (secMatch) {
      durationSec = parseInt(secMatch[1], 10);
    }
  }
  const durationMs = durationSec * 1000;
  modelExhaustionMap.set(model, Date.now() + durationMs);
}

function getActiveModels(): string[] {
  const active = GEMINI_MODELS.filter(m => !isModelQuarantined(m));
  return active.length > 0 ? active : ["gemini-3.1-flash-lite"];
}

async function delayMs(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function generateContentWithFallback(ai: GoogleGenAI, params: any) {
  let lastError: any = null;
  const models = getActiveModels();
  for (const model of models) {
    try {
      return await ai.models.generateContent({
        ...params,
        model
      });
    } catch (err: any) {
      lastError = err;
      const isQuotaOr429 = err?.status === 429 || err?.message?.includes('429') || err?.message?.includes('RESOURCE_EXHAUSTED');
      if (isQuotaOr429) {
        let retryDelaySec: number | undefined;
        try {
          const delayStr = err?.error?.details?.find((d: any) => d.retryDelay)?.retryDelay;
          if (delayStr) {
            retryDelaySec = parseInt(delayStr.replace('s', ''), 10);
          }
        } catch { /* noop */ }
        quarantineModel(model, retryDelaySec);
      }
      console.warn(`[GEMINI_MODEL_FALLBACK] Model ${model} failed (${err?.status || 'Error'}). Trying next model...`, err?.message || err);
      if (isQuotaOr429) {
        await delayMs(200);
      }
    }
  }
  throw lastError;
}

async function generateContentStreamWithFallback(ai: GoogleGenAI, params: any) {
  let lastError: any = null;
  const models = getActiveModels();
  for (const model of models) {
    try {
      return await ai.models.generateContentStream({
        ...params,
        model
      });
    } catch (err: any) {
      lastError = err;
      const isQuotaOr429 = err?.status === 429 || err?.message?.includes('429') || err?.message?.includes('RESOURCE_EXHAUSTED');
      if (isQuotaOr429) {
        quarantineModel(model);
      }
      console.warn(`[GEMINI_STREAM_FALLBACK] Model ${model} failed. Trying next model...`, err?.message || err);
      if (isQuotaOr429) {
        await delayMs(200);
      }
    }
  }
  throw lastError;
}

function repairTruncatedJson(input: string): string {
  let str = input.trim().replace(/,\s*([}\]])/g, '$1');
  let inString = false;
  let escape = false;
  const stack: string[] = [];

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (ch === '{') stack.push('}');
      else if (ch === '[') stack.push(']');
      else if (ch === '}' || ch === ']') {
        if (stack.length > 0 && stack[stack.length - 1] === ch) {
          stack.pop();
        }
      }
    }
  }

  if (inString) {
    // Remove trailing孤 backslash if any before closing quote
    if (escape) str = str.slice(0, -1);
    str += '"';
  }

  // Strip trailing comma or colon before closing brackets
  str = str.replace(/[,:\s]+$/, '');
  // If truncated right after an object key `"key"` without `: value`, strip the dangling key
  str = str.replace(/,\s*"[^"]*"\s*$/, '');

  while (stack.length > 0) {
    const closer = stack.pop()!;
    str = str.replace(/[,:\s]+$/, '');
    str += closer;
  }

  return str;
}

function safeJsonParse<T>(text: string, fallback: T): T {
  if (!text) return fallback;
  const cleaned = cleanJsonResponse(text);
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    try {
      const repaired = repairTruncatedJson(cleaned);
      return JSON.parse(repaired) as T;
    } catch {
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
    let cleanMime = (mimeType || 'audio/webm').split(';')[0].trim().toLowerCase() || 'audio/webm';
    const cleanBase64 = (audioBase64 || '')
      .replace(/^data:[^;]+;base64,/i, '')
      .replace(/[\r\n\s]/g, '')
      .trim();

    if (!cleanBase64 || cleanBase64.length < 2000) {
      return '';
    }

    const audioBuffer = Buffer.from(cleanBase64, 'base64');
    if (audioBuffer.length < 1500) {
      return '';
    }

    // Detect & verify true audio container format from magic bytes to prevent Gemini 400 INVALID_ARGUMENT
    const b0 = audioBuffer[0];
    const b1 = audioBuffer[1];
    const b2 = audioBuffer[2];
    const b3 = audioBuffer[3];
    const magic4 = audioBuffer.subarray(0, 4).toString('ascii');
    const magic4to8 = audioBuffer.subarray(4, 8).toString('ascii');

    if (b0 === 0x1a && b1 === 0x45 && b2 === 0xdf && b3 === 0xa3) {
      cleanMime = 'audio/webm';
    } else if (magic4 === 'RIFF') {
      cleanMime = 'audio/wav';
    } else if (magic4 === 'OggS') {
      cleanMime = 'audio/ogg';
    } else if (magic4to8 === 'ftyp') {
      cleanMime = 'audio/mp4';
    } else if (magic4.startsWith('ID3') || (b0 === 0xff && (b1 & 0xe0) === 0xe0)) {
      cleanMime = 'audio/mp3';
    } else {
      // Unrecognized or headerless raw fragment (e.g., partial MediaRecorder chunk without EBML header)
      return '';
    }

    const contextStr = userContextTerms && userContextTerms.length > 0
      ? `Known User Entities, Course Codes & Reminders: ${userContextTerms.filter(Boolean).join(', ')}`
      : 'Known Course Codes: CS-305';

    const sttParams = {
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: cleanMime,
                data: cleanBase64
              }
            },
            {
              text: "Transcribe the spoken audio into text with high precision and intelligent contextual refinement."
            }
          ]
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
    };

    const sttModels = ['gemini-3.1-flash-lite', 'gemini-flash-latest', 'gemini-3.8-flash'];
    let response: any = null;

    for (const model of sttModels) {
      if (isModelQuarantined(model)) continue;
      try {
        response = await ai.models.generateContent({
          ...sttParams,
          model
        });
        if (response) break;
      } catch (mErr: any) {
        const status = mErr?.status || mErr?.code;
        const msg = String(mErr?.message || '');
        // Do not retry other models if the audio payload itself is rejected as 400 INVALID_ARGUMENT
        if (status === 400 || msg.includes('INVALID_ARGUMENT')) {
          return '';
        }
        const isQuotaOr429 = status === 429 || msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED');
        if (isQuotaOr429) {
          quarantineModel(model, msg);
        }
      }
    }

    if (!response) {
      return '';
    }

    const resultText = (response.text || "").trim();

    if (resultText === "[SILENCE]" || !resultText) {
      return "";
    }

    const normalized = normalizeUserInput(resultText);
    return normalized.finalTranscript;
  } catch {
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

export function isSimpleGreeting(text: string): boolean {
  if (!text) return false;
  const lower = text.trim().toLowerCase().replace(/[?!.,;:]+$/, '').trim();

  // Never allow a greeting handler to intercept identity, role, purpose, or capability questions (Part 4.1 & 4.2)
  if (classifyIdentityOrCapability(text).isMatch) {
    return false;
  }

  // If query starts with or contains an action verb, it's not a greeting
  if (/\b(remind|create|set|add|schedule|save|delete|update|change|organize|plan|track)\b/i.test(lower)) {
    return false;
  }

  // Reject if a greeting is followed by any non-well-being question word ("Hi, what is...", "Hello, can you...", "Bonjour, comment...")
  const strippedAfterGreeting = lower.replace(
    /^(?:good\s+(?:morning|afternoon|evening|night)|hello|hi|hey|greetings|bonjour|salut|hola|coucou)(?:\s+(?:there|xena|xena\s+ai))?[\s,!.:;-]*/i,
    ''
  ).trim();

  const wellBeingSet = new Set([
    '',
    'how are you',
    'how are you doing',
    "how's it going",
    'how do you do',
    'how is everything',
    "how's your day",
    'how are you today',
    'how are you doing today',
    'comment vas-tu',
    'comment ça va',
    'ça va'
  ]);

  if (
    /^(?:good\s+(?:morning|afternoon|evening|night)|hello|hi|hey|greetings|bonjour|salut|hola|coucou)\b/i.test(lower) &&
    wellBeingSet.has(strippedAfterGreeting)
  ) {
    return true;
  }

  // Pure inquiry about well-being
  if (wellBeingSet.has(lower) && lower.length > 0) {
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

  return false;
}

export function isConversationalText(text: string): boolean {
  if (!text) return false;
  const lower = text.trim().toLowerCase();

  if (isSimpleGreeting(text)) {
    return true;
  }

  // If query starts with or contains an explicit action verb:
  const isExplicitAction = /^(remind me to|create a|create me|add a|schedule|save to vault|vault |delete memory|delete event|delete task|update event|change event|track my|study tracker)/i.test(lower);
  if (isExplicitAction) {
    return false;
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
    lower.includes('tell me something') ||
    lower.includes("what's my name") ||
    lower.includes('what is my name') ||
    lower.includes('difference between') ||
    lower.includes('how do reminders work') ||
    lower.includes('how do events work') ||
    lower.includes('can you create reminders') ||
    lower.includes('can you help me plan') ||
    lower.includes('can you explain') ||
    lower.includes('explain ') ||
    lower.includes('what is the difference') ||
    lower.includes("what's the difference") ||
    lower.includes('are you available')
  ) {
    return true;
  }

  return false;
}

export function extractEventParams(text: string, llmExtracted?: any) {
  const info = parseStructuredEventParams(text, llmExtracted);
  return {
    title: info.title,
    date: info.date,
    time: info.time,
    location: info.location,
    description: info.description,
    isTitleValid: info.isTitleValid,
    isDateExplicit: info.isDateExplicit,
    isTimeExplicit: info.isTimeExplicit
  };
}

export function generateConversationalResponse(userText: string, profileName?: string): string {
  const lower = userText.trim().toLowerCase();
  const name = profileName || 'Zialy';

  // Dedicated Authoritative Identity & Capability handling
  const identityCheck = classifyIdentityOrCapability(userText);
  if (identityCheck.isMatch) {
    return generateAuthoritativeIdentityResponse(userText, profileName);
  }

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
    return "I'm Xena, your student companion. I can help you set reminders with voice alerts, schedule events, organize study plans, track exam progress, and answer questions. What would you like help with?";
  }

  // Identity
  if (lower.includes('who are you') || lower.includes('what is xena') || lower.includes("what's xena") || lower.includes('what is your name') || lower.includes("what's your name") || lower.includes('who made you') || lower.includes('who created you')) {
    return "I am Xena AI, your intelligent student companion. I help you organize your academic schedule, manage reminders, plan study sessions, and answer your questions.";
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

  // 0a. Authoritative Identity, Purpose, Role & Capability Check (MUST NOT trigger actions or DB mutations)
  const idCheck = classifyIdentityOrCapability(cleanText);
  if (idCheck.isMatch) {
    return {
      intent: 'NORMAL_CHAT',
      intents: ['NORMAL_CHAT'],
      actions: [{ intent: 'NORMAL_CHAT', action: 'NO_OP', payload: {} }],
      explanation: `Authoritative identity/capability inquiry (${idCheck.category}${idCheck.featureId ? ':' + idCheck.featureId : ''}) — routing directly to XenaIdentity without tool execution.`
    };
  }

  // 0. Conversational Explanatory / General Knowledge Questions check (MUST NOT trigger actions)
  const isGeneralKnowledgeOrExplanatory = (
    lower.includes('difference between') ||
    lower.includes('what is the difference') ||
    lower.includes("what's the difference") ||
    lower.includes('how do reminders work') ||
    lower.includes('how do events work') ||
    lower.includes('what can you do') ||
    lower.includes('who are you') ||
    lower.includes('what is a database') ||
    lower.includes('what is an api') ||
    lower.includes('what is python') ||
    lower.includes('what is java') ||
    lower.includes('can you teach me') ||
    lower.includes('teach me') ||
    (lower.startsWith('what is') && (lower.includes('reminder') || lower.includes('event') || lower.includes('plan') || lower.includes('api') || lower.includes('database'))) ||
    (lower.startsWith("what's") && (lower.includes('reminder') || lower.includes('event') || lower.includes('plan') || lower.includes('api') || lower.includes('database')))
  );

  if (isGeneralKnowledgeOrExplanatory) {
    return {
      intent: 'NORMAL_CHAT',
      intents: ['NORMAL_CHAT'],
      actions: [{ intent: 'NORMAL_CHAT', action: 'NO_OP', payload: {} }],
      explanation: 'General knowledge or explanatory question — routing directly to conversational response without database mutations.'
    };
  }

  // 0.5 Ambiguous or Incomplete Command Check (MUST ask clarification rather than creating dummy/raw prompt records)
  const isAmbiguousIncompleteCommand = (
    /^(schedule|book|add|create|set|move|update)\s+(my\s+)?(meeting|event|appointment)\??$/i.test(lower) ||
    /^(set\s+it|remind\s+me)\s+(for\s+)?(today|tomorrow)\??$/i.test(lower) ||
    /^(make|create|generate)\s+(a\s+)?plan\??$/i.test(lower) ||
    /^(can\s+you\s+)?(organize|plan)\s+(this|it)\s*(for\s+me)?\??$/i.test(lower) ||
    /^(i\s+need\s+to\s+prepare\s+for\s+something|i\s+need\s+to\s+prepare\s+for\s+something\s+important)\??$/i.test(lower)
  );

  if (isAmbiguousIncompleteCommand) {
    let prompt = "What date and time should I schedule that for?";
    if (lower.includes('plan') || lower.includes('organize') || lower.includes('prepare')) {
      prompt = "Got it! Which subjects, activities, or study goals would you like me to include in your plan?";
    } else if (lower.includes('remind')) {
      prompt = "Sure! What would you like me to remind you about?";
    }
    return {
      intent: 'AMBIGUOUS',
      intents: ['AMBIGUOUS'],
      actions: [{ intent: 'AMBIGUOUS', action: 'NO_OP', payload: {} }],
      explanation: 'Incomplete or ambiguous command — requesting required parameter clarification.',
      clarificationPrompt: prompt
    };
  }

  // 0.8 Study Guidance / Exam Timetable Requests (e.g. "I am writing my exams on October 30... How can I proceed to succeed?")
  const isStudyGuidanceRequest = (
    lower.includes('how can i proceed to succeed') ||
    lower.includes('how should i organize my revision') ||
    (lower.includes('exam') && lower.includes('courses') && lower.includes('how')) ||
    (lower.includes('exams on') && lower.includes('courses'))
  );

  if (isStudyGuidanceRequest) {
    const coursesMatch = cleanText.match(/\b([A-Z]{2,4}\s*\d{3})\b/g) || [];
    const dateMatch = cleanText.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}\b/i) || cleanText.match(/\b\d{4}-\d{2}-\d{2}\b/);
    const date = dateMatch ? resolveRelativeDate(null, dateMatch[0]) : resolveRelativeDate(null, 'next month');

    return {
      intent: 'STUDY_TRACKING',
      intents: ['STUDY_TRACKING'],
      actions: [{
        intent: 'STUDY_TRACKING',
        action: 'READ',
        payload: {
          courses: coursesMatch,
          exam_date: date,
          query: cleanText
        }
      }],
      extractedData: {
        courses: coursesMatch,
        exam_date: date
      },
      explanation: `Providing structured study guidance for exams on ${date}.`
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

  // 1.5 My Items / Contextual Read Queries (Reminders, Planner, Study Plans, Events, Exams, Cross-Category Availability)
  const isContextualReadQuery = (
    lower.includes("what's in my items") ||
    lower.includes("what is in my items") ||
    lower.includes("show my items") ||
    lower.includes("what's in my organizer") ||
    lower.includes("am i free") ||
    lower.includes("conflict with my events") ||
    lower.includes("do my study sessions conflict") ||
    lower.includes("what are my study plans") ||
    lower.includes("what is my study plan") ||
    lower.includes("show my study plan") ||
    lower.includes("show my study timetable") ||
    lower.includes("what is my study timetable") ||
    lower.includes("what subjects am i tracking") ||
    lower.includes("which subjects am i tracking") ||
    lower.includes("what courses am i tracking") ||
    lower.includes("next exam") ||
    lower.includes("upcoming exam") ||
    lower.includes("when is my exam") ||
    lower.includes("what exams do i have") ||
    lower.includes("do i have any exam") ||
    lower.includes("do i have an exam") ||
    lower.includes("show my reminders") ||
    lower.includes("what reminders do i have") ||
    lower.includes("do i have any reminders") ||
    lower.includes("do i have a reminder") ||
    lower.includes("what tasks are in my planner") ||
    lower.includes("what is in my planner") ||
    lower.includes("summarize everything i have scheduled")
  );

  if (isContextualReadQuery) {
    if (lower.includes('study') || lower.includes('subject') || lower.includes('course') || lower.includes('timetable')) {
      return {
        intent: 'STUDY_TRACKING',
        intents: ['STUDY_TRACKING'],
        actions: [{
          intent: 'STUDY_TRACKING',
          action: 'READ',
          payload: { query: cleanText }
        }],
        extractedData: { query: cleanText },
        explanation: `Reading study tracking and timetable for "${cleanText}".`
      };
    }
    return {
      intent: 'NORMAL_CHAT',
      intents: ['NORMAL_CHAT'],
      actions: [{ intent: 'NORMAL_CHAT', action: 'NO_OP', payload: {} }],
      explanation: 'Contextual My Items inquiry — routing to PersonalContextEngine.'
    };
  }

  // 2. Study Tracking & Study Timetable check (placed BEFORE daily planning so "study plan" / "study timetable" / "study hours a day" for courses never gets hijacked by daily planning)
  const studyExtracted = extractStudyParams(cleanText);
  const isExplicitStudyTracker = (
    lower.includes('study tracker') ||
    lower.includes('study tracking') ||
    lower.includes('study timetable') ||
    lower.includes('revision timetable') ||
    lower.includes('revision schedule') ||
    lower.includes('track my studies') ||
    lower.includes('track my study') ||
    lower.includes('add to my study') ||
    (lower.includes('study plan') && !lower.includes('daily plan')) ||
    (studyExtracted.subjects.length > 0 && (
      lower.includes('exam') ||
      lower.includes('difficulty') ||
      lower.includes('hard') ||
      lower.includes('medium') ||
      lower.includes('easy') ||
      lower.includes('timetable') ||
      lower.includes('track') ||
      lower.includes('courses') ||
      lower.includes('subjects') ||
      Boolean(studyExtracted.hoursPerDay && studyExtracted.examDate)
    ))
  );

  if (isExplicitStudyTracker) {
    const isDelete = /^(delete|remove|drop)\b/i.test(lower) && (lower.includes('study') || lower.includes('subject') || lower.includes('course'));
    const isRead = /^(what|which|show|list|view|tell\s+me|how\s+many|when\s+is)\b/i.test(lower) && !lower.includes('create') && !lower.includes('generate') && !lower.includes('add');
    const isUpdate = !isDelete && !isRead && (
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

    const actionType = isDelete ? 'DELETE' : isRead ? 'READ' : isUpdate ? 'UPDATE' : 'CREATE';
    const primaryCourse = studyExtracted.subjects[0]?.name || '';

    return {
      intent: 'STUDY_TRACKING',
      intents: ['STUDY_TRACKING'],
      actions: [{
        intent: 'STUDY_TRACKING',
        action: actionType,
        payload: {
          course: primaryCourse,
          subjects: studyExtracted.subjects,
          exam_date: studyExtracted.examDate || undefined,
          ca_date: studyExtracted.caDate || undefined,
          study_hours_per_day: studyExtracted.hoursPerDay || undefined,
          preferred_study_time: studyExtracted.preferredTime || undefined,
          available_days: studyExtracted.availableDays || undefined,
          wants_timetable: studyExtracted.wantsTimetable,
          raw_text: cleanText
        }
      }],
      extractedData: {
        course: primaryCourse,
        subjects: studyExtracted.subjects,
        date: studyExtracted.examDate || undefined,
        hoursPerDay: studyExtracted.hoursPerDay,
        prefTime: studyExtracted.preferredTime,
        availableDays: studyExtracted.availableDays
      },
      explanation: `Routing Study Tracking (${actionType}) for ${studyExtracted.subjects.map(s => s.name).join(', ') || 'requested subjects'}.`
    };
  }

  // 2.5 Daily Planning check (Guardrail: never hijack explicit reminder, event, or study tracker requests)
  const hasExplicitReminderPhrase = /\b(remind\s+me|don't\s+forget\s+to\s+remind|set\s+a\s+reminder|create\s+a\s+reminder|add\s+a\s+reminder|schedule\s+a\s+reminder|rappelle-moi)\b/i.test(lower);
  const hasExplicitPlanPhrase = /\b(create\s+my\s+plan|create\s+a\s+plan|plan\s+my\s+day|plan\s+for\s+tomorrow|plan\s+for\s+today|organize\s+my\s+day|daily\s+plan|organize\s+my\s+schedule|schedule\s+my\s+day|make\s+a\s+schedule|make\s+a\s+plan|generate\s+a\s+plan|generate\s+my\s+plan|help\s+me\s+plan|help\s+me\s+to\s+plan|plan\s+my\s+activities|create\s+a\s+schedule)\b/i.test(lower);
  const looksLikeSingleEventStatement = /\b(event|conference|summit|meeting|appointment|wedding|gala|workshop|seminar|something\s+important|to\s+my\s+events|in\s+my\s+events)\b/i.test(lower) && !hasExplicitPlanPhrase;

  const tempDate = resolveRelativeDate(null, cleanText);
  const parsedConstraints = (hasExplicitReminderPhrase || looksLikeSingleEventStatement) && !hasExplicitPlanPhrase
    ? []
    : DailyScheduleEngine.parseTaskConstraints(cleanText, tempDate);
  const constraintsWithTimeOrDuration = parsedConstraints.filter(c => c.hasExplicitDuration || c.hasExplicitStartTime);
  const isMultiTaskSchedule = parsedConstraints.length >= 2 && constraintsWithTimeOrDuration.length >= 2;

  const isPlanningQuery = !hasExplicitReminderPhrase || hasExplicitPlanPhrase ? (
    isMultiTaskSchedule ||
    hasExplicitPlanPhrase ||
    lower.includes('schedule everything around') ||
    (lower.includes('schedule') && lower.includes('around')) ||
    (lower.includes('plan') && !lower.includes('study plan') && (lower.includes('football') || lower.includes('dance') || lower.includes('eat') || lower.includes('tasks') || lower.includes('activities') || lower.includes('day') || lower.includes('today') || lower.includes('tomorrow')))
  ) : false;

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
    lower.includes('which events') ||
    lower.includes('any events') ||
    lower.includes('events in ') ||
    lower.includes('events on ') ||
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
    lower.includes('do i have an event') ||
    lower.includes('do i have any event') ||
    lower.includes('do i have events') ||
    lower.includes('is there an event') ||
    lower.includes('are there any events') ||
    lower.includes('have i got an event') ||
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
    (lower.startsWith('when is ') && !lower.includes('exam')) ||
    (lower.includes('remind me') && (lower.includes('what event') || lower.includes('what meeting') || lower.includes('what schedule')))
  );

  if (isEventQueryView) {
    const dateInfo = extractExplicitDateFromText(cleanText);
    return {
      intent: 'VIEW_UPCOMING_EVENTS',
      intents: ['VIEW_UPCOMING_EVENTS'],
      actions: [{
        intent: 'VIEW_UPCOMING_EVENTS',
        action: 'READ',
        payload: {
          query: cleanText,
          date: dateInfo.isExplicit ? dateInfo.date : undefined
        }
      }],
      extractedData: { query: cleanText, date: dateInfo.isExplicit ? dateInfo.date : undefined },
      explanation: `Querying existing events for "${cleanText}".`
    };
  }

  // 3.5 Event DELETE check
  const isEventDeleteQuery = (
    (lower.startsWith('delete ') || lower.startsWith('remove ') || lower.startsWith('cancel ')) &&
    (lower.includes('event') || lower.includes('from my events') || lower.includes('meeting') || lower.includes('conference') || lower.includes('appointment'))
  );

  if (isEventDeleteQuery) {
    const evInfo = parseStructuredEventParams(cleanText);
    const targetTitle = evInfo.title
      .replace(/^(?:delete|remove|cancel)\s+(?:the\s+|my\s+)?(?:event\s+)?(?:called\s+|named\s+)?/i, '')
      .replace(/\s+from\s+my\s+events.*$/i, '')
      .trim();
    return {
      intent: 'EVENT',
      intents: ['EVENT'],
      actions: [{
        intent: 'EVENT',
        action: 'DELETE',
        payload: {
          title: targetTitle,
          date: evInfo.isDateExplicit ? evInfo.date : undefined
        }
      }],
      extractedData: { title: targetTitle, date: evInfo.isDateExplicit ? evInfo.date : undefined },
      explanation: `Deleting event "${targetTitle}".`
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
    const explicitDateInfo = extractExplicitDateFromText(cleanText);
    const date = explicitDateInfo.isExplicit && explicitDateInfo.date ? explicitDateInfo.date : undefined;

    let location = undefined;
    const locMatch = cleanText.match(/\b(at|in|to)\s+([A-Z0-9][a-zA-Z0-9\s,]{2,30})/);
    if (locMatch && !/saturday|sunday|monday|tuesday|wednesday|thursday|friday|today|tomorrow|january|february|march|april|may|june|july|august|september|october|november|december|events|my events/i.test(locMatch[2])) {
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
      extractedData: { title: targetTitle, time: explicitTime || undefined, date: date || undefined, location: location || undefined },
      explanation: `Updating event "${targetTitle}".`
    };
  }

  // 4. Event check (CREATE) — Supports all natural-language event patterns
  const eventKeywords = ['event', 'bootcamp', 'conference', 'workshop', 'webinar', 'seminar', 'meeting', 'appointment', 'church service', 'summit', 'gala', 'wedding', 'party', 'concert', 'festival', 'ceremony', 'symposium'];
  const hasEventKeyword = eventKeywords.some(kw => new RegExp(`\\b${kw}s?\\b`, 'i').test(lower));
  const isHypotheticalOrPastQuestion = /^(what|when|where|who|why|how|which|did|do|does|is|are|am|was|were|have|has|if|suppose)\b/i.test(lower);

  const isEventCreateIntent = !isHypotheticalOrPastQuestion && (
    lower.includes('save it in my events') ||
    lower.includes('in my events') ||
    lower.includes('to my events') ||
    lower.includes('as an event') ||
    lower.includes('add event') ||
    lower.includes('add an event') ||
    lower.includes('create event') ||
    lower.includes('create an event') ||
    lower.includes('schedule event') ||
    lower.includes('schedule an event') ||
    lower.includes('add meeting') ||
    lower.includes('schedule meeting') ||
    (/\bi\s+(?:have|got)\s+(?:an?\s+)?(?:something\s+important|important\s+event)\b/i.test(lower)) ||
    (hasEventKeyword && (
      /\bi\s+(?:have|got|am\s+attending|will\s+attend)\b/i.test(lower) ||
      /\bthere\s+is\s+an?\b/i.test(lower) ||
      lower.includes('called ') ||
      lower.includes('named ') ||
      lower.includes('add ') ||
      lower.includes('schedule ') ||
      lower.includes('create ') ||
      lower.includes('save ') ||
      lower.includes('put in calendar') ||
      lower.includes('add to calendar')
    ))
  );

  if (isEventCreateIntent) {
    const evParams = parseStructuredEventParams(cleanText);
    return {
      intent: 'EVENT',
      intents: ['EVENT'],
      actions: [{
        intent: 'EVENT',
        action: 'CREATE',
        payload: {
          title: evParams.title,
          date: evParams.date,
          time: evParams.time,
          location: evParams.location,
          description: cleanText,
          isTitleValid: evParams.isTitleValid,
          isDateExplicit: evParams.isDateExplicit
        }
      }],
      extractedData: {
        title: evParams.title,
        date: evParams.date,
        time: evParams.time,
        location: evParams.location
      },
      explanation: `Extracting structured event candidate (title="${evParams.title || 'missing'}", date="${evParams.date || 'missing'}").`
    };
  }

  // 5. Reminder check
  const isReminderQuery = (
    lower.includes('remind me') ||
    lower.includes('reminder') ||
    lower.includes("don't forget to") ||
    lower.includes('do not forget to') ||
    lower.includes('rappelle-moi') ||
    lower.includes('rappelle moi') ||
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

  // 0. Dedicated Identity, Purpose & Capability Check (NEVER trigger tools)
  const identityCheck = classifyIdentityOrCapability(cleanText);
  if (identityCheck.isMatch) {
    const res: IntentClassification = {
      intent: 'NORMAL_CHAT',
      intents: ['NORMAL_CHAT'],
      actions: [{ intent: 'NORMAL_CHAT', action: 'NO_OP', payload: {} }],
      explanation: `User asked about identity, role, goal, or capabilities (${identityCheck.category}). Routing to identity response pipeline.`
    };
    intentCache.set(cacheKey, res, 60000);
    return res;
  }

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

  // 3.5 Fast Conversational & Non-Action Guard:
  // If the utterance contains no imperative CRUD/tool keywords, skip the slow LLM JSON schema call and route directly to NORMAL_CHAT in <1ms!
  const hasPotentialActionKeyword = /\b(remind|reminder|rappelle|schedule|event|meeting|conference|appointment|summit|gala|wedding|workshop|seminar|add|create|set|make|build|generate|delete|remove|cancel|clear|drop|update|change|modify|edit|move|reschedule|plan|organize|planner|track|tracker|tracking|timetable|exam|course|subject|remember|vault|volt|save|keep|store|profile|name\s+is|call\s+me)\b/i.test(cleanText);
  if (!hasPotentialActionKeyword) {
    const fastChatResult: IntentClassification = {
      intent: 'NORMAL_CHAT',
      intents: ['NORMAL_CHAT'],
      actions: [{ intent: 'NORMAL_CHAT', action: 'NO_OP', payload: {} }],
      explanation: 'Direct conversational query without action keywords.'
    };
    intentCache.set(cacheKey, fastChatResult, 60000);
    return fastChatResult;
  }

  // Also if it is clearly a pure question ("what...", "when...", "where...", "who...", "how...", "do i...", "is there...", "am i...") without explicit creation commands ("can you create/set/add/remind/schedule/plan/generate")
  const isPureQuestionWithoutCommand = /^(what|when|where|who|why|how|which|do\s+i|does\s+my|is\s+there|are\s+there|am\s+i|have\s+i|tell\s+me\s+(?:a|about|what|when|how)|explain|describe)\b/i.test(cleanText) &&
    !/\b(create|set|add|schedule|generate|make|build|remind\s+me\s+to|remind\s+me\s+at|remind\s+me\s+on|remind\s+me\s+in|update|change|delete|remove)\b/i.test(cleanText);
  if (isPureQuestionWithoutCommand) {
    const fastQuestionResult: IntentClassification = {
      intent: 'NORMAL_CHAT',
      intents: ['NORMAL_CHAT'],
      actions: [{ intent: 'NORMAL_CHAT', action: 'NO_OP', payload: {} }],
      explanation: 'Pure question or inquiry — routing directly to conversational/context engine.'
    };
    intentCache.set(cacheKey, fastQuestionResult, 60000);
    return fastQuestionResult;
  }

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
    const lastUserMsg = recentMessages.slice().reverse().find(m => 
      m.sender === 'user' && 
      m.text !== text &&
      (/\b(event|meeting|conference|workshop|ceremony|party|dinner|lunch|gathering|appointment|session|class|lecture)\b/i.test(m.text) ||
       /(called|named)\s+/i.test(m.text) ||
       /\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday|tomorrow|today)\b/i.test(m.text))
    ) || recentMessages.slice().reverse().find(m => m.sender === 'user' && m.text !== text);

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
   - CREATE_EVENT (intent: "EVENT", action: "CREATE"): User asks to add or schedule a NEW calendar event, meeting, appointment, ceremony, etc. (e.g. "Add church service Sunday at 9am"). If the user mentions "event named X" or "event called X", title MUST be "X". If the user explicitly mentions an "event" (e.g. "I have an event..."), it MUST be an EVENT, not a REMINDER. In the actions payload and extractedData, always populate 'title' with the event name, 'date' with the date, and 'time' with the 24-hr time. NEVER put a time like "3 PM" in 'location'.
   - VIEW_UPCOMING_EVENTS (intent: "VIEW_UPCOMING_EVENTS", action: "READ"): User asks to check, retrieve, or list existing events on their calendar (e.g. "What events do I have coming up?", "Remind me what events I have coming up"). The word "remind" in "Remind me what events I have coming up" means RETRIEVING existing events — DO NOT create a reminder or event!
2. VOICE CLEANING: Clean speech hesitations ("um", "uh", "you know", "like", "err") and correct obvious speech typos.
3. MULTI-INTENT DETECTION: A single message may contain multiple independent intentions!
   Example: "My exam is on August 20. Create a study plan. Remind me three days before."
   Detects: EVENT/STUDY_TRACKING, PLANNING, and REMINDER! Return ALL detected intents in "intents" array and generate corresponding "actions".
4. DATES & TIMES: "tomorrow" = today + 1 day (${todayStr}). Always format time as 24-hour HH:MM.
5. AMBIGUITY & INCOMPLETE REQUESTS: If a reminder or event request is missing vital detail (like missing title for "remind me tomorrow" or "I want you to create me a reminder"), set intent to "AMBIGUOUS", provide missingFields and a clear clarificationPrompt.
6. REMINDER TITLE EXTRACTION: For REMINDER intent, 'title' MUST contain ONLY the concise, actionable task (e.g. 'Study CSC305', 'Call John', 'Submit project'). NEVER use the entire conversational sentence. Strip greetings ('Hello Xena', 'hope you are fine'), politeness ('please'), command language ('create me a reminder to', 'remind me to'), and date/time expressions ('at 3 PM', 'tomorrow') from the title.
7. NEVER INVENT INFORMATION: Do NOT invent missing fields (e.g. do not invent 09:00, or a default title like "Reminder", or a location). Only extract what the user explicitly said.
8. CONTEXTUAL COMMANDS: If the user says "Save the event I just told you" or "Save that", set intent="EVENT", action="CREATE". Do not invent the title; it will be resolved from the conversation context.
9. IDENTITY, GOAL & CAPABILITY INQUIRIES: When user asks about Xena ("Who are you?", "What is your goal?", "What is your purpose?", "What can you do?", "Are you just a chatbot?", "Can you update events?"), intent MUST be "NORMAL_CHAT" with action "NO_OP". NEVER classify identity, goal, purpose, or capability questions as action tools.`,
        responseMimeType: "application/json",
        maxOutputTokens: 800,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
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
        classification.actions.forEach((act: any) => {
          if (act.intent === 'REMINDER' && act.payload) {
            const params = extractReminderParams(act.payload, cleanText);
            act.payload.title = params.title;
            act.payload.date = params.date;
            act.payload.time = params.time;
          }
        });
      }
    } else if (classification.intent === 'EVENT' || (classification.intents && classification.intents.includes('EVENT'))) {
      const evParams = parseStructuredEventParams(cleanText, classification.extractedData);
      if (classification.extractedData) {
        classification.extractedData.title = evParams.title;
        classification.extractedData.date = evParams.date;
        classification.extractedData.time = evParams.time;
        classification.extractedData.location = evParams.location;
      }
      if (classification.actions) {
        classification.actions.forEach((act: any) => {
          if (act.intent === 'EVENT' && act.action === 'CREATE') {
            const actEv = parseStructuredEventParams(cleanText, act.payload);
            act.payload = {
              ...act.payload,
              title: actEv.title,
              date: actEv.date,
              time: actEv.time,
              location: actEv.location,
              isTitleValid: actEv.isTitleValid,
              isDateExplicit: actEv.isDateExplicit
            };
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
  const lower = text.toLowerCase();

  // Deterministic local extraction for explicit memory triggers
  const isExplicitMemory = /^(remember|vault|save|keep|store)\b/i.test(text) || lower.includes("mother's name") || lower.includes("is my mother") || lower.includes("my goal is");
  
  if (isExplicitMemory) {
    let extractedFact = text
      .replace(/^(remember|vault|save|keep|store)\s*(that|this|:)?\s*/i, '')
      .replace(/^(please\s+)/i, '')
      .trim();

    let category = "General";
    if (lower.includes("mother") || lower.includes("father") || lower.includes("sister") || lower.includes("brother") || lower.includes("friend")) {
      category = "Relationships";
    } else if (lower.includes("prefer") || lower.includes("like") || lower.includes("favorite")) {
      category = "Preference";
    } else if (lower.includes("goal") || lower.includes("target")) {
      category = "Goal";
    }

    if (extractedFact.length > 3) {
      // Check if duplicate already exists
      const existing = dbService.getMemories(userId).find(m => m.text.toLowerCase() === extractedFact.toLowerCase());
      if (!existing) {
        const memory = dbService.createMemory(userId, {
          text: extractedFact,
          category
        });
        return memory.text;
      }
      return existing.text;
    }
  }

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
            category: { type: Type.STRING, enum: ["Preference", "Relationships", "Schedule", "Milestone", "Setting", "General"], description: "Category of memory." }
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
  memories: any[] = [],
  userId: string = "user-1"
): string {
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
          const readableDate = formatReadableDate(d.date);
          const readableTime = formatReadableTime(d.time);
          output += `## Reminder Created\n\n`;
          output += `- **Task:** ${d.title || 'Reminder'}\n`;
          output += `- **Date:** ${readableDate}\n`;
          output += `- **Time:** ${readableTime}\n`;
          output += `- **Notifications:** Voice & Push Enabled\n\n`;
        } else if (res.targetModule === 'Event') {
          const d = res.data || {};
          if (d.title && d.date) {
            const readableDate = formatReadableDate(d.date);
            const readableTime = d.time && d.time !== '12:00' && d.time !== 'Not specified' ? formatReadableTime(d.time) : null;
            output += `## 📅 Event Scheduled\n\n`;
            output += `- **Event Name:** ${d.title}\n`;
            output += `- **Event Date:** ${readableDate} (${d.date})\n`;
            if (readableTime) {
              output += `- **Time:** ${readableTime}\n`;
            }
            if (d.location && d.location !== 'Not specified' && d.location.trim() !== '') {
              output += `- **Location:** ${d.location}\n`;
            }
            output += `\n`;
          } else {
            output += `${res.summary}\n\n`;
          }
        } else if (res.targetModule === 'StudyTracking') {
          output += `${res.summary}\n\n`;
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
        if (res.data?.hasConflict && res.data?.followUpText) {
          output += `⚠️ **Scheduling Conflict Detected**\n\n${res.data.followUpText}\n\n`;
        } else {
          output += `⚠️ **Action Failed**\n\n${res.error || res.summary || 'I couldn\'t save that. Please try again.'}\n\n`;
        }
      }
    }

    return output.trim();
  }

  // Use PersonalContextEngine for grounded local responses
  const contextPayload = PersonalContextEngine.assemblePersonalContext(userId, userText);
  return PersonalContextEngine.generateGroundedLocalResponse(userText, contextPayload);
}

export async function chatWithNexa(
  userId: string, 
  conversationId: string, 
  userText: string,
  actionResults?: any[]
): Promise<string> {
  const history = dbService.getMessages(conversationId).slice(-6);
  const profile = dbService.getProfile(userId);

  // Authoritative Identity & Capability Check (independent of My Items availability)
  if (!actionResults || actionResults.length === 0) {
    const idCheck = classifyIdentityOrCapability(userText, history);
    if (idCheck.isMatch) {
      return generateAuthoritativeIdentityResponse(userText, profile?.full_name, { mode: 'chat', recentHistory: history });
    }
  }

  const reminders = dbService.getReminders(userId);
  const exams = dbService.getExams(userId);
  const events = dbService.getEvents(userId);
  const memories = dbService.getMemories(userId);

  // Assemble Unified Personal Context Payload (Profile + AI Memory + My Organizer)
  const contextPayload = PersonalContextEngine.assemblePersonalContext(userId, userText);

  // When actions were executed or are pending, return the verified formatted card directly
  if (actionResults && actionResults.length > 0) {
    return generateLocalFormattedResponse(userText, actionResults, reminders, exams, events, memories, userId);
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    return generateLocalFormattedResponse(userText, actionResults, reminders, exams, events, memories, userId);
  }

  const ai = getGemini();

  const contextParts: string[] = [
    `Current Date: ${new Date().toISOString().split('T')[0]}`,
    contextPayload.formattedSystemContext
  ];

  if (actionResults && actionResults.length > 0) {
    const actionLogs = actionResults.map(r => `[Module: ${r.targetModule} | Action: ${r.action} | Success: ${r.success}] ${r.summary}`).join('\n');
    contextParts.push(`[ACTION EXECUTION RESULTS FROM DATABASE]\n${actionLogs}`);
  }

  if (history.length > 0) {
    contextParts.push(`Recent Conversation History:\n${history.map(h => `${h.sender === 'user' ? 'User' : 'Xena'}: ${h.text}`).join('\n')}`);
  }

  const contextPrompt = `[UNIFIED PERSONAL CONTEXT ENGINE]\n${contextParts.join('\n\n')}\n\n[CURRENT USER MESSAGE]\n"${userText}"`;

  try {
    const response = await generateContentWithFallback(ai, {
      contents: contextPrompt,
      config: {
        maxOutputTokens: 600,
        systemInstruction: `${XENA_OFFICIAL_IDENTITY.systemPromptDefinition}

UNIFIED PERSONAL CONTEXT & TRUTHFULNESS POLICY:
1. PROFILE & IDENTITY: When asked about user name, email, university, or field of study, retrieve and state the exact authoritative profile values from [UNIFIED PERSONAL CONTEXT ENGINE]. Never claim name or school is unknown if present in profile context.
2. AI MEMORY & RELATIONSHIPS: When asked about family members, friends, or stored facts (e.g., "Who is Pauline?", "What's my mother's name?"), state the exact saved relationship or fact. Never invent age, location, or occupation not supported by saved evidence.
3. MY ORGANIZER CONTEXT: When asked about schedule, tasks, or reminders for today, tomorrow, or a specific date, summarize the exact organizer time blocks.
4. ABSENCE OF INFORMATION: If a field or relationship is missing, state politely that it is not recorded in profile or memory yet. Never invent personal details.
5. NO INTRODUCTORY FLUFF: Never start responses with generic intro phrases like "Sure!", "Of course!", "Certainly!". Start directly with clear content or Markdown headings.`
      }
    });

    const reply = response.text?.trim();
    if (reply && reply.length > 0) {
      return reply;
    }

    return generateLocalFormattedResponse(userText, actionResults, reminders, exams, events, memories, userId);
  } catch (error) {
    console.error("Gemini Chat failed, using fallback:", error);
    return generateLocalFormattedResponse(userText, actionResults, reminders, exams, events, memories, userId);
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
  const history = dbService.getMessages(conversationId).slice(-6);
  const profile = dbService.getProfile(userId);

  // Authoritative Identity & Capability Check (independent of My Items availability)
  if (!actionResults || actionResults.length === 0) {
    const idCheck = classifyIdentityOrCapability(userText, history);
    if (idCheck.isMatch) {
      const idText = generateAuthoritativeIdentityResponse(userText, profile?.full_name, { mode: 'chat', recentHistory: history });
      onChunk(idText);
      return idText;
    }
  }

  const apiKey = process.env.GEMINI_API_KEY;
  const reminders = dbService.getReminders(userId);
  const exams = dbService.getExams(userId);
  const events = dbService.getEvents(userId);
  const memories = dbService.getMemories(userId);

  // When actions were executed or are pending, stream the verified formatted card directly
  if (actionResults && actionResults.length > 0) {
    const formatted = generateLocalFormattedResponse(userText, actionResults, reminders, exams, events, memories, userId);
    onChunk(formatted);
    return formatted;
  }

  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    const text = generateLocalFormattedResponse(userText, actionResults, reminders, exams, events, memories, userId);
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

  const ai = getGemini();
  const contextPayload = PersonalContextEngine.assemblePersonalContext(userId, userText);

  const contextParts: string[] = [
    `Current Date: ${new Date().toISOString().split('T')[0]}`,
    contextPayload.formattedSystemContext
  ];

  if (actionResults && actionResults.length > 0) {
    const actionLogs = actionResults.map(r => `[Module: ${r.targetModule} | Action: ${r.action} | Success: ${r.success}] ${r.summary}`).join('\n');
    contextParts.push(`[ACTION EXECUTION RESULTS FROM DATABASE]\n${actionLogs}`);
  }

  if (history.length > 0) {
    contextParts.push(`Recent History:\n${history.map(h => `${h.sender === 'user' ? 'User' : 'Xena'}: ${h.text}`).join('\n')}`);
  }

  const contextPrompt = `[UNIFIED PERSONAL CONTEXT & MY ITEMS STATE]\n${contextParts.join('\n\n')}\n\n[CURRENT USER MESSAGE]\n"${userText}"`;

  try {
    const stream = await generateContentStreamWithFallback(ai, {
      contents: contextPrompt,
      config: {
        maxOutputTokens: 600,
        systemInstruction: XENA_OFFICIAL_IDENTITY.systemPromptDefinition
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
      const fallback = generateLocalFormattedResponse(userText, actionResults, reminders, exams, events, memories, userId);
      onChunk(fallback);
      return fallback;
    }

    return fullText;
  } catch (error) {
    console.error("Gemini Chat Stream failed, using fallback:", error);
    const fallback = generateLocalFormattedResponse(userText, actionResults, reminders, exams, events, memories, userId);
    onChunk(fallback);
    return fallback;
  }
}

/**
 * Converts Markdown-formatted assistant output or structured cards into warm, natural, human-spoken prose.
 */
export function formatTextForNaturalSpeech(text: string): string {
  if (!text || !text.trim()) return '';

  let spoken = text.trim();

  // 1. Convert structured "## Reminder Created" Markdown card into a natural human sentence
  if (/##\s*Reminder\s+Created/i.test(spoken)) {
    const taskMatch = spoken.match(/\*\*Task:\*\*\s*([^\n]+)/i);
    const dateMatch = spoken.match(/\*\*Date:\*\*\s*([^\n]+)/i);
    const timeMatch = spoken.match(/\*\*Time:\*\*\s*([^\n]+)/i);
    const task = taskMatch ? taskMatch[1].trim() : 'your task';
    const date = dateMatch ? dateMatch[1].trim() : 'today';
    const time = timeMatch ? timeMatch[1].trim().replace(/^0(\d:)/, '$1') : '';
    spoken = time
      ? `Got it! I've set a reminder for ${task} on ${date} at ${time}.`
      : `Got it! I've set a reminder for ${task} on ${date}.`;
  }

  // 2. Strip Markdown syntax cleanly while preserving natural sentence pauses
  spoken = spoken
    .replace(/^#+\s+(.+)$/gm, '$1.')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^[•\-*]\s+/gm, '')
    .replace(/^[✓✗]\s*/gm, '')
    .replace(/\|/g, ', ')
    .replace(/-{3,}/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`{1,3}([^`]+)`{1,3}/g, '$1')
    // Space out course codes (e.g., CSC305 -> C S C 305, CS-305 -> C S 305) for natural academic pronunciation
    .replace(/\b([A-Z]{2,4})-?(\d{3})\b/g, (_, letters: string, digits: string) => `${letters.split('').join(' ')} ${digits}`)
    // Naturalize time ranges (08:00 – 10:00 -> 8:00 to 10:00)
    .replace(/\b0?(\d{1,2}:\d{2})\s*[–—-]\s*0?(\d{1,2}:\d{2})\b/g, '$1 to $2')
    // Naturalize leading zero in 12-hour times (09:00 PM -> 9:00 PM)
    .replace(/\b0(\d:\d{2}\s*(?:AM|PM|am|pm))\b/g, '$1')
    // Naturalize shorthand durations (1h -> 1 hour, 2h -> 2 hours, 30m -> 30 minutes)
    .replace(/\b1h\b/g, '1 hour')
    .replace(/\b(\d+(?:\.\d+)?)h\b/g, '$1 hours')
    .replace(/\b(\d+)m\b/g, '$1 minutes')
    .replace(/\n+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\.\.+/g, '.')
    .trim();

  return spoken;
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
  tasks: any[] = [],
  userId: string = "user-1"
): string {
  // 0. Authoritative Identity & Capability Check (Conversational Voice Mode: 1-2 short spoken sentences)
  if (!actionResults || actionResults.length === 0) {
    const idCheck = classifyIdentityOrCapability(userText);
    if (idCheck.isMatch) {
      const profile = dbService.getProfile(userId);
      return formatTextForNaturalSpeech(
        generateAuthoritativeIdentityResponse(userText, profile?.full_name, { mode: 'voice' })
      );
    }
  }

  // 1. Action Results Summaries (for mutating actions or pending drafts; READ actions fall through to PersonalContextEngine for natural spoken details)
  if (actionResults && actionResults.length > 0) {
    const successful = actionResults.filter(a => a.success && a.action !== 'READ');
    if (successful.length > 0) {
      const parts: string[] = [];
      for (const res of successful) {
        if (res.data?.pending && res.summary) {
          parts.push(res.summary);
        } else if (res.targetModule === 'Reminder') {
          const d = res.data || {};
          const readableDate = formatReadableDate(d.date);
          const readableTime = formatReadableTime(d.time).replace(/^0(\d:)/, '$1');
          parts.push(`Got it! I've set a reminder to ${d.title || 'complete your task'} on ${readableDate} at ${readableTime}.`);
        } else if (res.targetModule === 'Event') {
          const d = res.data || {};
          if (d.title && d.date) {
            const readableDate = formatReadableDate(d.date);
            const readableTime = d.time && d.time !== '12:00' && d.time !== 'Not specified' ? ` at ${formatReadableTime(d.time).replace(/^0(\d:)/, '$1')}` : '';
            const locPart = d.location && d.location !== 'Not specified' ? ` in ${d.location}` : '';
            parts.push(`All set! I've added the event "${d.title}" for ${readableDate}${readableTime}${locPart}.`);
          } else {
            parts.push(formatTextForNaturalSpeech(res.summary));
          }
        } else if (res.targetModule === 'StudyTracking') {
          parts.push(formatTextForNaturalSpeech(res.summary));
        } else if (res.targetModule === 'MemoryVault') {
          parts.push(`Got it, I've saved "${res.data?.content || 'that note'}" in your Vault Memory.`);
        } else if (res.targetModule === 'Planning') {
          parts.push(formatTextForNaturalSpeech(res.summary || `I've organized your daily schedule.`));
        } else {
          parts.push(formatTextForNaturalSpeech(res.summary.replace(/^✓\s*/, '')));
        }
      }
      return parts.join(' ');
    }
  }

  // 2. PersonalContextEngine Grounded Voice Answer
  const contextPayload = PersonalContextEngine.assemblePersonalContext(userId, userText);
  const groundedResponse = PersonalContextEngine.generateGroundedLocalResponse(userText, contextPayload);

  return formatTextForNaturalSpeech(groundedResponse);
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
  if (actionResults && actionResults.length > 0) {
    const localRes = generateLocalVoiceResponse(userText, actionResults, reminders, exams, events, memories, tasks);
    if (localRes) {
      return localRes;
    }
  }

  const history = dbService.getMessages(conversationId).slice(-6); // Multi-turn conversational context for progressive expansion
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
    contextParts.push(`Recent Conversation Context:\n${history.map(h => `${h.sender === 'user' ? 'User' : 'Xena'}: ${h.text}`).join('\n')}`);
  }

  const prompt = `[CONTEXT & ACTIVE STATE]\n${contextParts.join('\n\n')}\n\n[USER SPOKEN UTTERANCE]\n"${userText}"`;

  try {
    const generatePromise = generateContentWithFallback(ai, {
      contents: prompt,
      config: {
        maxOutputTokens: 250,
        temperature: 0.2,
        systemInstruction: XENA_CONVERSATIONAL_POLICY
      }
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Fast AI Live response timeout after 6000ms")), 6000);
    });

    const response = await Promise.race([generatePromise, timeoutPromise]);
    const reply = response.text?.trim();

    if (reply && reply.length > 0) {
      // Strip markdown code fences, bolding, table bars or headings for clean speech synthesis
      const cleanReply = reply
        .replace(/#+\s+/g, '')
        .replace(/\*+/g, '')
        .replace(/\|/g, ' ')
        .replace(/-{3,}/g, '')
        .replace(/\[.*?\]\(.*?\)/g, '')
        .replace(/`{1,3}.*?`{1,3}/g, '')
        .trim();
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
  // 1. Check if custom prompt or user tasks contain scheduling constraints
  const rawQuery = customPrompt || '';
  let constraints = DailyScheduleEngine.parseTaskConstraints(rawQuery, date);

  // If no constraints from prompt, load from DB tasks/events
  if (constraints.length === 0) {
    const dbTasks = dbService.getTasks(userId).filter(t => t.date === date);
    const dbEvents = dbService.getEvents(userId).filter(e => e.date === date);
    dbTasks.forEach((t, idx) => {
      const startMin = t.time ? DailyScheduleEngine.timeStringToMinutes(t.time) : null;
      constraints.push({
        id: `db-task-${idx + 1}-${Date.now()}`,
        rawSnippet: t.title,
        title: DailyScheduleEngine.cleanTaskTitle(t.title) || t.title,
        constraintType: startMin !== null ? 'fixed_time' : 'flexible',
        fixedStartTimeStr: t.time || null,
        fixedEndTimeStr: null,
        fixedStartTimeMin: startMin,
        fixedEndTimeMin: startMin !== null ? startMin + 60 : null,
        durationMinutes: Math.round((t.duration_hours || 1.0) * 60),
        durationHours: t.duration_hours || 1.0,
        durationLabel: `${t.duration_hours || 1.0}h`,
        deadlineMin: null,
        deadlineStr: null,
        priority: (t.priority || 'medium') as any,
        isFlexible: startMin === null,
        hasExplicitDuration: !!t.duration_hours,
        hasExplicitStartTime: startMin !== null,
        originalOrder: idx
      });
    });
    dbEvents.forEach((e, idx) => {
      const startMin = e.time ? DailyScheduleEngine.timeStringToMinutes(e.time) : null;
      constraints.push({
        id: `db-event-${idx + 1}-${Date.now()}`,
        rawSnippet: e.title,
        title: DailyScheduleEngine.cleanTaskTitle(e.title) || e.title,
        constraintType: 'fixed_time',
        fixedStartTimeStr: e.time || null,
        fixedEndTimeStr: null,
        fixedStartTimeMin: startMin,
        fixedEndTimeMin: startMin !== null ? startMin + 60 : null,
        durationMinutes: 60,
        durationHours: 1.0,
        durationLabel: '1h',
        deadlineMin: null,
        deadlineStr: null,
        priority: 'high',
        isFlexible: false,
        hasExplicitDuration: false,
        hasExplicitStartTime: true,
        originalOrder: 100 + idx
      });
    });
  }

  // If still empty, use sensible defaults
  if (constraints.length === 0) {
    constraints = [
      {
        id: `default-1-${Date.now()}`,
        rawSnippet: 'Core Focus Session',
        title: 'Core Focus Session',
        constraintType: 'duration_only',
        durationMinutes: 120,
        durationHours: 2.0,
        durationLabel: '2h',
        priority: 'high',
        isFlexible: true,
        hasExplicitDuration: true,
        hasExplicitStartTime: false,
        originalOrder: 0
      },
      {
        id: `default-2-${Date.now()}`,
        rawSnippet: 'Project Assignments',
        title: 'Project Assignments',
        constraintType: 'duration_only',
        durationMinutes: 90,
        durationHours: 1.5,
        durationLabel: '1.5h',
        priority: 'medium',
        isFlexible: true,
        hasExplicitDuration: true,
        hasExplicitStartTime: false,
        originalOrder: 1
      },
      {
        id: `default-3-${Date.now()}`,
        rawSnippet: 'Review & Reflection',
        title: 'Review & Reflection',
        constraintType: 'duration_only',
        durationMinutes: 60,
        durationHours: 1.0,
        durationLabel: '1h',
        priority: 'low',
        isFlexible: true,
        hasExplicitDuration: true,
        hasExplicitStartTime: false,
        originalOrder: 2
      }
    ];
  }

  const existingEventsForDate = dbService.getEvents(userId).filter(e => e.date === date);
  const schedResult = DailyScheduleEngine.scheduleDailyPlan(constraints, existingEventsForDate, date);

  if (schedResult.timeline && schedResult.timeline.length > 0) {
    return {
      timeline: schedResult.timeline.map((item, index) => ({
        id: `gen-item-${index + 1}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        time: item.time,
        title: item.title,
        duration: item.duration,
        color: item.color || (item.priority === 'high' ? 'blue' : 'purple'),
        priority: item.priority
      })),
      suggestions: schedResult.suggestions || `Daily schedule generated for ${date}.`
    };
  }

  return {
    timeline: [
      { id: `fallback-1-${Date.now()}`, time: '08:00 – 10:00', title: 'Study Session', duration: '2h', color: 'blue' }
    ],
    suggestions: "Showing standard outline."
  };
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

// ==================== GEMINI 3.8 NEURAL TTS & GEMINI LIVE VOICE ENGINE ====================

const VALID_GEMINI_VOICES = ['Aoede', 'Kore', 'Zephyr', 'Puck', 'Fenrir', 'Charon', 'Leda', 'Orus'] as const;

export function resolveGeminiVoiceName(voicePref?: string): string {
  if (!voicePref) return 'Aoede';
  const clean = voicePref.trim();
  const exact = VALID_GEMINI_VOICES.find(v => v.toLowerCase() === clean.toLowerCase());
  if (exact) return exact;

  const lower = clean.toLowerCase();
  if (lower === 'male' || lower.includes('vektor') || lower.includes('daniel') || lower.includes('guy')) {
    return 'Puck';
  }
  if (lower.includes('deep') || lower.includes('fenrir')) {
    return 'Fenrir';
  }
  if (lower.includes('calm') || lower.includes('zephyr')) {
    return 'Zephyr';
  }
  if (lower.includes('kore') || lower.includes('clear')) {
    return 'Kore';
  }
  // Default warm, expressive female companion voice
  return 'Aoede';
}

interface CachedTtsAudio {
  audioBase64: string;
  mimeType: string;
  voiceName: string;
  spokenText: string;
  timestamp: number;
}

const ttsAudioCache = new Map<string, CachedTtsAudio>();
const MAX_TTS_CACHE_SIZE = 80;

// ==================== PRE-WARMED GEMINI LIVE SESSION POOL ====================
// Eliminates the ~750ms cold WebSocket + TLS handshake delay on every spoken turn
interface WarmLiveSessionEntry {
  session: any;
  voiceName: string;
  mode: 'tts' | 'chat';
  createdAt: number;
  inUse: boolean;
  onMessageHandler: ((msg: any) => void) | null;
  onErrorHandler: ((err: any) => void) | null;
}

const warmLivePool = new Map<string, WarmLiveSessionEntry>();
const warmConnectingPromises = new Map<string, Promise<WarmLiveSessionEntry | null>>();
const WARM_SESSION_TTL_MS = 180 * 1000; // 3 minutes

function getPoolKey(mode: 'tts' | 'chat', voiceName: string): string {
  return `${mode}:${voiceName}`;
}

async function createWarmLiveSessionEntry(mode: 'tts' | 'chat', voiceName: string): Promise<WarmLiveSessionEntry | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') return null;

  const ai = getGemini();
  const entry: WarmLiveSessionEntry = {
    session: null,
    voiceName,
    mode,
    createdAt: Date.now(),
    inUse: false,
    onMessageHandler: null,
    onErrorHandler: null
  };

  const sysInstruction = mode === 'tts'
    ? 'You are the neural voice synthesizer for Xena AI. Speak the exact text provided by the user aloud with warm, natural human intonation, realistic pacing, and friendly clarity. Do not add, omit, or alter any words.'
    : `You are Xena, a warm, intelligent, concise personal student companion.
Speak naturally with realistic human intonation and fluid conversational rhythm.
Keep spoken answers concise (1 to 3 short sentences) unless the user explicitly asks for detail.
Answer directly without introductory fluff ("Sure!", "Of course!").
Never use markdown symbols, bullet points, or robotic labels.
Use the provided [CONTEXT] accurately when answering questions about the student's schedule, exams, events, reminders, or profile, and never invent personal data.`;

  try {
    const config: any = {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName }
        }
      },
      systemInstruction: sysInstruction
    };
    if (mode === 'chat') {
      config.outputAudioTranscription = {};
    }

    const session = await ai.live.connect({
      model: 'gemini-3.8-live',
      config,
      callbacks: {
        onmessage: (msg: any) => {
          if (entry.onMessageHandler) {
            entry.onMessageHandler(msg);
          }
        },
        onerror: (err: any) => {
          const key = getPoolKey(mode, voiceName);
          if (warmLivePool.get(key) === entry) {
            warmLivePool.delete(key);
          }
          if (entry.onErrorHandler) {
            entry.onErrorHandler(err);
          }
        },
        onclose: () => {
          const key = getPoolKey(mode, voiceName);
          if (warmLivePool.get(key) === entry) {
            warmLivePool.delete(key);
          }
        }
      }
    });

    entry.session = session;
    entry.createdAt = Date.now();
    return entry;
  } catch {
    return null;
  }
}

export function prewarmGeminiLiveSessions(voicePref?: string): void {
  const voiceName = resolveGeminiVoiceName(voicePref);
  for (const mode of ['tts', 'chat'] as const) {
    const key = getPoolKey(mode, voiceName);
    const existing = warmLivePool.get(key);
    if (existing && !existing.inUse && Date.now() - existing.createdAt < WARM_SESSION_TTL_MS) {
      continue;
    }
    if (warmConnectingPromises.has(key)) continue;

    const p = createWarmLiveSessionEntry(mode, voiceName)
      .then((entry) => {
        warmConnectingPromises.delete(key);
        if (entry) {
          warmLivePool.set(key, entry);
        }
        return entry;
      })
      .catch(() => {
        warmConnectingPromises.delete(key);
        return null;
      });
    warmConnectingPromises.set(key, p);
  }
}

async function acquireLiveSession(mode: 'tts' | 'chat', voiceName: string): Promise<WarmLiveSessionEntry | null> {
  const key = getPoolKey(mode, voiceName);
  const existing = warmLivePool.get(key);

  if (existing && !existing.inUse && Date.now() - existing.createdAt < WARM_SESSION_TTL_MS && existing.session) {
    warmLivePool.delete(key);
    existing.inUse = true;
    // Immediately pre-warm replacement in background for subsequent turns
    setImmediate(() => prewarmGeminiLiveSessions(voiceName));
    return existing;
  }

  const inflight = warmConnectingPromises.get(key);
  if (inflight) {
    warmConnectingPromises.delete(key);
    const awaited = await inflight;
    if (awaited && !awaited.inUse && awaited.session) {
      warmLivePool.delete(key);
      awaited.inUse = true;
      setImmediate(() => prewarmGeminiLiveSessions(voiceName));
      return awaited;
    }
  }

  // Cold fallback connect + background prewarm for next turn
  const fresh = await createWarmLiveSessionEntry(mode, voiceName);
  if (fresh) {
    fresh.inUse = true;
    setImmediate(() => prewarmGeminiLiveSessions(voiceName));
  }
  return fresh;
}

function releaseOrCloseLiveSession(entry: WarmLiveSessionEntry | null, reusable: boolean): void {
  if (!entry) return;
  entry.onMessageHandler = null;
  entry.onErrorHandler = null;
  entry.inUse = false;

  const key = getPoolKey(entry.mode, entry.voiceName);
  if (reusable && entry.session && Date.now() - entry.createdAt < WARM_SESSION_TTL_MS && !warmLivePool.has(key)) {
    warmLivePool.set(key, entry);
  } else {
    try { entry.session?.close(); } catch {}
  }
}

// Pre-warm default Aoede sessions shortly after server module load
setTimeout(() => {
  try { prewarmGeminiLiveSessions('Aoede'); } catch {}
}, 300);

/**
 * Helper to wrap raw 16-bit 24kHz mono little-endian PCM bytes in a standard 44-byte RIFF WAV header
 */
function pcm16ToWavBase64(pcmBuffer: Buffer, sampleRate: number = 24000): string {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcmBuffer.length;
  const wavBuffer = Buffer.alloc(44 + dataSize);

  wavBuffer.write('RIFF', 0);
  wavBuffer.writeUInt32LE(36 + dataSize, 4);
  wavBuffer.write('WAVE', 8);
  wavBuffer.write('fmt ', 12);
  wavBuffer.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  wavBuffer.writeUInt16LE(1, 20);  // AudioFormat (1 = PCM)
  wavBuffer.writeUInt16LE(numChannels, 22);
  wavBuffer.writeUInt32LE(sampleRate, 24);
  wavBuffer.writeUInt32LE(byteRate, 28);
  wavBuffer.writeUInt16LE(blockAlign, 32);
  wavBuffer.writeUInt16LE(bitsPerSample, 34);
  wavBuffer.write('data', 36);
  wavBuffer.writeUInt32LE(dataSize, 40);
  pcmBuffer.copy(wavBuffer, 44);

  return wavBuffer.toString('base64');
}

/**
 * Unary Gemini Neural Text-to-Speech (returns complete 24kHz 16-bit WAV base64).
 * Uses Gemini Live (gemini-3.8-live) as primary high-quota neural synthesizer so it never hits the 10-req/day free-tier limit of flash-lite-tts.
 */
export async function synthesizeSpeechWithGemini(
  rawText: string,
  options?: { voiceName?: string; style?: string }
): Promise<{ audioBase64: string; mimeType: string; voiceName: string; spokenText: string; cached: boolean }> {
  const spokenText = formatTextForNaturalSpeech(rawText);
  const voiceName = resolveGeminiVoiceName(options?.voiceName);

  if (!spokenText) {
    throw new Error('Empty text for speech synthesis');
  }

  const cacheKey = `${voiceName}|${spokenText}`;
  const cachedItem = ttsAudioCache.get(cacheKey);
  if (cachedItem && Date.now() - cachedItem.timestamp < 30 * 60 * 1000) {
    return {
      audioBase64: cachedItem.audioBase64,
      mimeType: cachedItem.mimeType,
      voiceName: cachedItem.voiceName,
      spokenText: cachedItem.spokenText,
      cached: true
    };
  }

  const pcmChunks: Buffer[] = [];
  await streamSpeechWithGemini(
    spokenText,
    (base64Chunk) => {
      if (base64Chunk) {
        pcmChunks.push(Buffer.from(base64Chunk, 'base64'));
      }
    },
    { voiceName, style: options?.style }
  );

  if (pcmChunks.length > 0) {
    const combinedPcm = Buffer.concat(pcmChunks);
    const wavBase64 = pcm16ToWavBase64(combinedPcm, 24000);
    const result = {
      audioBase64: wavBase64,
      mimeType: 'audio/wav',
      voiceName,
      spokenText,
      cached: false
    };

    if (ttsAudioCache.size >= MAX_TTS_CACHE_SIZE) {
      const oldestKey = ttsAudioCache.keys().next().value;
      if (oldestKey) ttsAudioCache.delete(oldestKey);
    }
    ttsAudioCache.set(cacheKey, { ...result, timestamp: Date.now() });
    return result;
  }

  throw new Error('Neural TTS synthesis produced no audio');
}

/**
 * Streaming Gemini Neural Speech (yields raw 24kHz 16-bit little-endian PCM base64 chunks).
 * Uses Gemini Live (gemini-3.8-live) directly for real-time 24kHz audio without 10-req/day rate limits.
 */
export async function streamSpeechWithGemini(
  rawText: string,
  onPcmChunk: (base64Pcm: string) => void,
  options?: { voiceName?: string; style?: string; signal?: AbortSignal }
): Promise<{ spokenText: string; voiceName: string; chunksSent: number }> {
  const spokenText = formatTextForNaturalSpeech(rawText);
  const voiceName = resolveGeminiVoiceName(options?.voiceName);

  if (!spokenText || options?.signal?.aborted) {
    return { spokenText: '', voiceName, chunksSent: 0 };
  }

  let chunksSent = 0;

  try {
    await new Promise<void>(async (resolve, reject) => {
      let settled = false;
      let sessionEntry: WarmLiveSessionEntry | null = null;
      let turnCompletedCleanly = false;

      const finish = () => {
        if (!settled) {
          settled = true;
          releaseOrCloseLiveSession(sessionEntry, turnCompletedCleanly && !options?.signal?.aborted);
          resolve();
        }
      };

      const timeoutId = setTimeout(finish, 7500);

      if (options?.signal) {
        options.signal.addEventListener('abort', () => {
          clearTimeout(timeoutId);
          finish();
        }, { once: true });
      }

      try {
        sessionEntry = await acquireLiveSession('tts', voiceName);
        if (!sessionEntry || !sessionEntry.session || options?.signal?.aborted) {
          clearTimeout(timeoutId);
          finish();
          return;
        }

        sessionEntry.onMessageHandler = (message: any) => {
          if (settled || options?.signal?.aborted) return;
          const parts = message.serverContent?.modelTurn?.parts;
          if (parts && Array.isArray(parts)) {
            for (const part of parts) {
              const data = part?.inlineData?.data;
              if (data) {
                chunksSent++;
                onPcmChunk(data);
              }
            }
          }
          if (message.serverContent?.turnComplete) {
            turnCompletedCleanly = true;
            clearTimeout(timeoutId);
            finish();
          }
        };

        sessionEntry.onErrorHandler = (err: any) => {
          clearTimeout(timeoutId);
          if (!settled) {
            settled = true;
            releaseOrCloseLiveSession(sessionEntry, false);
            reject(err);
          }
        };

        sessionEntry.session.sendClientContent({
          turns: [{ role: 'user', parts: [{ text: `Read this aloud verbatim: ${spokenText}` }] }],
          turnComplete: true
        });
      } catch (connectErr) {
        clearTimeout(timeoutId);
        if (!settled) {
          settled = true;
          releaseOrCloseLiveSession(sessionEntry, false);
          reject(connectErr);
        }
      }
    });
  } catch {
    // Graceful silent fallback if Live session fails
  }

  return { spokenText, voiceName, chunksSent };
}

/**
 * Real-Time Gemini Live (gemini-3.8-live) Conversational Audio + Transcript Turn Streamer
 * Uses pre-warmed Gemini Live sessions and fast local grounding for sub-second response startup.
 */
export async function streamGeminiLiveTurn(
  userId: string,
  conversationId: string,
  userText: string,
  actionResults: any[] | undefined,
  voicePref: string | undefined,
  callbacks: {
    onTranscriptDelta?: (delta: string) => void;
    onAudioChunk?: (base64Pcm: string) => void;
    signal?: AbortSignal;
  }
): Promise<string> {
  const voiceName = resolveGeminiVoiceName(voicePref);
  const profile = dbService.getProfile(userId);
  const userName = profile?.full_name ? profile.full_name.split(' ')[0] : 'there';

  if (callbacks.signal?.aborted) {
    return '';
  }

  // 1. Fast Path A: Authoritative Identity/Capability Inquiry FIRST, then Simple Greeting (<5ms text + immediate warm neural audio)
  const recentHistory = dbService.getMessages(conversationId).slice(-4);
  const identityCheck = classifyIdentityOrCapability(userText, recentHistory);
  if ((!actionResults || actionResults.length === 0) && identityCheck.isMatch) {
    const idReply = formatTextForNaturalSpeech(
      generateAuthoritativeIdentityResponse(userText, profile?.full_name, { mode: 'voice', recentHistory })
    );
    if (callbacks.onTranscriptDelta && !callbacks.signal?.aborted) {
      callbacks.onTranscriptDelta(idReply);
    }
    if (callbacks.onAudioChunk && !callbacks.signal?.aborted) {
      await streamSpeechWithGemini(idReply, callbacks.onAudioChunk, { voiceName, signal: callbacks.signal });
    }
    return idReply;
  }

  if ((!actionResults || actionResults.length === 0) && isSimpleGreeting(userText)) {
    const fastGreeting = generateConversationalResponse(userText, profile?.full_name);
    if (callbacks.onTranscriptDelta && !callbacks.signal?.aborted) {
      callbacks.onTranscriptDelta(fastGreeting);
    }
    if (callbacks.onAudioChunk && !callbacks.signal?.aborted) {
      await streamSpeechWithGemini(fastGreeting, callbacks.onAudioChunk, { voiceName, signal: callbacks.signal });
    }
    return fastGreeting;
  }

  // 2. Fast Path B: Current Clock Time / Today's Date Direct Answer (<5ms text + immediate warm neural audio)
  const lowerTrim = userText.toLowerCase().trim();
  if (/^(what\s+time\s+is\s+it|what's\s+the\s+time|tell\s+me\s+the\s+time|current\s+time|what\s+is\s+the\s+time)\b/i.test(lowerTrim)) {
    const nowTime = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const timeReply = `It is currently ${nowTime}.`;
    if (callbacks.onTranscriptDelta && !callbacks.signal?.aborted) {
      callbacks.onTranscriptDelta(timeReply);
    }
    if (callbacks.onAudioChunk && !callbacks.signal?.aborted) {
      await streamSpeechWithGemini(timeReply, callbacks.onAudioChunk, { voiceName, signal: callbacks.signal });
    }
    return timeReply;
  }

  // 3. Fast Path C: Action Confirmations (Reminders, Events, Study Tracking, Planning, Vault)
  if (actionResults && actionResults.length > 0) {
    const reminders = dbService.getReminders(userId);
    const exams = dbService.getExams(userId);
    const events = dbService.getEvents(userId);
    const memories = dbService.getMemories(userId);
    const tasks = dbService.getTasks(userId);
    const spokenConfirmation = generateLocalVoiceResponse(userText, actionResults, reminders, exams, events, memories, tasks, userId);

    if (spokenConfirmation) {
      if (callbacks.onTranscriptDelta && !callbacks.signal?.aborted) {
        callbacks.onTranscriptDelta(spokenConfirmation);
      }
      if (callbacks.onAudioChunk && !callbacks.signal?.aborted) {
        await streamSpeechWithGemini(spokenConfirmation, callbacks.onAudioChunk, { voiceName, signal: callbacks.signal });
      }
      return spokenConfirmation;
    }
  }

  // 4. Assemble Personal Context (My Items, Profile, Vault, Recent History)
  const contextPayload = PersonalContextEngine.assemblePersonalContext(userId, userText);

  // Fast Path D: If this is a direct My Items / Profile / Relationship / Saved Fact lookup where PersonalContextEngine
  // has a deterministic, grounded answer (e.g. "What is my next exam?", "Do I have an event tomorrow?", "What reminders do I have?"),
  // emit the grounded transcript immediately and stream via warm neural TTS!
  if (contextPayload.requestCategory !== 'GENERAL') {
    const grounded = PersonalContextEngine.generateGroundedLocalResponse(userText, contextPayload);
    if (grounded && !grounded.includes("I'm here to help you stay organized")) {
      const cleanGrounded = formatTextForNaturalSpeech(grounded);
      if (callbacks.onTranscriptDelta && !callbacks.signal?.aborted) {
        callbacks.onTranscriptDelta(cleanGrounded);
      }
      if (callbacks.onAudioChunk && !callbacks.signal?.aborted) {
        await streamSpeechWithGemini(cleanGrounded, callbacks.onAudioChunk, { voiceName, signal: callbacks.signal });
      }
      return cleanGrounded;
    }
  }

  // 5. Pre-Warmed Native Gemini Live Conversational Turn (for open-ended conversation, jokes, explanations, advice)
  const history = dbService.getMessages(conversationId).slice(-4);
  const historyContext = history.length > 0
    ? `\n[Recent Conversation]\n${history.map(h => `${h.sender === 'user' ? 'User' : 'Xena'}: ${h.text}`).join('\n')}`
    : '';

  const turnPromptWithContext = `[Student Name: ${userName} | Date: ${new Date().toISOString().split('T')[0]}]\n${contextPayload.formattedSystemContext}${historyContext}\n\n[User Spoken Utterance — Reply in 1 to 3 concise, natural spoken sentences with no markdown]:\n${userText}`;

  let fullTranscript = '';
  let audioChunksCount = 0;

  try {
    await new Promise<void>(async (resolve, reject) => {
      let settled = false;
      let sessionEntry: WarmLiveSessionEntry | null = null;
      let turnCompletedCleanly = false;

      const finish = () => {
        if (!settled) {
          settled = true;
          releaseOrCloseLiveSession(sessionEntry, turnCompletedCleanly && !callbacks.signal?.aborted);
          resolve();
        }
      };

      const timeoutId = setTimeout(() => {
        if (!settled) {
          settled = true;
          releaseOrCloseLiveSession(sessionEntry, false);
          reject(new Error('Gemini Live turn timeout'));
        }
      }, 8000);

      if (callbacks.signal) {
        callbacks.signal.addEventListener('abort', () => {
          clearTimeout(timeoutId);
          finish();
        }, { once: true });
      }

      try {
        sessionEntry = await acquireLiveSession('chat', voiceName);
        if (!sessionEntry || !sessionEntry.session || callbacks.signal?.aborted) {
          clearTimeout(timeoutId);
          finish();
          return;
        }

        sessionEntry.onMessageHandler = (message: any) => {
          if (settled || callbacks.signal?.aborted) return;

          const parts = message.serverContent?.modelTurn?.parts;
          if (parts && Array.isArray(parts) && callbacks.onAudioChunk) {
            for (const part of parts) {
              const audio = part?.inlineData?.data;
              if (audio) {
                audioChunksCount++;
                callbacks.onAudioChunk(audio);
              }
            }
          }

          const transcriptDelta = message.serverContent?.outputTranscription?.text;
          if (transcriptDelta) {
            fullTranscript += transcriptDelta;
            if (callbacks.onTranscriptDelta) {
              callbacks.onTranscriptDelta(transcriptDelta);
            }
          }

          if (message.serverContent?.turnComplete) {
            turnCompletedCleanly = true;
            clearTimeout(timeoutId);
            finish();
          }
        };

        sessionEntry.onErrorHandler = (err: any) => {
          clearTimeout(timeoutId);
          if (!settled) {
            settled = true;
            releaseOrCloseLiveSession(sessionEntry, false);
            reject(err);
          }
        };

        sessionEntry.session.sendClientContent({
          turns: [{ role: 'user', parts: [{ text: turnPromptWithContext }] }],
          turnComplete: true
        });
      } catch (connectErr) {
        clearTimeout(timeoutId);
        if (!settled) {
          settled = true;
          releaseOrCloseLiveSession(sessionEntry, false);
          reject(connectErr);
        }
      }
    });

    const cleanTranscript = fullTranscript.trim();
    if (cleanTranscript || audioChunksCount > 0) {
      return cleanTranscript || 'I am here and listening. How else can I help?';
    }
  } catch (liveErr: any) {
    if (callbacks.signal?.aborted) return '';
    // CRITICAL DUPLICATE PREVENTION: If partial audio or transcript was already emitted on the stream,
    // do NOT run the fallback generator a second time!
    if (audioChunksCount > 0 || fullTranscript.trim().length > 0) {
      return fullTranscript.trim();
    }
    console.warn('[GEMINI_LIVE_FALLBACK] Falling back to chatWithXenaLive + Neural TTS stream:', liveErr?.message);
  }

  if (callbacks.signal?.aborted) return '';

  // Fallback only if zero audio/transcript was emitted above
  const fallbackReply = await chatWithXenaLive(userId, conversationId, userText, actionResults);
  const cleanReply = formatTextForNaturalSpeech(fallbackReply);
  if (callbacks.onTranscriptDelta && !callbacks.signal?.aborted) {
    callbacks.onTranscriptDelta(cleanReply);
  }
  if (callbacks.onAudioChunk && !callbacks.signal?.aborted) {
    await streamSpeechWithGemini(cleanReply, callbacks.onAudioChunk, { voiceName, signal: callbacks.signal });
  }
  return cleanReply;
}


