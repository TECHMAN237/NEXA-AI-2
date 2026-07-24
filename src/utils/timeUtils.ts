export function normalizeTimeString(timeStr?: string | null): string | null {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const trimmed = timeStr.trim();
  const m = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (m) {
    const h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    if (h >= 0 && h <= 23 && min >= 0 && min <= 59) {
      return `${h.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
    }
  }
  return null;
}

export function extractTimeFromText(text?: string | null): string | null {
  if (!text || typeof text !== 'string') return null;
  const lower = text.toLowerCase();

  // 1. Check for 12-hour AM/PM with minutes: e.g. "3:30 pm", "08:15 AM", "9:00 am"
  const ampmMinuteMatch = lower.match(/\b(\d{1,2}):(\d{2})\s*(am|pm)\b/i);
  if (ampmMinuteMatch) {
    let hour = parseInt(ampmMinuteMatch[1], 10);
    const minute = parseInt(ampmMinuteMatch[2], 10);
    const ampm = ampmMinuteMatch[3].toLowerCase();
    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
    return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
  }

  // 2. Check for 12-hour AM/PM without minutes: e.g. "3 pm", "8am", "9pm", "8 am"
  const ampmHourMatch = lower.match(/\b(\d{1,2})\s*(am|pm)\b/i);
  if (ampmHourMatch) {
    let hour = parseInt(ampmHourMatch[1], 10);
    const ampm = ampmHourMatch[2].toLowerCase();
    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
    return `${hour.toString().padStart(2, '0')}:00`;
  }

  // 3. Check for French format with 'h' / 'H': e.g. "18h30", "15h", "8h00", "8h", "20h"
  const frenchHMatch = lower.match(/\b(\d{1,2})\s*h\s*(\d{2})?\b/i);
  if (frenchHMatch) {
    let hour = parseInt(frenchHMatch[1], 10);
    const minute = frenchHMatch[2] ? parseInt(frenchHMatch[2], 10) : 0;
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
    }
  }

  // 4. Check for 24-hour HH:MM or H:MM: e.g. "14:30", "08:00", "9:15", "20:00"
  const hhmmMatch = lower.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (hhmmMatch) {
    const hour = parseInt(hhmmMatch[1], 10);
    const minute = parseInt(hhmmMatch[2], 10);
    return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
  }

  // 5. Check for French/English "à 18h", "à 18 heures", "at 18", "at 6", "à 15"
  const atHourMatch = lower.match(/\b(?:at|à|a)\s+(\d{1,2})\s*(?:heures?|hrs?|o'clock)?\b/i);
  if (atHourMatch) {
    let hour = parseInt(atHourMatch[1], 10);
    if (hour >= 0 && hour <= 23) {
      return `${hour.toString().padStart(2, '0')}:00`;
    }
  }

  return null;
}
