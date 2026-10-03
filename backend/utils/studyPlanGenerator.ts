import { StudySubject, StudyPlanDay, StudyPlanSlot, ExamProximityReminder } from '../types/index.js';
import { extractExplicitDateFromText } from './reminderParser.js';
import { normalizeTimeString, extractTimeFromText } from './timeUtils.js';

export function parseDayList(daysInput?: string[]): string[] {
  if (!daysInput || daysInput.length === 0) {
    return ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  }
  
  const map: Record<string, string> = {
    'mon': 'Monday',
    'monday': 'Monday',
    'tue': 'Tuesday',
    'tues': 'Tuesday',
    'tuesday': 'Tuesday',
    'wed': 'Wednesday',
    'wednesday': 'Wednesday',
    'thu': 'Thursday',
    'thur': 'Thursday',
    'thurs': 'Thursday',
    'thursday': 'Thursday',
    'fri': 'Friday',
    'friday': 'Friday',
    'sat': 'Saturday',
    'saturday': 'Saturday',
    'sun': 'Sunday',
    'sunday': 'Sunday'
  };

  const result: string[] = [];
  daysInput.forEach(d => {
    const key = d.toLowerCase().trim();
    if (map[key] && !result.includes(map[key])) {
      result.push(map[key]);
    }
  });

  return result.length > 0 ? result : ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
}

export function parseHour(timeStr?: string, defaultHour: number = 20): number {
  if (!timeStr) return defaultHour;
  const match = timeStr.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (match) {
    let h = parseInt(match[1], 10);
    const mins = match[2] ? parseInt(match[2], 10) : 0;
    const isPm = match[3] && match[3].toLowerCase() === 'pm';
    if (isPm && h < 12) h += 12;
    if (!isPm && match[3] && match[3].toLowerCase() === 'am' && h === 12) h = 0;
    return h + mins / 60;
  }
  return defaultHour;
}

export function formatTimeSlot(startDec: number, durationDec: number): string {
  const helperFormat = (dec: number) => {
    const totalMins = Math.round(dec * 60);
    const h = ((Math.floor(totalMins / 60) % 24) + 24) % 24;
    const m = ((totalMins % 60) + 60) % 60;
    const hStr = h < 10 ? `0${h}` : `${h}`;
    const mStr = m < 10 ? `0${m}` : `${m}`;
    return `${hStr}:${mStr}`;
  };

  const endDec = startDec + durationDec;
  return `${helperFormat(startDec)} – ${helperFormat(endDec)}`;
}

/**
 * Generates a realistic weekly study timetable prioritizing weaker and harder subjects.
 * Weaker/Harder subjects receive more study time, stronger/easier subjects less, while EVERY subject receives study time.
 */
export function generateSubjectStudyPlan(
  subjects: StudySubject[],
  hoursPerDay: number,
  startTime: string = '20:00',
  endTime: string = '22:00',
  availableDays: string[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
): StudyPlanDay[] {
  if (!subjects || subjects.length === 0) return [];

  const days = parseDayList(availableDays);
  const startHour = parseHour(startTime, 20);
  const endHour = parseHour(endTime, startHour + (hoursPerDay || 2));

  let computedHours = hoursPerDay;
  if (!computedHours && endHour > startHour) {
    computedHours = Math.round(endHour - startHour);
  }
  const totalHours = Math.max(1, Math.min(12, computedHours || 2));
  const slotDuration = 1.0; // 1-hour slots per session

  const getSubjectWeight = (s: StudySubject): number => {
    const levelVal = typeof s.level === 'number' ? s.level : 50;
    const baseWeight = Math.max(10, 105 - Math.min(100, Math.max(0, levelVal)));
    const diffMult = s.difficulty === 'Hard' ? 1.45 : s.difficulty === 'Easy' ? 0.75 : 1.0;
    const prioMult = s.priority === 'High' ? 1.25 : s.priority === 'Low' ? 0.85 : 1.0;
    return Math.round(baseWeight * diffMult * prioMult);
  };

  // Sort subjects by weight descending (highest need / weakest / hardest first)
  const sortedSubjects = [...subjects].sort((a, b) => getSubjectWeight(b) - getSubjectWeight(a));
  const weights = sortedSubjects.map(s => getSubjectWeight(s));
  const totalWeight = weights.reduce((acc, w) => acc + w, 0);

  // Build subject pool sequence based on weights, ensuring EVERY subject appears at least once
  const totalSlotsNeeded = days.length * totalHours;
  const subjectPool: StudySubject[] = [];

  // Guarantee at least 1 slot for every subject
  sortedSubjects.forEach(s => subjectPool.push(s));

  // Fill remaining slots proportionally by weight
  const remainingSlots = totalSlotsNeeded - subjectPool.length;
  if (remainingSlots > 0 && totalWeight > 0) {
    for (let i = 0; i < sortedSubjects.length; i++) {
      const share = Math.round((weights[i] / totalWeight) * remainingSlots);
      for (let k = 0; k < share; k++) {
        subjectPool.push(sortedSubjects[i]);
      }
    }
  }

  while (subjectPool.length < totalSlotsNeeded) {
    subjectPool.push(sortedSubjects[0]);
  }

  // Interleave subjects so a single day has variety when possible while respecting weights
  let poolIndex = 0;
  return days.map((day) => {
    const slots: StudyPlanSlot[] = [];
    for (let h = 0; h < totalHours; h++) {
      const currentStart = startHour + h * slotDuration;
      const subj = subjectPool[poolIndex % subjectPool.length];
      poolIndex++;

      const diffTag = subj.difficulty === 'Hard' || (subj.level !== undefined && subj.level <= 40)
        ? ' — Intensive Focus & Practice'
        : subj.difficulty === 'Easy' || (subj.level !== undefined && subj.level >= 75)
        ? ' — Active Recall & Review'
        : ' — Core Concept Mastery';

      const timeRangeStr = formatTimeSlot(currentStart, slotDuration);
      const [startStr, endStr] = timeRangeStr.split(/\s*[-–]\s*/).map(s => s.trim());

      slots.push({
        time: timeRangeStr,
        activity: `${subj.name}${diffTag}`,
        subject: subj.name,
        start_time: startStr,
        end_time: endStr,
        duration_minutes: Math.round(slotDuration * 60),
        level: subj.level
      } as any);
    }

    return { day, slots };
  });
}

export interface ExtractedStudyRequest {
  subjects: StudySubject[];
  normal_exam_date?: string;
  continuous_assessment_date?: string;
  hours_per_day?: number;
  preferred_start_time?: string;
  preferred_end_time?: string;
  available_days?: string[];
  wantsGenerate: boolean;
  subjectToDelete?: string;
  // Aliases for convenience across callers
  examDate?: string;
  caDate?: string;
  hoursPerDay?: number;
  preferredTime?: string;
  availableDays?: string[];
  wantsTimetable?: boolean;
}

const STOP_WORDS_SUBJECT = new Set([
  'add', 'create', 'track', 'update', 'set', 'change', 'generate', 'make', 'build',
  'my', 'the', 'a', 'an', 'for', 'to', 'in', 'on', 'at', 'from', 'with', 'by',
  'study', 'tracking', 'tracker', 'plan', 'timetable', 'schedule', 'session', 'sessions',
  'exam', 'exams', 'examination', 'course', 'courses', 'subject', 'subjects',
  'hours', 'hour', 'day', 'days', 'daily', 'per', 'every', 'week', 'weekdays', 'weekend', 'weekends',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun',
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
  'today', 'tomorrow', 'next', 'this', 'please', 'xena', 'help', 'me', 'i', 'have', 'am', 'is', 'are', 'can', 'want'
]);

/**
 * Extracts structured Study Tracking parameters (subjects, difficulties/confidence, exam dates,
 * study hours, time windows, available days) from natural language.
 */
export function extractStudyParams(rawText: string, payload?: any, refDate: Date = new Date()): ExtractedStudyRequest {
  const text = (rawText || '').trim();
  const lower = text.toLowerCase();

  const result: ExtractedStudyRequest = {
    subjects: [],
    wantsGenerate: /\b(generate|create|build|make)\b.*\b(study\s+plan|study\s+timetable|study\s+schedule|timetable|revision\s+plan)\b/i.test(lower)
  };

  // 1. Extract CA date vs Normal Exam date
  const caSentenceMatch = text.match(/\b(?:continuous\s+assessment|ca(?:\s+period|\s+session|\s+exam)?)\b[^.!?]*/i);
  if (caSentenceMatch) {
    const caDate = extractExplicitDateFromText(caSentenceMatch[0], refDate);
    if (caDate.isExplicit && caDate.date) {
      result.continuous_assessment_date = caDate.date;
    }
  }

  const examSentenceMatch = text.match(/\b(?:normal\s+exam(?:ination)?|final\s+exam|exams?|test)\b[^.!?]*/i);
  if (examSentenceMatch) {
    const exDate = extractExplicitDateFromText(examSentenceMatch[0], refDate);
    if (exDate.isExplicit && exDate.date) {
      result.normal_exam_date = exDate.date;
    }
  }
  if (!result.normal_exam_date && !result.continuous_assessment_date) {
    const anyDate = extractExplicitDateFromText(text, refDate);
    if (anyDate.isExplicit && anyDate.date) {
      result.normal_exam_date = anyDate.date;
    } else if (payload?.exam_date || payload?.date || payload?.normal_exam_date) {
      const pDate = extractExplicitDateFromText(String(payload.exam_date || payload.date || payload.normal_exam_date), refDate);
      if (pDate.isExplicit && pDate.date) {
        result.normal_exam_date = pDate.date;
      }
    }
  }

  // 2. Extract preferred time window (e.g. "from 7 PM to 10 PM", "between 20:00 and 22:00", "starting at 8pm")
  const rangeMatch = text.match(/\b(?:from|between)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?)\s+(?:to|until|and|-|–)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?)/i) ||
                     text.match(/\b(\d{1,2}:\d{2}\s*(?:am|pm)?)\s*(?:-|–|to)\s*(\d{1,2}:\d{2}\s*(?:am|pm)?)/i);
  if (rangeMatch) {
    const startNorm = extractTimeFromText(rangeMatch[1]) || normalizeTimeString(rangeMatch[1]);
    const endNorm = extractTimeFromText(rangeMatch[2]) || normalizeTimeString(rangeMatch[2]);
    if (startNorm) result.preferred_start_time = startNorm;
    if (endNorm) result.preferred_end_time = endNorm;
  } else {
    const startMatch = text.match(/\b(?:starting\s+at|start\s+at|from|at)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.))\b/i);
    if (startMatch) {
      const startNorm = extractTimeFromText(startMatch[1]) || normalizeTimeString(startMatch[1]);
      if (startNorm) result.preferred_start_time = startNorm;
    }
  }

  // 3. Extract hours per day (e.g. "3 hours a day", "2 hours daily", "study 4 hours")
  const hoursMatch = text.match(/\b(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\s*(?:a\s+day|per\s+day|daily|each\s+day|every\s+day)?\b/i);
  if (hoursMatch) {
    const hrs = Math.round(parseFloat(hoursMatch[1]));
    if (hrs >= 1 && hrs <= 12) {
      result.hours_per_day = hrs;
    }
  } else if (result.preferred_start_time && result.preferred_end_time) {
    const sH = parseHour(result.preferred_start_time, 20);
    const eH = parseHour(result.preferred_end_time, 22);
    const diff = eH >= sH ? Math.round(eH - sH) : Math.round((24 - sH) + eH);
    if (diff >= 1 && diff <= 12) {
      result.hours_per_day = diff;
    }
  }

  if (result.preferred_start_time && !result.preferred_end_time) {
    const sH = parseHour(result.preferred_start_time, 20);
    const hrs = result.hours_per_day || 2;
    const endH = (Math.floor(sH) + hrs) % 24;
    result.preferred_end_time = `${String(endH).padStart(2, '0')}:00`;
  }

  // 4. Extract available study days
  const dayTokenMap: Array<{ rx: RegExp; short: string }> = [
    { rx: /\b(mon|monday)s?\b/i, short: 'Mon' },
    { rx: /\b(tue|tues|tuesday)s?\b/i, short: 'Tue' },
    { rx: /\b(wed|wednesday)s?\b/i, short: 'Wed' },
    { rx: /\b(thu|thur|thurs|thursday)s?\b/i, short: 'Thu' },
    { rx: /\b(fri|friday)s?\b/i, short: 'Fri' },
    { rx: /\b(sat|saturday)s?\b/i, short: 'Sat' },
    { rx: /\b(sun|sunday)s?\b/i, short: 'Sun' },
  ];
  const matchedDays: string[] = [];
  for (const dt of dayTokenMap) {
    if (dt.rx.test(lower)) {
      matchedDays.push(dt.short);
    }
  }
  if (matchedDays.length > 0) {
    result.available_days = matchedDays;
  } else if (/\b(every\s+day|all\s+week|7\s+days|monday\s+to\s+sunday)\b/i.test(lower)) {
    result.available_days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  } else if (/\b(weekdays|monday\s+to\s+friday|mon\s*-\s*fri)\b/i.test(lower)) {
    result.available_days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  } else if (/\b(weekends?|sat\s+and\s+sun|saturday\s+and\s+sunday)\b/i.test(lower)) {
    result.available_days = ['Sat', 'Sun'];
  }

  // 5. Extract subjects and their difficulty/confidence levels
  const addSubjectHelper = (rawName: string, explicitLevel?: number, explicitDiff?: 'Easy' | 'Medium' | 'Hard') => {
    let cleanName = rawName
      .replace(/^.*?\b(?:courses?|subjects?|exams?)\s*:\s*/i, '')
      .replace(/^(?:my\s+)?(?:\d+\s+)?(?:courses?|subjects?|exams?)\s+(?:are\s+|include\s+)?/i, '')
      .replace(/\([^)]*\)/g, '')
      .replace(/\b(?:at|with|level)\s+\d{1,3}%?/gi, '')
      .replace(/^(?:and|or|also|plus|in|for|of|about|subject|course|subjects|courses|exams?)\s+/i, '')
      .replace(/\s+(?:to\s+my\s+study.*|in\s+study.*|for\s+my\s+exam.*|on\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|\d).*)$/i, '')
      .replace(/[.,!?:;]+$/g, '')
      .trim();

    if (!cleanName || cleanName.length < 2) return;
    if (STOP_WORDS_SUBJECT.has(cleanName.toLowerCase())) return;
    if (/^\d+$/.test(cleanName)) return;

    // Check if sentence mentions this subject as hard/weak or easy/strong
    const escaped = cleanName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const isHardOrWeak =
      explicitDiff === 'Hard' ||
      new RegExp(`${escaped}\\s+(?:is\\s+)?(?:very\\s+)?(?:hard|difficult|tough|challenging|weak|my\\s+weakest)`, 'i').test(text) ||
      new RegExp(`(?:weak|struggling|bad|hard|difficult|weakest)\\s+(?:in|with|at|subject\\s+is)\\s+${escaped}`, 'i').test(text) ||
      new RegExp(`${escaped}\\s*\\(\\s*(?:hard|difficult|weak|high)\\s*\\)`, 'i').test(rawName);

    const isEasyOrStrong =
      explicitDiff === 'Easy' ||
      new RegExp(`${escaped}\\s+(?:is\\s+)?(?:very\\s+)?(?:easy|simple|strong|my\\s+strongest)`, 'i').test(text) ||
      new RegExp(`(?:strong|good|confident|easy)\\s+(?:in|with|at)\\s+${escaped}`, 'i').test(text) ||
      new RegExp(`${escaped}\\s*\\(\\s*(?:easy|simple|strong|low)\\s*\\)`, 'i').test(rawName);

    // Check inline percentage on rawName
    const pctMatch = rawName.match(/(\d{1,3})\s*%/);
    let level = explicitLevel !== undefined ? explicitLevel : (pctMatch ? parseInt(pctMatch[1], 10) : undefined);

    let difficulty: 'Easy' | 'Medium' | 'Hard' = explicitDiff || 'Medium';
    let priority: 'Low' | 'Medium' | 'High' = 'Medium';

    if (isHardOrWeak) {
      difficulty = 'Hard';
      priority = 'High';
      if (level === undefined) level = 30;
    } else if (isEasyOrStrong) {
      difficulty = 'Easy';
      priority = 'Low';
      if (level === undefined) level = 80;
    } else {
      if (level !== undefined) {
        if (level <= 40) {
          difficulty = 'Hard';
          priority = 'High';
        } else if (level >= 75) {
          difficulty = 'Easy';
          priority = 'Low';
        }
      } else {
        level = 50;
      }
    }

    // Format name nicely (preserve course codes like CSC305)
    const formattedName = /^[A-Za-z]{2,4}\s*\d{3}$/.test(cleanName)
      ? cleanName.toUpperCase().replace(/\s+/, '')
      : cleanName.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

    if (!result.subjects.some(s => s.name.toLowerCase() === formattedName.toLowerCase())) {
      result.subjects.push({
        id: `subj-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        name: formattedName,
        difficulty,
        priority,
        level
      });
    }
  };

  // 5a. Check course codes first (e.g. CSC305, MAT201)
  const courseCodes = text.match(/\b[A-Z]{2,4}[- ]?\d{3}\b/g);
  if (courseCodes && courseCodes.length > 0) {
    courseCodes.forEach(code => addSubjectHelper(code));
  }

  // 5b. Check explicit list patterns:
  // "exams in Mathematics, Physics, and Chemistry"
  // "study timetable for my 3 courses: Algorithms (hard), Database Systems (medium), and Linear Algebra (easy)"
  // "study timetable for Calculus (Hard), Linear Algebra (Medium), and Statistics (Easy)"
  // "subjects are Math, Physics and Biology"
  // "Add Data Structures and Operating Systems to my study tracker"
  const listPatterns = [
    /\b(?:courses?|subjects?)\s*:\s*([^.!?\n]+?)(?=(?:\s+(?:on\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|\d)|starting|from\s+\d|for\s+\d+\s+hour|at\s+\d{1,2}\s*(?:am|pm)|to\s+my\s+study)|[.!?]|$))/i,
    /\b(?:exams?\s+(?:in|for|on)|subjects?\s+(?:are|include|:)|courses?\s+(?:are|include|:)|timetable\s+for|study\s+plan\s+for|studying|revise\s+for|track(?:ing)?(?:\s+my\s+studies\s+for)?)\s+([^.!?\n]+?)(?=(?:\s+(?:on\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|\d)|starting|from\s+\d|for\s+\d+\s+hour|at\s+\d{1,2}\s*(?:am|pm)|to\s+my\s+study)|[.!?]|$))/i,
    /\b(?:add|include|put)\s+([^.!?\n]+?)\s+(?:to|in|into)\s+(?:my\s+)?(?:study\s*(?:tracker|tracking|plan|timetable)?|subjects?|exams?)/i,
  ];

  for (const lp of listPatterns) {
    const m = text.match(lp);
    if (m && m[1]) {
      const cleanedList = m[1].replace(/^(?:my\s+)?(?:\d+\s+)?(?:courses?|subjects?|exams?)\s*[:\-]?\s*/i, '');
      const parts = cleanedList
        .split(/\s*(?:,|\band\b|\s+&\s+)\s*/i)
        .map(p => p.trim())
        .filter(Boolean);
      parts.forEach(part => addSubjectHelper(part));
    }
  }

  // 5c. Also check payload.course / payload.subject_name / payload.courses
  if (payload?.courses && Array.isArray(payload.courses)) {
    payload.courses.forEach((c: string) => addSubjectHelper(String(c)));
  }
  if (payload?.course && typeof payload.course === 'string') {
    payload.course.split(/\s*(?:,|\band\b)\s*/i).forEach((c: string) => addSubjectHelper(c));
  }
  if (payload?.subject_name && typeof payload.subject_name === 'string') {
    addSubjectHelper(payload.subject_name, payload.level);
  }

  // If user provided subjects + availability/exam date, auto-enable timetable generation
  if (result.subjects.length > 0 && (result.hours_per_day || result.preferred_start_time || result.available_days || result.normal_exam_date)) {
    result.wantsGenerate = true;
  }

  result.examDate = result.normal_exam_date;
  result.caDate = result.continuous_assessment_date;
  result.hoursPerDay = result.hours_per_day;
  result.preferredTime = result.preferred_start_time && result.preferred_end_time
    ? `${result.preferred_start_time} - ${result.preferred_end_time}`
    : result.preferred_start_time;
  result.availableDays = result.available_days;
  result.wantsTimetable = result.wantsGenerate;

  return result;
}

export function generateStudyPlan(
  course: string,
  hoursPerDay: number,
  prefTime: string,
  availableDays: string[]
): StudyPlanDay[] {
  const dummySubject: StudySubject = {
    id: '1',
    name: course || 'Study',
    level: 30
  };
  let startTime = '20:00';
  let endTime = '22:00';
  if (prefTime) {
    const parts = prefTime.split('-').map(p => p.trim());
    if (parts[0]) startTime = parts[0];
    if (parts[1]) endTime = parts[1];
  }
  return generateSubjectStudyPlan([dummySubject], hoursPerDay, startTime, endTime, availableDays);
}

export function generateExamReminders(
  course: string,
  examDateStr: string
): ExamProximityReminder[] {
  if (!examDateStr || !/^\d{4}-\d{2}-\d{2}$/.test(examDateStr)) {
    return [];
  }

  const examDate = new Date(examDateStr + 'T00:00:00');
  if (isNaN(examDate.getTime())) return [];

  const milestones = [
    { label: '1 month before', days: 30 },
    { label: '2 weeks before', days: 14 },
    { label: '1 week before', days: 7 }
  ];

  return milestones.map((m, idx) => {
    const remDate = new Date(examDate.getTime() - m.days * 24 * 60 * 60 * 1000);
    const dateStr = remDate.toISOString().split('T')[0];
    return {
      id: `exam-rem-${idx + 1}-${Date.now()}`,
      milestone: m.label,
      date: dateStr,
      title: `Exam Reminder: ${course} exam in ${m.label.replace(' before', '')}`,
      status: 'scheduled'
    };
  });
}
