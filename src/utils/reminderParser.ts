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

  // Handle specific pattern: "Remind me that I have a meeting..." -> "Meeting..."
  if (/remind me that i have a/i.test(source)) {
    source = source.replace(/remind me that i have a/i, 'A');
  } else if (/remind me that i have/i.test(source)) {
    source = source.replace(/remind me that i have/i, '');
  }

  // Remove command prefixes (case insensitive)
  const commandPrefixes = [
    /^(please\s+)?(can\s+you\s+)?create\s+a\s+reminder\s+(to|for)?\s*/i,
    /^(please\s+)?(can\s+you\s+)?set\s+a\s+reminder\s+(to|for)?\s*/i,
    /^(please\s+)?(can\s+you\s+)?add\s+a\s+reminder\s+(to|for)?\s*/i,
    /^(please\s+)?(can\s+you\s+)?remind\s+me\s+(to|about|that)?\s*/i,
    /^i\s+(have\s+to|must|need\s+to)\s*/i,
    /^please\s+remind\s+me\s*/i,
  ];

  for (const prefix of commandPrefixes) {
    source = source.replace(prefix, '');
  }

  // Strip dates from title
  const datePatterns = [
    /\bthe day after tomorrow\b/gi,
    /\btomorrow\b/gi,
    /\btoday\b/gi,
    /\bnext (monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi,
    /\bevery (monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi,
    /\bnext week\b/gi,
    /\bon (monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi,
  ];

  for (const pattern of datePatterns) {
    source = source.replace(pattern, '');
  }

  // Strip time expressions from title
  const timePatterns = [
    /\bat\s+\d{1,2}(:\d{2})?\s*(am|pm)?\b/gi,
    /\b\d{1,2}(:\d{2})?\s*(am|pm)\b/gi,
    /\b\d{1,2}\s+in the (morning|evening|afternoon)\b/gi,
    /\btomorrow morning\b/gi,
    /\bin the morning\b/gi,
    /\bin the evening\b/gi,
    /\bin the afternoon\b/gi,
    /\bat noon\b/gi,
    /\bat midnight\b/gi,
    /\bat\s+\d{1,2}\b/gi,
  ];

  for (const pattern of timePatterns) {
    source = source.replace(pattern, '');
  }

  // Strip settings & recurrence flags
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
    source = source.replace(pattern, '');
  }

  // Clean trailing/leading punctuation or extra spaces
  source = source
    .replace(/^[\s,.:;-]+|[\s,.:;-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!source) return '';

  // Capitalize first letter
  return source.charAt(0).toUpperCase() + source.slice(1);
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

  const isMissingDate = !lastEvent.date || lastEvent.date === 'Not specified';
  const isMissingTime = !lastEvent.time || lastEvent.time === 'Not specified';
  const isMissingLoc = !lastEvent.location || lastEvent.location === 'Not specified';

  if (!isMissingDate && !isMissingTime && !isMissingLoc) {
    return null;
  }

  const updates: Record<string, any> = {};

  if (isMissingDate) {
    const hasDateMention = /\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|\d{1,2}\/\d{1,2}|\d{4}-\d{2}-\d{2})\b/i.test(queryText);
    if (hasDateMention) {
      updates.date = resolveRelativeDate(null, queryText);
    }
  }

  if (isMissingTime) {
    const timeMatch = extractTimeFromText(queryText);
    if (timeMatch) {
      updates.time = timeMatch;
    }
  }

  if (isMissingLoc) {
    const locMatch = queryText.match(/\b(at|in)\s+([A-Z0-9][a-zA-Z0-9\s,]{2,30})/i) || queryText.match(/\b(university|hall|room|office|church|center|centre|hub|building|campus|park|stadium|hotel|house)\b/i);
    if (locMatch) {
      let locStr = locMatch[0].replace(/^(at|in)\s+/i, '').trim();
      if (locStr && !/saturday|sunday|monday|tuesday|wednesday|thursday|friday|today|tomorrow/i.test(locStr)) {
        updates.location = locStr.charAt(0).toUpperCase() + locStr.slice(1);
      }
    } else if (!isMissingDate || !isMissingTime) {
      const cleaned = queryText.replace(/(saturday|sunday|monday|tuesday|wednesday|thursday|friday|today|tomorrow|\d{1,2}(:\d{2})?\s*(am|pm)?|at|in|on|,)/gi, '').trim();
      if (cleaned.length > 2) {
        updates.location = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
      }
    }
  }

  if (Object.keys(updates).length > 0) {
    return { isFollowUp: true, updates };
  }

  return null;
}
