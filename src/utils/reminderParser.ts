import { extractTimeFromText, normalizeTimeString } from './timeUtils.js';

export interface ExtractedReminderInfo {
  title: string;
  date: string;
  time: string;
  repeat: 'none' | 'daily' | 'weekly' | 'monthly';
  priority: 'low' | 'medium' | 'high';
  active: boolean;
  voiceReminder: boolean;
  description?: string;
  category?: string;
}

/**
  * Resolve relative dates based on text context and reference date.
  */
export function resolveRelativeDate(dateInput: string | undefined | null, queryText: string, refDate: Date = new Date()): string {
  const lower = (queryText || '').toLowerCase();
  
  // Create Date object in local context
  const today = new Date(refDate);

  const formatDate = (d: Date): string => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const todayStr = formatDate(today);

  // Check explicit phrases in text
  if (lower.includes('the day after tomorrow') || lower.includes('après-demain')) {
    const d = new Date(today);
    d.setDate(d.getDate() + 2);
    return formatDate(d);
  }

  if (lower.includes('tomorrow') || lower.includes('demain')) {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return formatDate(d);
  }

  if (lower.includes('today') || lower.includes("aujourd'hui")) {
    return todayStr;
  }

  // Day of week handling: "next monday", "this monday", "every monday", "on monday", "monday"
  const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  for (let i = 0; i < daysOfWeek.length; i++) {
    const dayName = daysOfWeek[i];
    if (
      lower.includes(`next ${dayName}`) || 
      lower.includes(`every ${dayName}`) || 
      lower.includes(`on ${dayName}`) ||
      lower.includes(`this ${dayName}`) ||
      lower.includes(dayName)
    ) {
      const currentDay = today.getDay(); // 0 is Sunday, 1 is Monday...
      let daysUntilTarget = i - currentDay;
      if (daysUntilTarget <= 0) {
        daysUntilTarget += 7; // Move to next week
      }
      const d = new Date(today);
      d.setDate(d.getDate() + daysUntilTarget);
      return formatDate(d);
    }
  }

  // Next week general handling
  if (lower.includes('next week')) {
    const d = new Date(today);
    d.setDate(d.getDate() + 7);
    return formatDate(d);
  }

  // If input date is valid YYYY-MM-DD, verify it isn't accidentally today when "tomorrow" was mentioned
  if (dateInput && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    if (lower.includes('tomorrow') && dateInput === todayStr) {
      const d = new Date(today);
      d.setDate(d.getDate() + 1);
      return formatDate(d);
    }
    return dateInput;
  }

  return todayStr;
}

/**
 * Clean user's command to extract ONLY the true title of the reminder.
 */
export function cleanReminderTitle(rawTitle: string, fullQuery: string): string {
  let source = (rawTitle || fullQuery || '').trim();

  // 1. Remove greetings and conversational wrappers anywhere in the query
  const conversationalWrappers = [
    /\b(hello|hey|hi|dear)\s+(xena|nexa|assistant)\b[,]?.?/gi,
    /\b(hope\s+you\s+(are|'re)\s+(doing\s+)?(fine|well|good|ok|great))\b[,]?.?/gi,
    /\b(how\s+are\s+you|how's\s+it\s+going|how\s+are\s+you\s+doing)\b[,]?.?/gi,
    /\b(xena|nexa)\s+please\b[,]?.?/gi,
    /\bplease\b[,]?.?/gi,
    /\b(i\s+need\s+you\s+to|i\s+would\s+like\s+you\s+to|i'd\s+like\s+you\s+to|i\s+want\s+you\s+to|could\s+you\s+please|can\s+you\s+please|can\s+you|could\s+you)\b/gi,
  ];

  let cleanedText = source;
  for (const cw of conversationalWrappers) {
    cleanedText = cleanedText.replace(cw, ' ');
  }
  cleanedText = cleanedText.replace(/\s+/g, ' ').trim();

  // 2. Look for explicit action phrase after command words:
  const actionRegexes = [
    /\b(?:create|set|add|make|schedule)(?:\s+me)?(?:\s+a)?\s+reminder\s+(?:for\s+me\s+)?(?:to|for|about)\s+(.+)/i,
    /\bremind\s+me\s+that\s+i\s+(?:have\s+to|need\s+to|must)\s+(.+)/i,
    /\bremind\s+me\s+that\s+i\s+have\s+a\s+(.+)/i,
    /\bremind\s+me\s+that\s+(.+)/i,
    /\bremind\s+me\s+(?:to|for|about)\s+(.+)/i,
    /\b(?:i\s+have\s+to|i\s+need\s+to|i\s+must)\s+(.+)/i,
  ];

  let extractedAction = '';
  for (const rx of actionRegexes) {
    const match = cleanedText.match(rx);
    if (match && match[1] && match[1].trim()) {
      extractedAction = match[1].trim();
      break;
    }
  }

  // If no action regex matched, fallback to cleanedText or stripping prefixes
  if (!extractedAction) {
    extractedAction = cleanedText;
    const commandPrefixes = [
      /^(please\s+)?(can\s+you\s+)?create\s+(me\s+)?a\s+reminder\s+(to|for)?\s*/i,
      /^(please\s+)?(can\s+you\s+)?set\s+(me\s+)?a\s+reminder\s+(to|for)?\s*/i,
      /^(please\s+)?(can\s+you\s+)?add\s+(me\s+)?a\s+reminder\s+(to|for)?\s*/i,
      /^(please\s+)?(can\s+you\s+)?remind\s+me\s+(to|about|that|for)?\s*/i,
      /^i\s+(have\s+to|must|need\s+to)\s*/i,
      /^please\s+remind\s+me\s*/i,
      /^xena\s*/i,
    ];
    for (const prefix of commandPrefixes) {
      extractedAction = extractedAction.replace(prefix, '');
    }
  }

  // 3. Handle complex case: "I have an important CSC305 class tomorrow and I don't want to forget to revise for it" -> "Revise for CSC305"
  const forgetMatch = extractedAction.match(/(?:don't\s+want\s+to\s+forget\s+to|forget\s+to)\s+(.+)/i);
  if (forgetMatch && forgetMatch[1]) {
    let subTask = forgetMatch[1].trim();
    if (/\bfor\s+it\b/i.test(subTask)) {
      const courseMatch = fullQuery.match(/\b([A-Z]{2,4}[- ]?\d{3,4})\b/i);
      if (courseMatch) {
        subTask = subTask.replace(/\bfor\s+it\b/i, `for ${courseMatch[1].toUpperCase()}`);
      }
    }
    extractedAction = subTask;
  }

  // 4. Strip date expressions from title
  const datePatterns = [
    /\bthe day after tomorrow\b/gi,
    /\btomorrow(\s+(morning|afternoon|evening|night))?\b/gi,
    /\btoday\b/gi,
    /\btonight\b/gi,
    /\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi,
    /\bevery\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi,
    /\bnext\s+week\b/gi,
    /\bon\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi,
    /\bthis\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi,
  ];

  for (const pattern of datePatterns) {
    extractedAction = extractedAction.replace(pattern, '');
  }

  // 5. Strip time expressions from title
  const timePatterns = [
    /\bat\s+\d{1,2}(:\d{2})?\s*(a\.?m\.?|p\.?m\.?)?\b/gi,
    /\b\d{1,2}(:\d{2})?\s*(a\.?m\.?|p\.?m\.?)\b/gi,
    /\b\d{1,2}\s+in the (morning|evening|afternoon)\b/gi,
    /\bin the (morning|evening|afternoon)\b/gi,
    /\bat noon\b/gi,
    /\bat midnight\b/gi,
    /\bat\s+\d{1,2}\b/gi,
  ];

  for (const pattern of timePatterns) {
    extractedAction = extractedAction.replace(pattern, '');
  }

  // 6. Strip settings & recurrence flags
  const settingPatterns = [
    /\bwithout voice\b/gi,
    /\bwith voice\b/gi,
    /\bno voice\b/gi,
    /\bwithout notification\b/gi,
    /\bdon't notify me\b/gi,
    /\bno notification\b/gi,
    /\bevery day\b/gi,
    /\bevery week\b/gi,
    /\bevery month\b/gi,
    /\bdaily\b/gi,
    /\bweekly\b/gi,
    /\bmonthly\b/gi,
  ];

  for (const pattern of settingPatterns) {
    extractedAction = extractedAction.replace(pattern, '');
  }

  // 7. Clean trailing/leading punctuation or extra spaces
  extractedAction = extractedAction
    .replace(/^[\s,.:;?!-]+|[\s,.:;?!-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!extractedAction) return '';

  // Capitalize first letter
  return extractedAction.charAt(0).toUpperCase() + extractedAction.slice(1);
}

/**
 * Extract full parameters for reminder creation with defaults.
 */
export function extractReminderParams(
  payload: any,
  queryText: string,
  refDate: Date = new Date()
): ExtractedReminderInfo {
  const rawTitle = payload?.title || payload?.content || queryText;
  const cleanedTitle = cleanReminderTitle(rawTitle, queryText);

  // Date resolution
  const date = resolveRelativeDate(payload?.date, queryText, refDate);

  // Time resolution
  const lowerText = queryText.toLowerCase();
  let parsedTime = normalizeTimeString(payload?.time) || extractTimeFromText(queryText);

  if (!parsedTime) {
    if (lowerText.includes('at noon') || lowerText.includes('noon')) {
      parsedTime = '12:00';
    } else if (lowerText.includes('at midnight') || lowerText.includes('midnight')) {
      parsedTime = '00:00';
    } else if (lowerText.includes('morning')) {
      parsedTime = '09:00';
    } else if (lowerText.includes('evening')) {
      parsedTime = '18:00';
    } else if (lowerText.includes('afternoon')) {
      parsedTime = '14:00';
    } else {
      parsedTime = '09:00'; // Default fallback time
    }
  }

  // Recurrence
  let repeat: 'none' | 'daily' | 'weekly' | 'monthly' = payload?.repeat || 'none';
  if (repeat === 'none') {
    if (lowerText.includes('every monday') || lowerText.includes('every week') || lowerText.includes('weekly')) {
      repeat = 'weekly';
    } else if (lowerText.includes('every day') || lowerText.includes('daily')) {
      repeat = 'daily';
    } else if (lowerText.includes('every month') || lowerText.includes('monthly')) {
      repeat = 'monthly';
    }
  }

  // Priority
  let priority: 'low' | 'medium' | 'high' = payload?.priority || 'medium';
  if (lowerText.includes('high priority') || lowerText.includes('urgent')) {
    priority = 'high';
  } else if (lowerText.includes('low priority')) {
    priority = 'low';
  }

  // Voice & Notification Defaulting (Requirement 6)
  let active = true; // Default ON
  let voiceReminder = true; // Default ON

  if (payload?.voiceReminder === false || lowerText.includes('without voice') || lowerText.includes('no voice')) {
    voiceReminder = false;
  }

  if (payload?.active === false || lowerText.includes("don't notify me") || lowerText.includes('without notification') || lowerText.includes('no notification')) {
    active = false;
    voiceReminder = false;
  }

  return {
    title: cleanedTitle,
    date,
    time: parsedTime,
    repeat,
    priority,
    active,
    voiceReminder,
    description: payload?.description || '',
    category: payload?.category || 'General'
  };
}

/**
 * Detect provided vs missing fields from created reminder and build follow-up question.
 */
export function detectReminderFields(
  newRem: any,
  rawQuery: string,
  payload: any
): { provided: string[]; missing: string[]; followUpText: string } {
  const lowerQuery = (rawQuery || '').toLowerCase();
  const provided: string[] = ['title', 'date', 'time'];
  const missing: string[] = [];

  // Description / Note
  if (newRem.description && newRem.description.trim().length > 0) {
    provided.push('description');
  } else {
    missing.push('description');
  }

  // Recurrence / repeat
  if (newRem.repeat && newRem.repeat !== 'none') {
    provided.push('recurrence');
  } else if (lowerQuery.includes('repeat') || lowerQuery.includes('daily') || lowerQuery.includes('weekly') || lowerQuery.includes('monthly') || lowerQuery.includes('every')) {
    provided.push('recurrence');
  } else {
    missing.push('recurrence');
  }

  // Priority
  if (lowerQuery.includes('priority') || lowerQuery.includes('urgent') || (payload?.priority && payload.priority !== 'medium')) {
    provided.push('priority');
  } else {
    missing.push('priority');
  }

  // Category
  if (lowerQuery.includes('category') || (payload?.category && payload.category !== 'General')) {
    provided.push('category');
  }

  // Voice & Notification
  if (newRem.active !== false) provided.push('notification');
  if (newRem.voice_notification !== false) provided.push('voice');

  // Format date description
  const todayStr = new Date().toISOString().split('T')[0];
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  let dateDesc = `on ${newRem.date}`;
  if (newRem.date === todayStr) {
    dateDesc = 'today';
  } else if (newRem.date === tomorrowStr) {
    dateDesc = 'tomorrow';
  }

  // Format time (e.g. 18:00 -> "6:00 PM" or "18:00")
  let timeDesc = newRem.time;
  if (newRem.time && newRem.time.includes(':')) {
    const [hStr, mStr] = newRem.time.split(':');
    const h = parseInt(hStr, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayH = h % 12 === 0 ? 12 : h % 12;
    const displayM = mStr ? `:${mStr}` : ':00';
    timeDesc = `${displayH}${displayM === ':00' ? '' : displayM} ${ampm}`;
  }

  // Build confirmation line
  const confirmation = `Done — I've set a reminder for **${newRem.title}** ${dateDesc} at **${timeDesc}**.`;

  return { provided, missing, followUpText: confirmation };
}

/**
 * Detect if user message is a follow-up modification for a recently created reminder.
 */
export function parseFollowUpUpdate(
  queryText: string,
  lastReminder: any
): { isFollowUp: boolean; updates?: Record<string, any> } | null {
  if (!lastReminder) return null;

  const lower = queryText.toLowerCase().trim();

  // If query is an explicit action/creation/query command, don't treat as follow-up
  if (/^(remind|create|set|add|schedule|what|when|where|how|do i|list|show|view|check|tell me|i have)/i.test(lower)) {
    return null;
  }

  // Pattern checks for explicit follow-ups
  const isAffirmativeOrDirectMod = (
    lower.startsWith('yes') ||
    lower.startsWith('sure') ||
    lower.startsWith('make it') ||
    lower.startsWith('repeat') ||
    lower.startsWith('set it') ||
    lower.startsWith('change it') ||
    lower.startsWith('add note') ||
    lower.startsWith('add a note') ||
    lower.startsWith('add description') ||
    lower.includes('every week') ||
    lower.includes('every monday') ||
    lower.includes('every day') ||
    lower.includes('high priority') ||
    lower.includes('low priority') ||
    lower.includes('without voice') ||
    lower.includes('note:') ||
    lower.includes('description:') ||
    lower.includes('priority') ||
    lower.includes('monthly') ||
    lower.includes('weekly') ||
    lower.includes('daily')
  );

  if (!isAffirmativeOrDirectMod) return null;

  const updates: Record<string, any> = {};

  if (lower.includes('every monday') || lower.includes('every tuesday') || lower.includes('every wednesday') || lower.includes('every thursday') || lower.includes('every friday') || lower.includes('every saturday') || lower.includes('every sunday') || lower.includes('every week') || lower.includes('repeat every week') || lower.includes('weekly')) {
    updates.repeat = 'weekly';
  } else if (lower.includes('every day') || lower.includes('daily') || lower.includes('repeat daily') || lower.includes('everyday')) {
    updates.repeat = 'daily';
  } else if (lower.includes('every month') || lower.includes('monthly') || lower.includes('repeat monthly')) {
    updates.repeat = 'monthly';
  } else if (lower.includes('no repeat') || lower.includes('dont repeat') || lower.includes("don't repeat") || lower.includes('none')) {
    updates.repeat = 'none';
  }

  if (lower.includes('high priority') || lower.includes('urgent') || lower === 'high' || lower.includes('set priority to high')) {
    updates.priority = 'high';
  } else if (lower.includes('medium priority') || lower === 'medium' || lower.includes('set priority to medium')) {
    updates.priority = 'medium';
  } else if (lower.includes('low priority') || lower === 'low' || lower.includes('set priority to low')) {
    updates.priority = 'low';
  }

  if (lower.includes('without voice') || lower.includes('no voice') || lower.includes('turn off voice') || lower.includes('disable voice')) {
    updates.voice_notification = false;
  } else if (lower.includes('with voice') || lower.includes('enable voice') || lower.includes('turn on voice')) {
    updates.voice_notification = true;
  }

  if (lower.includes('note:') || lower.includes('description:') || lower.includes('add note') || lower.includes('add a note') || lower.includes('add description') || lower.includes('add a description')) {
    const noteContent = queryText.replace(/.*?(note:|description:|add a note\s*:?\s*|add note\s*:?\s*|add description\s*:?\s*|add a description\s*:?\s*)/i, '').trim();
    if (noteContent) {
      updates.description = noteContent;
    }
  } else if (!updates.repeat && !updates.priority && updates.voice_notification === undefined) {
    if (lower.startsWith('yes') || lower.startsWith('sure') || lower.startsWith('add note') || lower.startsWith('add description')) {
      const cleanDesc = queryText.replace(/^(yes|sure|add note|add description),?\s*/i, '').trim();
      if (cleanDesc) {
        updates.description = cleanDesc;
      }
    }
  }

  const newTime = extractTimeFromText(queryText);
  if (newTime) {
    updates.time = newTime;
  }

  if (Object.keys(updates).length > 0) {
    return { isFollowUp: true, updates };
  }

  return null;
}

export function parseEventFollowUpUpdate(queryText: string, lastEvent: any) {
  if (!lastEvent) return null;

  const lower = queryText.toLowerCase().trim();

  // STRICT RULE: Requests containing creation/addition/save/schedule keywords MUST NEVER update an existing event.
  const hasCreationIntent = /\b(save|add|create|register|schedule|remind|put\s+this|put\s+it|another|new)\b/i.test(lower) ||
    lower.includes('in my events') ||
    lower.includes('to my events') ||
    lower.includes('as an event');

  if (hasCreationIntent) {
    return null;
  }

  // Check for explicit update intent
  const hasExplicitUpdateIntent = /\b(update|change|modify|edit|move|reschedule|change\s+the\s+time|change\s+the\s+date|change\s+the\s+location|make\s+it)\b/i.test(lower);

  // If NOT an explicit update command, it MUST be a short direct response (e.g., "At the university chapel") answering a missing field prompt.
  if (!hasExplicitUpdateIntent) {
    if (queryText.length > 60) return null;
  }

  const isMissingDate = !lastEvent.date || lastEvent.date === 'Not specified';
  const isMissingTime = !lastEvent.time || lastEvent.time === 'Not specified';
  const isMissingLoc = !lastEvent.location || lastEvent.location === 'Not specified';

  if (!isMissingDate && !isMissingTime && !isMissingLoc && !hasExplicitUpdateIntent) {
    return null;
  }

  const updates: Record<string, any> = {};

  if (isMissingDate || hasExplicitUpdateIntent) {
    const hasDateMention = /\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|\d{1,2}\/\d{1,2}|\d{4}-\d{2}-\d{2})\b/i.test(queryText);
    if (hasDateMention) {
      updates.date = resolveRelativeDate(null, queryText);
    }
  }

  if (isMissingTime || hasExplicitUpdateIntent) {
    const timeMatch = extractTimeFromText(queryText);
    if (timeMatch) {
      updates.time = timeMatch;
    }
  }

  if (isMissingLoc || hasExplicitUpdateIntent) {
    const locMatch = queryText.match(/\b(at|in)\s+([A-Z0-9][a-zA-Z0-9\s,]{2,30})/i) || queryText.match(/\b(university|hall|room|office|church|center|centre|hub|building|campus|park|stadium|hotel|house)\b/i);
    if (locMatch) {
      let locStr = locMatch[0].replace(/^(at|in)\s+/i, '').trim();
      if (locStr && !/saturday|sunday|monday|tuesday|wednesday|thursday|friday|today|tomorrow/i.test(locStr)) {
        updates.location = locStr.charAt(0).toUpperCase() + locStr.slice(1);
      }
    } else if (!isMissingDate || !isMissingTime) {
      const cleaned = queryText.replace(/(saturday|sunday|monday|tuesday|wednesday|thursday|friday|today|tomorrow|\d{1,2}(:\d{2})?\s*(am|pm)?|at|in|on|,)/gi, '').trim();
      if (cleaned.length > 2 && !/\b(event|meeting|bootcamp|conference|workshop)\b/i.test(cleaned)) {
        updates.location = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
      }
    }
  }

  if (Object.keys(updates).length > 0) {
    return { isFollowUp: true, updates };
  }

  return null;
}
