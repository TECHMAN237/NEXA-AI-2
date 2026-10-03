import { dbService } from './db.js';
import { normalizeTimeString, extractTimeFromText, extractDurationFromText, formatReadableDate, formatReadableTime } from '../utils/timeUtils.js';
import { extractReminderParams, parseFollowUpUpdate, cleanReminderTitle, resolveRelativeDate, detectReminderFields, extractExplicitDateFromText, extractEventParams } from '../utils/reminderParser.js';
import { generateStudyPlan, generateExamReminders, extractStudyParams } from '../utils/studyPlanGenerator.js';
import { StudyTrackingData, StudySubject } from '../types/index.js';
import { extractVaultContent } from './contextualNormalizer.js';
import { isConversationalText } from './gemini.js';
import { DailyScheduleEngine, ExtractedTaskConstraint } from '../services/DailyScheduleEngine.js';

export interface ServerActionPayload {
  intent: string;
  action?: 'CREATE' | 'READ' | 'UPDATE' | 'DELETE' | 'SEARCH' | 'NO_OP';
  payload?: Record<string, any>;
  title?: string;
  content?: string;
  date?: string;
  time?: string;
  course?: string;
  location?: string;
  category?: string;
  priority?: string;
  [key: string]: any;
}

export interface ServerActionResult {
  intent: string;
  targetModule: string;
  action: 'CREATE' | 'READ' | 'UPDATE' | 'DELETE' | 'SEARCH' | 'NO_OP';
  success: boolean;
  data?: any;
  error?: string;
  summary: string;
}

export interface PendingDraft {
  userId: string;
  intent: 'REMINDER' | 'EVENT' | 'PLANNING' | 'STUDY_TRACKING';
  data: Record<string, any>;
  missingFields: string[];
  createdAt: number;
}

export class ServerActionEngine {
  private static pendingDrafts: Map<string, PendingDraft> = new Map();

  public static getPendingDraft(userId: string): PendingDraft | null {
    const draft = this.pendingDrafts.get(userId);
    if (!draft) return null;
    if (Date.now() - draft.createdAt > 15 * 60 * 1000) {
      this.pendingDrafts.delete(userId);
      return null;
    }
    return draft;
  }

  public static setPendingDraft(userId: string, draft: PendingDraft): void {
    this.pendingDrafts.set(userId, draft);
  }

  public static clearPendingDraft(userId: string): void {
    this.pendingDrafts.delete(userId);
  }

  public static async resolvePendingDraft(
    userId: string,
    rawQuery: string
  ): Promise<ServerActionResult | null> {
    const draft = this.getPendingDraft(userId);
    if (!draft) return null;

    const lower = rawQuery.toLowerCase().trim();

    // If incoming message is conversational (greeting, thanks, how are you, who are you, etc.),
    // return null so normal chat handler responds directly without resolving or clearing the pending draft.
    if (isConversationalText(rawQuery)) {
      return null;
    }

    // Explicit cancel check
    if (/^(cancel|never mind|forget it|stop|no thanks|drop it)$/i.test(lower)) {
      this.clearPendingDraft(userId);
      return {
        intent: draft.intent,
        targetModule: this.getTargetModuleName(draft.intent),
        action: 'NO_OP',
        success: true,
        summary: "Okay, I've cancelled that."
      };
    }

    // New explicit command check or intent switch
    const isIntentSwitch = (
      lower.includes('plan') ||
      lower.includes('organize') ||
      lower.includes('generate') ||
      lower.includes('event') ||
      lower.includes('vault') ||
      lower.includes('memory') ||
      lower.includes('study') ||
      lower.startsWith('actually') ||
      lower.startsWith('forget') ||
      /^(remind me to|create a|create me|set a|add a|schedule|what events|show my|view my|list my|tell me|help me)/i.test(lower)
    );

    const isPureTimeOrDate = /^(at\s+)?(\d{1,2}(:\d{2})?|\d{1,2}\s+\d{2})\s*(am|pm|a\.m\.|p\.m\.)?$/i.test(lower) ||
      /^(today|tomorrow|tonight|noon|midnight|monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i.test(lower) ||
      extractExplicitDateFromText(rawQuery).isExplicit;

    if (isIntentSwitch && !isPureTimeOrDate) {
      const extractedT = extractTimeFromText(rawQuery);
      const extractedD = extractExplicitDateFromText(rawQuery);
      const extractedTitle = draft.intent === 'EVENT'
        ? extractEventParams(rawQuery).title
        : cleanReminderTitle(rawQuery, rawQuery);
      const satisfiesMissingTime = draft.missingFields.includes('time') && extractedT !== null;
      const satisfiesMissingDate = draft.missingFields.includes('date') && extractedD.isExplicit;
      const satisfiesMissingTitle = draft.missingFields.includes('title') && extractedTitle.length > 0;

      if (!satisfiesMissingTime && !satisfiesMissingDate && !satisfiesMissingTitle) {
        this.clearPendingDraft(userId);
        return null;
      }
    }

    if (draft.intent === 'EVENT') {
      const evExtract = extractEventParams(rawQuery, draft.data);
      const dateCheck = extractExplicitDateFromText(rawQuery);

      if (draft.missingFields.includes('date') && dateCheck.isExplicit && dateCheck.date) {
        draft.data.date = dateCheck.date;
        draft.missingFields = draft.missingFields.filter(f => f !== 'date');
      }
      if (evExtract.isTimeExplicit && evExtract.time !== 'Not specified') {
        draft.data.time = evExtract.time;
      }
      if (evExtract.isLocationExplicit && evExtract.location !== 'Not specified') {
        draft.data.location = evExtract.location;
      }

      if (draft.missingFields.includes('title')) {
        let candidateTitle = evExtract.isTitleValid ? evExtract.title : '';
        if (!candidateTitle) {
          const stripped = rawQuery
            .replace(/^(?:it's|it\s+is|call\s+it|name\s+it|title\s+is|the\s+event\s+is|called|named|titled)\s+/i, '')
            .replace(/[.,!?]+$/, '')
            .trim();
          if (stripped && !dateCheck.isExplicit && stripped.length >= 2 && stripped.length <= 60) {
            candidateTitle = stripped;
          }
        }
        if (candidateTitle) {
          draft.data.title = candidateTitle;
          draft.missingFields = draft.missingFields.filter(f => f !== 'title');
        }
      }

      if (!draft.missingFields.includes('title') && !draft.missingFields.includes('date') && draft.data.title && draft.data.date) {
        const newEvent = dbService.createEvent(userId, {
          title: draft.data.title,
          date: draft.data.date,
          time: draft.data.time || 'Not specified',
          location: draft.data.location || 'Not specified',
          description: draft.data.description || rawQuery,
          reminder_time: '30 minutes before',
          participants: draft.data.participants || ['Alex']
        });

        this.clearPendingDraft(userId);

        dbService.createNotificationHistory(userId, {
          type: 'EVENT',
          title: `Event Scheduled: "${newEvent.title}"`,
          description: `${newEvent.date}${newEvent.time && newEvent.time !== 'Not specified' ? ` at ${newEvent.time}` : ''}`,
          source_id: newEvent.id,
          status: 'completed'
        });

        const followUpText = this.buildCanonicalEventConfirmation(newEvent);
        return {
          intent: 'EVENT',
          targetModule: 'Event',
          action: 'CREATE',
          success: true,
          data: { ...newEvent, event_name: newEvent.title, event_date: newEvent.date, followUpText },
          summary: followUpText
        };
      } else {
        this.setPendingDraft(userId, draft);
        let question = 'What date is this event scheduled for?';
        if (draft.missingFields.includes('title') && draft.missingFields.includes('date')) {
          question = 'What would you like to call this event, and what date is it scheduled for?';
        } else if (draft.missingFields.includes('title')) {
          question = 'What would you like to call this event?';
        } else if (draft.missingFields.includes('date')) {
          question = `What date is ${draft.data.title || 'this event'} scheduled for?`;
        }
        return {
          intent: 'EVENT',
          targetModule: 'Event',
          action: 'CREATE',
          success: true,
          data: { pending: true, missingFields: draft.missingFields, followUpText: question },
          summary: question
        };
      }
    }

    if (draft.intent === 'STUDY_TRACKING') {
      const pctMatch = rawQuery.match(/(\d{1,3})\s*%?/);
      const isHard = /\b(hard|difficult|weak|low)\b/i.test(lower);
      const isEasy = /\b(easy|strong|high|good)\b/i.test(lower);
      const isMed = /\b(medium|moderate|average|ok)\b/i.test(lower);
      let levelVal: number | undefined = pctMatch ? Math.min(100, Math.max(0, parseInt(pctMatch[1], 10))) : undefined;
      let difficulty: 'Easy' | 'Medium' | 'Hard' = 'Medium';
      let priority: 'Low' | 'Medium' | 'High' = 'Medium';

      if (isHard) {
        difficulty = 'Hard';
        priority = 'High';
        if (levelVal === undefined) levelVal = 30;
      } else if (isEasy) {
        difficulty = 'Easy';
        priority = 'Low';
        if (levelVal === undefined) levelVal = 80;
      } else if (isMed && levelVal === undefined) {
        levelVal = 50;
      }

      if (levelVal !== undefined && draft.data.pendingSubject) {
        const subjectName = draft.data.pendingSubject;
        const currentTracking = dbService.getStudyTracking(userId);
        const existingIdx = currentTracking.subjects.findIndex(s => s.name.toLowerCase() === subjectName.toLowerCase());
        const updatedSubjects = [...currentTracking.subjects];
        if (existingIdx >= 0) {
          updatedSubjects[existingIdx] = { ...updatedSubjects[existingIdx], level: levelVal, difficulty, priority };
        } else {
          updatedSubjects.push({
            id: `subj-${Date.now()}`,
            name: subjectName,
            difficulty,
            priority,
            level: levelVal
          });
        }
        const updated = dbService.saveStudyTracking(userId, { subjects: updatedSubjects });
        this.clearPendingDraft(userId);
        const followUpText = `Added **${subjectName}** (${difficulty} • **${levelVal}%** confidence) to your study tracking and updated your study timetable.`;
        return {
          intent: 'STUDY_TRACKING',
          targetModule: 'StudyTracking',
          action: 'CREATE',
          success: true,
          data: { followUpText, study_tracking: updated },
          summary: followUpText
        };
      }
    }

    if (draft.intent === 'REMINDER') {
      // 1. Missing time check
      if (draft.missingFields.includes('time')) {
        const parsedTime = extractTimeFromText(rawQuery) || normalizeTimeString(rawQuery);
        if (parsedTime && !parsedTime.startsWith('AMBIGUOUS')) {
          draft.data.time = parsedTime;
          draft.missingFields = draft.missingFields.filter(f => f !== 'time');
        } else if (lower.includes('noon')) {
          draft.data.time = '12:00';
          draft.missingFields = draft.missingFields.filter(f => f !== 'time');
        } else if (lower.includes('midnight')) {
          draft.data.time = '00:00';
          draft.missingFields = draft.missingFields.filter(f => f !== 'time');
        }
      }

      // 2. Missing date check
      if (draft.missingFields.includes('date')) {
        const dateCheck = extractExplicitDateFromText(rawQuery);
        if (dateCheck.isExplicit && dateCheck.date) {
          draft.data.date = dateCheck.date;
          draft.missingFields = draft.missingFields.filter(f => f !== 'date');
        } else if (draft.data.time) {
          draft.data.date = resolveRelativeDate(null, 'today');
          draft.missingFields = draft.missingFields.filter(f => f !== 'date');
        }
      }

      // 3. Missing title check
      if (draft.missingFields.includes('title')) {
        const cleanT = cleanReminderTitle(rawQuery, rawQuery);
        if (cleanT && cleanT.length > 0) {
          draft.data.title = cleanT;
          draft.missingFields = draft.missingFields.filter(f => f !== 'title');
        }
      }

      // Parse optional modifiers if user provides them
      if (lower.includes('high priority') || lower.includes('urgent')) draft.data.priority = 'high';
      if (lower.includes('low priority')) draft.data.priority = 'low';
      if (lower.includes('every monday') || lower.includes('weekly')) draft.data.repeat = 'weekly';
      if (lower.includes('every day') || lower.includes('daily')) draft.data.repeat = 'daily';

      if (draft.missingFields.length === 0) {
        const newRem = dbService.createReminder(userId, {
          title: draft.data.title,
          description: draft.data.description || '',
          date: draft.data.date,
          time: draft.data.time,
          repeat: draft.data.repeat || 'none',
          priority: draft.data.priority || 'medium',
          voice_notification: draft.data.voiceReminder !== false,
          active: draft.data.active !== false,
          category: draft.data.category || 'General',
          status: 'scheduled'
        });

        this.clearPendingDraft(userId);

        const { followUpText } = detectReminderFields(newRem, rawQuery, draft.data);

        dbService.createNotificationHistory(userId, {
          type: 'REMINDER',
          title: `Reminder Created: "${newRem.title}"`,
          description: `Scheduled for ${newRem.date} at ${newRem.time}`,
          source_id: newRem.id,
          status: 'completed'
        });

        return {
          intent: 'REMINDER',
          targetModule: 'Reminder',
          action: 'CREATE',
          success: true,
          data: newRem,
          summary: followUpText
        };
      } else {
        this.setPendingDraft(userId, draft);
        let nextQuestion = 'What time should I set for this reminder?';
        if (draft.missingFields.includes('title') && (draft.missingFields.includes('time') || draft.missingFields.includes('date'))) {
          nextQuestion = 'Absolutely. What would you like me to remind you about, and when should I remind you?';
        } else if (draft.missingFields.includes('title')) {
          nextQuestion = 'What would you like me to remind you about?';
        } else if (draft.missingFields.includes('time') && draft.missingFields.includes('date')) {
          nextQuestion = 'When should I remind you?';
        } else if (draft.missingFields.includes('time')) {
          nextQuestion = 'Sure. What time should I remind you?';
        } else if (draft.missingFields.includes('date')) {
          nextQuestion = 'What date should I set for this reminder?';
        }

        return {
          intent: 'REMINDER',
          targetModule: 'Reminder',
          action: 'CREATE',
          success: true,
          data: { pending: true, missingFields: draft.missingFields },
          summary: nextQuestion
        };
      }
    }

    return null;
  }
  /**
   * Log development execution trace (AI ACTION DEBUG)
   */
  private static logDebugTrace(
    intent: string,
    action: string,
    targetModule: string,
    serviceCall: string,
    persistenceStatus: 'SUCCESS' | 'FAILED',
    verificationStatus: 'SUCCESS' | 'FAILED',
    finalResult: 'SUCCESS' | 'FAILED',
    details?: string
  ): void {
    console.log(`
========== AI ACTION DEBUG ==========
Intent:         ${intent}
Action:         ${action}
Module:         ${targetModule}
Service:        ${serviceCall}
Persistence:    ${persistenceStatus} ${persistenceStatus === 'SUCCESS' ? '✓' : '✗'}
Verification:   ${verificationStatus} ${verificationStatus === 'SUCCESS' ? '✓' : '✗'}
Final Result:   ${finalResult} ${finalResult === 'SUCCESS' ? '✓' : '✗'}
Details:        ${details || 'N/A'}
====================================
`);
  }

  /**
   * Main entry point to execute AI structured actions server-side.
   */
  public static async executeActions(
    userId: string,
    actions: ServerActionPayload[],
    rawQuery: string = ''
  ): Promise<ServerActionResult[]> {
    const results: ServerActionResult[] = [];

    for (const act of actions) {
      const intentStr = (act.intent || '').toUpperCase();
      const actionType = (act.action || 'CREATE') as 'CREATE' | 'READ' | 'UPDATE' | 'DELETE' | 'SEARCH' | 'NO_OP';

      if (intentStr === 'NORMAL_CHAT' || intentStr === 'GENERAL_HELP' || intentStr === 'UNKNOWN' || actionType === 'NO_OP') {
        continue;
      }

      const payload = act.payload || act;
      const res = await this.dispatchSingleAction(userId, intentStr, actionType, payload, rawQuery);
      results.push(res);
    }

    return results;
  }

  private static getTargetModuleName(intent: string): string {
    switch (intent) {
      case 'REMINDER':
      case 'CREATE_REMINDER':
        return 'Reminder';
      case 'PLANNING':
      case 'CREATE_TASK':
        return 'Planning';
      case 'EVENT':
      case 'CREATE_EVENT':
      case 'VIEW_UPCOMING_EVENTS':
      case 'QUERY_EVENTS':
        return 'Event';
      case 'STUDY_TRACKING':
      case 'CREATE_EXAM':
        return 'StudyTracking';
      case 'MEMORY_VAULT':
        return 'MemoryVault';
      case 'PROFILE':
        return 'Profile';
      case 'SETTINGS':
        return 'Settings';
      default:
        return 'Core';
    }
  }

  private static async dispatchSingleAction(
    userId: string,
    intent: string,
    action: 'CREATE' | 'READ' | 'UPDATE' | 'DELETE' | 'SEARCH' | 'NO_OP',
    payload: any,
    rawQuery: string
  ): Promise<ServerActionResult> {
    const todayStr = new Date().toISOString().split('T')[0];
    const targetModule = this.getTargetModuleName(intent);

    // Dispatch based on intent and action type
    switch (intent) {
      case 'REMINDER':
      case 'CREATE_REMINDER': {
        return this.handleReminderAction(userId, intent, action, payload, rawQuery, todayStr);
      }
      case 'PLANNING':
      case 'CREATE_TASK': {
        return this.handlePlanningAction(userId, intent, action, payload, rawQuery, todayStr);
      }
      case 'EVENT':
      case 'CREATE_EVENT':
      case 'VIEW_UPCOMING_EVENTS':
      case 'QUERY_EVENTS': {
        return this.handleEventAction(userId, intent, action, payload, rawQuery, todayStr);
      }
      case 'STUDY_TRACKING':
      case 'CREATE_EXAM': {
        return this.handleStudyAction(userId, intent, action, payload, rawQuery);
      }
      case 'MEMORY_VAULT': {
        return this.handleMemoryVaultAction(userId, intent, action, payload, rawQuery);
      }
      case 'PROFILE': {
        if (payload.full_name || payload.language || payload.voice_gender) {
          const updated = dbService.updateProfile(userId, payload);
          this.logDebugTrace(intent, action, 'Profile', 'dbService.updateProfile', 'SUCCESS', 'SUCCESS', 'SUCCESS');
          return {
            intent,
            targetModule: 'Profile',
            action,
            success: true,
            data: updated,
            summary: '✓ Profile preferences updated.'
          };
        }
        return {
          intent,
          targetModule: 'Profile',
          action,
          success: false,
          error: 'No valid profile updates provided.',
          summary: '✗ Profile update failed: no valid fields provided.'
        };
      }
      default: {
        this.logDebugTrace(intent, action, targetModule, 'N/A', 'FAILED', 'FAILED', 'FAILED', `Unsupported intent ${intent}`);
        return {
          intent,
          targetModule,
          action,
          success: false,
          error: `Unsupported action intent: ${intent}`,
          summary: `✗ Unsupported action intent: ${intent}`
        };
      }
    }
  }

  // ==================== REMINDER MODULE ====================
  private static handleReminderAction(
    userId: string,
    intent: string,
    action: 'CREATE' | 'READ' | 'UPDATE' | 'DELETE' | 'SEARCH' | 'NO_OP',
    payload: any,
    rawQuery: string,
    todayStr: string
  ): ServerActionResult {
    const reminders = dbService.getReminders(userId);
    const lastReminder = reminders.length > 0 ? reminders[reminders.length - 1] : null;

    // Check if user's query is a follow-up modification on the most recently created reminder
    const followUp = parseFollowUpUpdate(rawQuery, lastReminder);
    if (followUp && followUp.isFollowUp && lastReminder && followUp.updates) {
      const updated = dbService.updateReminder(userId, lastReminder.id, followUp.updates);
      if (updated) {
        this.logDebugTrace(intent, 'UPDATE', 'Reminder', 'dbService.updateReminder', 'SUCCESS', 'SUCCESS', 'SUCCESS', `Updated ID: ${lastReminder.id}`);
        const updateSummary = Object.entries(followUp.updates)
          .map(([k, v]) => `${k.replace('_', ' ')} set to ${v}`)
          .join(', ');
        return {
          intent,
          targetModule: 'Reminder',
          action: 'UPDATE',
          success: true,
          data: updated,
          summary: `✓ Updated reminder "${updated.title}": ${updateSummary}.`
        };
      }
    }

    if (action === 'DELETE') {
      const titleSearch = (payload.title || payload.content || rawQuery).toLowerCase();
      const match = reminders.find(r => r.title.toLowerCase().includes(titleSearch));

      if (!match) {
        this.logDebugTrace(intent, action, 'Reminder', 'dbService.deleteReminder', 'FAILED', 'FAILED', 'FAILED', `No reminder found matching "${titleSearch}"`);
        return {
          intent,
          targetModule: 'Reminder',
          action,
          success: false,
          error: `No reminder found matching "${payload.title || rawQuery}"`,
          summary: `✗ Failed to delete: reminder matching "${payload.title || rawQuery}" not found.`
        };
      }

      const deleted = dbService.deleteReminder(userId, match.id);
      const verifyList = dbService.getReminders(userId);
      const isGone = !verifyList.some(r => r.id === match.id);

      if (deleted && isGone) {
        this.logDebugTrace(intent, action, 'Reminder', 'dbService.deleteReminder', 'SUCCESS', 'SUCCESS', 'SUCCESS', `Deleted ID: ${match.id}`);
        return {
          intent,
          targetModule: 'Reminder',
          action,
          success: true,
          data: { deletedId: match.id, title: match.title },
          summary: `✓ Deleted reminder: "${match.title}".`
        };
      } else {
        this.logDebugTrace(intent, action, 'Reminder', 'dbService.deleteReminder', 'FAILED', 'FAILED', 'FAILED', 'Deletion verification failed');
        return {
          intent,
          targetModule: 'Reminder',
          action,
          success: false,
          error: 'Reminder deletion failed in database persistence.',
          summary: `✗ Failed to delete reminder "${match.title}".`
        };
      }
    }

    if (action === 'UPDATE') {
      const titleSearch = (payload.title || payload.content || rawQuery).toLowerCase();
      const match = reminders.find(r => r.title.toLowerCase().includes(titleSearch)) || lastReminder;

      if (!match) {
        this.logDebugTrace(intent, action, 'Reminder', 'dbService.updateReminder', 'FAILED', 'FAILED', 'FAILED', `No reminder found matching "${titleSearch}"`);
        return {
          intent,
          targetModule: 'Reminder',
          action,
          success: false,
          error: `No reminder found matching "${payload.title || rawQuery}"`,
          summary: `✗ Failed to update: reminder matching "${payload.title || rawQuery}" not found.`
        };
      }

      const updates: any = {};
      if (payload.time) updates.time = normalizeTimeString(payload.time) || payload.time;
      if (payload.date) updates.date = resolveRelativeDate(payload.date, rawQuery);
      if (payload.priority) updates.priority = payload.priority;
      if (payload.repeat) updates.repeat = payload.repeat;
      if (payload.voiceReminder !== undefined) updates.voice_notification = payload.voiceReminder;

      const updated = dbService.updateReminder(userId, match.id, updates);
      if (updated) {
        this.logDebugTrace(intent, action, 'Reminder', 'dbService.updateReminder', 'SUCCESS', 'SUCCESS', 'SUCCESS', `Updated ID: ${match.id}`);
        return {
          intent,
          targetModule: 'Reminder',
          action,
          success: true,
          data: updated,
          summary: `✓ Updated reminder "${updated.title}" to ${updated.date} at ${updated.time}.`
        };
      }
    }

    if (action === 'READ') {
      const list = dbService.getReminders(userId);
      this.logDebugTrace(intent, action, 'Reminder', 'dbService.getReminders', 'SUCCESS', 'SUCCESS', 'SUCCESS', `Found ${list.length} reminders`);
      return {
        intent,
        targetModule: 'Reminder',
        action,
        success: true,
        data: list,
        summary: `✓ Retrieved ${list.length} active reminders.`
      };
    }

    // Default: CREATE using SIGMA-1.1 parser
    console.log('[REMINDER_CREATE_STARTED]', { userId, intent, action, rawQuery, payload });

    const params = extractReminderParams(payload, rawQuery);

    // Missing information check
    const missingFields: string[] = [];
    if (!params.title || params.title.trim().length === 0) {
      missingFields.push('title');
    }
    const isPayloadTimeAmbiguous = payload?.time && String(payload.time).startsWith('AMBIGUOUS');
    if (!params.isTimeExplicit && (!payload?.time || isPayloadTimeAmbiguous)) {
      missingFields.push('time');
    }
    if (!params.isDateExplicit && !payload?.date && !params.isTimeExplicit && (!payload?.time || isPayloadTimeAmbiguous)) {
      missingFields.push('date');
    }

    if (missingFields.length > 0) {
      ServerActionEngine.setPendingDraft(userId, {
        userId,
        intent: 'REMINDER',
        data: {
          title: params.title,
          date: params.date,
          repeat: params.repeat,
          priority: params.priority,
          voiceReminder: params.voiceReminder,
          active: params.active,
          category: params.category,
          description: params.description
        },
        missingFields,
        createdAt: Date.now()
      });

      let followUpQuestion = '';
      if (missingFields.includes('title') && missingFields.includes('time')) {
        followUpQuestion = 'What would you like me to remind you about, and what time should I set it for?';
      } else if (missingFields.includes('title')) {
        followUpQuestion = 'What would you like me to remind you about?';
      } else if (missingFields.includes('time')) {
        if (params.time && params.time.startsWith('AMBIGUOUS_CONFLICT:')) {
          const conflictTimes = params.time.replace('AMBIGUOUS_CONFLICT:', '').trim();
          followUpQuestion = `I noticed two different times mentioned (${conflictTimes}) — which time should I set your reminder to "${params.title}" for?`;
        } else if (params.time && params.time.startsWith('AMBIGUOUS:')) {
          const ambHour = params.time.split(':')[1];
          followUpQuestion = `Did you mean ${ambHour}:00 AM or ${ambHour}:00 PM for your reminder to "${params.title}"?`;
        } else {
          followUpQuestion = `What time should I set the reminder to "${params.title}" for?`;
        }
      } else {
        followUpQuestion = 'What date should I set for this reminder?';
      }

      this.logDebugTrace(intent, action, 'Reminder', 'PendingDraftStore', 'SUCCESS', 'SUCCESS', 'SUCCESS', `Stored pending draft. Missing: ${missingFields.join(', ')}`);
      return {
        intent,
        targetModule: 'Reminder',
        action: 'CREATE',
        success: true,
        data: { pending: true, missingFields },
        summary: followUpQuestion
      };
    }

    const newRem = dbService.createReminder(userId, {
      title: params.title,
      description: params.description || '',
      date: params.date,
      time: params.time,
      repeat: params.repeat,
      priority: params.priority,
      voice_notification: params.voiceReminder,
      active: params.active,
      category: params.category || 'General',
      status: 'scheduled'
    });

    console.log('[REMINDER_CREATED]', newRem);

    // Verification check
    const verifyList = dbService.getReminders(userId);
    const verified = verifyList.some(r => r.id === newRem.id);

    console.log('[REMINDER_PERSISTED]', verified);
    console.log('[REMINDER_CREATE_RESULT]', { success: verified, reminderId: newRem.id });

    if (verified) {
      const { provided, missing, followUpText } = detectReminderFields(newRem, rawQuery, payload);

      console.log('[REMINDER_FIELDS_PROVIDED]', provided);
      console.log('[REMINDER_FIELDS_MISSING]', missing);

      console.log('[FOLLOW_UP_GENERATION_STARTED]', { reminderId: newRem.id, missingFields: missing });
      console.log('[FOLLOW_UP_GENERATED]', followUpText);

      dbService.createNotificationHistory(userId, {
        type: 'REMINDER',
        title: `Reminder Created: "${newRem.title}"`,
        description: `Scheduled for ${newRem.date} at ${newRem.time}`,
        source_id: newRem.id,
        status: 'completed'
      });

      this.logDebugTrace(intent, action, 'Reminder', 'dbService.createReminder', 'SUCCESS', 'SUCCESS', 'SUCCESS', `Created & Verified ID: ${newRem.id}`);
      return {
        intent,
        targetModule: 'Reminder',
        action: 'CREATE',
        success: true,
        data: { ...newRem, followUpText, missingFields: missing },
        summary: followUpText
      };
    } else {
      this.logDebugTrace(intent, action, 'Reminder', 'dbService.createReminder', 'SUCCESS', 'FAILED', 'FAILED', 'Verification failed in getReminders');
      return {
        intent,
        targetModule: 'Reminder',
        action: 'CREATE',
        success: false,
        error: 'Storage verification failed for new reminder.',
        summary: `✗ Failed to persist reminder "${params.title}".`
      };
    }
  }

  // ==================== PLANNING / TASK MODULE ====================
  private static handlePlanningAction(
    userId: string,
    intent: string,
    action: 'CREATE' | 'READ' | 'UPDATE' | 'DELETE' | 'SEARCH' | 'NO_OP',
    payload: any,
    rawQuery: string,
    todayStr: string
  ): ServerActionResult {
    if (action === 'DELETE') {
      const titleSearch = (payload.title || payload.taskTitle || rawQuery).toLowerCase();
      const tasks = dbService.getTasks(userId);
      const match = tasks.find(t => t.title.toLowerCase().includes(titleSearch));

      if (!match) {
        return {
          intent,
          targetModule: 'Planning',
          action,
          success: false,
          error: `No task found matching "${payload.title || rawQuery}"`,
          summary: `✗ Failed to delete task: "${payload.title || rawQuery}" not found.`
        };
      }

      const deleted = dbService.deleteTask(userId, match.id);
      this.logDebugTrace(intent, action, 'Planning', 'dbService.deleteTask', deleted ? 'SUCCESS' : 'FAILED', deleted ? 'SUCCESS' : 'FAILED', deleted ? 'SUCCESS' : 'FAILED');
      return {
        intent,
        targetModule: 'Planning',
        action,
        success: deleted,
        summary: deleted ? `✓ Deleted task: "${match.title}".` : `✗ Failed to delete task "${match.title}".`
      };
    }

    if (action === 'UPDATE') {
      const titleSearch = (payload.title || payload.taskTitle || rawQuery).toLowerCase();
      const tasks = dbService.getTasks(userId);
      const match = tasks.find(t => t.title.toLowerCase().includes(titleSearch));

      if (!match) {
        return {
          intent,
          targetModule: 'Planning',
          action,
          success: false,
          error: `No task found matching "${payload.title || rawQuery}"`,
          summary: `✗ Failed to update task: "${payload.title || rawQuery}" not found.`
        };
      }

      const updated = dbService.updateTask(userId, match.id, payload);
      this.logDebugTrace(intent, action, 'Planning', 'dbService.updateTask', 'SUCCESS', 'SUCCESS', 'SUCCESS');
      return {
        intent,
        targetModule: 'Planning',
        action,
        success: !!updated,
        data: updated,
        summary: `✓ Updated task: "${match.title}".`
      };
    }

    // Default: CREATE
    const date = resolveRelativeDate(payload.date, rawQuery);

    // 1. Extract constraints from raw query
    let taskConstraints = DailyScheduleEngine.parseTaskConstraints(rawQuery, date);

    // If query was short or payload passed explicit tasks
    if (taskConstraints.length === 0 && Array.isArray(payload.tasks) && payload.tasks.length > 0) {
      taskConstraints = payload.tasks.map((t: any, idx: number) => {
        const title = typeof t === 'string' ? t : t.title || 'Task';
        const rawT = typeof t === 'string' ? t : `${t.title || 'Task'} ${t.time || ''} ${t.duration || ''}`;
        const parsedList = DailyScheduleEngine.parseTaskConstraints(rawT, date);
        if (parsedList.length > 0) return parsedList[0];
        return {
          id: `constraint-${idx + 1}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          rawSnippet: title,
          title: DailyScheduleEngine.cleanTaskTitle(title) || title,
          constraintType: (t.fixedTime || t.time ? 'fixed_time' : 'flexible') as any,
          fixedStartTimeStr: t.fixedTime || t.time || null,
          fixedEndTimeStr: null,
          fixedStartTimeMin: t.fixedTime || t.time ? DailyScheduleEngine.timeStringToMinutes(t.fixedTime || t.time) : null,
          fixedEndTimeMin: null,
          durationMinutes: Math.round((t.durationHours || 1.0) * 60),
          durationHours: t.durationHours || 1.0,
          durationLabel: `${t.durationHours || 1.0}h`,
          deadlineMin: null,
          deadlineStr: null,
          priority: (t.priority || 'medium') as any,
          isFlexible: !(t.fixedTime || t.time),
          hasExplicitDuration: !!t.durationHours,
          hasExplicitStartTime: !!(t.fixedTime || t.time),
          originalOrder: idx
        };
      }).filter((t: any) => !DailyScheduleEngine.isMetaInstruction(t.title));
    }

    // If still empty, check existing tasks & calendar events for the date
    if (taskConstraints.length === 0) {
      const existingDbTasks = dbService.getTasks(userId).filter(t => t.date === date);
      const existingDbEvents = dbService.getEvents(userId).filter(e => e.date === date);
      existingDbTasks.forEach((t, idx) => {
        const startMin = t.time ? DailyScheduleEngine.timeStringToMinutes(t.time) : null;
        taskConstraints.push({
          id: `db-task-${idx + 1}-${Date.now()}`,
          rawSnippet: t.title,
          title: DailyScheduleEngine.cleanTaskTitle(t.title) || t.title,
          constraintType: startMin !== null ? 'fixed_time' : 'flexible',
          fixedStartTimeStr: t.time || null,
          fixedEndTimeStr: null,
          fixedStartTimeMin: startMin,
          fixedEndTimeMin: startMin !== null ? startMin + 60 : null,
          durationMinutes: 60,
          durationHours: 1.0,
          durationLabel: '1h',
          deadlineMin: null,
          deadlineStr: null,
          priority: (t.priority || 'medium') as any,
          isFlexible: startMin === null,
          hasExplicitDuration: false,
          hasExplicitStartTime: startMin !== null,
          originalOrder: idx
        });
      });
      existingDbEvents.forEach((e, idx) => {
        const startMin = e.time ? DailyScheduleEngine.timeStringToMinutes(e.time) : null;
        taskConstraints.push({
          id: `db-event-${idx + 1}-${Date.now()}`,
          rawSnippet: e.title,
          title: DailyScheduleEngine.cleanTaskTitle(e.title) || e.title,
          constraintType: 'fixed_time',
          fixedStartTimeStr: e.time || null,
          fixedEndTimeStr: null,
          fixedStartTimeMin: startMin,
          fixedEndTimeMin: startMin !== null ? startMin + 60 : null,
          durationMinutes: 60,
          durationHours: 1.0,
          durationLabel: '1h',
          deadlineMin: null,
          deadlineStr: null,
          priority: 'high',
          isFlexible: false,
          hasExplicitDuration: false,
          hasExplicitStartTime: true,
          originalOrder: 100 + idx
        });
      });
    }

    // Fallback ONLY if zero tasks specified and zero existing items
    if (taskConstraints.length === 0) {
      taskConstraints = [
        {
          id: `default-1-${Date.now()}`,
          rawSnippet: 'Core Focus Session',
          title: 'Core Focus Session',
          constraintType: 'duration_only',
          durationMinutes: 120,
          durationHours: 2.0,
          durationLabel: '2h',
          priority: 'high',
          isFlexible: true,
          hasExplicitDuration: true,
          hasExplicitStartTime: false,
          originalOrder: 0
        },
        {
          id: `default-2-${Date.now()}`,
          rawSnippet: 'Project Assignments',
          title: 'Project Assignments',
          constraintType: 'duration_only',
          durationMinutes: 90,
          durationHours: 1.5,
          durationLabel: '1.5h',
          priority: 'medium',
          isFlexible: true,
          hasExplicitDuration: true,
          hasExplicitStartTime: false,
          originalOrder: 1
        },
        {
          id: `default-3-${Date.now()}`,
          rawSnippet: 'Review & Reflection',
          title: 'Review & Reflection',
          constraintType: 'duration_only',
          durationMinutes: 60,
          durationHours: 1.0,
          durationLabel: '1h',
          priority: 'low',
          isFlexible: true,
          hasExplicitDuration: true,
          hasExplicitStartTime: false,
          originalOrder: 2
        }
      ];
    }

    // Fetch existing calendar events for date to enforce hard collision protection
    const existingEventsForDate = dbService.getEvents(userId).filter(e => e.date === date);

    // Run deterministic constraint scheduler
    const scheduleResult = DailyScheduleEngine.scheduleDailyPlan(
      taskConstraints,
      existingEventsForDate,
      date
    );

    // If hard conflict detected, do NOT persist invalid schedule!
    if (scheduleResult.hasConflict) {
      this.logDebugTrace(intent, action, 'Planning', 'DailyScheduleEngine.scheduleDailyPlan', 'FAILED', 'FAILED', 'FAILED', `Conflict: ${scheduleResult.conflictReport?.reason}`);
      return {
        intent,
        targetModule: 'Planning',
        action: 'CREATE',
        success: false,
        error: scheduleResult.conflictReport?.reason || 'Scheduling conflict detected.',
        data: {
          hasConflict: true,
          conflictReport: scheduleResult.conflictReport,
          followUpText: scheduleResult.clarificationMessage
        },
        summary: scheduleResult.clarificationMessage || (scheduleResult.conflictReport?.reason || 'A scheduling conflict was detected.')
      };
    }

    // Persistence: Save validated timeline
    const timelineBlocks = scheduleResult.timeline.map((b, idx) => ({
      id: `block-${idx + 1}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      time: b.time,
      title: b.title,
      duration: b.duration,
      durationHours: b.durationHours,
      durationMinutes: b.durationMinutes,
      startTime: b.startTime,
      endTime: b.endTime,
      priority: b.priority,
      reminder_enabled: true
    }));

    const newPlan = dbService.createPlan(userId, {
      date,
      timeline: timelineBlocks,
      suggestions: scheduleResult.suggestions
    });

    let followUpText = scheduleResult.cleanPlanSummary;
    if (scheduleResult.unscheduledTasks && scheduleResult.unscheduledTasks.length > 0) {
      followUpText += `\n\n*Note:* ${scheduleResult.unscheduledTasks.map(u => `• **${u.title}**: ${u.reason}`).join('\n')}`;
    }

    dbService.createNotificationHistory(userId, {
      type: 'PLANNING',
      title: `Plan Initialized for ${newPlan.date}`,
      description: `Generated ${timelineBlocks.length} schedule time blocks`,
      source_id: newPlan.id,
      status: 'completed'
    });

    this.logDebugTrace(intent, action, 'Planning', 'dbService.createPlan', 'SUCCESS', 'SUCCESS', 'SUCCESS', `Created Plan ID: ${newPlan.id}`);
    return {
      intent,
      targetModule: 'Planning',
      action: 'CREATE',
      success: true,
      data: { ...newPlan, followUpText, tasks: timelineBlocks },
      summary: `✓ Generated structured daily schedule for ${newPlan.date} with ${timelineBlocks.length} time blocks.`
    };
  }

  private static buildCanonicalEventConfirmation(ev: { title: string; date: string; time?: string; location?: string }): string {
    const readableDate = ev.date && ev.date !== 'Not specified' ? formatReadableDate(ev.date) : ev.date;
    const hasTime = ev.time && ev.time !== 'Not specified';
    const hasLoc = ev.location && ev.location !== 'Not specified' && ev.location !== 'TBD';
    const readableTime = hasTime ? formatReadableTime(ev.time!) : null;

    let card = `## Event Scheduled\n\n`;
    card += `- **Event Name:** ${ev.title}\n`;
    card += `- **Event Date:** ${ev.date} (${readableDate})\n`;
    if (readableTime) {
      card += `- **Time:** ${readableTime}\n`;
    }
    if (hasLoc) {
      card += `- **Location:** ${ev.location}\n`;
    }
    return card.trim();
  }

  // ==================== EVENT MODULE ====================
  private static handleEventAction(
    userId: string,
    intent: string,
    action: 'CREATE' | 'READ' | 'UPDATE' | 'DELETE' | 'SEARCH' | 'NO_OP',
    payload: any,
    rawQuery: string,
    todayStr: string
  ): ServerActionResult {
    if (action === 'DELETE') {
      const cleanedTarget = (payload.title || rawQuery)
        .replace(/^(?:please\s+)?(?:delete|remove|cancel|clear)\s+(?:the\s+|my\s+)?(?:event\s+(?:called|named)?\s*)?/i, '')
        .replace(/\s+(?:event|from\s+my\s+events?|from\s+calendar).*$/i, '')
        .replace(/[.,!?]+$/, '')
        .trim()
        .toLowerCase();

      const events = dbService.getEvents(userId);
      const match = events.find(ev =>
        ev.title.toLowerCase().includes(cleanedTarget) ||
        cleanedTarget.includes(ev.title.toLowerCase())
      );

      if (!match) {
        return {
          intent,
          targetModule: 'Event',
          action,
          success: false,
          error: `No event found matching "${cleanedTarget || rawQuery}"`,
          summary: `✗ Could not find an event matching "${cleanedTarget || rawQuery}" to delete.`
        };
      }

      const deleted = dbService.deleteEvent(userId, match.id);
      this.logDebugTrace(intent, action, 'Event', 'dbService.deleteEvent', deleted ? 'SUCCESS' : 'FAILED', deleted ? 'SUCCESS' : 'FAILED', deleted ? 'SUCCESS' : 'FAILED');
      const followUpText = deleted
        ? `Done — I have deleted the event **${match.title}** (${match.date}) from your Event Tracker.`
        : `Failed to delete event "${match.title}".`;
      return {
        intent,
        targetModule: 'Event',
        action,
        success: deleted,
        data: { followUpText },
        summary: followUpText
      };
    }

    if (action === 'UPDATE') {
      const events = dbService.getEvents(userId);
      let match = payload.id ? events.find(e => e.id === payload.id) : null;
      if (!match) {
        const titleSearch = (payload.title || rawQuery).toLowerCase();
        match = events.find(ev =>
          titleSearch.includes(ev.title.toLowerCase()) ||
          ev.title.toLowerCase().includes(titleSearch)
        );
      }
      if (!match && events.length > 0) {
        match = events[events.length - 1];
      }

      if (!match) {
        return {
          intent,
          targetModule: 'Event',
          action,
          success: false,
          error: 'Event not found for update.',
          summary: '✗ Could not find a matching event to update.'
        };
      }

      const updates: Record<string, any> = {};
      const dateInfo = extractExplicitDateFromText(rawQuery);
      if (dateInfo.isExplicit && dateInfo.date) {
        updates.date = dateInfo.date;
      } else if (payload.date && payload.date !== 'Not specified') {
        const pDate = extractExplicitDateFromText(String(payload.date));
        if (pDate.isExplicit && pDate.date) updates.date = pDate.date;
      }

      const timeInfo = extractTimeFromText(rawQuery) || (payload.time ? normalizeTimeString(String(payload.time)) : null);
      if (timeInfo) {
        updates.time = timeInfo;
      }

      if (payload.location && payload.location !== 'Not specified') {
        updates.location = payload.location;
      } else {
        const evExt = extractEventParams(rawQuery);
        if (evExt.isLocationExplicit) {
          updates.location = evExt.location;
        }
      }

      const renameMatch = rawQuery.match(/\b(?:rename|call\s+it|change\s+(?:the\s+)?(?:name|title)\s+to)\s+["']?([^"'\n.!?]+)["']?/i);
      if (renameMatch && renameMatch[1]) {
        updates.title = renameMatch[1].trim();
      }

      const updated = dbService.updateEvent(userId, match.id, updates);
      const updatedEvent = updated || { ...match, ...updates };
      const followUpText = this.buildCanonicalEventConfirmation(updatedEvent);

      return {
        intent,
        targetModule: 'Event',
        action: 'UPDATE',
        success: true,
        data: { ...updatedEvent, event_name: updatedEvent.title, event_date: updatedEvent.date, followUpText },
        summary: `✓ Updated event "${updatedEvent.title}".`
      };
    }

    if (action === 'READ' || action === 'SEARCH' || intent === 'VIEW_UPCOMING_EVENTS' || intent === 'QUERY_EVENTS') {
      const events = dbService.getEvents(userId);

      const sortedEvents = [...events].sort((a, b) => {
        const dComp = (a.date || '').localeCompare(b.date || '');
        if (dComp !== 0) return dComp;
        return (a.time || '').localeCompare(b.time || '');
      });

      const lowerQuery = rawQuery.toLowerCase();
      let matchingEvents = sortedEvents;
      let filterDescription = 'upcoming';

      const explicitDateQuery = extractExplicitDateFromText(rawQuery);

      if (explicitDateQuery.isExplicit && explicitDateQuery.date) {
        matchingEvents = sortedEvents.filter(e => e.date === explicitDateQuery.date);
        filterDescription = `for ${explicitDateQuery.date}`;
      } else if (lowerQuery.includes('this week') || lowerQuery.includes('week')) {
        const dEnd = new Date();
        dEnd.setDate(dEnd.getDate() + 7);
        const endOfWeekStr = dEnd.toISOString().split('T')[0];
        matchingEvents = sortedEvents.filter(e => e.date >= todayStr && e.date <= endOfWeekStr);
        filterDescription = 'for this week';
      } else {
        // Check if user is asking about a specific event by name (e.g., "When is Maranatha?")
        const byName = sortedEvents.filter(e => e.title && lowerQuery.includes(e.title.toLowerCase()));
        if (byName.length > 0) {
          matchingEvents = byName;
          filterDescription = `matching "${byName[0].title}"`;
        } else {
          const upcoming = sortedEvents.filter(e => e.date >= todayStr || e.date === 'Not specified');
          if (upcoming.length > 0) {
            matchingEvents = upcoming;
            filterDescription = 'coming up';
          } else {
            matchingEvents = sortedEvents;
            filterDescription = 'on record';
          }
        }
      }

      this.logDebugTrace(intent, 'READ', 'Event', 'dbService.getEvents', 'SUCCESS', 'SUCCESS', 'SUCCESS', `Found ${matchingEvents.length} events`);

      if (matchingEvents.length === 0) {
        const followUpText = `You don't have any events scheduled ${filterDescription}.`;
        return {
          intent,
          targetModule: 'Event',
          action: 'READ',
          success: true,
          data: { events: [], followUpText },
          summary: followUpText
        };
      }

      const eventListStr = matchingEvents
        .map(e => {
          const timePart = e.time && e.time !== 'Not specified' ? ` at ${e.time}` : '';
          const locPart = e.location && e.location !== 'Not specified' && e.location !== 'TBD' ? ` (${e.location})` : '';
          return `• **${e.title}** — ${e.date}${timePart}${locPart}`;
        })
        .join('\n');

      const followUpText = `Here are your events ${filterDescription}:\n\n${eventListStr}`;

      return {
        intent,
        targetModule: 'Event',
        action: 'READ',
        success: true,
        data: { events: matchingEvents, followUpText },
        summary: `✓ Retrieved ${matchingEvents.length} event(s) ${filterDescription}.`
      };
    }

    // ==================== STAGE A: EXTRACTION ====================
    const extracted = extractEventParams(rawQuery, payload);

    // ==================== STAGE B: VALIDATION ====================
    const missingFields: string[] = [];
    if (!extracted.isTitleValid || !extracted.title) {
      missingFields.push('title');
    }
    if (!extracted.isDateExplicit || !extracted.date || extracted.date === 'Not specified') {
      missingFields.push('date');
    }

    // If required fields (event_name or event_date) are missing, save a PendingDraft and ask for clarification!
    // NEVER fabricate a date or save the entire sentence as the event title.
    if (missingFields.length > 0) {
      this.setPendingDraft(userId, {
        userId,
        intent: 'EVENT',
        data: {
          title: extracted.title || '',
          date: extracted.isDateExplicit ? extracted.date : '',
          time: extracted.time,
          location: extracted.location,
          description: extracted.description
        },
        missingFields,
        createdAt: Date.now()
      });

      let clarificationQuestion = 'What would you like to call this event, and what date is it scheduled for?';
      if (missingFields.includes('title') && !missingFields.includes('date')) {
        clarificationQuestion = 'What would you like to call this event?';
      } else if (missingFields.includes('date') && !missingFields.includes('title')) {
        clarificationQuestion = `What date is ${extracted.title} scheduled for?`;
      }

      this.logDebugTrace(intent, 'CREATE_PENDING_CLARIFICATION', 'Event', 'ServerActionEngine.setPendingDraft', 'SUCCESS', 'SUCCESS', 'SUCCESS', `Missing: ${missingFields.join(', ')}`);
      return {
        intent,
        targetModule: 'Event',
        action: 'CREATE',
        success: true,
        data: {
          pending: true,
          missingFields,
          partialEvent: {
            event_name: extracted.title || null,
            event_date: extracted.isDateExplicit ? extracted.date : null
          },
          followUpText: clarificationQuestion
        },
        summary: clarificationQuestion
      };
    }

    // ==================== STAGE C: EXECUTION ====================
    // Prevent duplicate event creation if identical title + date already exists
    const existingEvents = dbService.getEvents(userId);
    const duplicateEvent = existingEvents.find(
      e => e.title.toLowerCase() === extracted.title.toLowerCase() && e.date === extracted.date
    );

    const newEvent = duplicateEvent
      ? (dbService.updateEvent(userId, duplicateEvent.id, {
          time: extracted.isTimeExplicit ? extracted.time : duplicateEvent.time,
          location: extracted.isLocationExplicit ? extracted.location : duplicateEvent.location,
          description: extracted.description || duplicateEvent.description
        }) || duplicateEvent)
      : dbService.createEvent(userId, {
          title: extracted.title,
          date: extracted.date,
          time: extracted.time,
          location: extracted.location,
          description: extracted.description,
          reminder_time: '30 minutes before',
          participants: payload.participants || ['Alex']
        });

    const verifyList = dbService.getEvents(userId);
    const verified = verifyList.some(e => e.id === newEvent.id);

    if (verified) {
      const followUpText = this.buildCanonicalEventConfirmation(newEvent);

      dbService.createNotificationHistory(userId, {
        type: 'EVENT',
        title: `Event Scheduled: "${newEvent.title}"`,
        description: `${newEvent.date}${newEvent.time && newEvent.time !== 'Not specified' ? ` at ${newEvent.time}` : ''}${newEvent.location && newEvent.location !== 'Not specified' ? ` (${newEvent.location})` : ''}`,
        source_id: newEvent.id,
        status: 'completed'
      });

      this.logDebugTrace(intent, action, 'Event', 'dbService.createEvent', 'SUCCESS', 'SUCCESS', 'SUCCESS', `Created Event ID: ${newEvent.id} | Name: ${newEvent.title} | Date: ${newEvent.date}`);
      return {
        intent,
        targetModule: 'Event',
        action: 'CREATE',
        success: true,
        data: {
          ...newEvent,
          event_name: newEvent.title,
          event_date: newEvent.date,
          followUpText
        },
        summary: followUpText
      };
    } else {
      this.logDebugTrace(intent, action, 'Event', 'dbService.createEvent', 'SUCCESS', 'FAILED', 'FAILED');
      return {
        intent,
        targetModule: 'Event',
        action: 'CREATE',
        success: false,
        error: 'Storage verification failed for new event.',
        summary: `✗ Failed to persist event "${extracted.title}".`
      };
    }
  }

  // ==================== STUDY TRACKING MODULE ====================
  private static handleStudyAction(
    userId: string,
    intent: string,
    action: 'CREATE' | 'READ' | 'UPDATE' | 'DELETE' | 'SEARCH' | 'NO_OP',
    payload: any,
    rawQuery: string
  ): ServerActionResult {
    const currentTracking = dbService.getStudyTracking(userId);
    const lower = rawQuery.toLowerCase();

    // 1. "What should I study today?"
    if (lower.includes('today') && (lower.includes('what should i study') || lower.includes('what do i study') || lower.includes('my study for today') || lower.includes('study schedule today'))) {
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const todayName = dayNames[new Date().getDay()];
      const plan = currentTracking.study_plan || [];
      const todayPlan = plan.find(p => p.day.toLowerCase() === todayName.toLowerCase());

      if (!todayPlan || !todayPlan.slots || todayPlan.slots.length === 0) {
        return {
          intent,
          targetModule: 'StudyTracking',
          action: 'READ',
          success: true,
          data: { followUpText: `No study sessions are scheduled for today (${todayName}). Enjoy your break or ask me to generate your study plan!` },
          summary: `✓ Checked study schedule for today.`
        };
      }

      const slotsSummary = todayPlan.slots.map((s: any) => `• **${s.time}**: ${s.activity}`).join('\n');
      const followUpText = `Here is what you should study today (**${todayName}**):\n\n${slotsSummary}`;
      return {
        intent,
        targetModule: 'StudyTracking',
        action: 'READ',
        success: true,
        data: { followUpText },
        summary: `✓ Retrieved today's study plan.`
      };
    }

    // 2. Exam Countdown
    if (lower.includes('how long') || lower.includes('days left') || lower.includes('countdown') || (lower.includes('when is') && lower.includes('exam'))) {
      if (!currentTracking.normal_exam_date) {
        return {
          intent,
          targetModule: 'StudyTracking',
          action: 'READ',
          success: true,
          data: { followUpText: `You haven't set your normal examination session date yet. Tell me your exam date (e.g., "My normal exam session starts December 15").` },
          summary: `✓ Checked exam countdown.`
        };
      }

      const targetDate = new Date(currentTracking.normal_exam_date + 'T00:00:00');
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const diffMs = targetDate.getTime() - now.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      const followUpText = `Your normal examination session (**${currentTracking.normal_exam_date}**) is in **${diffDays > 0 ? diffDays : 0} days**.`;
      return {
        intent,
        targetModule: 'StudyTracking',
        action: 'READ',
        success: true,
        data: { followUpText },
        summary: `✓ Calculated exam countdown.`
      };
    }

    // 3. View / Read Study Plan or Subjects
    const isReadQuery =
      action === 'READ' ||
      lower.includes("what's my study plan") ||
      lower.includes("what is my study plan") ||
      lower.includes("what is my study timetable") ||
      lower.includes("show my study plan") ||
      lower.includes("show my study timetable") ||
      lower.includes("view my study plan") ||
      lower.includes("what subjects am i") ||
      lower.includes("what courses am i");

    const extractedStudy = extractStudyParams(rawQuery, payload);

    if (isReadQuery && extractedStudy.subjects.length === 0 && !extractedStudy.wantsGenerate) {
      const plan = currentTracking.study_plan || [];
      const subjects = currentTracking.subjects || [];
      if (plan.length === 0 && subjects.length === 0) {
        return {
          intent,
          targetModule: 'StudyTracking',
          action: 'READ',
          success: true,
          data: { followUpText: `You don't have a generated study timetable yet. Tell me your subjects, exam date, and study hours (e.g., "I have exams in Math, Physics, and Chemistry on December 15, I can study 3 hours a day from 7 PM to 10 PM") and I'll generate it for you!` },
          summary: `✓ Retrieved study plan.`
        };
      }

      let followUpText = `## Study Tracking & Timetable\n\n`;
      if (currentTracking.normal_exam_date) {
        followUpText += `- **Exam Date:** ${currentTracking.normal_exam_date}\n`;
      }
      if (currentTracking.continuous_assessment_date) {
        followUpText += `- **CA Date:** ${currentTracking.continuous_assessment_date}\n`;
      }
      followUpText += `- **Study Window:** ${currentTracking.hours_per_day}h/day (${currentTracking.preferred_start_time} – ${currentTracking.preferred_end_time}) on ${currentTracking.available_days.join(', ')}\n\n`;

      if (subjects.length > 0) {
        followUpText += `### Tracked Subjects\n`;
        subjects.forEach(s => {
          followUpText += `- **${s.name}** — ${s.difficulty || 'Medium'} difficulty • ${s.level}% confidence\n`;
        });
        followUpText += `\n`;
      }

      if (plan.length > 0) {
        const planSummary = plan.map((d: any) => `**${d.day}:**\n` + d.slots.map((s: any) => `  • ${s.time} — ${s.activity}`).join('\n')).join('\n\n');
        followUpText += `### Personalized Study Timetable\n\n${planSummary}`;
      }
      return {
        intent,
        targetModule: 'StudyTracking',
        action: 'READ',
        success: true,
        data: { followUpText: followUpText.trim(), study_tracking: currentTracking },
        summary: `✓ Retrieved study timetable.`
      };
    }

    // 4. Subject operations: Delete
    const delSubjMatch = lower.match(/(?:delete|remove)\s+([a-z0-9\s]+?)(?:\s+from\s+(?:my\s+)?study\s+tracking|$)/i);
    if (delSubjMatch || action === 'DELETE') {
      const targetName = delSubjMatch ? delSubjMatch[1].trim() : (payload.course || payload.subject_name || rawQuery).replace(/(?:delete|remove|from|study|tracking)/gi, '').trim();
      if (targetName) {
        const updatedSubjects = currentTracking.subjects.filter(s => !s.name.toLowerCase().includes(targetName.toLowerCase()));
        const updated = dbService.saveStudyTracking(userId, { subjects: updatedSubjects });
        const followUpText = `Removed **${targetName}** from your study tracking subjects and updated your timetable.`;
        return {
          intent,
          targetModule: 'StudyTracking',
          action: 'DELETE',
          success: true,
          data: { followUpText, study_tracking: updated },
          summary: `✓ Removed subject "${targetName}".`
        };
      }
    }

    // 5. Subject operations: Single Level Update / Change / Set (e.g. "Set Mathematics to 45%")
    const setLevelMatch = lower.match(/(?:change|set|update)\s+([a-z0-9\s]+?)\s+(?:to|level\s+to|at)\s+(\d{1,3})\s*%?/i);
    if (setLevelMatch && extractedStudy.subjects.length <= 1) {
      const targetName = setLevelMatch[1].trim();
      const levelVal = Math.min(100, Math.max(0, parseInt(setLevelMatch[2], 10)));
      const difficulty: 'Easy' | 'Medium' | 'Hard' = levelVal <= 40 ? 'Hard' : levelVal >= 75 ? 'Easy' : 'Medium';
      const priority: 'Low' | 'Medium' | 'High' = levelVal <= 40 ? 'High' : levelVal >= 75 ? 'Low' : 'Medium';
      let found = false;
      const updatedSubjects = currentTracking.subjects.map(s => {
        if (s.name.toLowerCase().includes(targetName.toLowerCase())) {
          found = true;
          return { ...s, level: levelVal, difficulty, priority };
        }
        return s;
      });

      if (!found) {
        updatedSubjects.push({
          id: `subj-${Date.now()}`,
          name: targetName.charAt(0).toUpperCase() + targetName.slice(1),
          difficulty,
          priority,
          level: levelVal
        });
      }

      const updated = dbService.saveStudyTracking(userId, { subjects: updatedSubjects });
      const followUpText = `Set **${targetName}** confidence level to **${levelVal}%** (${difficulty} difficulty) and rebalanced your study timetable.`;
      return {
        intent,
        targetModule: 'StudyTracking',
        action: 'UPDATE',
        success: true,
        data: { followUpText, study_tracking: updated },
        summary: `✓ Updated level for "${targetName}" to ${levelVal}%.`
      };
    }

    // 6. Comprehensive Multi-Subject / Exam Date / Availability / Timetable Generation Handler
    const mergedSubjects: StudySubject[] = [...currentTracking.subjects];
    const addedOrUpdatedSubjectNames: string[] = [];

    if (extractedStudy.subjects.length > 0) {
      for (const incoming of extractedStudy.subjects) {
        const existingIdx = mergedSubjects.findIndex(s => s.name.toLowerCase() === incoming.name.toLowerCase());
        if (existingIdx >= 0) {
          mergedSubjects[existingIdx] = {
            ...mergedSubjects[existingIdx],
            difficulty: incoming.difficulty || mergedSubjects[existingIdx].difficulty || 'Medium',
            priority: incoming.priority || mergedSubjects[existingIdx].priority || 'Medium',
            level: incoming.level !== undefined ? incoming.level : mergedSubjects[existingIdx].level
          };
        } else {
          mergedSubjects.push(incoming);
        }
        addedOrUpdatedSubjectNames.push(`${incoming.name} (${incoming.difficulty} • ${incoming.level}%)`);
      }
    }

    const updatesToSave: Partial<StudyTrackingData> = {};
    if (extractedStudy.subjects.length > 0) {
      updatesToSave.subjects = mergedSubjects;
    }
    if (extractedStudy.normal_exam_date) {
      updatesToSave.normal_exam_date = extractedStudy.normal_exam_date;
    }
    if (extractedStudy.continuous_assessment_date) {
      updatesToSave.continuous_assessment_date = extractedStudy.continuous_assessment_date;
    }
    if (extractedStudy.hours_per_day) {
      updatesToSave.hours_per_day = extractedStudy.hours_per_day;
    }
    if (extractedStudy.preferred_start_time) {
      updatesToSave.preferred_start_time = extractedStudy.preferred_start_time;
    }
    if (extractedStudy.preferred_end_time) {
      updatesToSave.preferred_end_time = extractedStudy.preferred_end_time;
    }
    if (extractedStudy.available_days && extractedStudy.available_days.length > 0) {
      updatesToSave.available_days = extractedStudy.available_days;
    }

    // If user asked to generate timetable but no subjects exist at all yet
    if (extractedStudy.wantsGenerate && mergedSubjects.length === 0) {
      const promptMsg = `Which subjects are you preparing for, and how many hours per day can you study?`;
      return {
        intent,
        targetModule: 'StudyTracking',
        action: 'CREATE',
        success: false,
        error: 'No subjects found',
        data: { followUpText: promptMsg },
        summary: promptMsg
      };
    }

    // Persist updates and auto-generate study_plan in dbService.saveStudyTracking
    const updated = dbService.saveStudyTracking(userId, updatesToSave);
    const plan = updated.study_plan || [];

    // Schedule exam proximity reminders if exam date is set and subjects exist
    if (updated.normal_exam_date && updated.subjects.length > 0) {
      const existingReminders = dbService.getReminders(userId);
      const examReminders = generateExamReminders(
        updated.subjects.map(s => s.name).join(', ') || 'Exam Session',
        updated.normal_exam_date
      );
      for (const rem of examReminders) {
        const alreadyExists = existingReminders.some(r => r.title === rem.title && r.date === rem.date);
        if (!alreadyExists) {
          dbService.createReminder(userId, {
            title: rem.title,
            date: rem.date,
            time: updated.preferred_start_time || '20:00',
            repeat: 'none',
            priority: 'high',
            voice_notification: true,
            active: true,
            category: 'Study'
          });
        }
      }
    }

    let responseLines: string[] = [`## Study Tracking & Timetable Updated\n`];
    if (updated.normal_exam_date) {
      responseLines.push(`- **Exam Date:** ${updated.normal_exam_date}`);
    }
    if (updated.continuous_assessment_date) {
      responseLines.push(`- **Continuous Assessment Date:** ${updated.continuous_assessment_date}`);
    }
    responseLines.push(`- **Study Schedule:** ${updated.hours_per_day}h/day (${updated.preferred_start_time} – ${updated.preferred_end_time}) on ${updated.available_days.join(', ')}`);

    if (updated.subjects.length > 0) {
      responseLines.push(`- **Tracked Subjects:** ${updated.subjects.map(s => `**${s.name}** (${s.difficulty || 'Medium'} • ${s.level}%)`).join(', ')}`);
    }

    if (plan.length > 0) {
      const planSummary = plan
        .map((d: any) => `**${d.day}:**\n` + d.slots.map((s: any) => `  • ${s.time} — ${s.activity}`).join('\n'))
        .join('\n\n');
      responseLines.push(`\n### Personalized Study Timetable\n*(Weaker & harder subjects are prioritized with extra revision blocks)*\n\n${planSummary}`);
    }

    const followUpText = responseLines.join('\n');
    return {
      intent,
      targetModule: 'StudyTracking',
      action: extractedStudy.wantsGenerate || extractedStudy.subjects.length > 0 ? 'CREATE' : 'UPDATE',
      success: true,
      data: { followUpText, study_tracking: updated },
      summary: followUpText
    };
  }

  // ==================== MEMORY VAULT & SAVED INFORMATION MODULE ====================
  private static handleMemoryVaultAction(
    userId: string,
    intent: string,
    action: 'CREATE' | 'READ' | 'UPDATE' | 'DELETE' | 'SEARCH' | 'NO_OP',
    payload: any,
    rawQuery: string
  ): ServerActionResult {
    // 1. READ / SEARCH
    if (action === 'READ' || action === 'SEARCH') {
      const vaultItems = dbService.getMemoryVaultItems(userId);
      const memories = dbService.getMemories(userId);

      const itemsList: string[] = [];
      vaultItems.forEach(v => {
        const txt = v.content || v.title;
        if (txt && !itemsList.includes(txt)) itemsList.push(txt);
      });
      memories.forEach(m => {
        if (m.text && !itemsList.includes(m.text)) itemsList.push(m.text);
      });

      let followUpText = '';
      if (itemsList.length === 0) {
        followUpText = "You haven't saved any information in memory yet. Tell me things like 'Remember that my mother's birthday is June 12' or 'Keep in mind my favorite language is Java' and I'll keep them saved for you.";
      } else {
        followUpText = `Here is what I have saved in your memory:\n\n` + itemsList.map(item => `• **${item}**`).join('\n');
      }

      this.logDebugTrace(intent, action, 'MemoryVault', 'dbService.getMemoryVaultItems', 'SUCCESS', 'SUCCESS', 'SUCCESS');
      return {
        intent,
        targetModule: 'MemoryVault',
        action,
        success: true,
        data: { items: itemsList, followUpText },
        summary: `✓ Retrieved ${itemsList.length} saved memories.`
      };
    }

    // 2. DELETE
    if (action === 'DELETE') {
      const rawTarget = (payload.title || payload.content || rawQuery).toLowerCase();
      const targetSearch = rawTarget
        .replace(/^(delete|remove|forget|the|memory|about|my|saved|info)\s*/g, '')
        .trim();

      const vaultItems = dbService.getMemoryVaultItems(userId);
      const memories = dbService.getMemories(userId);

      let matchVault = vaultItems.find(v => 
        (v.title && v.title.toLowerCase().includes(targetSearch)) || 
        (v.content && v.content.toLowerCase().includes(targetSearch))
      );
      let matchMemory = memories.find(m => 
        m.text && m.text.toLowerCase().includes(targetSearch)
      );

      let deletedAny = false;
      let deletedTitle = targetSearch || 'Memory';

      if (matchVault) {
        dbService.deleteMemoryVaultItem(userId, matchVault.id);
        deletedTitle = matchVault.title || matchVault.content;
        deletedAny = true;
      }

      if (matchMemory) {
        dbService.deleteMemory(userId, matchMemory.id);
        if (!deletedTitle || deletedTitle === targetSearch) deletedTitle = matchMemory.text;
        deletedAny = true;
      }

      if (!deletedAny && targetSearch.length > 0) {
        const keywords = targetSearch.split(/\s+/).filter((w: string) => w.length > 2);
        for (const kw of keywords) {
          const mv = vaultItems.find(v => (v.title && v.title.toLowerCase().includes(kw)) || (v.content && v.content.toLowerCase().includes(kw)));
          const mm = memories.find(m => m.text && m.text.toLowerCase().includes(kw));
          if (mv) {
            dbService.deleteMemoryVaultItem(userId, mv.id);
            deletedTitle = mv.title || mv.content;
            deletedAny = true;
          }
          if (mm) {
            dbService.deleteMemory(userId, mm.id);
            deletedAny = true;
          }
          if (deletedAny) break;
        }
      }

      if (deletedAny) {
        const followUpText = `Done — I've deleted the memory about **${deletedTitle}**.`;
        this.logDebugTrace(intent, action, 'MemoryVault', 'dbService.deleteMemoryVaultItem', 'SUCCESS', 'SUCCESS', 'SUCCESS');
        return {
          intent,
          targetModule: 'MemoryVault',
          action,
          success: true,
          data: { followUpText },
          summary: `✓ Deleted memory about "${deletedTitle}".`
        };
      } else {
        const followUpText = `I couldn't find a saved memory matching "${targetSearch || rawQuery}".`;
        this.logDebugTrace(intent, action, 'MemoryVault', 'dbService.deleteMemoryVaultItem', 'SUCCESS', 'FAILED', 'FAILED');
        return {
          intent,
          targetModule: 'MemoryVault',
          action,
          success: false,
          data: { followUpText },
          summary: `✗ No memory found matching "${targetSearch || rawQuery}".`
        };
      }
    }

    // 3. NO_OP or Empty command
    if (action === 'NO_OP' || payload?.empty) {
      const followUpText = "What would you like me to keep in mind?";
      return {
        intent,
        targetModule: 'MemoryVault',
        action: 'NO_OP',
        success: true,
        data: { followUpText },
        summary: followUpText
      };
    }

    // 4. CREATE (Default)
    const rawInputToClean = payload.content || payload.text || payload.title || rawQuery;
    const extractedVault = extractVaultContent(rawInputToClean);
    let content = extractedVault.content;
    let title = extractedVault.title;

    if (!content) {
      const followUpText = "What would you like me to keep in mind?";
      return {
        intent,
        targetModule: 'MemoryVault',
        action: 'NO_OP',
        success: true,
        data: { followUpText },
        summary: followUpText
      };
    }

    // Check for duplicate entry
    const existingVaultItems = dbService.getMemoryVaultItems(userId);
    const isDuplicate = existingVaultItems.some(v => 
      (v.content && v.content.trim().toLowerCase() === content.trim().toLowerCase()) ||
      (v.title && v.title.trim().toLowerCase() === content.trim().toLowerCase())
    );

    if (isDuplicate) {
      const followUpText = "I already have that saved in your Vault Memory.";
      return {
        intent,
        targetModule: 'MemoryVault',
        action: 'CREATE',
        success: true,
        data: { followUpText },
        summary: `✓ Information already exists in Vault Memory.`
      };
    }

    const newItem = dbService.createVaultItem(userId, {
      title: title.trim().slice(0, 40),
      content: content.trim(),
      category: payload.category || 'Personal',
      tags: payload.tags || ['ai_saved']
    });

    dbService.createMemory(userId, {
      text: content.trim(),
      category: payload.category || 'Personal'
    });

    const verifyList = dbService.getMemoryVaultItems(userId);
    const verified = verifyList.some(v => v.id === newItem.id);

    if (verified) {
      dbService.createNotificationHistory(userId, {
        type: 'MEMORY_VAULT',
        title: `Information Saved: "${newItem.title}"`,
        description: newItem.content.slice(0, 60),
        source_id: newItem.id,
        status: 'completed'
      });

      const followUpText = "I've noted that in your Vault Memory.";

      this.logDebugTrace(intent, action, 'MemoryVault', 'dbService.createVaultItem', 'SUCCESS', 'SUCCESS', 'SUCCESS', `Created Vault ID: ${newItem.id}`);
      return {
        intent,
        targetModule: 'MemoryVault',
        action: 'CREATE',
        success: true,
        data: { ...newItem, followUpText },
        summary: `✓ Preserved in memory: "${content}".`
      };
    } else {
      const followUpText = "I encountered an issue saving this to your Vault Memory. Please try again.";
      this.logDebugTrace(intent, action, 'MemoryVault', 'dbService.createVaultItem', 'SUCCESS', 'FAILED', 'FAILED');
      return {
        intent,
        targetModule: 'MemoryVault',
        action: 'CREATE',
        success: false,
        error: 'Storage verification failed for saved memory.',
        data: { followUpText },
        summary: `✗ Failed to persist memory "${title}".`
      };
    }
  }
}
