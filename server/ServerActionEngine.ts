import { dbService } from './db.js';
import { normalizeTimeString, extractTimeFromText } from '../src/utils/timeUtils.js';
import { extractReminderParams, parseFollowUpUpdate, cleanReminderTitle, resolveRelativeDate, detectReminderFields } from '../src/utils/reminderParser.js';

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

export class ServerActionEngine {
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

    if (!params.title || params.title.trim().length === 0) {
      console.log('[REMINDER_CREATE_RESULT]', { success: false, error: 'Missing reminder title' });
      this.logDebugTrace(intent, action, 'Reminder', 'dbService.createReminder', 'FAILED', 'FAILED', 'FAILED', 'Missing reminder title');
      return {
        intent,
        targetModule: 'Reminder',
        action: 'CREATE',
        success: false,
        error: 'Reminder title missing or ambiguous.',
        summary: '✗ Reminder creation failed: missing title description.'
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

    // 1. Extract actual user tasks mentioned in query
    let extracted = payload.tasks || [];
    if (!Array.isArray(extracted) || extracted.length === 0) {
      let clean = rawQuery
        .replace(/^(I\s+(need|have|want)\s+to\s+)?(create\s+my\s+plan|create\s+a\s+plan|plan\s+my\s+day|plan\s+for\s+tomorrow|schedule\s+my\s+day|daily\s+plan|daily\s+schedule)\b/gi, '')
        .replace(/create\s+my\s+plan.*$/gi, '')
        .replace(/create\s+a\s+plan.*$/gi, '')
        .replace(/plan\s+my\s+day.*$/gi, '')
        .replace(/please\s+plan.*$/gi, '')
        .replace(/^(I\s+need\s+to|I\s+have\s+to|I\s+want\s+to|I\s+should)\s+/gi, '')
        .trim();

      const chunks = clean
        .split(/,|;|\band\b|\n|\r/)
        .map(p => p.replace(/\b(tomorrow|today|this weekend|next week|for tomorrow|for today)\b/gi, '').trim())
        .filter(p => p.length > 2 && !/^(create|plan|schedule|tomorrow|today|my plan)$/i.test(p));

      extracted = chunks.map(c => {
        let t = c.replace(/^(i\s+need\s+to|i\s+have\s+to|i\s+want\s+to|need\s+to|have\s+to|go\s+to)\s+/i, '').trim();
        return t.split(' ').map(w => w.length > 0 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : '').join(' ');
      }).filter(Boolean);
    }

    // 2. Fetch existing DB items for user
    const existingDbTasks = dbService.getTasks(userId).filter(t => t.date === date);
    const existingDbEvents = dbService.getEvents(userId).filter(e => e.date === date);
    const existingDbReminders = dbService.getReminders(userId).filter(r => r.date === date);

    const allTaskList: string[] = [...extracted];
    existingDbTasks.forEach(t => { if (!allTaskList.includes(t.title)) allTaskList.push(t.title); });
    existingDbEvents.forEach(e => { if (!allTaskList.includes(e.title)) allTaskList.push(e.title); });
    existingDbReminders.forEach(r => { if (!allTaskList.includes(r.title)) allTaskList.push(r.title); });

    if (allTaskList.length === 0) {
      allTaskList.push('Morning Preparation & Setup', 'Core Work / Study Session', 'Project Assignments', 'Review & Reflection');
    }

    const standardTimeSlots = [
      '08:00 – 10:00',
      '10:30 – 12:00',
      '14:00 – 16:00',
      '18:00 – 20:00',
      '20:30 – 22:00'
    ];

    const timelineBlocks: any[] = [];
    const createdTasks: any[] = [];

    allTaskList.forEach((taskTitle, idx) => {
      const slotTime = standardTimeSlots[idx] || `${18 + idx}:00 – ${19 + idx}:00`;
      const startTime = slotTime.split(' – ')[0] || '09:00';

      timelineBlocks.push({
        id: `block-${idx + 1}-${Date.now()}`,
        time: slotTime,
        title: taskTitle,
        duration: '1.5h - 2h',
        priority: idx === 0 ? 'high' : 'medium',
        reminder_enabled: true
      });

      const newTask = dbService.createTask(userId, {
        title: taskTitle,
        date,
        time: startTime,
        duration_hours: 2,
        priority: idx === 0 ? 'high' : 'medium',
        status: 'pending'
      });
      createdTasks.push(newTask);
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
      data: { ...newPlan, followUpText, tasks: createdTasks },
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
    if (action === 'DELETE') {
      const courseSearch = (payload.course || payload.title || rawQuery).toLowerCase();
      const exams = dbService.getExams(userId);
      const match = exams.find(e => e.course.toLowerCase().includes(courseSearch));

      if (!match) {
        return {
          intent,
          targetModule: 'StudyTracking',
          action,
          success: false,
          error: `No exam found matching "${payload.course || rawQuery}"`,
          summary: `✗ Failed to delete exam: "${payload.course || rawQuery}" not found.`
        };
      }

      const deleted = dbService.deleteExam(userId, match.id);
      this.logDebugTrace(intent, action, 'StudyTracking', 'dbService.deleteExam', deleted ? 'SUCCESS' : 'FAILED', deleted ? 'SUCCESS' : 'FAILED', deleted ? 'SUCCESS' : 'FAILED');
      return {
        intent,
        targetModule: 'StudyTracking',
        action,
        success: deleted,
        summary: deleted ? `✓ Deleted exam track: "${match.course}".` : `✗ Failed to delete exam track "${match.course}".`
      };
    }

    // Default: CREATE
    let course = payload.course || payload.title;
    if (!course || typeof course !== 'string' || course.trim().length === 0) {
      if (rawQuery.toLowerCase().includes('algorithms')) course = 'Algorithms';
      else if (rawQuery.toLowerCase().includes('math')) course = 'Mathematics';
      else course = 'Course Revision';
    }

    let exam_date = payload.exam_date || payload.date;
    if (!exam_date || !/^\d{4}-\d{2}-\d{2}$/.test(exam_date)) {
      if (rawQuery.toLowerCase().includes('two weeks') || rawQuery.toLowerCase().includes('2 weeks')) {
        const d = new Date();
        d.setDate(d.getDate() + 14);
        exam_date = d.toISOString().split('T')[0];
      } else {
        exam_date = resolveRelativeDate(null, rawQuery);
      }
    }

    const difficulty = (payload.difficulty === 'low' || payload.difficulty === 'high') ? payload.difficulty : 'medium';

    const newExam = dbService.createExam(userId, {
      course: course.trim(),
      exam_date,
      difficulty,
      study_hours_per_day: payload.study_hours_per_day || 3,
      preferred_study_time: payload.preferred_study_time || '20:00 - 23:00',
      available_days: payload.available_days || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      remaining_chapters: payload.remaining_chapters || 10,
      progress: 0
    });

    const verifyList = dbService.getExams(userId);
    const verified = verifyList.some(e => e.id === newExam.id);

    if (verified) {
      dbService.createNotificationHistory(userId, {
        type: 'STUDY',
        title: `Exam Tracking Added: "${newExam.course}"`,
        description: `Exam date set for ${newExam.exam_date}`,
        source_id: newExam.id,
        status: 'completed'
      });

      this.logDebugTrace(intent, action, 'StudyTracking', 'dbService.createExam', 'SUCCESS', 'SUCCESS', 'SUCCESS', `Created Exam ID: ${newExam.id}`);
      return {
        intent,
        targetModule: 'StudyTracking',
        action: 'CREATE',
        success: true,
        data: newExam,
        summary: `✓ Study tracking active: "${newExam.course}" exam scheduled for ${newExam.exam_date}.`
      };
    } else {
      this.logDebugTrace(intent, action, 'StudyTracking', 'dbService.createExam', 'SUCCESS', 'FAILED', 'FAILED');
      return {
        intent,
        targetModule: 'StudyTracking',
        action: 'CREATE',
        success: false,
        error: 'Storage verification failed for new exam.',
        summary: `✗ Failed to persist study tracking for "${course}".`
      };
    }
  }

  // ==================== MEMORY VAULT MODULE ====================
  private static handleMemoryVaultAction(
    userId: string,
    intent: string,
    action: 'CREATE' | 'READ' | 'UPDATE' | 'DELETE' | 'SEARCH' | 'NO_OP',
    payload: any,
    rawQuery: string
  ): ServerActionResult {
    if (action === 'DELETE') {
      const titleSearch = (payload.title || rawQuery).toLowerCase();
      const vaultItems = dbService.getMemoryVaultItems(userId);
      const match = vaultItems.find(v => v.title.toLowerCase().includes(titleSearch) || v.content.toLowerCase().includes(titleSearch));

      if (!match) {
        return {
          intent,
          targetModule: 'MemoryVault',
          action,
          success: false,
          error: `No Memory Vault note found matching "${payload.title || rawQuery}"`,
          summary: `✗ Failed to delete vault note: "${payload.title || rawQuery}" not found.`
        };
      }

      const deleted = dbService.deleteMemoryVaultItem(userId, match.id);
      this.logDebugTrace(intent, action, 'MemoryVault', 'dbService.deleteMemoryVaultItem', deleted ? 'SUCCESS' : 'FAILED', deleted ? 'SUCCESS' : 'FAILED', deleted ? 'SUCCESS' : 'FAILED');
      return {
        intent,
        targetModule: 'MemoryVault',
        action,
        success: deleted,
        summary: deleted ? `✓ Deleted vault note: "${match.title}".` : `✗ Failed to delete vault note "${match.title}".`
      };
    }

    // Default: CREATE
    const title = payload.title || payload.content || rawQuery;
    const content = payload.content || payload.title || rawQuery;
    const category = payload.category || 'General';

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      this.logDebugTrace(intent, action, 'MemoryVault', 'dbService.createVaultItem', 'FAILED', 'FAILED', 'FAILED', 'Missing note content');
      return {
        intent,
        targetModule: 'MemoryVault',
        action: 'CREATE',
        success: false,
        error: 'Note content missing.',
        summary: '✗ Memory Vault save failed: missing note content.'
      };
    }

    const newItem = dbService.createVaultItem(userId, {
      title: title.trim().slice(0, 40),
      content: content.trim(),
      category,
      tags: payload.tags || ['ai_saved']
    });

    const verifyList = dbService.getMemoryVaultItems(userId);
    const verified = verifyList.some(v => v.id === newItem.id);

    if (verified) {
      dbService.createNotificationHistory(userId, {
        type: 'MEMORY_VAULT',
        title: `Note Saved in Vault: "${newItem.title}"`,
        description: newItem.content.slice(0, 60),
        source_id: newItem.id,
        status: 'completed'
      });

      this.logDebugTrace(intent, action, 'MemoryVault', 'dbService.createVaultItem', 'SUCCESS', 'SUCCESS', 'SUCCESS', `Created Vault ID: ${newItem.id}`);
      return {
        intent,
        targetModule: 'MemoryVault',
        action: 'CREATE',
        success: true,
        data: newItem,
        summary: `✓ Preserved note in Memory Vault: "${newItem.title}".`
      };
    } else {
      this.logDebugTrace(intent, action, 'MemoryVault', 'dbService.createVaultItem', 'SUCCESS', 'FAILED', 'FAILED');
      return {
        intent,
        targetModule: 'MemoryVault',
        action: 'CREATE',
        success: false,
        error: 'Storage verification failed for vault note.',
        summary: `✗ Failed to persist note "${title}".`
      };
    }
  }
}
