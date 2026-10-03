import { extractTimeFromText, normalizeTimeString, extractRelativeTimeOffset, formatReadableDate, formatReadableTime } from './timeUtils.js';
import { classifyIdentityOrCapability, isQuestionOrInquiry } from '../server/XenaIdentity.js';

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
  isTimeExplicit: boolean;
  isDateExplicit: boolean;
}

export interface ExtractedDateInfo {
  date: string | null;
  isExplicit: boolean;
  matchedText?: string;
}

export interface ExtractedEventInfo {
  title: string;
  date: string;
  time: string;
  location: string;
  description: string;
  isTitleValid: boolean;
  isDateExplicit: boolean;
  isTimeExplicit: boolean;
  isLocationExplicit: boolean;
}

const MONTH_NAME_MAP: Record<string, number> = {
  january: 0, jan: 0, janvier: 0,
  february: 1, feb: 1, fevrier: 1, 'février': 1,
  march: 2, mar: 2, mars: 2,
  april: 3, apr: 3, avril: 3,
  may: 4, mai: 4,
  june: 5, jun: 5, juin: 5,
  july: 6, jul: 6, juillet: 6,
  august: 7, aug: 7, aout: 7, 'août': 7,
  september: 8, sep: 8, sept: 8, septembre: 8,
  october: 9, oct: 9, octobre: 9,
  november: 10, nov: 10, novembre: 10,
  december: 11, dec: 11, decembre: 11, 'décembre': 11
};

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5,
  sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
  eleventh: 11, twelfth: 12
};

function formatLocalIsoDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function buildValidDate(year: number, monthIndex: number, day: number): Date | null {
  if (monthIndex < 0 || monthIndex > 11 || day < 1 || day > 31) return null;
  const d = new Date(year, monthIndex, day, 0, 0, 0, 0);
  if (d.getFullYear() !== year || d.getMonth() !== monthIndex || d.getDate() !== day) {
    return null;
  }
  return d;
}

/**
 * Deterministic Date Extractor & Normalizer.
 * Parses ISO dates, Month+Day(+Year), Day+Month(+Year), "8th of August", slash dates,
 * relative dates ("today", "tomorrow", "in 3 days", "next Friday"), and resolves future years accurately.
 */
export function extractExplicitDateFromText(queryText: string | undefined | null, refDate: Date = new Date()): ExtractedDateInfo {
  if (!queryText || !queryText.trim()) {
    return { date: null, isExplicit: false };
  }

  const raw = queryText.trim();
  const lower = raw.toLowerCase();
  const today = new Date(refDate);
  today.setHours(0, 0, 0, 0);
  const currentYear = today.getFullYear();

  // 1. Explicit ISO YYYY-MM-DD
  const isoMatch = raw.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoMatch) {
    const y = parseInt(isoMatch[1], 10);
    const m = parseInt(isoMatch[2], 10) - 1;
    const day = parseInt(isoMatch[3], 10);
    const valid = buildValidDate(y, m, day);
    if (valid) {
      return { date: formatLocalIsoDate(valid), isExplicit: true, matchedText: isoMatch[0] };
    }
  }

  // 2. Month Name + Day (+ optional Year): e.g. "December 31", "Dec 31st, 2027", "November 12"
  const monthNamesPattern = Object.keys(MONTH_NAME_MAP).sort((a, b) => b.length - a.length).join('|');
  const monthFirstRegex = new RegExp(`\\b(${monthNamesPattern})\\.?\\s+(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?(?:\\s*,?\\s*(\\d{4}))?\\b`, 'i');
  const mFirst = raw.match(monthFirstRegex);
  if (mFirst) {
    const monthIdx = MONTH_NAME_MAP[mFirst[1].toLowerCase()];
    const day = parseInt(mFirst[2], 10);
    let year = mFirst[3] ? parseInt(mFirst[3], 10) : currentYear;
    let candidate = buildValidDate(year, monthIdx, day);
    if (candidate && !mFirst[3] && candidate.getTime() < today.getTime()) {
      candidate = buildValidDate(currentYear + 1, monthIdx, day);
    }
    if (candidate) {
      return { date: formatLocalIsoDate(candidate), isExplicit: true, matchedText: mFirst[0] };
    }
  }

  // 3. Day + Month Name (+ optional Year): e.g. "31 December", "31st of December", "on the 8th of August 2027"
  const dayFirstRegex = new RegExp(`\\b(?:the\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${monthNamesPattern})\\.?(?:\\s*,?\\s*(\\d{4}))?\\b`, 'i');
  const dFirst = raw.match(dayFirstRegex);
  if (dFirst) {
    const day = parseInt(dFirst[1], 10);
    const monthIdx = MONTH_NAME_MAP[dFirst[2].toLowerCase()];
    let year = dFirst[3] ? parseInt(dFirst[3], 10) : currentYear;
    let candidate = buildValidDate(year, monthIdx, day);
    if (candidate && !dFirst[3] && candidate.getTime() < today.getTime()) {
      candidate = buildValidDate(currentYear + 1, monthIdx, day);
    }
    if (candidate) {
      return { date: formatLocalIsoDate(candidate), isExplicit: true, matchedText: dFirst[0] };
    }
  }

  // 4. Numeric slash date: MM/DD/YYYY or DD/MM/YYYY (e.g. 12/08/2027, 31/12/2026, 12/31/2026)
  const slashMatch = raw.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (slashMatch) {
    const p1 = parseInt(slashMatch[1], 10);
    const p2 = parseInt(slashMatch[2], 10);
    let year = slashMatch[3] ? parseInt(slashMatch[3], 10) : currentYear;
    if (year < 100) year += 2000;

    let monthIdx = -1;
    let day = -1;
    if (p1 > 12 && p2 <= 12) {
      // Unambiguously DD/MM/YYYY
      day = p1;
      monthIdx = p2 - 1;
    } else {
      // Standard MM/DD/YYYY
      monthIdx = p1 - 1;
      day = p2;
    }
    let candidate = buildValidDate(year, monthIdx, day);
    if (candidate && !slashMatch[3] && candidate.getTime() < today.getTime()) {
      candidate = buildValidDate(currentYear + 1, monthIdx, day);
    }
    if (candidate) {
      return { date: formatLocalIsoDate(candidate), isExplicit: true, matchedText: slashMatch[0] };
    }
  }

  // 5. Relative offsets: "the day after tomorrow", "tomorrow", "today", "tonight", "in X days"
  if (lower.includes('the day after tomorrow') || lower.includes('day after tomorrow') || lower.includes('après-demain')) {
    const d = new Date(today);
    d.setDate(d.getDate() + 2);
    return { date: formatLocalIsoDate(d), isExplicit: true, matchedText: 'the day after tomorrow' };
  }

  if (/\b(tomorrow|demain)\b/i.test(lower)) {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return { date: formatLocalIsoDate(d), isExplicit: true, matchedText: 'tomorrow' };
  }

  if (/\b(today|tonight|aujourd'hui)\b/i.test(lower)) {
    return { date: formatLocalIsoDate(today), isExplicit: true, matchedText: 'today' };
  }

  const inDaysMatch = lower.match(/\bin\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+days?\b/i);
  if (inDaysMatch) {
    const rawNum = inDaysMatch[1].toLowerCase();
    const offset = WORD_NUMBERS[rawNum] || parseInt(rawNum, 10);
    if (!isNaN(offset) && offset > 0) {
      const d = new Date(today);
      d.setDate(d.getDate() + offset);
      return { date: formatLocalIsoDate(d), isExplicit: true, matchedText: inDaysMatch[0] };
    }
  }

  // 6. Day of week handling: "next friday", "this friday", "on friday", "friday"
  const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  for (let i = 0; i < daysOfWeek.length; i++) {
    const dayName = daysOfWeek[i];
    const dayRegex = new RegExp(`\\b(?:(next|this|on|every)\\s+)?(${dayName})\\b`, 'i');
    const dayMatch = lower.match(dayRegex);
    if (dayMatch) {
      const currentDay = today.getDay();
      let daysUntilTarget = i - currentDay;
      if (daysUntilTarget <= 0) {
        daysUntilTarget += 7;
      }
      const d = new Date(today);
      d.setDate(d.getDate() + daysUntilTarget);
      return { date: formatLocalIsoDate(d), isExplicit: true, matchedText: dayMatch[0] };
    }
  }

  if (/\bnext\s+week\b/i.test(lower)) {
    const d = new Date(today);
    d.setDate(d.getDate() + 7);
    return { date: formatLocalIsoDate(d), isExplicit: true, matchedText: 'next week' };
  }

  if (/\bnext\s+month\b/i.test(lower)) {
    const d = new Date(today);
    d.setMonth(d.getMonth() + 1);
    return { date: formatLocalIsoDate(d), isExplicit: true, matchedText: 'next month' };
  }

  return { date: null, isExplicit: false };
}

/**
 * Resolve relative or explicit dates based on text context and reference date.
 * Never overwrites an explicitly mentioned date in queryText with today's date.
 */
export function resolveRelativeDate(dateInput: string | undefined | null, queryText: string, refDate: Date = new Date()): string {
  const today = new Date(refDate);
  const todayStr = formatLocalIsoDate(today);

  // 1. Always check queryText first so explicit dates in the user's sentence ("December 31", "tomorrow")
  // are never overwritten by a faulty LLM default dateInput.
  const fromQuery = extractExplicitDateFromText(queryText, refDate);
  if (fromQuery.isExplicit && fromQuery.date) {
    return fromQuery.date;
  }

  // 2. Next check dateInput (could be ISO YYYY-MM-DD or natural language like "December 31")
  if (dateInput && typeof dateInput === 'string' && dateInput.trim() && dateInput !== 'Not specified') {
    const fromInput = extractExplicitDateFromText(dateInput, refDate);
    if (fromInput.isExplicit && fromInput.date) {
      return fromInput.date;
    }
  }

  return todayStr;
}

const VAGUE_EVENT_TITLES = new Set([
  '', 'event', 'an event', 'my event', 'the event', 'new event', 'scheduled event', 'saved event',
  'something', 'something important', 'important', 'anything', 'it', 'this', 'that',
  'meeting', 'a meeting', 'appointment', 'an appointment', 'conference', 'a conference',
  'schedule', 'calendar', 'my events', 'events'
]);

/**
 * Authoritative Event Entity Extractor (Stage A — Extraction).
 * Extracts structured { title, date, time, location, description } and validity flags
 * without ever copying the raw conversational sentence into the event title or fabricating dates.
 */
export function extractEventParams(rawText: string, payload?: any, refDate: Date = new Date()): ExtractedEventInfo {
  const text = (rawText || '').trim();

  // 1. Date extraction & normalization
  const queryDateInfo = extractExplicitDateFromText(text, refDate);
  const payloadDateInfo = (!queryDateInfo.isExplicit && payload?.date && payload.date !== 'Not specified')
    ? extractExplicitDateFromText(String(payload.date), refDate)
    : { date: null, isExplicit: false };

  // Guard: If payload.date equals today's date, only trust it if the user actually mentioned today/tonight!
  const todayStr = formatLocalIsoDate(refDate);
  const userMentionedToday = /\b(today|tonight|aujourd'hui)\b/i.test(text);
  const isPayloadDateGenuine = payloadDateInfo.isExplicit && (payloadDateInfo.date !== todayStr || userMentionedToday);

  const isDateExplicit = queryDateInfo.isExplicit || isPayloadDateGenuine;
  const date = queryDateInfo.isExplicit && queryDateInfo.date
    ? queryDateInfo.date
    : (isPayloadDateGenuine && payloadDateInfo.date ? payloadDateInfo.date : 'Not specified');

  // 2. Time extraction & normalization
  const explicitTimeFromQuery = extractTimeFromText(text);
  const explicitTimeFromPayload = payload?.time && payload.time !== 'Not specified' && payload.time !== '12:00' && payload.time !== '09:00'
    ? normalizeTimeString(String(payload.time))
    : null;
  const time = explicitTimeFromQuery || explicitTimeFromPayload || (payload?.time && explicitTimeFromQuery ? explicitTimeFromQuery : 'Not specified');
  const isTimeExplicit = time !== 'Not specified';

  // 3. Location extraction
  let location = 'Not specified';
  if (payload?.location && typeof payload.location === 'string' && payload.location !== 'Not specified' && payload.location !== 'TBD') {
    const cand = payload.location.trim();
    const isTimeLike = /^\d{1,2}(:\d{2})?\s*(am|pm|a\.m\.|p\.m\.)?$/i.test(cand);
    const isDateLike = extractExplicitDateFromText(cand, refDate).isExplicit;
    if (!isTimeLike && !isDateLike && !/^(my\s+events|events|calendar)$/i.test(cand)) {
      location = cand;
    }
  }

  if (location === 'Not specified') {
    // Strip known date, time, and "called X" segments before scanning for "in <Location>" or "at <Location>"
    const monthNamesPattern = Object.keys(MONTH_NAME_MAP).sort((a, b) => b.length - a.length).join('|');
    const textForLocation = text
      .replace(new RegExp(`\\b(?:on\\s+)?(?:the\\s+)?(?:${monthNamesPattern})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?(?:\\s*,?\\s*\\d{4})?\\b`, 'gi'), ' ')
      .replace(new RegExp(`\\b(?:on\\s+)?(?:the\\s+)?\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?(?:${monthNamesPattern})\\.?(?:\\s*,?\\s*\\d{4})?\\b`, 'gi'), ' ')
      .replace(/\b(?:at|from|by)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?\b/gi, ' ')
      .replace(/\b(?:to|in|into|inside)\s+(?:my\s+)?(?:events?|calendar|schedule|organizer)\b/gi, ' ')
      .replace(/\b(?:called|named|titled)\s+["']?[^"'\n,.]+?["']?(?=\s+(?:on|at|in|for|tomorrow|today|next|this)\b|$)/gi, ' ');

    const locMatch = textForLocation.match(/\b(?:in|at)\s+([A-Z][a-zA-Z0-9\s,.'-]{1,35}?)(?=\s+(?:on|at|from|for|called|named|titled|tomorrow|today|next|this)\b|[.!?]|$)/);
    if (locMatch && locMatch[1]) {
      const candidate = locMatch[1].trim().replace(/[.,!?]+$/, '').trim();
      const isDateOrDay = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow|morning|afternoon|evening|night)\b/i.test(candidate) ||
                          extractExplicitDateFromText(candidate, refDate).isExplicit;
      const isTime = /^\d{1,2}(:\d{2})?\s*(am|pm)?$/i.test(candidate);
      if (!isDateOrDay && !isTime && candidate.length >= 2) {
        location = candidate;
      }
    }
  }
  const isLocationExplicit = location !== 'Not specified';

  // 4. Event Name (Title) Extraction
  let extractedTitle = '';

  // Pattern A: Explicit "called X", "named X", "titled X" anywhere in the sentence
  // e.g., "I have an event on December 31 called Maranatha."
  // e.g., "Please add an event called Maranatha on December 31."
  // e.g., "I have a conference called Tech Summit on November 12 at 10 AM in Douala."
  const monthNamesPattern = Object.keys(MONTH_NAME_MAP).sort((a, b) => b.length - a.length).join('|');
  const calledRegex = /\b(?:called|named|titled|entitled)\s+["']?([^"'\n.!?]+?)["']?(?=\s+(?:on|at|in|from|by|for|tomorrow|today|tonight|next|this|which|that)\b|[.!?]|$)/i;
  const calledMatch = text.match(calledRegex);

  if (calledMatch && calledMatch[1]) {
    extractedTitle = calledMatch[1]
      .replace(new RegExp(`\\s+(?:on|for)\\s+(?:the\\s+)?(?:${monthNamesPattern}|\\d{1,2}).*$`, 'i'), '')
      .replace(/\s+(?:at|in)\s+.*$/i, '')
      .replace(/[.,!?]+$/, '')
      .trim();
  } else {
    // Pattern B: Strip preambles, dates, times, locations, and event suffixes
    let candidate = text;

    // Strip leading date clauses like "On December 31, ", "On the 8th of August, ", "Tomorrow, "
    candidate = candidate
      .replace(new RegExp(`^(?:on\\s+)?(?:the\\s+)?(?:${monthNamesPattern})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?(?:\\s*,?\\s*\\d{4})?\\s*[,:-]?\\s*`, 'i'), '')
      .replace(new RegExp(`^(?:on\\s+)?(?:the\\s+)?\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?(?:${monthNamesPattern})\\.?(?:\\s*,?\\s*\\d{4})?\\s*[,:-]?\\s*`, 'i'), '')
      .replace(/^(?:tomorrow|today|tonight|next\s+\w+|this\s+\w+)\s*[,:-]?\s*/i, '');

    // Strip conversational preambles & command verbs
    candidate = candidate
      .replace(/^(?:hello|hi|hey|dear)?\s*(?:xena|nexa)?\s*[,!]?\s*/i, '')
      .replace(/^(?:please|kindly|can\s+you|could\s+you|would\s+you|i\s+want\s+(?:you\s+)?to|i\s+would\s+like\s+(?:you\s+)?to|i\s+need\s+(?:you\s+)?to|help\s+me)\s+/i, '')
      .replace(/^(?:please\s+|kindly\s+)?(?:add|create|schedule|book|put|set\s+up|save|register|record)\s+(?:an?\s+|my\s+|the\s+|new\s+)?(?:event|meeting|appointment|conference|workshop|ceremony|party|dinner|lunch|gathering|session)?\s*(?:called|named|titled|for|about)?\s*/i, '')
      .replace(/^(?:i\s+(?:have|got)|i've\s+got|there\s+is|we\s+have)\s+(?:an?\s+|my\s+|the\s+)?(?:important\s+)?(?:event|meeting|appointment|conference|workshop|ceremony|party|dinner|lunch|gathering|session)?\s*(?:called|named|titled)?\s*/i, '');

    // Strip trailing/embedded dates, times, locations, and "to my events"
    candidate = candidate
      .replace(new RegExp(`\\s+(?:on|for|from)?\\s*(?:the\\s+)?(?:${monthNamesPattern})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?(?:\\s*,?\\s*\\d{4})?.*$`, 'i'), '')
      .replace(new RegExp(`\\s+(?:on|for|from)?\\s*(?:the\\s+)?\\d{1,2}(?:st|nd|rd|th)?\\s+(?:of\\s+)?(?:${monthNamesPattern})\\.?(?:\\s*,?\\s*\\d{4})?.*$`, 'i'), '')
      .replace(/\s+(?:on|for)?\s*\b\d{4}-\d{2}-\d{2}\b.*$/i, '')
      .replace(/\s+(?:on|for)?\s*\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b.*$/i, '')
      .replace(/\s+(?:on|this|next)?\s*\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today|tonight|next\s+week|next\s+month)\b.*$/i, '')
      .replace(/\s+(?:at|from|by)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?.*$/i, '')
      .replace(/\s+(?:to|in|into|inside|on)\s+(?:my\s+)?(?:events?(?:\s+tracker)?|calendar|schedule|organizer).*$/i, '')
      .replace(/\s+as\s+an?\s+event.*$/i, '')
      .replace(/[.,!?]+$/, '')
      .trim();

    if (location !== 'Not specified') {
      const escapedLoc = location.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      candidate = candidate.replace(new RegExp(`\\s+(?:in|at)\\s+${escapedLoc}\\b.*$`, 'i'), '').trim();
    }

    extractedTitle = candidate;
  }

  // Also check payload.title if extractedTitle is empty or vague, provided payload.title is not the raw sentence itself
  if ((!extractedTitle || VAGUE_EVENT_TITLES.has(extractedTitle.toLowerCase())) && payload?.title && typeof payload.title === 'string') {
    const pTitle = payload.title.trim().replace(/[.,!?]+$/, '').trim();
    const isWholeSentence = pTitle.toLowerCase() === text.toLowerCase().replace(/[.,!?]+$/, '').trim() && pTitle.split(/\s+/).length > 4;
    if (!isWholeSentence && !VAGUE_EVENT_TITLES.has(pTitle.toLowerCase())) {
      // Run recursive clean on pTitle just in case
      const cleanedP = pTitle
        .replace(new RegExp(`\\s+(?:on|for)?\\s*(?:the\\s+)?(?:${monthNamesPattern})\\.?\\s+\\d{1,2}.*$`, 'i'), '')
        .replace(/\s+(?:to|in|into)\s+(?:my\s+)?events?.*$/i, '')
        .trim();
      if (cleanedP && !VAGUE_EVENT_TITLES.has(cleanedP.toLowerCase())) {
        extractedTitle = cleanedP;
      }
    }
  }

  // Final validation of title
  const normalizedTitleLower = extractedTitle.toLowerCase().replace(/^["']|["']$/g, '').trim();
  const isVagueOrInvalid =
    !normalizedTitleLower ||
    VAGUE_EVENT_TITLES.has(normalizedTitleLower) ||
    /^(?:something|anything)\s+(?:important|special|big|urgent|personal)$/i.test(normalizedTitleLower) ||
    /^(?:on|at|in)\s+/i.test(normalizedTitleLower);

  const isTitleValid = !isVagueOrInvalid;
  const finalTitle = isTitleValid
    ? extractedTitle.replace(/^["']|["']$/g, '').trim()
    : '';

  return {
    title: finalTitle,
    date,
    time,
    location,
    description: payload?.description || text,
    isTitleValid,
    isDateExplicit,
    isTimeExplicit,
    isLocationExplicit
  };
}

/**
 * Clean user's command to extract ONLY the true title of the reminder.
 */
export function cleanReminderTitle(rawTitle: string, fullQuery: string): string {
  let source = (rawTitle || fullQuery || '').trim();

  // 1. Remove correction preambles and greetings
  let cleanedText = source
    .replace(/^(?:(?:chucky\s+chucky|okay|ok|well|so|hey|hi|hello|dear\s+xena|xena)\s+)*(?:thank\s+you(?:\s+very\s+much|\s+too|\s+so\s+much)?|thanks(?:\s+a\s+lot)?|merci(?:\s+beaucoup)?)\s*(?:and\s+)?/i, '')
    .replace(/^(no|no\s+no|actually|i\s+meant|instead|correction|that's\s+wrong|change\s+that|okay|ok|well|so)\b[,]?.?\s*/i, '')
    .replace(/^(?:and\s+)?(?:don't\s+forget\s+to|do\s+not\s+forget\s+to)\s+/i, '')
    .replace(/^(i\s+want\s+you\s+to|i\s+want|i\s+need\s+you\s+to|i\s+would\s+like\s+you\s+to|could\s+you\s+please|can\s+you\s+please)\s+/i, '')
    .trim();

  const conversationalWrappers = [
    /\b(hello|hey|hi|dear)\s+(xena|nexa|assistant)\b[,]?.?/gi,
    /\b(hope\s+you\s+(are|'re)\s+(doing\s+)?(fine|well|good|ok|great))\b[,]?.?/gi,
    /\b(how\s+are\s+you|how's\s+it\s+going|how\s+are\s+you\s+doing)\b[,]?.?/gi,
    /\b(xena|nexa)\s+please\b[,]?.?/gi,
    /\bplease\b[,]?.?/gi,
    /\b(i\s+need\s+you\s+to|i\s+would\s+like\s+you\s+to|i'd\s+like\s+you\s+to|i\s+want\s+you\s+to|could\s+you\s+please|can\s+you\s+please|can\s+you|could\s+you)\b/gi,
  ];

  for (const cw of conversationalWrappers) {
    cleanedText = cleanedText.replace(cw, ' ');
  }
  cleanedText = cleanedText.replace(/\s+/g, ' ').trim();

  // Explicit check for meta-commands / questions asking if Xena can create a reminder / empty intentions
  const isGenericCommandQuestion = /^(create|set|add|make|schedule)?\s*(me\s+)?(a\s+)?reminder\s*[,.]?\s*(can\s+you\s+(do\s+that|help( me)?)|is\s+that\s+possible|\?)?\??$/i.test(cleanedText) ||
    /^(can\s+you\s+(do\s+that|help( me)?)|do\s+it|make\s+one|create\s+one|create\s+something|reminder|task|your\s+task|placeholder|default\s+task|todo|unknown|undefined|null|something|anything)\??$/i.test(cleanedText) ||
    /^create me a reminder, do that\??$/i.test(cleanedText);

  if (isGenericCommandQuestion) {
    return '';
  }

  // 2. Look for explicit action phrase after command words:
  const actionRegexes = [
    /\b(?:create|set|add|make|schedule)(?:\s+me)?(?:\s+a)?\s+reminder\s+(?:at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s+)?(?:for\s+me\s+)?(?:to|for|about)\s+(.+)/i,
    /\b(?:can|could|would)\s+(?:you\s+)?(?:please\s+)?remind\s+me\s+(?:to|for|about|that)\s+(.+)/i,
    /\b(?:can|could|would)\s+(?:you\s+)?(?:please\s+)?(?:create|set|add|make|schedule)\s+(?:me\s+)?(?:a\s+)?reminder\s+(?:to|for|about)\s+(.+)/i,
    /\b(?:make\s+sure\s+(?:that\s+)?(?:i\s+)?(?:remember\s+to|don't\s+forget\s+to))\s+(.+)/i,
    /\b(?:i\s+don't\s+want\s+to\s+forget\s+to|don't\s+let\s+me\s+forget\s+to|don't\s+forget\s+to\s+remind\s+me\s+to|don't\s+forget\s+to|help\s+me\s+remember\s+to|so\s+i\s+don't\s+forget\s+to)\s+(.+)/i,
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
      /^(?:please\s+)?(?:can\s+you\s+)?create\s+(?:me\s+)?a\s+reminder(?:\s+(?:to|for)\b)?\s*/i,
      /^(?:please\s+)?(?:can\s+you\s+)?set\s+(?:me\s+)?a\s+reminder(?:\s+(?:to|for)\b)?\s*/i,
      /^(?:please\s+)?(?:can\s+you\s+)?add\s+(?:me\s+)?a\s+reminder(?:\s+(?:to|for)\b)?\s*/i,
      /^(?:please\s+)?(?:can\s+you\s+)?remind\s+me(?:\s+(?:to|about|that|for)\b)?\s*/i,
      /^i\s+(?:have\s+to|must|need\s+to)\b\s*/i,
      /^please\s+remind\s+me\b\s*/i,
      /^xena\b\s*/i,
    ];
    for (const prefix of commandPrefixes) {
      extractedAction = extractedAction.replace(prefix, '');
    }
  }

  // Clean remaining prepositional prefixes like "for me to", "for me", "to"
  extractedAction = extractedAction.replace(/^(for\s+me\s+to|for\s+me\s+about|for\s+me\s+for|for\s+me|to|for|about|that)\s+/i, '').trim();

  // Check if extractedAction is itself a meta phrase or placeholder
  const isMetaResult = /^(can\s+you\s+do\s+that\??|do\s+it|make\s+one|create\s+one|create\s+something|reminder|task|your\s+task|placeholder|default\s+task|todo|unknown|undefined|null|something|anything|me)$/i.test(extractedAction.trim());
  if (isMetaResult) {
    return '';
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

  // 5. Strip time & relative offset expressions from title (including "by 9:00 p.m.", "before 5 pm", "at 4:00 at 9:00 p.m.")
  const timePatterns = [
    /\b(?:in|for)\s+\d+\s*(seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h)\b(\s*from\s+now)?/gi,
    /\b\d+\s*(seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h)\s*from\s+now\b/gi,
    /\b(?:at|by|before|around|until|till)\s+\d{1,2}(?::\d{2})?\s*(?:minutes?|mins?|m)?\s*(a\.?m\.?|p\.?m\.?)(?!\w)/gi,
    /\b\d{1,2}(?::\d{2})?\s*(?:minutes?|mins?|m)?\s*(a\.?m\.?|p\.?m\.?)(?!\w)/gi,
    /\b(?:at|by|before|around|until|till)\s+\d{1,2}(?::\d{2})?\b/gi,
    /\b\d{1,2}\s+in the (morning|evening|afternoon)\b/gi,
    /\bin the (morning|evening|afternoon)\b/gi,
    /\b(?:at|by|before)\s+noon\b/gi,
    /\b(?:at|by|before)\s+midnight\b/gi,
    /\b(?:at|by|before|around)\s+\d{1,2}\b/gi,
    /\b(?:by|before|at|around)\s*$/gi,
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

  // 7. Clean trailing/leading punctuation, prepositions ("to review Chemistry" -> "review Chemistry"), or extra spaces
  extractedAction = extractedAction
    .replace(/^[\s,.:;?!-]+|[\s,.:;?!-]+$/g, '')
    .replace(/^(?:for\s+me\s+to|for\s+me\s+about|for\s+me\s+for|for\s+me|to|for|about|that)\b\s+/i, '')
    .replace(/^[\s,.:;?!-]+|[\s,.:;?!-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const finalCheck = /^(can\s+you\s+do\s+that\??|do\s+it|make\s+one|create\s+one|create\s+something|reminder|task|your\s+task|placeholder|default\s+task|todo|unknown|undefined|null|something|anything|me)$/i.test(extractedAction);
  if (!extractedAction || finalCheck) return '';

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

  const lowerText = queryText.toLowerCase();

  // Check for relative time offsets (e.g. "in 30 seconds", "in 2 minutes", "in 1 hour")
  const relOffset = extractRelativeTimeOffset(queryText, refDate);

  let date = resolveRelativeDate(payload?.date, queryText, refDate);
  let parsedTime = '';
  let isTimeExplicit = false;
  let isDateExplicit = !!(
    payload?.date ||
    lowerText.includes('today') ||
    lowerText.includes('tomorrow') ||
    lowerText.includes('demain') ||
    lowerText.includes('tonight') ||
    lowerText.includes("aujourd'hui") ||
    lowerText.includes('next week') ||
    /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(lowerText) ||
    /\b\d{4}-\d{2}-\d{2}\b/.test(lowerText) ||
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}\b/i.test(lowerText)
  );

  // Check for multiple conflicting "at/by <time>" expressions in a single reminder query (e.g., "at 4:00 at 9:00 p.m. today")
  const multiTimeMatches = Array.from(
    lowerText.matchAll(/\b(?:at|by|before|for)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.?m\.?|p\.?m\.?)?)/gi)
  ).map(m => m[1].trim());
  const uniqueExplicitTimes = Array.from(new Set(multiTimeMatches));
  const hasExplicitSelfCorrection = /\b(i\s+mean|i\s+meant|actually|sorry|instead|no\s+wait)\b/i.test(lowerText);
  const isTimeRange = /\bfrom\s+\d{1,2}/i.test(lowerText);

  const payloadTimeStr = payload?.time ? String(payload.time) : '';

  if (relOffset) {
    date = relOffset.date;
    parsedTime = relOffset.time;
    isTimeExplicit = true;
    isDateExplicit = true;
  } else if (payloadTimeStr.startsWith('AMBIGUOUS')) {
    isTimeExplicit = false;
    parsedTime = payloadTimeStr;
  } else if (uniqueExplicitTimes.length >= 2 && !hasExplicitSelfCorrection && !isTimeRange && !payloadTimeStr) {
    // Conflicting multiple times in the same reminder utterance (e.g. "at 4:00 at 9:00 p.m.")
    isTimeExplicit = false;
    parsedTime = `AMBIGUOUS_CONFLICT:${uniqueExplicitTimes.join(' or ')}`;
  } else {
    const rawTimeMatch = normalizeTimeString(payload?.time) || extractTimeFromText(queryText);
    if (rawTimeMatch && !rawTimeMatch.startsWith('AMBIGUOUS')) {
      isTimeExplicit = true;
      parsedTime = rawTimeMatch;
    } else if (rawTimeMatch && rawTimeMatch.startsWith('AMBIGUOUS')) {
      isTimeExplicit = false;
      parsedTime = rawTimeMatch;
    } else if (lowerText.includes('at noon') || lowerText.includes('noon')) {
      isTimeExplicit = true;
      parsedTime = '12:00';
    } else if (lowerText.includes('at midnight') || lowerText.includes('midnight')) {
      isTimeExplicit = true;
      parsedTime = '00:00';
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
    category: payload?.category || 'General',
    isTimeExplicit,
    isDateExplicit
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

  const readableDate = formatReadableDate(newRem.date);
  const readableTime = formatReadableTime(newRem.time);
  const confirmation = `## Reminder Created\n\n- **Task:** ${newRem.title}\n- **Date:** ${readableDate}\n- **Time:** ${readableTime}\n- **Notifications:** Voice & Push Enabled`;

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

  // STRICT RULE: Requests containing creation/addition/save/schedule/planning keywords MUST NEVER update an existing reminder.
  const hasCreationIntent = /\b(save|add|create|register|schedule|remind|put\s+this|put\s+it|another|new|plan|organize|timetable)\b/i.test(lower) ||
    lower.includes('a reminder') ||
    lower.includes('me a reminder') ||
    lower.includes('new reminder') ||
    lower.includes('remind me') ||
    lower.includes('plan my') ||
    lower.includes('help me plan') ||
    lower.includes('for one hour') ||
    lower.includes('for two hours') ||
    lower.includes('for 2 hours') ||
    lower.includes('for 1 hour');

  if (hasCreationIntent) {
    return null;
  }

  // Strip conversational prefixes and check for query/creation actions
  const stripped = lower.replace(/^(please|can you|could you|would you|i want you to|help me|go ahead and)\s+/i, '');
  if (/^(remind|create|set|add|schedule|what|when|where|how|do i|list|show|view|check|tell me|i have)/i.test(stripped)) {
    return null;
  }

  // Pattern checks for explicit follow-ups
  const isAffirmativeOrDirectMod = (
    lower.startsWith('yes') ||
    lower.startsWith('sure') ||
    lower.startsWith('make it') ||
    lower.startsWith('repeat') ||
    lower.startsWith('set it') ||
    lower.startsWith('change') ||
    lower.startsWith('update') ||
    lower.startsWith('no') ||
    lower.startsWith('actually') ||
    lower.startsWith('i meant') ||
    lower.startsWith('add note') ||
    lower.startsWith('add a note') ||
    lower.startsWith('add description') ||
    lower.includes('not am') ||
    lower.includes('not pm') ||
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
    lower.includes('daily') ||
    /\b(\d{1,2}(:\d{2})?|\d{1,2}\s+\d{2})\s*(am|pm)\b/i.test(lower)
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
  if (!lastEvent || !queryText) return null;

  const lower = queryText.toLowerCase().trim();

  // STRICT GUARD 1: Identity, purpose, role, and capability questions MUST NEVER update an event
  if (classifyIdentityOrCapability(queryText).isMatch) {
    return null;
  }

  // STRICT GUARD 2: General questions or inquiries are NOT action commands or event parameter answers
  if (isQuestionOrInquiry(queryText)) {
    return null;
  }

  // STRICT GUARD 3: Greetings, gratitude, and casual remarks are NOT event updates
  if (
    /^(hi|hello|hey|good morning|good afternoon|good evening|thanks|thank you|cool|great|nice|ok|okay|bye|see you)\b/i.test(lower)
  ) {
    return null;
  }

  // STRICT RULE: Requests containing creation/addition/save/schedule keywords MUST NEVER update an existing event.
  const hasCreationIntent = /\b(save|add|create|register|schedule|remind|put\s+this|put\s+it|another|new)\b/i.test(lower) ||
    lower.includes('in my events') ||
    lower.includes('to my events') ||
    lower.includes('as an event');

  if (hasCreationIntent) {
    return null;
  }

  // Check for explicit update intent (e.g. "update event location to library", "change date to Friday")
  const hasExplicitUpdateIntent = /\b(update|change|modify|edit|move|reschedule|change\s+the\s+time|change\s+the\s+date|change\s+the\s+location|make\s+it\s+at)\b/i.test(lower);

  // If NOT an explicit update command, it MUST be a short direct response (e.g., "At the university chapel") answering a missing field prompt.
  if (!hasExplicitUpdateIntent) {
    if (queryText.length > 50) return null;
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
    // 1. Explicit location prepositions like "at the library", "in Room 204"
    const locMatch = queryText.match(/\b(?:at|in)\s+([A-Za-z0-9][a-zA-Z0-9\s,.'-]{2,40})/i);
    // 2. Recognized educational/campus location nouns
    const placeWordMatch = queryText.match(/\b(university|library|hall|room|office|church|chapel|center|centre|hub|building|campus|park|stadium|hotel|house|lab|auditorium|classroom|zoom|google meet|online)\b/i);

    if (locMatch) {
      const candidate = locMatch[1].replace(/^(the\s+|a\s+|an\s+)/i, '').trim();
      const isTimeOrDate = /^\d{1,2}(:\d{2})?\s*(am|pm|a\.m\.|p\.m\.)?$/i.test(candidate) ||
                           /\b(am|pm|noon|midnight)\b/i.test(candidate) ||
                           /\b(saturday|sunday|monday|tuesday|wednesday|thursday|friday|today|tomorrow|events|my events)\b/i.test(candidate);
      if (!isTimeOrDate && candidate.length >= 2) {
        updates.location = candidate.charAt(0).toUpperCase() + candidate.slice(1);
      }
    } else if (placeWordMatch) {
      const candidate = queryText.replace(/^(the\s+|it's\s+at\s+|it\s+is\s+at\s+|at\s+|in\s+)/i, '').trim();
      if (candidate.length >= 2 && candidate.length <= 40) {
        updates.location = candidate.charAt(0).toUpperCase() + candidate.slice(1);
      }
    }
  }

  if (Object.keys(updates).length > 0) {
    return { isFollowUp: true, updates };
  }

  return null;
}
