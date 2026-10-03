import { PlanningRepository } from '../interfaces/PlanningRepository.js';
import { Planning } from '../models/Planning.js';
import { PlanningTask } from '../models/PlanningTask.js';
import { NotificationEngine } from './NotificationEngine.js';
import { ReminderEngine } from './ReminderEngine.js';
import { DailyScheduleEngine } from '../services/DailyScheduleEngine.js';
import { dbService } from '../server/db.js';

export class PlanningEngine {
  constructor(
    private planningRepo: PlanningRepository,
    private notificationEngine: NotificationEngine,
    private reminderEngine: ReminderEngine
  ) {}

  async createPlanning(userId: string, data: Partial<Planning>): Promise<Planning> {
    const plan = await this.planningRepo.createPlan(userId, data);
    
    await this.notificationEngine.createHistoryLog(userId, {
      type: 'PLANNING',
      title: `Plan Initialized`,
      description: `New daily timeline created for date: ${plan.date}.`,
      source_id: plan.id,
      status: 'completed',
      metadata: { items_count: plan.timeline.length }
    });

    await this.syncPlanTimelineReminders(userId, plan);

    return plan;
  }

  async generatePlanning(userId: string, date: string, promptInfo?: string): Promise<Planning> {
    console.log(`[PlanningEngine] Requesting constraint-aware daily schedule for user ${userId} on ${date}`);
    
    const rawQuery = promptInfo || '';
    let constraints = DailyScheduleEngine.parseTaskConstraints(rawQuery, date);

    if (constraints.length === 0) {
      const dbTasks = await this.planningRepo.listTasks(userId);
      const dateTasks = dbTasks.filter(t => t.date === date);
      dateTasks.forEach((t, idx) => {
        const startMin = t.time ? DailyScheduleEngine.timeStringToMinutes(t.time) : null;
        constraints.push({
          id: `db-task-${idx + 1}-${Date.now()}`,
          rawSnippet: t.title,
          title: DailyScheduleEngine.cleanTaskTitle(t.title) || t.title,
          constraintType: startMin !== null ? 'fixed_time' : 'flexible',
          fixedStartTimeStr: t.time || null,
          fixedEndTimeStr: null,
          fixedStartTimeMin: startMin,
          fixedEndTimeMin: startMin !== null ? startMin + 60 : null,
          durationMinutes: Math.round((t.duration_hours || 1.0) * 60),
          durationHours: t.duration_hours || 1.0,
          durationLabel: `${t.duration_hours || 1.0}h`,
          deadlineMin: null,
          deadlineStr: null,
          priority: (t.priority || 'medium') as any,
          isFlexible: startMin === null,
          hasExplicitDuration: !!t.duration_hours,
          hasExplicitStartTime: startMin !== null,
          originalOrder: idx
        });
      });
    }

    if (constraints.length === 0) {
      constraints = [
        {
          id: `def-1-${Date.now()}`,
          rawSnippet: 'Core Focus Session',
          title: 'Core Focus Session',
          constraintType: 'duration_only',
          durationMinutes: 90,
          durationHours: 1.5,
          durationLabel: '1.5h',
          priority: 'high',
          isFlexible: true,
          hasExplicitDuration: true,
          hasExplicitStartTime: false,
          originalOrder: 0
        },
        {
          id: `def-2-${Date.now()}`,
          rawSnippet: 'Review & Assignments',
          title: 'Review & Assignments',
          constraintType: 'duration_only',
          durationMinutes: 90,
          durationHours: 1.5,
          durationLabel: '1.5h',
          priority: 'medium',
          isFlexible: true,
          hasExplicitDuration: true,
          hasExplicitStartTime: false,
          originalOrder: 1
        }
      ];
    }

    const existingEvents = dbService.getEvents(userId).filter(e => e.date === date);
    const schedResult = DailyScheduleEngine.scheduleDailyPlan(constraints, existingEvents, date);

    const timeline = schedResult.timeline.map((item, index) => ({
      id: `time-${index + 1}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      time: item.time,
      title: item.title,
      duration: item.duration,
      color: item.priority === 'high' ? 'border-l-red-500' : 'border-l-cyan-500',
      reminder_enabled: true,
      priority: item.priority
    }));

    const suggestions = schedResult.suggestions || (promptInfo || "Daily plan structured around your actual tasks.");

    const generatedPlan = await this.planningRepo.createPlan(userId, {
      date,
      timeline: timeline as any,
      suggestions
    });

    await this.notificationEngine.createHistoryLog(userId, {
      type: 'PLANNING',
      title: `AI Plan Generated`,
      description: `Xena AI structured a daily schedule based on your constraints.`,
      source_id: generatedPlan.id,
      status: 'completed',
      metadata: { suggestions, date }
    });

    await this.syncPlanTimelineReminders(userId, generatedPlan);

    return generatedPlan;
  }

  async updatePlanning(userId: string, id: string, data: Partial<Planning>): Promise<Planning | null> {
    const plan = await this.planningRepo.updatePlan(userId, id, data);
    if (plan) {
      await this.syncPlanTimelineReminders(userId, plan);
    }
    return plan;
  }

  // Task actions
  async createTask(userId: string, data: Partial<PlanningTask>): Promise<PlanningTask> {
    const task = await this.planningRepo.createTask(userId, data);
    
    await this.notificationEngine.createHistoryLog(userId, {
      type: 'PLANNING',
      title: `Task Added: ${task.title}`,
      description: `Added study objective scheduled for ${task.date}.`,
      source_id: task.id,
      status: 'completed',
      metadata: { priority: task.priority, status: task.status }
    });

    if (task.reminder_enabled) {
      await this.reminderEngine.createReminder(userId, {
        title: `Task: ${task.title}`,
        description: `Reminder for your scheduled planning task: ${task.title}`,
        date: task.date,
        time: task.time,
        repeat: 'none',
        priority: task.priority,
        voice_notification: true,
        active: true,
        category: 'Planning',
        status: 'scheduled',
        source_id: task.id,
        sound_enabled: true,
        sound_name: 'default',
        voice_speed: 1.0,
        voice_name: 'default'
      });
    }

    return task;
  }

  async moveTask(userId: string, id: string, status: 'pending' | 'completed' | 'in_progress'): Promise<PlanningTask | null> {
    console.log(`[PlanningEngine] Transitioning task state for ${id} to status: ${status}`);
    const task = await this.planningRepo.updateTask(userId, id, { status });
    if (task) {
      await this.notificationEngine.createHistoryLog(userId, {
        type: 'PLANNING',
        title: `Task State Changed`,
        description: `Task "${task.title}" shifted to [${status.toUpperCase()}].`,
        source_id: task.id,
        status: 'completed',
        metadata: { prev_status: task.status, new_status: status }
      });

      if (status === 'completed') {
        const reminders = await this.reminderEngine.listReminders(userId);
        const taskReminder = reminders.find(r => r.source_id === id && r.category === 'Planning');
        if (taskReminder) {
          await this.reminderEngine.completeReminder(userId, taskReminder.id);
        }
      }
    }
    return task;
  }

  async deleteTask(userId: string, id: string): Promise<boolean> {
    const reminders = await this.reminderEngine.listReminders(userId);
    const taskReminders = reminders.filter(r => r.source_id === id && r.category === 'Planning');
    for (const r of taskReminders) {
      await this.reminderEngine.deleteReminder(userId, r.id);
    }
    return this.planningRepo.deleteTask(userId, id);
  }

  // Synchronization helper for Daily Timeline Block Reminders
  private async syncPlanTimelineReminders(userId: string, plan: Planning): Promise<void> {
    try {
      const reminders = await this.reminderEngine.listReminders(userId);
      const planReminders = reminders.filter(r => r.source_id === plan.id && r.category === 'Planning Timeline');
      
      for (const r of planReminders) {
        await this.reminderEngine.deleteReminder(userId, r.id);
      }

      if (!plan.timeline || !Array.isArray(plan.timeline)) return;

      const activeBlocks = plan.timeline.filter((b: any) => b.reminder_enabled);
      
      for (const block of activeBlocks) {
        const startTime = block.time.split(' - ')[0] || '09:00';
        await this.reminderEngine.createReminder(userId, {
          title: `Schedule Block: ${block.title}`,
          description: `Reminder for your scheduled block: "${block.title}" (${block.time}). Notes: ${block.description || ''}`,
          date: plan.date,
          time: startTime,
          repeat: 'none',
          priority: block.priority || 'medium',
          voice_notification: true,
          active: true,
          category: 'Planning Timeline',
          status: 'scheduled',
          source_id: plan.id,
          sound_enabled: true,
          sound_name: 'default',
          voice_speed: 1.0,
          voice_name: 'default'
        });
      }
    } catch (e) {
      console.error("[PlanningEngine] Failed to sync plan timeline reminders:", e);
    }
  }
}
