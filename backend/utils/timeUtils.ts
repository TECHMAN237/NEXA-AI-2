export function normalizeTimeString(timeStr?: string | null): string | null {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const trimmed = timeStr.trim();
  const m = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (m) {
    const h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    const sec = m[3] ? parseInt(m[3], 10) : 0;
    if (h >= 0 && h <= 23 && min >= 0 && min <= 59 && sec >= 0 && sec <= 59) {
      if (m[3]) {
        return `${h.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
      }
      return `${h.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
    }
  }
  return null;
}

/**
 * Extracts relative time offsets like "in 30 seconds", "in 2 minutes", "in 1 hour", "30s from now".
 */
export function extractRelativeTimeOffset(
  text?: string | null,
  refDate: Date = new Date()
): { date: string; time: string; scheduledAt: string } | null {
  if (!text || typeof text !== 'string') return null;
  const lower = text.toLowerCase().trim();

  // 1. Seconds: "in 30 seconds", "in 30 secs", "in 30s", "for 30 seconds", "30 seconds from now"
  const secMatch = lower.match(/\b(?:in|for)\s+(\d+)\s*(?:seconds?|secs?|s)\b/i) ||
                   lower.match(/\b(\d+)\s*(?:seconds?|secs?|s)\s*(?:from\s+now)?\b/i);
  if (secMatch) {
    const secs = parseInt(secMatch[1], 10);
    if (secs > 0 && secs <= 86400) {
      const target = new Date(refDate.getTime() + secs * 1000);
      return formatDateAndTime(target);
    }
  }

  // 2. Minutes: "in 2 minutes", "in 5 mins", "in 10m", "5 minutes from now"
  const minMatch = lower.match(/\b(?:in|for)\s+(\d+)\s*(?:minutes?|mins?|m)\b/i) ||
                   lower.match(/\b(\d+)\s*(?:minutes?|mins?|m)\s*(?:from\s+now)?\b/i);
  if (minMatch) {
    const mins = parseInt(minMatch[1], 10);
    if (mins > 0 && mins <= 1440) {
      const target = new Date(refDate.getTime() + mins * 60 * 1000);
      return formatDateAndTime(target);
    }
  }

  // 3. Hours: "in 1 hour", "in 2 hours", "in 3 hrs"
  const hrMatch = lower.match(/\b(?:in|for)\s+(\d+)\s*(?:hours?|hrs?|h)\b/i) ||
                  lower.match(/\b(\d+)\s*(?:hours?|hrs?|h)\s*(?:from\s+now)?\b/i);
  if (hrMatch) {
    const hrs = parseInt(hrMatch[1], 10);
    if (hrs > 0 && hrs <= 168) {
      const target = new Date(refDate.getTime() + hrs * 3600 * 1000);
      return formatDateAndTime(target);
    }
  }

  return null;
}

function formatDateAndTime(d: Date): { date: string; time: string; scheduledAt: string } {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');

  return {
    date: `${year}-${month}-${day}`,
    time: `${hours}:${minutes}:${seconds}`,
    scheduledAt: d.toISOString()
  };
}

export interface DurationResult {
  durationHours: number;
  durationMinutes: number;
  durationLabel: string;
}

const wordNumberMap: Record<string, number> = {
  'one': 1, 'a': 1, 'an': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
  'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
  'eleven': 11, 'twelve': 12, 'thirteen': 13, 'fourteen': 14, 'fifteen': 15,
  'sixteen': 16, 'seventeen': 17, 'eighteen': 18, 'nineteen': 19, 'twenty': 20,
  'twenty-five': 25, 'thirty': 30, 'forty': 40, 'forty-five': 45, 'fifty': 50
};

/**
 * Extracts exact task/activity duration without rounding or guessing.
 * E.g., "3 minutes" -> 3 minutes (0.05 hours)
 * E.g., "17 minutes" -> 17 minutes
 * E.g., "1.5 hours" -> 90 minutes (1.5 hours)
 */
export function extractDurationFromText(text?: string | null): DurationResult | null {
  if (!text || typeof text !== 'string') return null;
  const lower = text.toLowerCase().trim();

  // 1. Digit minutes: "3 minutes", "17 mins", "30m", "45 min"
  const digitMinMatch = lower.match(/\b(\d+(\.\d+)?)\s*(minutes?|mins?|m)\b/i);
  if (digitMinMatch) {
    const mins = parseFloat(digitMinMatch[1]);
    if (mins > 0) {
      return {
        durationHours: mins / 60,
        durationMinutes: mins,
        durationLabel: mins === 1 ? '1 min' : `${mins} mins`
      };
    }
  }

  // 2. Digit hours: "1.5 hours", "2 hrs", "3h", "1 hour"
  const digitHrMatch = lower.match(/\b(\d+(\.\d+)?)\s*(hours?|hrs?|h)\b/i);
  if (digitHrMatch) {
    const hrs = parseFloat(digitHrMatch[1]);
    if (hrs > 0) {
      const mins = Math.round(hrs * 60);
      return {
        durationHours: hrs,
        durationMinutes: mins,
        durationLabel: hrs === 1 ? '1h' : (hrs % 1 === 0 ? `${hrs}h` : `${hrs}h`)
      };
    }
  }

  // 3. Word-number minutes: "three minutes", "seventeen minutes", "thirty minutes"
  const wordKeys = Object.keys(wordNumberMap).join('|');
  const wordMinRegex = new RegExp(`\\b(${wordKeys})\\s*(minutes?|mins?)\\b`, 'i');
  const wordMinMatch = lower.match(wordMinRegex);
  if (wordMinMatch) {
    const word = wordMinMatch[1].toLowerCase();
    const mins = wordNumberMap[word];
    if (mins) {
      return {
        durationHours: mins / 60,
        durationMinutes: mins,
        durationLabel: mins === 1 ? '1 min' : `${mins} mins`
      };
    }
  }

  // 4. Word-number hours: "one hour", "two hours", "three hours"
  const wordHrRegex = new RegExp(`\\b(${wordKeys})\\s*(hours?|hrs?)\\b`, 'i');
  const wordHrMatch = lower.match(wordHrRegex);
  if (wordHrMatch) {
    const word = wordHrMatch[1].toLowerCase();
    const hrs = wordNumberMap[word];
    if (hrs) {
      return {
        durationHours: hrs,
        durationMinutes: hrs * 60,
        durationLabel: hrs === 1 ? '1h' : `${hrs}h`
      };
    }
  }

  return null;
}

/**
 * Extracts normalized 24-hour time "HH:MM" or detects ambiguous time "AMBIGUOUS:H".
 * Strictly distinguishes AM/PM, contextual indicators, and explicit formats.
 */
export function extractTimeFromText(text?: string | null): string | null {
  if (!text || typeof text !== 'string') return null;
  const lower = text.toLowerCase().trim();

  // Special named times
  if (/\bnoon\b|\bmidday\b/i.test(lower)) return '12:00';
  if (/\bmidnight\b/i.test(lower)) return '00:00';

  // 1. Explicit 12-hour AM/PM with minutes: e.g. "3:30 pm", "08:15 AM", "9:00 am", "12:00 am"
  const ampmMinuteMatch = lower.match(/\b(\d{1,2}):(\d{2})\s*(am|pm|a\.m\.|p\.m\.)\b/i);
  if (ampmMinuteMatch) {
    let hour = parseInt(ampmMinuteMatch[1], 10);
    const minute = parseInt(ampmMinuteMatch[2], 10);
    const ampm = ampmMinuteMatch[3].replace(/\./g, '').toLowerCase();
    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
    return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
  }

  // 1b. Digit hour and space minutes with AM/PM: e.g. "1 22 PM", "01 22 pm", "3 45 am"
  const spaceMinuteMatch = lower.match(/\b(\d{1,2})\s+(\d{2})\s*(am|pm|a\.m\.|p\.m\.)\b/i);
  if (spaceMinuteMatch) {
    let hour = parseInt(spaceMinuteMatch[1], 10);
    const minute = parseInt(spaceMinuteMatch[2], 10);
    const ampm = spaceMinuteMatch[3].replace(/\./g, '').toLowerCase();
    if (hour >= 1 && hour <= 12 && minute >= 0 && minute <= 59) {
      if (ampm === 'pm' && hour < 12) hour += 12;
      if (ampm === 'am' && hour === 12) hour = 0;
      return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
    }
  }

  // 1c. Spoken word hours and minutes: e.g. "one twenty-two pm", "one twenty two pm", "three fifteen pm"
  const spokenWordMatch = lower.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+((?:twenty|thirty|forty|fifty)(?:[\s-](?:one|two|three|four|five|six|seven|eight|nine))?|fifteen|ten|five)\s*(am|pm|a\.m\.|p\.m\.)\b/i);
  if (spokenWordMatch) {
    const hWord = spokenWordMatch[1].toLowerCase();
    const mWord = spokenWordMatch[2].toLowerCase().replace('-', ' ');
    const ampm = spokenWordMatch[3].replace(/\./g, '').toLowerCase();

    let hour = wordNumberMap[hWord] || 0;
    let minute = 0;
    const parts = mWord.split(' ');
    for (const p of parts) {
      if (wordNumberMap[p] !== undefined) {
        minute += wordNumberMap[p];
      }
    }

    if (hour >= 1 && hour <= 12) {
      if (ampm === 'pm' && hour < 12) hour += 12;
      if (ampm === 'am' && hour === 12) hour = 0;
      return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
    }
  }

  // 2. Explicit 12-hour AM/PM without minutes: e.g. "3 pm", "3pm", "8am", "8 am", "12 pm", "12 am"
  const ampmHourMatch = lower.match(/\b(\d{1,2})\s*(am|pm|a\.m\.|p\.m\.)\b/i);
  if (ampmHourMatch) {
    let hour = parseInt(ampmHourMatch[1], 10);
    const ampm = ampmHourMatch[2].replace(/\./g, '').toLowerCase();
    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
    return `${hour.toString().padStart(2, '0')}:00`;
  }

  // 3. Word numbers with AM/PM: e.g. "three pm", "eight am", "twelve pm"
  const wordKeys = Object.keys(wordNumberMap).join('|');
  const wordAmpmMatch = lower.match(new RegExp(`\\b(${wordKeys})\\s*(am|pm|a\\.m\\.|p\\.m\\.)\\b`, 'i'));
  if (wordAmpmMatch) {
    const word = wordAmpmMatch[1].toLowerCase();
    let hour = wordNumberMap[word];
    if (hour !== undefined && hour >= 1 && hour <= 12) {
      const ampm = wordAmpmMatch[2].replace(/\./g, '').toLowerCase();
      if (ampm === 'pm' && hour < 12) hour += 12;
      if (ampm === 'am' && hour === 12) hour = 0;
      return `${hour.toString().padStart(2, '0')}:00`;
    }
  }

  // 4. Contextual Indicators for Afternoon / Evening / Night:
  // "3 in the afternoon", "3 tonight", "8 tonight", "8 in the evening", "3 this afternoon", "3 at night"
  const eveMatch = lower.match(/\b(\d{1,2})(?::(\d{2}))?\s*(?:in the|this|at)?\s*(afternoon|evening|night|tonight|l'après-midi|soir)\b/i);
  if (eveMatch) {
    let hour = parseInt(eveMatch[1], 10);
    const minute = eveMatch[2] ? parseInt(eveMatch[2], 10) : 0;
    if (hour >= 1 && hour < 12) hour += 12;
    return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
  }

  // 5. Contextual Indicators for Morning:
  // "8 in the morning", "3 in the morning", "8 this morning"
  const mornMatch = lower.match(/\b(\d{1,2})(?::(\d{2}))?\s*(?:in the|this|at)?\s*(morning|matin)\b/i);
  if (mornMatch) {
    let hour = parseInt(mornMatch[1], 10);
    const minute = mornMatch[2] ? parseInt(mornMatch[2], 10) : 0;
    if (hour === 12) hour = 0;
    return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
  }

  // 6. French format 'h' / 'H': e.g. "18h30", "15h", "8h00", "20h"
  const frenchHMatch = lower.match(/\b(\d{1,2})\s*h\s*(\d{2})?\b/i);
  if (frenchHMatch) {
    let hour = parseInt(frenchHMatch[1], 10);
    const minute = frenchHMatch[2] ? parseInt(frenchHMatch[2], 10) : 0;
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
    }
  }

  // 7. Explicit 24-hour format HH:MM: e.g. "14:30", "08:00", "14:00", "20:00", "14:03"
  const hhmmMatch = lower.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (hhmmMatch) {
    const hour = parseInt(hhmmMatch[1], 10);
    const minute = parseInt(hhmmMatch[2], 10);
    return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
  }

  // 8. Explicit 24-hour "at X" or "à X" where X >= 13 and <= 23: e.g. "at 14", "at 18", "at 20"
  const at24Match = lower.match(/\b(?:at|à|a)\s+(1[3-9]|2[0-3])\s*(?:heures?|hrs?|o'clock)?\b/i);
  if (at24Match) {
    const hour = parseInt(at24Match[1], 10);
    return `${hour.toString().padStart(2, '0')}:00`;
  }

  // 9. Bare "at X" / "à X" or "X o'clock" where X is 1..12 and no AM/PM or morning/afternoon context exists:
  // e.g., "at 3", "remind me at 3", "at 8"
  const bareAtMatch = lower.match(/\b(?:at|à|a)\s+(\d{1,2})\s*(?:o'clock)?\b/i) || lower.match(/\b(\d{1,2})\s*o'clock\b/i);
  if (bareAtMatch) {
    const hour = parseInt(bareAtMatch[1], 10);
    if (hour === 12) {
      return '12:00';
    }
    if (hour >= 1 && hour <= 11) {
      // Check if context elsewhere in text indicates morning vs afternoon/evening
      if (/\b(afternoon|evening|tonight|night|p\.m\.|pm)\b/i.test(lower)) {
        return `${(hour + 12).toString().padStart(2, '0')}:00`;
      }
      if (/\b(morning|a\.m\.|am)\b/i.test(lower)) {
        return `${hour.toString().padStart(2, '0')}:00`;
      }
      return `AMBIGUOUS:${hour}`;
    }
  }

  return null;
}
