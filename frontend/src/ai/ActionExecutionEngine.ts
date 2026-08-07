import { ReminderService } from '../services/ReminderService.js';
import { PlanningService } from '../services/PlanningService.js';
import { EventService } from '../services/EventService.js';
import { StudyService } from '../services/StudyService.js';
import { MemoryVaultService } from '../services/MemoryVaultService.js';
import { ProfileService } from '../services/ProfileService.js';
import { SettingsService } from '../services/SettingsService.js';
import { normalizeTimeString, extractTimeFromText } from '../utils/timeUtils.js';

export interface ActionPayload {
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

export interface SingleExecutionResult {
  intent: string;
  targetModule: string;
  action: string;
  success: boolean;
  data?: any;
  error?: string;
  summary: string;
}

export interface ActionExecutionResult {
  success: boolean;
  isExecution: boolean; // Category A (false) vs Category B (true)
  totalActions: number;
  successfulActions: number;
  failedActions: number;
  results: SingleExecutionResult[];
  summaryMessage: string;
}

export interface ExecutionLogEntry {
  id: string;
  timestamp: string;
  intent: string;
  targetModule: string;
  action: string;
  status: 'STARTED' | 'COMPLETED' | 'FAILED';
  payload: any;
  errorDetails?: string;
}

type RefreshCallback = () => void;

export class ActionExecutionEngine {
  private static instance: ActionExecutionEngine;
  private refreshCallbacks: Set<RefreshCallback> = new Set();
  private logs: ExecutionLogEntry[] = [];

  public static getInstance(): ActionExecutionEngine {
    if (!ActionExecutionEngine.instance) {
      ActionExecutionEngine.instance = new ActionExecutionEngine();
    }
    return ActionExecutionEngine.instance;
  }

  /**
   * Register a state refresh callback (e.g., from App.tsx or MyItemsView).
   */
  public registerRefreshCallback(callback: RefreshCallback): () => void {
    this.refreshCallbacks.add(callback);
    return () => {
      this.refreshCallbacks.delete(callback);
    };
  }

  /**
   * Trigger all registered application state refresh callbacks.
   */
  public triggerStateRefresh(): void {
    this.refreshCallbacks.forEach(cb => {
      try {
        cb();
      } catch (err) {
        console.error('[ActionExecutionEngine] Refresh callback failed:', err);
      }
    });
  }

  /**
   * Get all action execution logs for debugging.
   */
  public getExecutionLogs(): ExecutionLogEntry[] {
    return [...this.logs];
  }

  private logEvent(
    intent: string,
    targetModule: string,
    action: string,
    status: 'STARTED' | 'COMPLETED' | 'FAILED',
    payload: any,
    errorDetails?: string
  ): void {
    const entry: ExecutionLogEntry = {
      id: `exec-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      intent,
      targetModule,
      action,
      status,
      payload,
      errorDetails
    };
    this.logs.unshift(entry);
    if (this.logs.length > 200) this.logs.pop();

    console.log(
      `[ActionExecutionEngine] ${status} | Intent: ${intent} | Module: ${targetModule} | Action: ${action}`,
      payload,
      errorDetails ? `| Error: ${errorDetails}` : ''
    );
  }

  /**
   * Main entry point for executing AI actions.
   */
  public async execute(
    intent: string,
    actionsInput: ActionPayload | ActionPayload[],
    rawQuery: string = ''
  ): Promise<ActionExecutionResult> {
    const actions: ActionPayload[] = Array.isArray(actionsInput)
      ? actionsInput
      : [actionsInput];

    // Check if this is Category A (Pure Conversation / No-Op)
    const isCategoryA = actions.every(a => {
      const intentUpper = (a.intent || intent).toUpperCase();
      return intentUpper === 'NORMAL_CHAT' || intentUpper === 'CHAT' || intentUpper === 'GENERAL_HELP' || intentUpper === 'UNKNOWN' || a.action === 'NO_OP';
    });

    if (isCategoryA) {
      return {
        success: true,
        isExecution: false,
        totalActions: 0,
        successfulActions: 0,
        failedActions: 0,
        results: [],
        summaryMessage: ''
      };
    }

    // Category B: Real Execution Pipeline
    const executionResults: SingleExecutionResult[] = [];

    for (const act of actions) {
      const actIntent = (act.intent || intent).toUpperCase();
      const payloadData = act.payload || act;

      this.logEvent(actIntent, this.getTargetModuleName(actIntent), act.action || 'EXECUTE', 'STARTED', payloadData);

      try {
        const result = await this.dispatchSingleAction(actIntent, payloadData, rawQuery);
        executionResults.push(result);

        if (result.success) {
          this.logEvent(actIntent, result.targetModule, result.action, 'COMPLETED', result.data);
        } else {
          this.logEvent(actIntent, result.targetModule, result.action, 'FAILED', payloadData, result.error);
        }
      } catch (err: any) {
        const errorMsg = err?.message || 'Unexpected execution failure';
        const failResult: SingleExecutionResult = {
          intent: actIntent,
          targetModule: this.getTargetModuleName(actIntent),
          action: 'FAILED',
          success: false,
          error: errorMsg,
          summary: `✗ ${this.getTargetModuleName(actIntent)} failed: ${errorMsg}`
        };
        executionResults.push(failResult);
        this.logEvent(actIntent, failResult.targetModule, 'FAILED', 'FAILED', payloadData, errorMsg);
      }
    }

    const successfulActions = executionResults.filter(r => r.success).length;
    const failedActions = executionResults.filter(r => !r.success).length;
    const overallSuccess = successfulActions > 0;

    // Trigger state refresh if at least one action succeeded
    if (successfulActions > 0) {
      this.triggerStateRefresh();
    }

    // Build comprehensive status summary
    const summaryLines = executionResults.map(r => r.summary);
    const summaryMessage = summaryLines.join('\n');

    return {
      success: overallSuccess,
      isExecution: true,
      totalActions: executionResults.length,
      successfulActions,
      failedActions,
      results: executionResults,
      summaryMessage
    };
  }

  private getTargetModuleName(intent: string): string {
    switch (intent) {
      case 'REMINDER':
      case 'CREATE_REMINDER':
        return 'Reminder';
      case 'PLANNING':
      case 'CREATE_TASK':
        return 'Planning';
      case 'EVENT':
      case 'CREATE_EVENT':
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

  private async dispatchSingleAction(
    intent: string,
    payload: any,
    rawQuery: string
  ): Promise<SingleExecutionResult> {
    const todayStr = new Date().toISOString().split('T')[0];

    switch (intent) {
      case 'REMINDER':
      case 'CREATE_REMINDER': {
        const title = payload.title || payload.content || rawQuery;
        if (!title || typeof title !== 'string' || title.trim().length === 0) {
          return {
            intent,
            targetModule: 'Reminder',
            action: 'VALIDATION_FAILED',
            success: false,
            error: 'Reminder title missing.',
            summary: '✗ Reminder creation failed: missing title description.'
          };
        }

        let date = payload.date || todayStr;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) date = todayStr;

        let time = normalizeTimeString(payload.time) || extractTimeFromText(rawQuery) || '09:00';
        const repeat = (payload.repeat as any) || 'none';
        const priority = (payload.priority as any) || 'medium';
        const voice_notification = payload.voiceReminder !== false;

        const newRem = await ReminderService.addReminder(
          title,
          date,
          time,
          repeat,
          priority,
          voice_notification,
          payload.description || ''
        );

        return {
          intent,
          targetModule: 'Reminder',
          action: 'CREATE_REMINDER',
          success: true,
          data: newRem,
          summary: `✓ Reminder created: "${newRem.title}" scheduled for ${newRem.date} at ${newRem.time}.`
        };
      }

      case 'PLANNING':
      case 'CREATE_TASK': {
        const title = payload.title || payload.taskTitle || payload.content || rawQuery;
        if (!title || typeof title !== 'string' || title.trim().length === 0) {
          return {
            intent,
            targetModule: 'Planning',
            action: 'VALIDATION_FAILED',
            success: false,
            error: 'Planning task title missing.',
            summary: '✗ Planning task failed: missing task title.'
          };
        }

        let date = payload.date || todayStr;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) date = todayStr;

        let time = normalizeTimeString(payload.time) || extractTimeFromText(rawQuery) || '18:00';
        const priority = (payload.priority as any) || 'medium';

        const newTask = await PlanningService.addTask(
          title,
          date,
          time,
          payload.duration_hours || 1,
          priority,
          'pending'
        );

        return {
          intent,
          targetModule: 'Planning',
          action: 'CREATE_TASK',
          success: true,
          data: newTask,
          summary: `✓ Planning task created: "${newTask.title}" set for ${newTask.date} at ${newTask.time}.`
        };
      }

      case 'EVENT':
      case 'CREATE_EVENT': {
        const title = payload.title || payload.content || rawQuery;
        if (!title || typeof title !== 'string' || title.trim().length === 0) {
          return {
            intent,
            targetModule: 'Event',
            action: 'VALIDATION_FAILED',
            success: false,
            error: 'Event title missing.',
            summary: '✗ Event creation failed: missing event title.'
          };
        }

        let date = payload.date || todayStr;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) date = todayStr;

        let time = normalizeTimeString(payload.time) || extractTimeFromText(rawQuery) || '12:00';
        const location = payload.location || 'Tech Hub';

        const newEvent = await EventService.addEvent(
          title,
          date,
          time,
          location,
          payload.description || 'Created automatically by Xena AI',
          '30 minutes before',
          payload.participants || ['Alex']
        );

        return {
          intent,
          targetModule: 'Event',
          action: 'CREATE_EVENT',
          success: true,
          data: newEvent,
          summary: `✓ Event created: "${newEvent.title}" on ${newEvent.date} at ${newEvent.time} (${location}).`
        };
      }

      case 'STUDY_TRACKING':
      case 'CREATE_EXAM': {
        const course = payload.course || payload.title || rawQuery;
        if (!course || typeof course !== 'string' || course.trim().length === 0) {
          return {
            intent,
            targetModule: 'StudyTracking',
            action: 'VALIDATION_FAILED',
            success: false,
            error: 'Course subject missing.',
            summary: '✗ Study tracking failed: missing course name.'
          };
        }

        let exam_date = payload.date || payload.exam_date || '2026-08-20';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(exam_date)) exam_date = '2026-08-20';

        const difficulty = (payload.difficulty as any) || 'medium';

        const newExam = await StudyService.addExam(
          course,
          exam_date,
          difficulty,
          payload.study_hours_per_day || 3,
          payload.preferred_study_time || '20:00 - 23:00',
          payload.available_days || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
          payload.remaining_chapters || 10,
          0
        );

        return {
          intent,
          targetModule: 'StudyTracking',
          action: 'CREATE_EXAM',
          success: true,
          data: newExam,
          summary: `✓ Study tracking active: "${newExam.course}" exam scheduled for ${newExam.exam_date}.`
        };
      }

      case 'MEMORY_VAULT': {
        const title = payload.title || payload.content || rawQuery;
        const content = payload.content || payload.title || rawQuery;
        const category = payload.category || 'General';

        const newItem = await MemoryVaultService.addVaultItem(
          title,
          content,
          category as any,
          payload.tags || []
        );

        return {
          intent,
          targetModule: 'MemoryVault',
          action: 'CREATE_VAULT_ITEM',
          success: true,
          data: newItem,
          summary: `✓ Preserved note in Memory Vault: "${newItem.title}".`
        };
      }

      case 'PROFILE': {
        if (payload.language) {
          await ProfileService.setLanguage(payload.language);
        }
        if (payload.voice_gender) {
          await ProfileService.setVoiceGender(payload.voice_gender);
        }
        return {
          intent,
          targetModule: 'Profile',
          action: 'UPDATE_PROFILE',
          success: true,
          data: payload,
          summary: '✓ Profile preferences updated.'
        };
      }

      case 'SETTINGS': {
        const updatedSettings = await SettingsService.saveSettings(payload);
        return {
          intent,
          targetModule: 'Settings',
          action: 'UPDATE_SETTINGS',
          success: true,
          data: updatedSettings,
          summary: '✓ Application settings updated.'
        };
      }

      default: {
        return {
          intent,
          targetModule: 'Core',
          action: 'UNKNOWN_ACTION',
          success: false,
          error: `Unsupported action intent: ${intent}`,
          summary: `✗ Action execution failed: unsupported intent ${intent}.`
        };
      }
    }
  }
}

export const actionExecutionEngine = ActionExecutionEngine.getInstance();
