import { extractTimeFromText, extractDurationFromText, formatReadableDate } from '../utils/timeUtils.js';

export type TaskConstraintType = 'fixed_time' | 'duration_only' | 'fixed_and_duration' | 'flexible' | 'deadline';

export interface ExtractedTaskConstraint {
  id: string;
  rawSnippet: string;
  title: string;
  constraintType: TaskConstraintType;
  fixedStartTimeStr?: string | null; // e.g. "06:48", "15:00"
  fixedEndTimeStr?: string | null;   // e.g. "11:00"
  fixedStartTimeMin?: number | null; // minutes from midnight (0..1439)
  fixedEndTimeMin?: number | null;   // minutes from midnight (0..1439)
  durationMinutes: number;           // in minutes
  durationHours: number;             // e.g. 1.0, 1.5, 2.0
  durationLabel: string;             // e.g. "1h", "2h", "45 mins"
  deadlineMin?: number | null;       // minutes from midnight
  deadlineStr?: string | null;
  priority: 'high' | 'medium' | 'low';
  isFlexible: boolean;
  hasExplicitDuration: boolean;
  hasExplicitStartTime: boolean;
  originalOrder: number;
}

export interface ScheduleTimeBlock {
  id: string;
  title: string;
  time: string;                     // e.g. "06:48 – 07:48"
  startTime: string;                // "06:48"
  endTime: string;                  // "07:48"
  startMinutes: number;             // 408
  endMinutes: number;               // 468
  duration: string;                 // "1h"
  durationHours: number;            // 1
  durationMinutes: number;          // 60
  priority: 'high' | 'medium' | 'low';
  reminder_enabled: boolean;
  constraintType: TaskConstraintType;
  color?: string;
  description?: string;
}

export interface ConflictReport {
  taskA: string;
  taskB: string;
  slotA: string;
  slotB: string;
  reason: string;
  conflictType: 'fixed_overlap' | 'calendar_event_overlap' | 'infeasible_duration';
}

export interface ScheduleGenerationResult {
  success: boolean;
  hasConflict: boolean;
  date: string;
  timeline: ScheduleTimeBlock[];
  cleanPlanSummary: string;
  suggestions: string;
  conflictReport?: ConflictReport;
  clarificationMessage?: string;
  unscheduledTasks?: Array<{ title: string; reason: string }>;
}

export class DailyScheduleEngine {
  /**
   * Helper to convert "HH:MM" (24-hour) string to minutes from midnight (0..1439)
   */
  public static timeStringToMinutes(timeStr: string): number {
    if (!timeStr) return 480; // default 08:00 AM
    const parts = timeStr.trim().split(':');
    const h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    return Math.max(0, Math.min(1439, h * 60 + m));
  }

  /**
   * Helper to format minutes from midnight into 24-hour "HH:MM" string
   */
  public static minutesToTimeString(minutes: number): string {
    const totalM = Math.max(0, Math.round(minutes)) % 1440;
    const h = Math.floor(totalM / 60);
    const m = totalM % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  }

  /**
   * Identifies whether a chunk of text is pure conversational meta-instruction
   */
  public static isMetaInstruction(text: string): boolean {
    const lower = text.trim().toLowerCase();
    if (!lower || lower.length < 2) return true;
    if (/^(help me|plan my day|generate my plan|generate my plan for that|create my plan|make a schedule|organize these tasks|schedule them|for that|plan it|make a plan)$/i.test(lower)) return true;
    if (/^can\s+you\s+(create|generate|make)\s+(a|my)?\s*(plan|schedule)/i.test(lower)) return true;
    if (/^i\s+want\s+you\s+to\s+help\s+me/i.test(lower)) return true;
    if (/^i\s+am\s+writing\s+my\s+exams/i.test(lower) || lower.includes("how can i proceed to succeed")) return true;
    if (/^generate\s+(my|a)?\s*plan/i.test(lower)) return true;
    if (/^create\s+(my|a)?\s*plan/i.test(lower)) return true;
    if (/^plan\s+my\s+day/i.test(lower)) return true;
    if (/^help\s+me\s+plan/i.test(lower)) return true;
    if (/^organize\s+(these\s+tasks|my\s+day|my\s+schedule|my\s+tasks|my\s+revision)/i.test(lower)) return true;
    if (/^arrange\s+(these\s+activities|my\s+tasks)/i.test(lower)) return true;
    if (/^for\s+that\??$/i.test(lower)) return true;
    if (lower.split(' ').length > 10 && !/\b(at|from|for|before|by|avant|à)\s+(\d+|\w+)\b/i.test(lower)) return true;
    return false;
  }

  /**
   * Cleans a raw title string by removing timing artifacts, command prefixes, and noise.
   */
  public static cleanTaskTitle(rawChunk: string): string {
    if (this.isMetaInstruction(rawChunk)) return '';

    let clean = rawChunk
      // Remove time ranges: "from 8 AM to 11 AM", "from 8 to 10", "from 8h to 11h"
      .replace(/\b(?:from|de)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*(?:to|à|au|-)\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b/gi, '')
      // Remove durations: "for two hours", "for 1 hour", "for 90 minutes", "for 45 mins", "pendant 2 heures"
      .replace(/\b(?:for|pendant|durant)\s+\d+(\.\d+)?\s*(?:hours?|hrs?|h|minutes?|mins?|m|heures?)\b/gi, '')
      .replace(/\b(?:for|pendant|durant)\s+(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|une|un|deux|trois|quatre|cinq|six|sept|huit|neuf|dix)\s*(?:hours?|hrs?|h|minutes?|mins?|m|heures?)\b/gi, '')
      .replace(/\b\d+(\.\d+)?\s*(?:hours?|hrs?|minutes?|mins?|heures?)\b/gi, '')
      // Remove start times: "at 6:48 AM", "at 3 PM", "à 18h", "starting at 8 AM", "at 8", "at 6 48 am", "à 15h"
      .replace(/(?:^|\s|[.,;])(?:starts?\s+at|starting\s+at|at|à|commençant\s+à)\s+\d{1,2}(?::\d{2}|h\d{0,2})?\s*(?:minutes?|mins?|m)?\s*(?:am|pm|a\.?m\.?|p\.?m\.?)?\b/gi, ' ')
      .replace(/\b\d{1,2}h\d{0,2}\b/gi, '')
      .replace(/\b\d{1,2}:\d{2}\s*(?:minutes?|mins?|m)?\s*(?:am|pm|a\.?m\.?|p\.?m\.?)?\b/gi, '')
      .replace(/\b\d{1,2}\s*(?:am|pm|a\.?m\.?|p\.?m\.?)\b/gi, '')
      // Remove deadlines: "before 5 PM", "by 6 PM", "avant 17h"
      .replace(/\b(?:before|by|avant)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b/gi, '')
      // Remove conversational flexibility remarks
      .replace(/\b(?:but\s+i\s+can\s+choose\s+the\s+time|whenever\s+i\s+want|i\s+can\s+start\s+whenever|when\s+i\s+want|mais\s+je\s+peux\s+choisir\s+l'heure|quand\s+je\s+veux)\b/gi, '')
      // Remove priority indicators from title
      .replace(/\b(?:my\s+most\s+important\s+task\s+is\s+to|most\s+important\s+task|high\s+priority|mon\s+activité\s+prioritaire\s+est\s+de)\b/gi, '')
      // Remove command prefixes
      .replace(/^(?:i\s+need\s+to|i\s+have\s+to|i\s+want\s+to|need\s+to|have\s+to|i\s+must|must|schedule\s+my|schedule|put\s+my|add\s+my|i\s+also\s+have\s+to|also\s+have\s+to|also\s+need\s+to|also\s+want\s+to|je\s+dois|je\s+veux|planifie|ajoute)\s+/gi, '')
      .replace(/^(?:tomorrow|today|for\s+tomorrow|for\s+today|demain|aujourd'hui)\s+/gi, '')
      // Clean unwanted punctuation (preserving accented characters)
      .replace(/[^a-zA-Z0-9\s\-'àâäéèêëîïôöùûüçÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!clean) return '';

    // If cleaned string is still longer than 8 words, truncate or extract main course/action
    const words = clean.split(' ');
    if (words.length > 8) {
      const courseMatch = clean.match(/\b[A-Z]{2,4}\s*\d{3}\b/i);
      if (courseMatch) {
        return `Revise ${courseMatch[0].toUpperCase()}`;
      }
      return words.slice(0, 4).map(w => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    }

    // Title case formatting while preserving acronyms (e.g. CSC305, MATH101)
    return clean
      .split(' ')
      .map(word => {
        if (!word) return '';
        if (/^[A-Z0-9]+$/.test(word)) return word;
        return word[0].toUpperCase() + word.slice(1).toLowerCase();
      })
      .join(' ');
  }

  /**
   * Parses natural language input into structured task constraints.
   */
  public static parseTaskConstraints(rawText: string, dateStr: string): ExtractedTaskConstraint[] {
    if (!rawText || typeof rawText !== 'string') return [];

    let cleaned = rawText
      .replace(/aide-moi\s+à\s+planifier\s+ma\s+journée\.?/gi, '')
      .replace(/aide-moi\s+à\s+planifier\.?/gi, '')
      .replace(/planifie\s+ma\s+journée\.?/gi, '')
      .replace(/i\s+want\s+you\s+to\s+help\s+me\s+(?:to\s+)?plan\s+my\s+day\.?/gi, '')
      .replace(/can\s+you\s+(?:please\s+)?create\s+a\s+plan\s+for\s+that\??/gi, '')
      .replace(/can\s+you\s+(?:please\s+)?create\s+a\s+plan\??/gi, '')
      .replace(/generate\s+my\s+plan\s+for\s+that/gi, '')
      .replace(/generate\s+my\s+plan/gi, '')
      .replace(/generate\s+a\s+plan/gi, '')
      .replace(/create\s+my\s+plan/gi, '')
      .replace(/create\s+a\s+plan/gi, '')
      .replace(/help\s+me\s+plan\s+my\s+day/gi, '')
      .replace(/plan\s+my\s+day/gi, '')
      .replace(/make\s+a\s+schedule/gi, '')
      .replace(/organize\s+these\s+tasks/gi, '')
      .replace(/organize\s+my\s+day/gi, '')
      .replace(/schedule\s+everything\s+around\s+them/gi, '')
      .replace(/schedule\s+them/gi, '')
      .replace(/for\s+that\??$/gi, '')
      .trim();

    // Split text into semantic task chunks
    const rawChunks = cleaned
      .split(/\.|\n|\r|;|\band\s+then\b|\band\s+after\s+that\b|\bafter\s+that\b|\bthen\b|\bpuis\b|\bensuite\b/i)
      .flatMap(chunk => {
        // Only split on comma or "and / et / also" if both sides have substantial task content
        return chunk.split(/,|\band\s+(?:i\s+|i\s+also\s+|also\s+|need\s+to|have\s+to|want\s+to|schedule|my|a\s+)|(?<=\b(?:am|pm|hours?|hrs?|minutes?|mins?|heures?|h))\s+(?:and|et)\s+|\bet\s+(?:je\s+|aussi\s+|dois\s+|veux\s+|aller\s+|faire\s+|danser\s+|réviser\s+)/i);
      })
      .map(c => c.trim())
      .filter(c => c.length > 2);

    const constraints: ExtractedTaskConstraint[] = [];
    let orderIndex = 0;

    for (const chunk of rawChunks) {
      if (this.isMetaInstruction(chunk)) continue;

      const lowerChunk = chunk.toLowerCase();

      // 1. Duration extraction
      let durationHours = 1.0;
      let durationMinutes = 60;
      let durationLabel = '1h';
      let hasExplicitDuration = false;

      const extDur = extractDurationFromText(chunk);
      if (extDur) {
        durationHours = extDur.durationHours;
        durationMinutes = extDur.durationMinutes;
        durationLabel = extDur.durationLabel;
        hasExplicitDuration = true;
      }

      // 2. Fixed Start Time and Time Range extraction
      let fixedStartTimeStr: string | null = null;
      let fixedEndTimeStr: string | null = null;
      let hasExplicitStartTime = false;

      // Check for explicit "from X to Y" or "de X à Y" ranges
      const rangeMatch = lowerChunk.match(/\b(?:from|de)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:to|à|au|-)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/i);
      if (rangeMatch) {
        const startParsed = extractTimeFromText(rangeMatch[1]);
        const endParsed = extractTimeFromText(rangeMatch[2]);
        if (startParsed && !startParsed.startsWith('AMBIGUOUS:')) {
          fixedStartTimeStr = startParsed;
          hasExplicitStartTime = true;
        }
        if (endParsed && !endParsed.startsWith('AMBIGUOUS:')) {
          fixedEndTimeStr = endParsed;
        }
        if (fixedStartTimeStr && fixedEndTimeStr) {
          const sMin = this.timeStringToMinutes(fixedStartTimeStr);
          const eMin = this.timeStringToMinutes(fixedEndTimeStr);
          if (eMin > sMin) {
            durationMinutes = eMin - sMin;
            durationHours = durationMinutes / 60;
            durationLabel = durationMinutes % 60 === 0 ? `${durationMinutes / 60}h` : `${durationMinutes}m`;
            hasExplicitDuration = true;
          }
        }
      }

      // If not a range, check for standard start time
      if (!fixedStartTimeStr) {
        // Exclude relative offsets or deadline markers from being treated as start times
        const isDeadlineContext = /\b(?:before|by|avant)\s+\d{1,2}/i.test(lowerChunk);
        if (!isDeadlineContext) {
          const timeMatch = extractTimeFromText(chunk);
          if (timeMatch && !timeMatch.startsWith('AMBIGUOUS:')) {
            // Confirm it's genuinely a start time marker: "at 6:48", "à 15h", "starting at 8 AM", "at 3 PM"
            if (/\b(?:at|à|starts?\s+at|starting\s+at|commençant\s+à)\b/i.test(lowerChunk) || /\b(?:am|pm|a\.?m\.?|p\.?m\.?)\b/i.test(lowerChunk) || /\b\d{1,2}h\d{0,2}\b/i.test(lowerChunk)) {
              fixedStartTimeStr = timeMatch;
              hasExplicitStartTime = true;
            }
          }
        }
      }

      // 3. Deadline extraction ("before 5 PM", "by 6 PM", "avant 17h")
      let deadlineStr: string | null = null;
      let deadlineMin: number | null = null;
      const deadlineMatch = lowerChunk.match(/\b(?:before|by|avant)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?|\d{1,2}h(?:\d{2})?)\b/i);
      if (deadlineMatch) {
        const parsedDeadline = extractTimeFromText(deadlineMatch[1]);
        if (parsedDeadline && !parsedDeadline.startsWith('AMBIGUOUS:')) {
          deadlineStr = parsedDeadline;
          deadlineMin = this.timeStringToMinutes(parsedDeadline);
        }
      }

      // 4. Flexibility detection
      const isFlexible = (
        !hasExplicitStartTime ||
        /\b(?:choose\s+the\s+time|whenever|any\s+time|flexible|at\s+my\s+convenience|quand\s+je\s+veux|horaire\s+libre)\b/i.test(lowerChunk)
      );

      // 5. Priority detection
      let priority: 'high' | 'medium' | 'low' = 'medium';
      if (/\b(?:most\s+important|highest\s+priority|critical|crucial|essential|prioritaire|très\s+important)\b/i.test(lowerChunk)) {
        priority = 'high';
      } else if (/\b(?:low\s+priority|optional|facultatif|si\s+possible)\b/i.test(lowerChunk)) {
        priority = 'low';
      }

      // 6. Clean Title
      const title = this.cleanTaskTitle(chunk);
      if (!title || this.isMetaInstruction(title)) {
        continue;
      }

      // 7. Determine Constraint Type
      let constraintType: TaskConstraintType = 'flexible';
      if (deadlineMin !== null && !hasExplicitStartTime) {
        constraintType = 'deadline';
      } else if (hasExplicitStartTime && hasExplicitDuration) {
        constraintType = 'fixed_and_duration';
      } else if (hasExplicitStartTime) {
        constraintType = 'fixed_time';
      } else if (hasExplicitDuration) {
        constraintType = 'duration_only';
      }

      const fixedStartTimeMin = fixedStartTimeStr ? this.timeStringToMinutes(fixedStartTimeStr) : null;
      const fixedEndTimeMin = fixedEndTimeStr
        ? this.timeStringToMinutes(fixedEndTimeStr)
        : (fixedStartTimeMin !== null ? fixedStartTimeMin + durationMinutes : null);

      constraints.push({
        id: `constraint-${orderIndex + 1}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        rawSnippet: chunk,
        title,
        constraintType,
        fixedStartTimeStr,
        fixedEndTimeStr: fixedEndTimeStr || (fixedStartTimeMin !== null && fixedEndTimeMin !== null ? this.minutesToTimeString(fixedEndTimeMin) : null),
        fixedStartTimeMin,
        fixedEndTimeMin,
        durationMinutes,
        durationHours,
        durationLabel,
        deadlineMin,
        deadlineStr,
        priority,
        isFlexible: isFlexible && !hasExplicitStartTime,
        hasExplicitDuration,
        hasExplicitStartTime,
        originalOrder: orderIndex++
      });
    }

    return constraints;
  }

  /**
   * Deterministic Constraint Scheduler
   * Takes extracted constraints and existing calendar events, validates them,
   * detects conflicts, and schedules all tasks into non-overlapping chronological blocks.
   */
  public static scheduleDailyPlan(
    constraints: ExtractedTaskConstraint[],
    existingCalendarEvents: Array<{ title: string; time: string; duration_hours?: number }> = [],
    dateStr: string
  ): ScheduleGenerationResult {
    if (!constraints || constraints.length === 0) {
      return {
        success: false,
        hasConflict: false,
        date: dateStr,
        timeline: [],
        cleanPlanSummary: '',
        suggestions: 'No tasks specified for scheduling.'
      };
    }

    // Step 1: Initialize occupied intervals list from existing calendar events
    interface OccupiedInterval {
      startMin: number;
      endMin: number;
      title: string;
      isFixed: boolean;
      source: 'calendar' | 'fixed_task' | 'flexible_task';
    }

    const occupiedList: OccupiedInterval[] = [];

    // Register existing calendar events
    for (const ev of existingCalendarEvents) {
      if (!ev.time) continue;
      const startMin = this.timeStringToMinutes(ev.time);
      const durMin = Math.round((ev.duration_hours || 1.0) * 60);
      const endMin = startMin + durMin;
      occupiedList.push({
        startMin,
        endMin,
        title: ev.title || 'Calendar Event',
        isFixed: true,
        source: 'calendar'
      });
    }

    // Step 2: Extract all fixed-time constraints
    const fixedConstraints = constraints.filter(c => c.hasExplicitStartTime && c.fixedStartTimeMin !== null);
    const flexibleConstraints = constraints.filter(c => !c.hasExplicitStartTime || c.fixedStartTimeMin === null);

    // Step 3: Hard Conflict Detection across all fixed commitments
    // Check conflicts between fixed tasks themselves
    for (let i = 0; i < fixedConstraints.length; i++) {
      const taskA = fixedConstraints[i];
      const startA = taskA.fixedStartTimeMin!;
      const endA = taskA.fixedEndTimeMin || (startA + taskA.durationMinutes);

      for (let j = i + 1; j < fixedConstraints.length; j++) {
        const taskB = fixedConstraints[j];
        const startB = taskB.fixedStartTimeMin!;
        const endB = taskB.fixedEndTimeMin || (startB + taskB.durationMinutes);

        // Check if [startA, endA) overlaps with [startB, endB)
        if (startA < endB && startB < endA) {
          const slotA = `${this.minutesToTimeString(startA)} – ${this.minutesToTimeString(endA)}`;
          const slotB = `${this.minutesToTimeString(startB)} – ${this.minutesToTimeString(endB)}`;
          return {
            success: false,
            hasConflict: true,
            date: dateStr,
            timeline: [],
            cleanPlanSummary: '',
            suggestions: '',
            conflictReport: {
              taskA: taskA.title,
              taskB: taskB.title,
              slotA,
              slotB,
              reason: `Your "${taskA.title}" (${slotA}) conflicts directly with "${taskB.title}" (${slotB}).`,
              conflictType: 'fixed_overlap'
            },
            clarificationMessage: `Your **${taskA.title}** from ${slotA} conflicts with **${taskB.title}** at ${this.minutesToTimeString(startB)}. Would you prefer to adjust the duration or reschedule one of them?`
          };
        }
      }

      // Check conflict between fixed task and existing calendar events
      for (const calEv of occupiedList.filter(o => o.source === 'calendar')) {
        if (startA < calEv.endMin && calEv.startMin < endA) {
          const slotA = `${this.minutesToTimeString(startA)} – ${this.minutesToTimeString(endA)}`;
          const slotCal = `${this.minutesToTimeString(calEv.startMin)} – ${this.minutesToTimeString(calEv.endMin)}`;
          return {
            success: false,
            hasConflict: true,
            date: dateStr,
            timeline: [],
            cleanPlanSummary: '',
            suggestions: '',
            conflictReport: {
              taskA: taskA.title,
              taskB: calEv.title,
              slotA,
              slotB: slotCal,
              reason: `Your requested time for "${taskA.title}" (${slotA}) overlaps with your existing calendar commitment "${calEv.title}" (${slotCal}).`,
              conflictType: 'calendar_event_overlap'
            },
            clarificationMessage: `Your **${taskA.title}** scheduled from ${slotA} overlaps with your existing calendar event **${calEv.title}** (${slotCal}). Would you like to move "${taskA.title}" to an open time slot?`
          };
        }
      }
    }

    // Step 4: Schedule all validated fixed tasks
    const scheduledBlocks: ScheduleTimeBlock[] = [];

    for (const ft of fixedConstraints) {
      const startMin = ft.fixedStartTimeMin!;
      const endMin = ft.fixedEndTimeMin || (startMin + ft.durationMinutes);
      const startStr = this.minutesToTimeString(startMin);
      const endStr = this.minutesToTimeString(endMin);

      scheduledBlocks.push({
        id: `block-${scheduledBlocks.length + 1}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        title: ft.title,
        time: `${startStr} – ${endStr}`,
        startTime: startStr,
        endTime: endStr,
        startMinutes: startMin,
        endMinutes: endMin,
        duration: ft.durationLabel,
        durationHours: ft.durationHours,
        durationMinutes: ft.durationMinutes,
        priority: ft.priority,
        reminder_enabled: true,
        constraintType: ft.constraintType,
        color: 'blue'
      });

      occupiedList.push({
        startMin,
        endMin,
        title: ft.title,
        isFixed: true,
        source: 'fixed_task'
      });
    }

    // Helper to check if a proposed [start, end) interval is free of conflict
    const isIntervalFree = (startMin: number, endMin: number): boolean => {
      if (endMin > 1440) return false;
      for (const occ of occupiedList) {
        if (startMin < occ.endMin && occ.startMin < endMin) {
          return false;
        }
      }
      return true;
    };

    // Determine earliest active start of day (e.g. if user has dance at 6:48 AM, start window at 06:00, otherwise 08:00)
    let earliestActiveMin = 480; // 08:00 AM default
    for (const occ of occupiedList) {
      if (occ.startMin < earliestActiveMin) {
        earliestActiveMin = Math.max(300, occ.startMin - 60); // at earliest 05:00 AM
      }
    }

    const latestActiveMin = 1350; // 22:30 PM

    // Step 5: Schedule deadline-constrained tasks first
    const deadlineConstraints = flexibleConstraints.filter(c => c.deadlineMin !== null);
    const regularFlexible = flexibleConstraints.filter(c => c.deadlineMin === null);

    const unscheduledTasks: Array<{ title: string; reason: string }> = [];

    for (const dc of deadlineConstraints) {
      const dur = dc.durationMinutes;
      const targetDeadline = dc.deadlineMin!;
      let placed = false;

      // Try to find a slot ending before or at the deadline, starting from earliestActiveMin
      for (let candStart = earliestActiveMin; candStart + dur <= targetDeadline; candStart += 15) {
        const candEnd = candStart + dur;
        if (isIntervalFree(candStart, candEnd)) {
          const startStr = this.minutesToTimeString(candStart);
          const endStr = this.minutesToTimeString(candEnd);

          scheduledBlocks.push({
            id: `block-${scheduledBlocks.length + 1}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            title: dc.title,
            time: `${startStr} – ${endStr}`,
            startTime: startStr,
            endTime: endStr,
            startMinutes: candStart,
            endMinutes: candEnd,
            duration: dc.durationLabel,
            durationHours: dc.durationHours,
            durationMinutes: dc.durationMinutes,
            priority: dc.priority,
            reminder_enabled: true,
            constraintType: dc.constraintType,
            color: 'teal'
          });

          occupiedList.push({
            startMin: candStart,
            endMin: candEnd,
            title: dc.title,
            isFixed: false,
            source: 'flexible_task'
          });

          placed = true;
          break;
        }
      }

      if (!placed) {
        unscheduledTasks.push({
          title: dc.title,
          reason: `Could not find an available ${dc.durationLabel} block before the ${dc.deadlineStr} deadline.`
        });
      }
    }

    // Step 6: Schedule regular flexible tasks (sorted by priority high -> medium -> low)
    regularFlexible.sort((a, b) => {
      const pMap = { high: 0, medium: 1, low: 2 };
      return pMap[a.priority] - pMap[b.priority] || a.originalOrder - b.originalOrder;
    });

    for (const fc of regularFlexible) {
      const dur = fc.durationMinutes;
      let placed = false;

      // Find earliest feasible slot in the active day window
      for (let candStart = earliestActiveMin; candStart + dur <= latestActiveMin; candStart += 15) {
        // Prefer placing after fixed tasks with a small 15-min gap if right after
        const candEnd = candStart + dur;
        if (isIntervalFree(candStart, candEnd)) {
          const startStr = this.minutesToTimeString(candStart);
          const endStr = this.minutesToTimeString(candEnd);

          scheduledBlocks.push({
            id: `block-${scheduledBlocks.length + 1}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            title: fc.title,
            time: `${startStr} – ${endStr}`,
            startTime: startStr,
            endTime: endStr,
            startMinutes: candStart,
            endMinutes: candEnd,
            duration: fc.durationLabel,
            durationHours: fc.durationHours,
            durationMinutes: fc.durationMinutes,
            priority: fc.priority,
            reminder_enabled: true,
            constraintType: fc.constraintType,
            color: fc.priority === 'high' ? 'purple' : 'slate'
          });

          occupiedList.push({
            startMin: candStart,
            endMin: candEnd,
            title: fc.title,
            isFixed: false,
            source: 'flexible_task'
          });

          placed = true;
          break;
        }
      }

      if (!placed) {
        unscheduledTasks.push({
          title: fc.title,
          reason: `No open ${fc.durationLabel} window available in your daily schedule without overlapping existing commitments.`
        });
      }
    }

    // Step 7: Sort all scheduled blocks in strict ascending chronological order
    scheduledBlocks.sort((a, b) => a.startMinutes - b.startMinutes);

    // Step 8: Build the clean generated task list presentation (Part VII, Section 8: task names ONLY)
    const readableDate = formatReadableDate(dateStr);
    const cleanListLines = scheduledBlocks.map(b => `- ${b.title}`).join('\n');
    const cleanPlanSummary = `**Daily Plan — ${readableDate}**\n\n${cleanListLines}`;

    const suggestions = `Daily plan structured around your actual tasks for ${dateStr}. High-priority focus blocks assigned chronologically.`;

    return {
      success: true,
      hasConflict: false,
      date: dateStr,
      timeline: scheduledBlocks,
      cleanPlanSummary,
      suggestions,
      unscheduledTasks: unscheduledTasks.length > 0 ? unscheduledTasks : undefined
    };
  }
}
