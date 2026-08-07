import { PlanningRepository } from '../interfaces/PlanningRepository.js';
import { Planning } from '../models/Planning.js';
import { PlanningTask } from '../models/PlanningTask.js';
import { NotificationEngine } from './NotificationEngine.js';
import { ReminderEngine } from './ReminderEngine.js';

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
    console.log(`[PlanningEngine] Requesting AI-optimised study block schedule for user ${userId} on ${date}`);
    
    // Simulate smart timeline item creation based on active tasks and standard structures
    const mockTimeline = [
      { id: 'time-1', time: '08:00 - 09:30', title: 'Deep Work: High Priority Tasks', duration: '90m', color: 'border-l-red-500', reminder_enabled: true, priority: 'high', description: 'Focus on core challenging concepts.' },
      { id: 'time-2', time: '10:00 - 11:30', title: 'Review Chapter 4 Microcontrollers', duration: '90m', color: 'border-l-cyan-500', reminder_enabled: true, priority: 'medium', description: 'Active recall and micro-control architectures.' },
      { id: 'time-3', time: '13:00 - 14:00', title: 'Quiz Prep & Practice Questions', duration: '60m', color: 'border-l-purple-500', reminder_enabled: false },
      { id: 'time-4', time: '16:00 - 17:30', title: 'Peer Sync & Study Group Review', duration: '90m', color: 'border-l-emerald-500', reminder_enabled: false }
    ];

    const suggestions = promptInfo || "Focus on Advanced Microcontrollers chapter 4 in the morning. Rest in the afternoon, then do peer review on CSC301 questions.";

    const generatedPlan = await this.planningRepo.createPlan(userId, {
      date,
      timeline: mockTimeline as any,
      suggestions
    });

    await this.notificationEngine.createHistoryLog(userId, {
      type: 'PLANNING',
      title: `AI Plan Generated`,
      description: `NEXA AI analyzed your curriculum workload and structured a daily study schedule.`,
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
