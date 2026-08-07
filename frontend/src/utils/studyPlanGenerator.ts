import { StudySubject, StudyPlanDay, StudyPlanSlot, ExamProximityReminder } from '../types.js';

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
    const isPm = match[3] && match[3].toLowerCase() === 'pm';
    if (isPm && h < 12) h += 12;
    if (!isPm && match[3] && match[3].toLowerCase() === 'am' && h === 12) h = 0;
    return h;
  }
  return defaultHour;
}

export function formatTimeSlot(startDec: number, durationDec: number): string {
  const helperFormat = (dec: number) => {
    const totalMins = Math.round(dec * 60);
    const h = Math.floor(totalMins / 60) % 24;
    const m = totalMins % 60;
    const hStr = h < 10 ? `0${h}` : `${h}`;
    const mStr = m < 10 ? `0${m}` : `${m}`;
    return `${hStr}:${mStr}`;
  };

  const endDec = startDec + durationDec;
  return `${helperFormat(startDec)} – ${helperFormat(endDec)}`;
}

/**
 * Generates a realistic weekly study timetable prioritizing weaker subjects (lower percentage level).
 * Weaker subjects get more study time, stronger subjects less, but EVERY subject receives study time.
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
  const totalHours = Math.max(1, Math.min(12, hoursPerDay || 2));
  const slotDuration = 1.0; // 1-hour slots per session

  // Sort subjects by level ascending (weaker subjects first)
  const sortedSubjects = [...subjects].sort((a, b) => a.level - b.level);

  // Calculate weights: weaker level (e.g. 15%) gets higher weight (e.g. 90)
  const weights = sortedSubjects.map(s => Math.max(5, 105 - Math.min(100, Math.max(0, s.level))));
  const totalWeight = weights.reduce((acc, w) => acc + w, 0);

  // Build subject pool sequence based on weights, ensuring EVERY subject appears at least once
  const totalSlotsNeeded = days.length * totalHours;
  const subjectPool: string[] = [];

  // Guarantee at least 1 slot for every subject
  sortedSubjects.forEach(s => subjectPool.push(s.name));

  // Fill remaining slots proportionally by weight
  let remainingSlots = totalSlotsNeeded - subjectPool.length;
  if (remainingSlots > 0) {
    for (let i = 0; i < sortedSubjects.length; i++) {
      const share = Math.round((weights[i] / totalWeight) * remainingSlots);
      for (let k = 0; k < share; k++) {
        subjectPool.push(sortedSubjects[i].name);
      }
    }
  }

  // If pool is still short or long due to rounding, adjust
  while (subjectPool.length < totalSlotsNeeded) {
    subjectPool.push(sortedSubjects[0].name);
  }

  // Generate timetable for each available day
  let poolIndex = 0;
  return days.map((day) => {
    const slots: StudyPlanSlot[] = [];
    for (let h = 0; h < totalHours; h++) {
      const currentStart = startHour + h * slotDuration;
      const subjectName = subjectPool[poolIndex % subjectPool.length];
      poolIndex++;

      slots.push({
        time: formatTimeSlot(currentStart, slotDuration),
        activity: subjectName
      });
    }

    return { day, slots };
  });
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
