import { dbService } from './db.js';
import { normalizeTimeString, extractTimeFromText, extractDurationFromText } from '../src/utils/timeUtils.js';
import { extractReminderParams, parseFollowUpUpdate, cleanReminderTitle, resolveRelativeDate, detectReminderFields } from '../src/utils/reminderParser.js';
import { generateStudyPlan, generateExamReminders } from '../src/utils/studyPlanGenerator.js';
import { StudyTrackingData } from '../src/types.js';
import { extractVaultContent } from './contextualNormalizer.js';
import { isConversationalText } from './gemini.js';

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
      /^(today|tomorrow|tonight|noon|midnight|monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i.test(lower);

    if (isIntentSwitch && !isPureTimeOrDate) {
      const extractedT = extractTimeFromText(rawQuery);
      const extractedTitle = cleanReminderTitle(rawQuery, rawQuery);
      const satisfiesMissingTime = draft.missingFields.includes('time') && extractedT !== null;
      const satisfiesMissingTitle = draft.missingFields.includes('title') && extractedTitle.length > 0;

      if (!satisfiesMissingTime && !satisfiesMissingTitle) {
        this.clearPendingDraft(userId);
        return null;
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
        const hasDateInQuery = lower.includes('today') || lower.includes('tomorrow') || /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(lower) || /\b\d{4}-\d{2}-\d{2}\b/.test(lower) || /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}\b/i.test(lower);
        if (hasDateInQuery) {
          draft.data.date = resolveRelativeDate(null, rawQuery);
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
    if (followUp && followUp.isFollowUp && lastReminder) {
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
    if (!params.isTimeExplicit && !payload?.time) {
      missingFields.push('time');
    }
    if (!params.isDateExplicit && !payload?.date && !params.isTimeExplicit && !payload?.time) {
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
      if (missingFields.includes('title')) {
        followUpQuestion = 'What would you like me to remind you about?';
      } else if (missingFields.includes('time') && missingFields.includes('date')) {
        followUpQuestion = 'When should I remind you?';
      } else if (missingFields.includes('time')) {
        followUpQuestion = 'Sure. What time should I remind you?';
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
    const lowerQuery = rawQuery.toLowerCase();

    const isMetaChunk = (text: string): boolean => {
      const lower = text.trim().toLowerCase();
      if (!lower || lower.length < 2) return true;
      if (/^(help me|plan my day|generate my plan|generate my plan for that|create my plan|make a schedule|organize these tasks|schedule them|for that|plan it|make a plan)$/i.test(lower)) return true;
      if (/^can\s+you\s+create\s+a\s+plan/i.test(lower)) return true;
      if (/^i\s+want\s+you\s+to\s+help\s+me/i.test(lower)) return true;
      if (/^generate\s+(my|a)?\s*plan/i.test(lower)) return true;
      if (/^create\s+(my|a)?\s*plan/i.test(lower)) return true;
      if (/^plan\s+my\s+day/i.test(lower)) return true;
      if (/^help\s+me\s+plan/i.test(lower)) return true;
      if (/^organize\s+(these\s+tasks|my\s+day|my\s+schedule|my\s+tasks)/i.test(lower)) return true;
      if (/^arrange\s+(these\s+activities|my\s+tasks)/i.test(lower)) return true;
      if (/^for\s+that\??$/i.test(lower)) return true;
      return false;
    };

    // Helper: Stage 1 - Task Extraction
    const parseAndExtractTasks = (query: string) => {
      let cleaned = query
        .replace(/i\s+want\s+you\s+to\s+help\s+me\s+(to\s+)?plan\s+my\s+day\.?/gi, '')
        .replace(/can\s+you\s+create\s+a\s+plan\s+for\s+that\??/gi, '')
        .replace(/can\s+you\s+create\s+a\s+plan\??/gi, '')
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
        .replace(/schedule\s+them/gi, '')
        .replace(/for\s+that\??$/gi, '')
        .replace(/^(help\s+me|please|can\s+you|i\s+want\s+to)\s+/gi, '')
        .replace(/\b(for\s+)?(tomorrow|today|this\s+weekend|next\s+week)\b/gi, '')
        .trim();

      cleaned = cleaned.replace(/^[^a-zA-Z0-9]+/, '').trim();

      const rawChunks = cleaned
        .split(/\.|\n|\r|;|\band\s+then\b|\band\s+after\s+that\b|\bafter\s+that\b|\bthen\b/i)
        .flatMap(chunk => chunk.split(/,|\band\b/i))
        .map(c => c.trim())
        .filter(c => c.length > 2);

      const results: Array<{ title: string; durationHours: number; durationLabel: string; fixedTime: string | null }> = [];

      for (const chunk of rawChunks) {
        if (isMetaChunk(chunk)) {
          continue;
        }

        let durationHours = 1.5;
        let durationLabel = '1.5h';

        const extDur = extractDurationFromText(chunk);
        if (extDur) {
          durationHours = extDur.durationHours;
          durationLabel = extDur.durationLabel;
        }

        let fixedTime: string | null = null;
        const timeMatch = extractTimeFromText(chunk);
        if (timeMatch && !timeMatch.startsWith('AMBIGUOUS:') && (/\b(at|from|starts?\s+at)\b/i.test(chunk) || /\b(am|pm)\b/i.test(chunk))) {
          fixedTime = timeMatch;
        }

        let title = chunk
          .replace(/\b(for\s+)?(\d+(\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m)\b/gi, '')
          .replace(/\b(for\s+)?(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty)\s*(hours?|hrs?|h|minutes?|mins?|m)\b/gi, '')
          .replace(/\b(at|from|starts?\s+at)\s+\d{1,2}(:\d{2})?\s*(am|pm)?\b/gi, '')
          .replace(/\b\d{1,2}(:\d{2})?\s*(am|pm)\b/gi, '')
          .replace(/^(i\s+need\s+to|i\s+have\s+to|i\s+want\s+to|need\s+to|have\s+to|i\s+must|make\s+this\s+activity|create\s+a)\s+/i, '')
          .replace(/^(tomorrow|today|for\s+tomorrow|for\s+today)\s+/i, '')
          .replace(/[^a-zA-Z0-9\s-]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        if (title) {
          // Capitalize words cleanly while preserving acronyms like CSC305
          title = title.split(' ').map(w => {
            if (w.length === 0) return '';
            if (/^[A-Z0-9]+$/.test(w)) return w; // Keep uppercase terms like CSC305, CS101
            return w[0].toUpperCase() + w.slice(1);
          }).join(' ');
        }

        if (!title || isMetaChunk(title)) {
          continue;
        }

        results.push({
          title,
          durationHours,
          durationLabel,
          fixedTime
        });
      }

      return results;
    };

    // STAGE 1: Extract real user tasks
    let taskSpecs = parseAndExtractTasks(rawQuery);

    if (taskSpecs.length === 0 && Array.isArray(payload.tasks) && payload.tasks.length > 0) {
      taskSpecs = payload.tasks
        .map((t: any) => {
          const ext = typeof t === 'string' ? extractDurationFromText(t) : null;
          const durHours = t.durationHours || (ext ? ext.durationHours : 1.5);
          const durLabel = t.durationLabel || (ext ? ext.durationLabel : `${durHours}h`);
          return {
            title: typeof t === 'string' ? t : t.title || 'Task',
            durationHours: durHours,
            durationLabel: durLabel,
            fixedTime: t.fixedTime || null
          };
        })
        .filter((t: any) => !isMetaChunk(t.title));
    }

    // Check available time constraint in raw query (e.g., "3 hours available")
    const availMatch = rawQuery.match(/(\d+(\.\d+)?)\s*(hours?|hrs?|h)\s*(available|free|total)/i) ||
                      rawQuery.match(/(available|free|have)\s*(\d+(\.\d+)?)\s*(hours?|hrs?|h)/i);
    if (availMatch && taskSpecs.length > 0) {
      const availVal = parseFloat(availMatch[1] || availMatch[2]);
      if (availVal > 0) {
        const perTaskDuration = parseFloat((availVal / taskSpecs.length).toFixed(1));
        taskSpecs.forEach(t => {
          if (!t.fixedTime) {
            t.durationHours = perTaskDuration;
            t.durationLabel = `${perTaskDuration}h`;
          }
        });
      }
    }

    // If still empty, check existing items for the date
    if (taskSpecs.length === 0) {
      const existingDbTasks = dbService.getTasks(userId).filter(t => t.date === date);
      const existingDbEvents = dbService.getEvents(userId).filter(e => e.date === date);
      existingDbTasks.forEach(t => taskSpecs.push({ title: t.title, durationHours: 1.5, durationLabel: '1.5h', fixedTime: t.time || null }));
      existingDbEvents.forEach(e => taskSpecs.push({ title: e.title, durationHours: 1.5, durationLabel: '1.5h', fixedTime: e.time || null }));
    }

    // Fallback ONLY if zero tasks specified and zero existing DB tasks/events
    if (taskSpecs.length === 0) {
      taskSpecs = [
        { title: 'Core Focus Session', durationHours: 2, durationLabel: '2h', fixedTime: null },
        { title: 'Project Assignments', durationHours: 1.5, durationLabel: '1.5h', fixedTime: null },
        { title: 'Review & Reflection', durationHours: 1, durationLabel: '1h', fixedTime: null }
      ];
    }

    // STAGE 2: Generate Chronological Daily Schedule
    const helperFormatTime = (decimalHours: number): string => {
      const totalMins = Math.round(decimalHours * 60);
      const h = Math.floor(totalMins / 60) % 24;
      const m = totalMins % 60;
      const hStr = h < 10 ? `0${h}` : `${h}`;
      const mStr = m < 10 ? `0${m}` : `${m}`;
      return `${hStr}:${mStr}`;
    };

    const parseTimeToDecimal = (timeStr: string): number => {
      if (!timeStr) return 9;
      const [hStr, mStr] = timeStr.split(':');
      const h = parseInt(hStr, 10) || 9;
      const m = parseInt(mStr, 10) || 0;
      return h + m / 60;
    };

    let clock = 8.0; // Start at 8:00 AM
    const blocks: Array<{ startTimeDec: number; endTimeDec: number; timeLabel: string; title: string; durationLabel: string }> = [];

    const fixedTasks = taskSpecs.filter(t => t.fixedTime !== null);
    const flexibleTasks = taskSpecs.filter(t => t.fixedTime === null);

    // Schedule flexible tasks
    for (let i = 0; i < flexibleTasks.length; i++) {
      const task = flexibleTasks[i];

      const startDec = clock;
      const endDec = startDec + task.durationHours;
      const startStr = helperFormatTime(startDec);
      const endStr = helperFormatTime(endDec);

      blocks.push({
        startTimeDec: startDec,
        endTimeDec: endDec,
        timeLabel: `${startStr} – ${endStr}`,
        title: task.title,
        durationLabel: task.durationLabel
      });

      clock = endDec + 0.25; // 15 min break between tasks
      if (clock >= 12.5 && clock < 13.5) clock = 13.5; // Lunch break
    }

    // Schedule fixed tasks
    for (const ft of fixedTasks) {
      const startDec = parseTimeToDecimal(ft.fixedTime!);
      const endDec = startDec + ft.durationHours;
      const startStr = helperFormatTime(startDec);
      const endStr = helperFormatTime(endDec);

      if (!blocks.some(b => b.title === ft.title)) {
        blocks.push({
          startTimeDec: startDec,
          endTimeDec: endDec,
          timeLabel: `${startStr} – ${endStr}`,
          title: ft.title,
          durationLabel: ft.durationLabel
        });
      }
    }

    // Sort all blocks chronologically
    blocks.sort((a, b) => a.startTimeDec - b.startTimeDec);

    const timelineBlocks: any[] = [];

    blocks.forEach((b, idx) => {
      timelineBlocks.push({
        id: `block-${idx + 1}-${Date.now()}`,
        time: b.timeLabel,
        title: b.title,
        duration: b.durationLabel,
        priority: idx === 0 ? 'high' : 'medium',
        reminder_enabled: true
      });
    });

    const suggestions = `Daily plan structured around your actual tasks for ${date}. High-priority focus blocks assigned chronologically.`;

    const newPlan = dbService.createPlan(userId, {
      date,
      timeline: timelineBlocks,
      suggestions
    });

    const scheduleLines = timelineBlocks
      .map(b => `${b.time}\n${b.title}`)
      .join('\n\n');

    const followUpText = `MY PLAN FOR ${date === todayStr ? 'TODAY' : 'TOMORROW'} (${date}):\n\n${scheduleLines}`;

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
      const titleSearch = (payload.title || rawQuery).toLowerCase();
      const events = dbService.getEvents(userId);
      const match = events.find(ev => ev.title.toLowerCase().includes(titleSearch));

      if (!match) {
        return {
          intent,
          targetModule: 'Event',
          action,
          success: false,
          error: `No event found matching "${payload.title || rawQuery}"`,
          summary: `✗ Failed to delete event: "${payload.title || rawQuery}" not found.`
        };
      }

      const deleted = dbService.deleteEvent(userId, match.id);
      this.logDebugTrace(intent, action, 'Event', 'dbService.deleteEvent', deleted ? 'SUCCESS' : 'FAILED', deleted ? 'SUCCESS' : 'FAILED', deleted ? 'SUCCESS' : 'FAILED');
      return {
        intent,
        targetModule: 'Event',
        action,
        success: deleted,
        summary: deleted ? `✓ Deleted event: "${match.title}".` : `✗ Failed to delete event "${match.title}".`
      };
    }

    if (action === 'UPDATE') {
      const events = dbService.getEvents(userId);
      let match = payload.id ? events.find(e => e.id === payload.id) : null;
      if (!match) {
        const titleSearch = (payload.title || rawQuery).toLowerCase();
        match = events.find(ev => ev.title.toLowerCase().includes(titleSearch));
      }

      if (!match) {
        return {
          intent,
          targetModule: 'Event',
          action,
          success: false,
          error: 'Event not found for update.',
          summary: '✗ Failed to update event.'
        };
      }

      const updated = dbService.updateEvent(userId, match.id, payload);
      const updatedEvent = updated || match;

      const missingFields: string[] = [];
      if (!updatedEvent.date || updatedEvent.date === 'Not specified') missingFields.push('Date');
      if (!updatedEvent.time || updatedEvent.time === 'Not specified') missingFields.push('Time');
      if (!updatedEvent.location || updatedEvent.location === 'Not specified') missingFields.push('Location');

      let followUpText = '';
      if (payload.location) {
        followUpText = `Done — Updated **${updatedEvent.title}** location to **${updatedEvent.location}**.`;
      } else {
        followUpText = `Done — Updated **${updatedEvent.title}**.`;
      }

      return {
        intent,
        targetModule: 'Event',
        action: 'UPDATE',
        success: true,
        data: { ...updatedEvent, followUpText },
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

      if (lowerQuery.includes('tomorrow')) {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        const tomorrowStr = d.toISOString().split('T')[0];
        matchingEvents = sortedEvents.filter(e => e.date === tomorrowStr);
        filterDescription = `for tomorrow (${tomorrowStr})`;
      } else if (lowerQuery.includes('today')) {
        matchingEvents = sortedEvents.filter(e => e.date === todayStr);
        filterDescription = `for today (${todayStr})`;
      } else if (lowerQuery.includes('this week') || lowerQuery.includes('week')) {
        const dEnd = new Date();
        dEnd.setDate(dEnd.getDate() + 7);
        const endOfWeekStr = dEnd.toISOString().split('T')[0];
        matchingEvents = sortedEvents.filter(e => e.date >= todayStr && e.date <= endOfWeekStr);
        filterDescription = 'for this week';
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

      this.logDebugTrace(intent, 'READ', 'Event', 'dbService.getEvents', 'SUCCESS', 'SUCCESS', 'SUCCESS', `Found ${matchingEvents.length} events`);

      if (matchingEvents.length === 0) {
        const followUpText = `You don't have any events scheduled ${filterDescription}.`;
        return {
          intent,
          targetModule: 'Event',
          action: 'READ',
          success: true,
          data: { events: [], followUpText },
          summary: `✓ No events found ${filterDescription}.`
        };
      }

      const eventListStr = matchingEvents
        .map(e => `• **${e.title}**: ${e.date} at ${e.time}${e.location && e.location !== 'Not specified' ? ` (${e.location})` : ''}`)
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

    // Default: CREATE
    let rawTitle = payload.title || payload.content || rawQuery;
    let title = rawTitle;
    if (typeof rawTitle === 'string') {
      title = rawTitle
        .replace(/^(I\s+(would\s+like|want)\s+(you\s+)?to\s+)?(remind\s+me\s+of\s+the|remind\s+me\s+about\s+the|remind\s+me\s+of|remind\s+me\s+about|remind\s+me\s+to|remind\s+me|save\s+my|save\s+the|save\s+it\s+in|save\s+in|save\s+to|save|add\s+my|add\s+the|add|schedule\s+my|schedule\s+the|schedule|create\s+my|create\s+the|create)\s+/i, '')
        .replace(/\s+(that\s+will\s+happen|which\s+is\s+happening|happening|taking\s+place).*$/i, '')
        .replace(/\s+(and\s+)?(save\s+it\s+(inside|in)|add\s+it\s+to|save\s+to)\s+(my\s+)?events.*$/i, '')
        .replace(/\s+(inside|in|to)\s+(my\s+)?events.*$/i, '')
        .replace(/\s+as\s+an?\s+event.*$/i, '')
        .replace(/\s+(this|next)?\s*(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today).*$/i, '')
        .replace(/\s+(on|at)\s+\d{1,2}(:\d{2})?\s*(am|pm)?.*$/i, '')
        .trim();

      if (title) {
        title = title.split(/\s+/).map(w => w.length > 0 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : '').join(' ');
      }
    }
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      title = 'Scheduled Event';
    }

    const hasExplicitDate = !!payload.date || /\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|\d{1,2}\/\d{1,2}|\d{4}-\d{2}-\d{2})\b/i.test(rawQuery);
    const date = hasExplicitDate ? resolveRelativeDate(payload.date, rawQuery) : 'Not specified';

    const explicitTime = normalizeTimeString(payload.time) || extractTimeFromText(rawQuery);
    const time = explicitTime ? explicitTime : 'Not specified';

    let location = payload.location;
    if (!location) {
      const locMatch = rawQuery.match(/\b(at|in)\s+([A-Z0-9][a-zA-Z0-9\s,]{2,30})/);
      if (locMatch && !/saturday|sunday|monday|tuesday|wednesday|thursday|friday|today|tomorrow|events|my events/i.test(locMatch[2])) {
        location = locMatch[2].trim();
      }
    }
    if (!location || location === 'Tech Hub, Buea') {
      location = 'Not specified';
    }

    const newEvent = dbService.createEvent(userId, {
      title: title.trim(),
      date,
      time,
      location,
      description: payload.description || rawQuery,
      reminder_time: '30 minutes before',
      participants: payload.participants || ['Alex']
    });

    const verifyList = dbService.getEvents(userId);
    const verified = verifyList.some(e => e.id === newEvent.id);

    if (verified) {
      const missingFields: string[] = [];
      if (date === 'Not specified') missingFields.push('Date');
      if (time === 'Not specified') missingFields.push('Time');
      if (location === 'Not specified') missingFields.push('Location');

      let timeDisplay = time;
      if (time && time.includes(':')) {
        const [hStr, mStr] = time.split(':');
        const h = parseInt(hStr, 10);
        const ampm = h >= 12 ? 'PM' : 'AM';
        const displayH = h % 12 === 0 ? 12 : h % 12;
        const displayM = mStr ? `:${mStr}` : ':00';
        timeDisplay = `${displayH}${displayM === ':00' ? '' : displayM} ${ampm}`;
      }

      let dateDisplay = date;
      const todayDateStr = new Date().toISOString().split('T')[0];
      const tomorrowDate = new Date();
      tomorrowDate.setDate(tomorrowDate.getDate() + 1);
      const tomorrowDateStr = tomorrowDate.toISOString().split('T')[0];

      if (date === todayDateStr) dateDisplay = 'today';
      else if (date === tomorrowDateStr) dateDisplay = 'tomorrow';

      let followUpText = '';
      if (missingFields.length === 0) {
        followUpText = `Done — I've saved **${newEvent.title}** for ${dateDisplay} at ${timeDisplay}${location !== 'Not specified' ? ` at ${location}` : ''}.`;
      } else if (missingFields.length === 1 && missingFields[0] === 'Location') {
        followUpText = `Done — I've saved **${newEvent.title}** for ${dateDisplay} at ${timeDisplay}.\n\nWhere will it take place?`;
      } else if (missingFields.length === 1 && missingFields[0] === 'Time') {
        followUpText = `Done — I've saved **${newEvent.title}** for ${dateDisplay}.\n\nWhat time will it start?`;
      } else {
        const questions = missingFields.map(f => {
          if (f === 'Location') return 'Where will it take place?';
          if (f === 'Time') return 'What time will it start?';
          if (f === 'Date') return 'What date will it happen?';
          return `What is the ${f.toLowerCase()}?`;
        }).join(' ');
        followUpText = `Done — I've saved **${newEvent.title}** to your events.\n\n${questions}`;
      }

      dbService.createNotificationHistory(userId, {
        type: 'EVENT',
        title: `Event Scheduled: "${newEvent.title}"`,
        description: `${newEvent.date} at ${newEvent.time} (${newEvent.location})`,
        source_id: newEvent.id,
        status: 'completed'
      });

      this.logDebugTrace(intent, action, 'Event', 'dbService.createEvent', 'SUCCESS', 'SUCCESS', 'SUCCESS', `Created Event ID: ${newEvent.id}`);
      return {
        intent,
        targetModule: 'Event',
        action: 'CREATE',
        success: true,
        data: { ...newEvent, followUpText },
        summary: `✓ Event created: "${newEvent.title}".`
      };
    } else {
      this.logDebugTrace(intent, action, 'Event', 'dbService.createEvent', 'SUCCESS', 'FAILED', 'FAILED');
      return {
        intent,
        targetModule: 'Event',
        action: 'CREATE',
        success: false,
        error: 'Storage verification failed for new event.',
        summary: `✗ Failed to persist event "${title}".`
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
          data: { followUpText: `You haven't set your normal examination session date yet. Tell me your exam date (e.g., "My normal exam session starts August 20").` },
          summary: `✓ Checked exam countdown.`
        };
      }

      const targetDate = new Date(currentTracking.normal_exam_date + 'T00:00:00');
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const diffMs = targetDate.getTime() - now.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      const followUpText = `Your normal examination session (${currentTracking.normal_exam_date}) is in **${diffDays > 0 ? diffDays : 0} days**.`;
      return {
        intent,
        targetModule: 'StudyTracking',
        action: 'READ',
        success: true,
        data: { followUpText },
        summary: `✓ Calculated exam countdown.`
      };
    }

    // 3. View / Read Study Plan
    if (action === 'READ' || lower.includes("what's my study plan") || lower.includes("show my study plan") || lower.includes("view my study plan")) {
      const plan = currentTracking.study_plan || [];
      if (plan.length === 0) {
        return {
          intent,
          targetModule: 'StudyTracking',
          action: 'READ',
          success: true,
          data: { followUpText: `You don't have a generated study plan yet. Ask me to "Generate my study plan" once you've added your subjects and availability.` },
          summary: `✓ Retrieved study plan.`
        };
      }

      const planSummary = plan.map((d: any) => `**${d.day}:**\n` + d.slots.map((s: any) => `  • ${s.time} — ${s.activity}`).join('\n')).join('\n\n');
      const followUpText = `Here is your current study timetable:\n\n${planSummary}`;
      return {
        intent,
        targetModule: 'StudyTracking',
        action: 'READ',
        success: true,
        data: { followUpText },
        summary: `✓ Retrieved study plan.`
      };
    }

    // 4. Generate Study Plan
    if (lower.includes('generate') && (lower.includes('plan') || lower.includes('timetable') || lower.includes('schedule'))) {
      if (currentTracking.subjects.length === 0) {
        return {
          intent,
          targetModule: 'StudyTracking',
          action: 'CREATE',
          success: false,
          error: 'No subjects found',
          data: { followUpText: `Please add at least one subject to your study tracking first (e.g. "Add Mathematics at 30%").` },
          summary: `✗ Cannot generate plan without subjects.`
        };
      }

      const updated = dbService.saveStudyTracking(userId, {});
      const plan = updated.study_plan || [];
      const planSummary = plan.map((d: any) => `**${d.day}:**\n` + d.slots.map((s: any) => `  • ${s.time} — ${s.activity}`).join('\n')).join('\n\n');

      const examReminders = generateExamReminders(
        updated.subjects.map(s => s.name).join(', ') || 'Exam Session',
        updated.normal_exam_date || '2026-08-20'
      );
      for (const rem of examReminders) {
        dbService.createReminder(userId, {
          title: rem.title,
          date: rem.date,
          time: updated.preferred_start_time || '20:00',
          repeat: 'none',
          priority: 'high',
          voice_notification: true,
          active: true
        });
      }

      const followUpText = `I have generated your personalized study timetable! Weaker subjects have been allocated more revision sessions.\n\n**Generated Study Timetable:**\n\n${planSummary}\n\nAutomated exam proximity reminders have also been scheduled.`;
      return {
        intent,
        targetModule: 'StudyTracking',
        action: 'CREATE',
        success: true,
        data: { followUpText, study_tracking: updated },
        summary: `✓ Generated personalized study plan.`
      };
    }

    // 5. Subject operations: Delete
    const delSubjMatch = lower.match(/(?:delete|remove)\s+([a-z0-9\s]+?)(?:\s+from\s+(?:my\s+)?study\s+tracking|$)/i);
    if (delSubjMatch || action === 'DELETE') {
      const targetName = delSubjMatch ? delSubjMatch[1].trim() : (payload.course || payload.subject_name || rawQuery).replace(/(?:delete|remove|from|study|tracking)/gi, '').trim();
      if (targetName) {
        const updatedSubjects = currentTracking.subjects.filter(s => !s.name.toLowerCase().includes(targetName.toLowerCase()));
        const updated = dbService.saveStudyTracking(userId, { subjects: updatedSubjects });
        const followUpText = `Removed **${targetName}** from your study tracking subjects.`;
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

    // 6. Subject operations: Level Update / Change / Set
    const setLevelMatch = lower.match(/(?:change|set|update)\s+([a-z0-9\s]+?)\s+(?:to|level\s+to|at)\s+(\d{1,3})%?/i);
    if (setLevelMatch) {
      const targetName = setLevelMatch[1].trim();
      const levelVal = parseInt(setLevelMatch[2], 10);
      let found = false;
      const updatedSubjects = currentTracking.subjects.map(s => {
        if (s.name.toLowerCase().includes(targetName.toLowerCase())) {
          found = true;
          return { ...s, level: levelVal };
        }
        return s;
      });

      if (!found) {
        updatedSubjects.push({
          id: `subj-${Date.now()}`,
          name: targetName.charAt(0).toUpperCase() + targetName.slice(1),
          level: levelVal
        });
      }

      const updated = dbService.saveStudyTracking(userId, { subjects: updatedSubjects });
      const followUpText = `Set **${targetName}** confidence level to **${levelVal}%**.`;
      return {
        intent,
        targetModule: 'StudyTracking',
        action: 'UPDATE',
        success: true,
        data: { followUpText, study_tracking: updated },
        summary: `✓ Updated level for "${targetName}" to ${levelVal}%.`
      };
    }

    // 7. Subject operations: Add Subject
    const addSubjMatch = lower.match(/(?:add|create)\s+([a-z0-9\s]+?)\s+(?:to\s+(?:my\s+)?study\s+tracking|at\s+(\d{1,3})%?|with\s+(\d{1,3})%?)/i);
    if (addSubjMatch || lower.includes('add ') || payload.subject_name) {
      let subjectName = payload.subject_name || (addSubjMatch ? addSubjMatch[1].trim() : '');
      let levelVal = payload.level !== undefined ? payload.level : (addSubjMatch ? (addSubjMatch[2] ? parseInt(addSubjMatch[2], 10) : (addSubjMatch[3] ? parseInt(addSubjMatch[3], 10) : undefined)) : undefined);

      if (!subjectName) {
        const words = rawQuery.replace(/(?:add|to|my|study|tracking)/gi, '').trim();
        if (words) subjectName = words;
      }

      const pctMatch = rawQuery.match(/(\d{1,3})%/);
      if (pctMatch && levelVal === undefined) {
        levelVal = parseInt(pctMatch[1], 10);
      }

      if (subjectName && levelVal === undefined) {
        return {
          intent,
          targetModule: 'StudyTracking',
          action: 'NO_OP',
          success: true,
          data: { 
            followUpText: `What percentage would you give your current level in **${subjectName}**?`,
            pendingSubject: subjectName
          },
          summary: `Asked for level percentage for ${subjectName}.`
        };
      }

      if (subjectName && levelVal !== undefined) {
        const existingIdx = currentTracking.subjects.findIndex(s => s.name.toLowerCase() === subjectName.toLowerCase());
        let updatedSubjects = [...currentTracking.subjects];
        if (existingIdx >= 0) {
          updatedSubjects[existingIdx].level = levelVal;
        } else {
          updatedSubjects.push({
            id: `subj-${Date.now()}`,
            name: subjectName.charAt(0).toUpperCase() + subjectName.slice(1),
            level: levelVal
          });
        }

        const updated = dbService.saveStudyTracking(userId, { subjects: updatedSubjects });
        const followUpText = `Added **${subjectName}** at **${levelVal}%** level to your study tracking.`;
        return {
          intent,
          targetModule: 'StudyTracking',
          action: 'CREATE',
          success: true,
          data: { followUpText, study_tracking: updated },
          summary: `✓ Added subject "${subjectName}" at ${levelVal}%.`
        };
      }
    }

    // 8. Normal Exam date
    if (lower.includes('normal exam') || lower.includes('exam session')) {
      const date = payload.date || resolveRelativeDate(null, rawQuery) || '2026-08-20';
      const updated = dbService.saveStudyTracking(userId, { normal_exam_date: date });
      const followUpText = `Updated normal examination session start date to **${date}**.`;
      return {
        intent,
        targetModule: 'StudyTracking',
        action: 'UPDATE',
        success: true,
        data: { followUpText, study_tracking: updated },
        summary: `✓ Set normal exam date to ${date}.`
      };
    }

    // 9. CA date
    if (lower.includes('continuous assessment') || lower.includes('ca period') || lower.includes('ca start')) {
      const date = payload.date || resolveRelativeDate(null, rawQuery) || '2026-06-10';
      const updated = dbService.saveStudyTracking(userId, { continuous_assessment_date: date });
      const followUpText = `Updated continuous assessment period start date to **${date}**.`;
      return {
        intent,
        targetModule: 'StudyTracking',
        action: 'UPDATE',
        success: true,
        data: { followUpText, study_tracking: updated },
        summary: `✓ Set CA date to ${date}.`
      };
    }

    // Fallback update
    const updatesToApply: Partial<StudyTrackingData> = {};
    if (payload.hours_per_day || payload.study_hours_per_day) updatesToApply.hours_per_day = payload.hours_per_day || payload.study_hours_per_day;
    if (payload.normal_exam_date) updatesToApply.normal_exam_date = payload.normal_exam_date;
    if (payload.continuous_assessment_date) updatesToApply.continuous_assessment_date = payload.continuous_assessment_date;
    if (payload.available_days) updatesToApply.available_days = payload.available_days;

    const updated = dbService.saveStudyTracking(userId, updatesToApply);
    return {
      intent,
      targetModule: 'StudyTracking',
      action: 'UPDATE',
      success: true,
      data: { followUpText: `Updated your study tracking preferences.`, study_tracking: updated },
      summary: `✓ Updated study tracking.`
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
        const keywords = targetSearch.split(/\s+/).filter(w => w.length > 2);
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
