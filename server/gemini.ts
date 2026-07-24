import { GoogleGenAI, Type } from "@google/genai";
import { dbService } from "./db.js";
import { IntentClassification } from "../src/types.js";
import { extractTimeFromText, normalizeTimeString } from "../src/utils/timeUtils.js";

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
 * Route User Intent: Simple & robust intent classification using Gemini JSON schema.
 */
export async function routeUserIntent(text: string): Promise<IntentClassification> {
  const apiKey = process.env.GEMINI_API_KEY;
  const todayStr = new Date().toISOString().split('T')[0];

  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    // Offline mode rule-based parsing fallback
    const lower = text.toLowerCase().trim();
    if (
      lower.includes('remind me') ||
      lower.includes('i have to') ||
      lower.includes('i must') ||
      lower.includes('i need to') ||
      lower.includes('interview at') ||
      lower.includes('pay my rent') ||
      lower.includes('submit my') ||
      lower.includes('reminder')
    ) {
      // Clean hesitations
      let cleaned = text.replace(/\b(um+|uh+|err+|ah+|like|you know|please)\b/gi, '').replace(/\s+/g, ' ').trim();
      let title = cleaned.replace(/^remind me (to|about)?/i, '').replace(/^i have to/i, '').replace(/^i must/i, '').trim();
      const parsedTime = extractTimeFromText(text) || '09:00';
      return {
        intent: 'reminder',
        extractedData: {
          title: title || cleaned,
          date: todayStr,
          time: parsedTime,
          repeat: lower.includes('every monday') ? 'weekly' : lower.includes('first day of every month') ? 'monthly' : 'none',
          priority: 'medium',
          voiceReminder: true
        },
        explanation: `Parsed reminder "${title || cleaned}" for ${parsedTime} using NEXA engine.`
      };
    }

    return {
      intent: 'chat',
      explanation: 'Defaulting to general assistant chat in local mode.'
    };
  }

  const ai = getGemini();

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: `Classify and extract parameters from user message: "${text}"`,
      config: {
        systemInstruction: `You are NEXA AI's command classifier and parameter extractor.
Current date: ${todayStr}.
Analyze the user request and classify it into one of: 'reminder', 'planning', 'study', 'event', 'chat'.

CRITICAL RULES FOR REMINDER CREATION ('reminder'):
1. VOICE & TRANSCRIPTION CLEANING: If input is a voice transcript or spoken text with hesitations ("um", "uh", "like", "you know", "err", "ah"), FIRST clean it up and extract the clean intended action.
2. DATES & REPEAT COMPUTATION:
   - Calculate dates relative to today (${todayStr}).
   - "tomorrow" = today + 1 day (YYYY-MM-DD).
   - "next Friday" = upcoming Friday (YYYY-MM-DD).
   - "every Monday" = repeat: "weekly", set date to next Monday.
   - "first day of every month" = repeat: "monthly", set date to YYYY-MM-01.
3. TIME EXTRACTING & VALIDATION (CRITICAL):
   - "title" must be concise and cleaned (e.g. "Call mother", "Submit dissertation", "Attend church", "Pay rent").
   - "date" must be formatted as YYYY-MM-DD.
   - "time" MUST be formatted as 24-hour HH:MM (e.g., "08:00", "14:30", "18:00", "20:00").
   - EXPLICIT TIME EXTRACTION: Carefully extract the exact time specified in English or French (e.g., "à 18h30" -> "18:30", "at 3 pm" -> "15:00", "à 15h" -> "15:00", "at 8:15 AM" -> "08:15", "à 20h" -> "20:00"). NEVER default to 09:00 if an explicit time was mentioned!
   - If title or date is completely missing or ambiguous, list the missing field in "missingFields" and write a clarification question in "clarificationPrompt" (e.g. "What time should I remind you?").`,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            intent: {
              type: Type.STRING,
              enum: ["reminder", "planning", "study", "event", "chat"],
              description: "The classified user intention."
            },
            extractedData: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING, description: "Cleaned title of the reminder, task, or event." },
                date: { type: Type.STRING, description: "Date formatted as YYYY-MM-DD." },
                time: { type: Type.STRING, description: "Exact time formatted as 24-hour HH:MM." },
                course: { type: Type.STRING, description: "Course name or subject for study tracking." },
                difficulty: { type: Type.STRING, enum: ["low", "medium", "high"], description: "Difficulty level." },
                priority: { type: Type.STRING, enum: ["low", "medium", "high"], description: "Priority level." },
                repeat: { type: Type.STRING, enum: ["none", "daily", "weekly", "monthly"], description: "Recurrence frequency." },
                voiceReminder: { type: Type.BOOLEAN, description: "Whether voice alert is enabled." },
                location: { type: Type.STRING, description: "Location of the event." },
                description: { type: Type.STRING, description: "Detailed description of the event or task." },
                missingFields: { type: Type.ARRAY, items: { type: Type.STRING } },
                clarificationPrompt: { type: Type.STRING, description: "Question to ask user if details are missing." }
              }
            },
            explanation: {
              type: Type.STRING,
              description: "A short, friendly message explaining what NEXA parsed and is doing."
            }
          },
          required: ["intent", "explanation"]
        }
      }
    });

    const resultText = response.text || "{}";
    const classification = JSON.parse(resultText) as IntentClassification;

    // Post-processing safeguard: ensure explicit times in user text override/normalize data.time
    if (classification.extractedData) {
      const explicitTimeInText = extractTimeFromText(text);
      if (explicitTimeInText) {
        classification.extractedData.time = explicitTimeInText;
      } else if (classification.extractedData.time) {
        classification.extractedData.time = normalizeTimeString(classification.extractedData.time) || classification.extractedData.time;
      }
    }

    return classification;
  } catch (error) {
    console.error("Intent routing failed:", error);
    return {
      intent: 'chat',
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
        systemInstruction: `You are NEXA's memory logger.
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
  userText: string
): Promise<string> {
  const reminders = dbService.getReminders(userId);
  const exams = dbService.getExams(userId);
  const events = dbService.getEvents(userId);
  const memories = dbService.getMemories(userId);
  const history = dbService.getMessages(conversationId).slice(-10);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
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
    return `Hello! I am **NEXA AI**. I can help you manage reminders, track study schedules, and plan your days. What would you like to do?`;
  }

  const ai = getGemini();

  const contextPrompt = `
[USER CONTEXT]
User Name: Alex T. (steevezali@gmail.com)
Current Date: ${new Date().toISOString().split('T')[0]}

Active Reminders:
${reminders.map(r => `- ${r.title} at ${r.date} ${r.time} (Priority: ${r.priority})`).join('\n')}

Tracked Exams & Plans:
${exams.map(e => `- ${e.course} on ${e.exam_date} (Difficulty: ${e.difficulty}, Progress: ${e.progress}%)`).join('\n')}

Upcoming Events:
${events.map(ev => `- ${ev.title} on ${ev.date} at ${ev.time} at ${ev.location}`).join('\n')}

AI Memories saved for User:
${memories.map(m => `- ${m.text} (Category: ${m.category})`).join('\n')}

Previous Conversation:
${history.map(h => `${h.sender === 'user' ? 'User' : 'Assistant'}: ${h.text}`).join('\n')}
`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: `${contextPrompt}\n\nUser Message: "${userText}"`,
      config: {
        systemInstruction: `You are NEXA AI, an Apple Intelligence/Notion style premium AI assistant.
Keep your answers elegant, clean, concise, and helpful. Use markdown list formats and bold highlighting.
Always address the user's explicit question, referencing their context (Reminders, Events, Exams, Memories) naturally.
Do not invent facts outside of their context unless giving suggestions.
If they asked to set something and you already parsed it, confirm you have completed the request beautifully.`
      }
    });

    return response.text || "I apologize, I could not generate a response. Please try again.";
  } catch (error) {
    console.error("Gemini Chat failed:", error);
    const lower = userText.toLowerCase();
    if (lower.includes('remind') || lower.includes('reminder')) {
      if (reminders.length > 0) {
        return `Here are your current active reminders:\n\n` + reminders.map(r => `• **${r.title}** scheduled for ${r.date} at ${r.time}`).join('\n');
      }
      return "You have no active reminders right now. What would you like me to remind you about?";
    }
    if (lower.includes('exam') || lower.includes('study')) {
      if (exams.length > 0) {
        return `Here are your tracked exams:\n\n` + exams.map(e => `• **${e.course}** on ${e.exam_date} (${e.progress}% ready)`).join('\n');
      }
      return "No study goals recorded yet.";
    }
    return `Hello! I'm NEXA AI. I've noted your input and updated your assistant context. How else can I assist you with your schedule or tasks?`;
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
  const apiKey = process.env.GEMINI_API_KEY;
  const nameSalutation = userName && userName.trim() ? `Hello ${userName.trim()}.` : "Hello.";
  const defaultText = `${nameSalutation} This is NEXA AI. I'm reminding you that you have scheduled "${title}" now.${description ? ' ' + description : ''}`;

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

    return `${nameSalutation} This is NEXA AI. I'm reminding you that ${reformulated}`;
  }

  const ai = getGemini();
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: `Reminder Title: "${title}"\nReminder Description: "${description || 'No description provided'}"`,
      config: {
        systemInstruction: `You are NEXA AI's voice synthesis helper.
Your job is to reformulate the reminder title and description into a single short, natural, friendly, and concise spoken sentence.
The user's greeting is handled separately. You only need to generate the "{reformulated reminder}" part, which will fit into this structure:
"Hello {UserName}. This is NEXA AI. I'm reminding you that {your_output_goes_here}"

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
      return `${nameSalutation} This is NEXA AI. I'm reminding you that ${cleanGenerated}`;
    }
  } catch (err) {
    console.error("Gemini reformulation failed:", err);
  }
  return defaultText;
}

