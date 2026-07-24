import { GoogleGenAI, Type } from "@google/genai";
import { dbService } from "./db.js";
import { IntentClassification } from "../src/types.js";

// Helper to safely get the API key
function getGeminiApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === "MY_GEMINI_API_KEY") {
    // Return a fallback or throw. Let's throw a helpful warning during active dev
    console.warn("Warning: GEMINI_API_KEY environment variable is not set or is set to placeholder.");
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
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    return {
      intent: 'chat',
      explanation: 'Gemini API key is not configured yet. Defaulting to general assistant chat.'
    };
  }

  const ai = getGemini();

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: `Classify the following user message: "${text}"`,
      config: {
        systemInstruction: `You are NEXA AI's command classifier.
Analyze the user request and classify it into one of the following intents:
- 'reminder': For creating simple reminders, notifications, or "remind me to..."
- 'planning': For scheduling a day, organizing tasks, generating timelines or weekly tasks.
- 'study': For exam preparation, tracking an exam, scheduling study hours, exam countdowns.
- 'event': For meetings, church, conferences, appointments, or scheduled events.
- 'chat': For generic statements, greetings, answering questions, general talk, or retrieval.

For 'reminder', 'planning', 'study', and 'event', extract any fields such as title, course, date (return in YYYY-MM-DD, assume today is 2025-05-20), time (return in HH:MM), priority (low, medium, or high), difficulty (low, medium, or high), location, description.
Provide a concise and friendly, human-centric 'explanation' about what you parsed.`,
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
                title: { type: Type.STRING, description: "The title of the reminder, task, or event." },
                date: { type: Type.STRING, description: "Date formatted as YYYY-MM-DD." },
                time: { type: Type.STRING, description: "Time formatted as HH:MM." },
                course: { type: Type.STRING, description: "Course name or subject for study tracking." },
                difficulty: { type: Type.STRING, enum: ["low", "medium", "high"], description: "Difficulty level." },
                priority: { type: Type.STRING, enum: ["low", "medium", "high"], description: "Priority level." },
                location: { type: Type.STRING, description: "Location of the event." },
                description: { type: Type.STRING, description: "Detailed description of the event or task." }
              }
            },
            explanation: {
              type: Type.STRING,
              description: "A short, friendly message explaining what NEXA parsed and is doing (e.g. 'I will schedule an exam tracking for you')."
            }
          },
          required: ["intent", "explanation"]
        }
      }
    });

    const resultText = response.text || "{}";
    return JSON.parse(resultText) as IntentClassification;
  } catch (error) {
    console.error("Intent routing failed:", error);
    return {
      intent: 'chat',
      explanation: 'General chat response due to error: ' + (error as Error).message
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
      model: "gemini-3.5-flash",
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
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    return "Hello! I am **NEXA AI**, your personal digital assistant. To activate my brain, please configure a real `GEMINI_API_KEY` in the **Settings > Secrets** panel! Currently, I am running in Offline Mode, but you can still fully navigate, add items manually, and test the exact UI layout. How can I help you today?";
  }

  const ai = getGemini();

  // Retrieve user context to ground the response
  const reminders = dbService.getReminders(userId);
  const exams = dbService.getExams(userId);
  const events = dbService.getEvents(userId);
  const memories = dbService.getMemories(userId);
  const history = dbService.getMessages(conversationId).slice(-10); // Last 10 messages for context

  const contextPrompt = `
[USER CONTEXT]
User Name: Alex T. (steevezali@gmail.com)
Current Date: 2025-05-20 (Tuesday)

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
      model: "gemini-3.5-flash",
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
    return "I ran into an issue communicating with my AI core. Please check your network connection or API Key.";
  }
}

/**
 * Generate AI suggested Planning timeline
 */
export async function generateAILinePlanning(userId: string, date: string, customPrompt?: string): Promise<{ timeline: any[], suggestions: string }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    // Return high quality fallback
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
        ? `Offline Mode fallback. Simulated schedule for: "${customPrompt}"`
        : "Offline Mode: Showing optimized default schedule for study-heavy days."
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
      model: "gemini-3.5-flash",
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
      suggestions: "Failed to generate customized timeline. Showing standard outline."
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
    // High-quality template-based fallback
    let content = description ? description.trim() : title.trim();
    let reformulated = "";
    if (description && description.trim()) {
      const titleLower = title.toLowerCase().trim();
      const descLower = description.toLowerCase().trim();
      if (descLower.includes(titleLower)) {
        reformulated = description.trim();
      } else {
        // Formulate a natural helper sentence
        reformulated = `it's time to focus on "${title.trim()}". ${description.trim()}`;
      }
    } else {
      reformulated = `it's time for your scheduled task: "${title.trim()}"`;
    }

    // Ensure it ends nicely
    if (!/[.!?]$/.test(reformulated)) {
      reformulated += ".";
    }

    return `${nameSalutation} This is NEXA AI. I'm reminding you that ${reformulated}`;
  }

  const ai = getGemini();
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
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

