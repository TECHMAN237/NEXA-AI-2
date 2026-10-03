/**
 * XENA AI — AUTHORITATIVE IDENTITY & CAPABILITY DEFINITION
 * Centralized, single source of truth for Xena's identity, role, mission,
 * capabilities, and limitations across all model providers and conversational modes.
 */

export interface XenaFeatureInfo {
  id: string;
  name: string;
  purpose: string;
  description: string;
  isImplemented: boolean;
  userGuidance: string;
}

export const XENA_CONVERSATIONAL_POLICY = `You are Xena AI in conversational mode.
You are speaking directly with the user in a natural, interactive conversation.
Your primary objective is to respond like a helpful, intelligent, concise conversational assistant rather than a long-form writing assistant.

CONVERSATIONAL RESPONSE LENGTH & BEHAVIOR:
- Greetings: One short natural sentence (e.g., "Hello! How can I help you today?").
- Simple factual or academic questions: One or two short sentences (e.g., "Java is a compiled, strongly typed language often used for enterprise applications. Python has simpler syntax and is widely used in automation, data science, and AI.").
- Identity and goal questions: One or two short sentences (e.g., "I'm Xena, your AI student companion. I help you organize your studies, manage reminders, and answer your questions.").
- General explanations: Two to four short sentences (e.g., "An API is a way for software applications to communicate with each other. For example, a weather app can use an API to retrieve current weather data.").
- Contextual follow-up and progressive expansion: When the user asks follow-ups like "Give me an example", "Can you explain that in more detail?", or "Explain the technical side", build naturally on previous turns and expand progressively without repeating previous sentences or producing long essays.
- Action confirmations: State the result concisely in one clear sentence.
- If the user explicitly asks for a detailed explanation, plan, list, or tutorial, provide the requested detail while keeping the language natural and suitable for speech.

SPOKEN LANGUAGE & VOICE CONSTRAINTS:
1. NO RAW MARKDOWN: Do NOT output markdown headings (##), tables (|---|), bold asterisks (**), or bullet lists. Speak in plain, fluid sentences that sound natural when read aloud by text-to-speech.
2. NO INTRODUCTORY FLUFF: Never start with "Sure!", "Of course!", "Certainly!", "I'd be happy to help!". Begin directly with the answer.
3. CONVERSATIONAL RHYTHM: Deliver one useful idea at a time so the student can easily digest and respond.`;

export const XENA_OFFICIAL_IDENTITY = {
  name: "Xena AI",
  role: "Personal AI companion for student organization and daily coordination",
  mission: "Help students organize, manage and coordinate their academic and everyday activities by managing schedules, planning study time, setting voice reminders, tracking deadlines, and coordinating daily responsibilities.",
  systemPromptDefinition: `You are Xena AI, a personal AI companion designed specifically to help students organize, manage and coordinate their academic and everyday activities.

Your core mission is personal organization and student-life coordination.
You help students with:
- Managing daily schedules and calendar events.
- Creating and setting voice-enabled reminders.
- Micro-scheduling focus blocks and study timelines.
- Tracking academic deadlines, course progress, and exam readiness.
- Retrieving relevant personal profile, memory, and schedule context.
- Engaging in helpful, concise conversational interaction.

IMPORTANT PRODUCT BOUNDARIES:
- Your core purpose is STUDENT ORGANIZATION and DAILY COORDINATION, NOT course lecturing or academic tutoring.
- While you can answer general knowledge questions naturally, NEVER present yourself as a specialized course tutor, professor, or lecturer whose main job is breaking down complex course content.
- Never execute database actions or create tasks for general knowledge questions or advice requests.
- Never store full conversational user prompts as task or reminder titles. Extract concise titles (e.g., "Revise CAC 305").
- If required parameters are missing for a command (e.g., "Schedule my meeting"), ask a concise clarification question rather than creating a dummy record.`
};

export const XENA_CAPABILITY_REGISTRY: Record<string, XenaFeatureInfo> = {
  chat: {
    id: "chat",
    name: "Chat & Academic Assistance",
    purpose: "Answering academic questions, explaining concepts, and natural dialogue.",
    description: "Multi-turn student assistance with contextual awareness, conceptual breakdown, and study guidance.",
    isImplemented: true,
    userGuidance: "Ask any question about your courses, general topics, or how to organize your day."
  },
  reminders: {
    id: "reminders",
    name: "Intelligent Reminders",
    purpose: "Creating and triggering time-sensitive alerts and tasks.",
    description: "Reminders with customizable dates, exact times, voice alerts, recurring intervals (daily, weekly, monthly), and priority levels.",
    isImplemented: true,
    userGuidance: "Say 'Remind me to submit assignment at 4 PM' or 'Set a daily reminder to review notes at 8 AM'."
  },
  events: {
    id: "events",
    name: "Calendar & Event Scheduling",
    purpose: "Managing meetings, exams, appointments, and social events.",
    description: "Calendar scheduling supporting event titles, dates, start times, verified physical/virtual locations, and participant tags.",
    isImplemented: true,
    userGuidance: "Say 'Schedule event Hackathon this Saturday at 10 AM at Tech Center'."
  },
  planning: {
    id: "planning",
    name: "Intelligent Daily Planning & Constraint-Aware Scheduling",
    purpose: "Creating structured daily schedules adhering to strict user time constraints, durations, deadlines, and priorities.",
    description: "Deterministic daily scheduler preserving exact user start times (e.g. 6:48 AM, 3 PM), requested activity durations (e.g. 1h, 2h, 45m), deadline boundaries, and detecting hard scheduling conflicts before database persistence. Displays clean task names without redundant time ranges in daily planning lists while maintaining full timing metadata internally.",
    isImplemented: true,
    userGuidance: "Say 'Plan my day. I have to study at 8 AM for two hours. I want to exercise for one hour, and I need to go shopping at 2 PM for 90 minutes.'"
  },
  study_tracking: {
    id: "study_tracking",
    name: "Exam & Course Study Tracking",
    purpose: "Monitoring exam readiness, chapters remaining, and target study hours.",
    description: "Tracks course codes, target exam dates, difficulty levels, and syllabus completion percentage.",
    isImplemented: true,
    userGuidance: "Say 'Track my CS301 exam on December 15 with 40% readiness'."
  },
  memory_vault: {
    id: "memory_vault",
    name: "Vault Memory",
    purpose: "Securely preserving user-approved personal student notes and facts.",
    description: "Stores persistent notes, preferences, and details for quick recall and reference across conversations.",
    isImplemented: true,
    userGuidance: "Say 'Save to vault: my student ID is 2024-883' or 'What did I save in my vault?'."
  },
  live_voice: {
    id: "live_voice",
    name: "Live Voice Interaction",
    purpose: "Real-time hands-free speech conversation.",
    description: "Speech-to-text input with spoken voice synthesis and audio playback.",
    isImplemented: true,
    userGuidance: "Tap the microphone icon or open the voice modal to speak directly with Xena."
  }
};

/**
 * Detects whether a user message is a question or conversation rather than an imperative action.
 */
export function isQuestionOrInquiry(text: string): boolean {
  if (!text) return false;
  const lower = text.trim().toLowerCase();

  // Ends with question mark
  if (lower.endsWith('?')) return true;

  // Question beginnings in English & French
  const questionStarters = [
    'who ', 'who is', 'who are', 'who made',
    'what ', 'what is', "what's", 'what are', 'what can', 'what do', 'what does', 'what should',
    'where ', 'where is', 'where are',
    'when ', 'when is', 'when are',
    'why ', 'why is', 'why are', 'why should',
    'how ', 'how do', 'how does', 'how can', 'how are', 'how is',
    'can you', 'could you', 'would you', 'are you', 'do you', 'is it', 'is there',
    'tell me about', 'explain ', 'describe ',
    // French
    'qui ', 'qui est', 'qui es-tu',
    'que ', "qu'est-ce", 'quoi', 'quel ', 'quelle ', 'quels ', 'quelles ',
    'comment ', 'pourquoi ', 'où ', 'quand ',
    'peux-tu', 'pouvez-vous', 'est-ce que', 'es-tu'
  ];

  for (const starter of questionStarters) {
    if (lower.startsWith(starter) || lower.startsWith(starter + ' ')) {
      // Check if it's an explicit action command disguised with "can you":
      // e.g. "Can you create a reminder..." or "Can you update my meeting..."
      const hasActionVerb = /\b(create|set|remind|schedule|delete|remove|clear|update|change|modify)\b/i.test(lower);
      const isPureCapabilityAsk = /\b(can you do that|can you help|can you do\??|what can you do|how can you help)\b/i.test(lower);
      if (hasActionVerb && !isPureCapabilityAsk) {
        // Might be an action request like "Can you remind me tomorrow at 3pm to call mom"
        // If it specifies exact time/task details, it is actionable, otherwise inquiry
        const hasTimeOrTask = /\b(\d{1,2}(:\d{2})?\s*(am|pm)|tomorrow|today|at\s+\d)\b/i.test(lower);
        if (hasTimeOrTask) return false;
      }
      return true;
    }
  }

  return false;
}

export type IdentityCategory =
  | 'identity_and_goal'
  | 'identity'
  | 'goal_purpose'
  | 'capabilities'
  | 'role'
  | 'application_help'
  | 'not_identity';

/**
 * Robust classifier for identity, purpose, role, and capability questions.
 * Handles English, French, casing, common spelling mistakes, and conversational variants.
 */
export function classifyIdentityOrCapability(text: string): {
  isMatch: boolean;
  category: IdentityCategory;
  language: 'en' | 'fr';
} {
  if (!text || typeof text !== 'string') {
    return { isMatch: false, category: 'not_identity', language: 'en' };
  }

  const clean = text.trim().toLowerCase()
    .replace(/[?!.,;:]+$/, '')
    .replace(/\s+/g, ' ');

  // Detect language
  const isFrench = /\b(tu|toi|ton|ta|tes|vous|votre|vos|qui|est-ce|rôle|objectif|présente|peux-tu|fonctionnalités|études|compagnon)\b/i.test(clean);
  const lang = isFrench ? 'fr' : 'en';

  // 1. Combined Identity AND Goal / Purpose
  // e.g. "WHO ARE YOU AND WHAT IS YOUR GOAL?", "who are u and what is your purpose", "qui es tu et quel est ton but"
  const hasWho = /\b(who are you|who r u|who u are|who made you|qui es-tu|qui es tu|présente-toi|presente toi)\b/i.test(clean);
  const hasGoal = /\b(goal|purpose|mission|objective|aim|target|objectif|but|mission)\b/i.test(clean);
  if (hasWho && hasGoal) {
    return { isMatch: true, category: 'identity_and_goal', language: lang };
  }

  // 2. Pure Identity questions
  // "who are you", "who is xena", "what is xena", "tell me about yourself", "qui es-tu", "présente-toi"
  if (
    /\b(who are you|who r u|who u|who is xena|what is xena|whats xena|who made you|who created you|tell me about yourself|introduce yourself)\b/i.test(clean) ||
    /\b(qui es-tu|qui es tu|c'est quoi xena|qui est xena|présente-toi|presente-toi|présente toi|presente toi|parle-moi de toi)\b/i.test(clean)
  ) {
    return { isMatch: true, category: 'identity', language: lang };
  }

  // 3. Goal / Purpose questions
  // "what is your goal", "what is your purpose", "what is your mission", "why do you exist", "quel est ton objectif"
  if (
    /\b(what is your goal|whats your goal|what is your purpose|whats your purpose|what is your mission|whats your mission|why should i use xena|why do you exist|what are you designed for)\b/i.test(clean) ||
    /\b(quel est ton objectif|c'est quoi ton objectif|quel est ton but|c'est quoi ton but|quelle est ta mission|pourquoi tu existes|à quoi tu sers|a quoi sers tu|a quoi tu sers)\b/i.test(clean)
  ) {
    return { isMatch: true, category: 'goal_purpose', language: lang };
  }

  // 4. Role in this application
  // "what is your role", "what is your role in this application", "i am asking what your role is", "quel est ton rôle"
  if (
    /\b(what is your role|whats your role|what's your role|what is your job|what is your function|what are you here for|asking what your role is)\b/i.test(clean) ||
    /\b(quel est ton rôle|quel est ton role|c'est quoi ton rôle|c'est quoi ton role|quelle est ta fonction)\b/i.test(clean)
  ) {
    return { isMatch: true, category: 'role', language: lang };
  }

  // 5. Capability / Feature questions
  // "what can you do", "what are your features", "what can you help me with", "how can you help me as a student", "tu peux faire quoi"
  if (
    /\b(what can you do|what r u able to do|what are your features|what features do you have|what features are available|what can you help me with|how can you help me|how can you help|what makes you useful|are you just a chatbot|are you a calendar app|can you help me prepare for exams|can you manage my study schedule|explain how you work|how does xena work)\b/i.test(clean) ||
    /\b(tu peux faire quoi|qu'est-ce que tu peux faire|quelles sont tes fonctionnalités|quelles sont tes fonctionnalites|comment tu peux m'aider|comment peux-tu m'aider|comment fonctionne xena|es-tu juste un chatbot)\b/i.test(clean)
  ) {
    return { isMatch: true, category: 'capabilities', language: lang };
  }

  // 6. Application guidance / How-to questions
  // "explain event management", "explain how reminders work", "how do reminders work", "explique-moi comment fonctionnent tes rappels"
  if (
    /\b(explain event management|explain reminders|explain planning|explain vault|how do reminders work|how do events work|how does planning work|how does vault work)\b/i.test(clean) ||
    /\b(explique-moi comment fonctionnent tes rappels|explique les rappels|comment fonctionnent les événements)\b/i.test(clean)
  ) {
    return { isMatch: true, category: 'application_help', language: lang };
  }

  // 7. Conversational clarification about capability
  // e.g. "Can you update my event?", "Can you create reminders?" (without any action parameters)
  if (/^can you (update|change|edit|create|delete|manage)\s+(my\s+)?(event|reminder|task|schedule|plan)\??$/i.test(clean)) {
    return { isMatch: true, category: 'capabilities', language: lang };
  }

  return { isMatch: false, category: 'not_identity', language: lang };
}

/**
 * Generates an authoritative, natural, and contextually precise identity response.
 */
export function generateAuthoritativeIdentityResponse(
  queryText: string,
  profileName?: string
): string {
  const { category, language } = classifyIdentityOrCapability(queryText);
  const name = profileName || (language === 'fr' ? 'l\'étudiant' : 'there');

  if (language === 'fr') {
    switch (category) {
      case 'identity_and_goal':
        return "Salut ! Je suis **Xena AI**, ton compagnon intelligent pour les études. Mon objectif est de t'aider à organiser ton emploi du temps, gérer tes rappels, planifier tes révisions, suivre tes objectifs académiques et répondre à tes questions. Pense à moi comme un assistant conçu pour simplifier ta vie d'étudiant.";

      case 'identity':
        return "Je suis **Xena AI**, ton compagnon d'études intelligent au sein de l'application Xena. Je suis là pour t'accompagner dans l'organisation de ton quotidien universitaire, tes devoirs, tes révisions et tes rappels.";

      case 'goal_purpose':
        return "En tant que compagnon d'études **Xena AI**, mon objectif principal est de rendre la vie étudiante plus simple et structurée : t'aider à respecter tes délais, planifier tes sessions d'étude, ne rien oublier et garder le cap sur tes objectifs scolaires.";

      case 'role':
        return "Mon rôle au sein de **Xena AI** est d'agir comme ton compagnon personnel d'études : répondre à tes questions, t'aider à programmer tes rappels avec alertes vocales, organiser tes événements et structurer tes révisions de manière efficace.";

      case 'capabilities':
        return `En tant que **Xena AI**, voici ce que je peux faire pour tes études :
- **Rappels intelligents** : alertes précises, répétitions et notifications vocales.
- **Gestion d'événements** : planification de réunions, cours et dates d'examens.
- **Planning d'études** : création d'emplois du temps personnalisés par blocs de travail.
- **Suivi des examens** : suivi de ta progression et de ta préparation cours par cours.
- **Memory Vault** : sauvegarde de tes notes et informations personnelles importantes.
- **Réponses académiques** : explications de concepts et réponses à tes questions.

Dis-moi simplement ce dont tu as besoin !`;

      case 'application_help':
        return "Avec **Xena AI**, tu peux me demander à tout moment de créer un rappel ('Rappelle-moi de réviser demain à 18h'), d'ajouter un événement à ton calendrier pour tes études, de planifier ta journée d'étude ou de sauvegarder une note dans ton Vault Memory. Toutes tes données sont sauvegardées en temps réel.";

      default:
        return "Je suis **Xena AI**, ton assistant et compagnon d'études. Comment puis-je t'aider aujourd'hui ?";
    }
  }

  // English Responses
  switch (category) {
    case 'identity_and_goal':
      return "Hi! I'm **Xena AI**, your personal AI companion for student organization and daily coordination. My goal is to help you stay organized, manage your schedule, plan study sessions, track academic deadlines, and set voice-enabled reminders.";

    case 'identity':
      return "I'm **Xena AI**, a personal AI companion designed to help students organize, manage, and coordinate their academic and everyday activities.";

    case 'goal_purpose':
      return "As your **Xena AI** companion, my primary goal is to help you organize your academic life by managing your schedule, planning focus study sessions, tracking deadlines, setting voice reminders, and keeping your daily responsibilities under control.";

    case 'role':
      return "My role is your personal **Xena AI** student organization companion. I help you coordinate your schedule, set voice-enabled reminders, structure study plans, track exam preparation, and manage your daily activities.";

    case 'capabilities':
      return `As **Xena AI**, here is how I can help you organize your student life:
- **Intelligent Reminders**: Create time-sensitive alerts with exact dates, times, recurrence, and voice notifications.
- **Calendar & Events**: Schedule exams, project deadlines, appointments, and club meetings.
- **Study Planning**: Generate chronological daily timelines and dedicated focus blocks.
- **Exam Tracking**: Monitor course readiness, syllabus completion, and study targets.
- **Vault Memory**: Save and recall important personal facts, notes, and credentials.
- **Personal Context**: Retrieve your profile, schedule, and memory facts seamlessly.

How can I help you organize your day or schedule today?`;

    case 'application_help':
      return "You can use **Xena AI** to organize your student life by typing or speaking natural instructions. For example, say *\"Remind me to study Math tomorrow at 4 PM\"*, *\"Schedule an event called Majestical Night this Sunday at 3 PM\"*, or *\"Plan my 3-hour study session today\"*. I will organize everything directly into your dashboard.";

    default:
      return "I'm **Xena AI**, your personal AI companion for student organization. How can I help you organize your schedule or studies today?";
  }
}
