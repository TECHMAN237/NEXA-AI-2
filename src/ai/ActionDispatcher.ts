import { IActionDispatcher, ActionResult, UserIntent, AIContext } from './types.js';
import { ReminderService } from '../services/ReminderService.js';
import { PlanningService } from '../services/PlanningService.js';
import { StudyService } from '../services/StudyService.js';
import { MemoryService } from '../services/MemoryService.js';
import { ProfileService } from '../services/ProfileService.js';
import { Reminder, Task, Memory, Event } from '../types.js';
import { normalizeTimeString, extractTimeFromText } from '../utils/timeUtils.js';

export class ActionDispatcher implements IActionDispatcher {
  /**
   * Routes validated AI responses to the targeted core application module.
   */
  async dispatch(
    intent: UserIntent,
    parsedData: any,
    _context?: AIContext
  ): Promise<ActionResult> {
    try {
      switch (intent) {
        case 'CREATE_REMINDER':
        case 'UPDATE_REMINDER':
        case 'DELETE_REMINDER':
          return await this.handleReminderAction(intent, parsedData);

        case 'CREATE_EVENT':
        case 'UPDATE_EVENT':
          return await this.handleEventAction(intent, parsedData);

        case 'GENERATE_PLANNING':
        case 'UPDATE_PLANNING':
          return await this.handlePlanningAction(intent, parsedData);

        case 'STUDY_COACH':
          return await this.handleStudyAction(parsedData);

        case 'AI_MEMORY':
          return await this.handleMemoryAction(parsedData);

        case 'PROFILE':
        case 'SETTINGS':
          return await this.handleProfileSettingsAction(intent, parsedData);

        case 'CHAT':
        case 'UNKNOWN':
        default:
          return {
            success: true,
            targetModule: 'Assistant',
            action: 'REPLY',
            data: parsedData,
            message: parsedData?.message || 'Processed response in assistant channel.'
          };
      }
    } catch (err: any) {
      console.warn('[NEXA AI Core ActionDispatcher] Module dispatch soft fallback:', err);
      return {
        success: false,
        targetModule: 'Core',
        action: 'ERROR_FALLBACK',
        data: parsedData,
        message: err?.message || 'Failed to dispatch AI action.'
      };
    }
  }

  private async handleReminderAction(intent: UserIntent, data: any): Promise<ActionResult> {
    if (intent === 'CREATE_REMINDER') {
      // Check for missing fields or explicit clarification requests from Gemini/Parser
      if (data?.clarificationPrompt || (data?.missingFields && data.missingFields.length > 0)) {
        return {
          success: false,
          targetModule: 'Reminder',
          action: 'CLARIFICATION_REQUIRED',
          data,
          message: data.clarificationPrompt || 'What time should I set for your reminder?'
        };
      }

      const title = data?.title || data?.cleanedText;
      if (!title || typeof title !== 'string' || title.trim().length === 0) {
        return {
          success: false,
          targetModule: 'Reminder',
          action: 'CLARIFICATION_REQUIRED',
          data,
          message: 'What would you like me to remind you about?'
        };
      }

      // Check date validation
      let date = data.date;
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        date = new Date().toISOString().split('T')[0];
      }

      // Check time validation & extraction
      let time = normalizeTimeString(data.time) || extractTimeFromText(data.title || data.cleanedText || '') || '09:00';

      // Normalize repeat
      let repeat: 'none' | 'daily' | 'weekly' | 'monthly' = 'none';
      if (data.repeat) {
        const rLower = String(data.repeat).toLowerCase();
        if (rLower === 'daily' || rLower === 'weekly' || rLower === 'monthly') {
          repeat = rLower;
        }
      }

      // Normalize priority
      let priority: 'low' | 'medium' | 'high' = 'medium';
      if (data.priority) {
        const pLower = String(data.priority).toLowerCase();
        if (pLower === 'low' || pLower === 'high') {
          priority = pLower;
        } else if (pLower === 'normal') {
          priority = 'medium';
        }
      }

      const existing = await ReminderService.getReminders();
      const newReminder: Reminder = {
        id: `rem_${Date.now()}`,
        user_id: 'user-1',
        title: title.trim(),
        description: data.description || '',
        date,
        time,
        repeat,
        priority,
        voice_notification: data.voiceReminder !== false,
        active: true,
        created_at: new Date().toISOString(),
        status: 'scheduled'
      };

      await ReminderService.saveReminders([...existing, newReminder]);

      // Best effort backend POST to stay synchronized
      try {
        await fetch('/api/reminders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newReminder)
        });
      } catch (e) {
        // Safe local storage fallback active
      }

      return {
        success: true,
        targetModule: 'Reminder',
        action: 'CREATED',
        data: newReminder,
        message: `Scheduled reminder: "${newReminder.title}" for ${newReminder.date} at ${newReminder.time}.`
      };
    }

    return {
      success: true,
      targetModule: 'Reminder',
      action: 'PROCESSED',
      data,
      message: 'Reminder intent processed.'
    };
  }

  private async handleEventAction(_intent: UserIntent, data: any): Promise<ActionResult> {
    if (data?.title) {
      const existing = await ProfileService.getEvents();
      const newEvent: Event = {
        id: `evt_${Date.now()}`,
        user_id: 'user-1',
        title: data.title,
        date: data.date || new Date().toISOString().split('T')[0],
        time: data.time || '12:00',
        location: data.location || 'Tech Hub',
        description: data.description || 'AI Created Event',
        reminder_time: '30 minutes before',
        participants: ['Alex'],
        created_at: new Date().toISOString()
      };
      await ProfileService.saveEvents([...existing, newEvent]);
      return {
        success: true,
        targetModule: 'Events',
        action: 'CREATED',
        data: newEvent,
        message: `Created event "${data.title}".`
      };
    }

    return {
      success: true,
      targetModule: 'Events',
      action: 'PROCESSED',
      data,
      message: 'Event intent processed.'
    };
  }

  private async handlePlanningAction(_intent: UserIntent, data: any): Promise<ActionResult> {
    if (data?.taskTitle) {
      const existing = await PlanningService.getTasks();
      const newTask: Task = {
        id: `task_${Date.now()}`,
        user_id: 'user-1',
        title: data.taskTitle,
        date: data.date || new Date().toISOString().split('T')[0],
        time: data.dueTime || '18:00',
        duration_hours: 1,
        priority: (data.priority as 'low' | 'medium' | 'high') || 'medium',
        status: 'pending',
        created_at: new Date().toISOString()
      };
      await PlanningService.saveTasks([...existing, newTask]);
      return {
        success: true,
        targetModule: 'Planning',
        action: 'TASK_CREATED',
        data: newTask,
        message: `Created task "${data.taskTitle}".`
      };
    }

    return {
      success: true,
      targetModule: 'Planning',
      action: 'PROCESSED',
      data,
      message: 'Planning intent processed.'
    };
  }

  private async handleStudyAction(data: any): Promise<ActionResult> {
    return {
      success: true,
      targetModule: 'StudyTracking',
      action: 'COACH_ADVISED',
      data,
      message: 'Study coaching advice structured.'
    };
  }

  private async handleMemoryAction(data: any): Promise<ActionResult> {
    if (data?.fact) {
      const existing = await MemoryService.getMemories();
      const newMemory: Memory = {
        id: `mem_${Date.now()}`,
        user_id: 'user-1',
        text: data.fact,
        category: 'Preference',
        created_at: new Date().toISOString()
      };
      await MemoryService.saveMemories([...existing, newMemory]);
      return {
        success: true,
        targetModule: 'AIMemory',
        action: 'LOGGED',
        data: newMemory,
        message: `Logged fact: "${data.fact}".`
      };
    }

    return {
      success: true,
      targetModule: 'AIMemory',
      action: 'PROCESSED',
      data,
      message: 'Memory intent processed.'
    };
  }

  private async handleProfileSettingsAction(intent: UserIntent, data: any): Promise<ActionResult> {
    return {
      success: true,
      targetModule: intent === 'PROFILE' ? 'Profile' : 'Settings',
      action: 'PROCESSED',
      data,
      message: `${intent} parameters evaluated.`
    };
  }
}
