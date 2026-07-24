import { ReminderRepository } from '../interfaces/ReminderRepository.js';
import { Reminder } from '../models/Reminder.js';
import { NotificationEngine } from './NotificationEngine.js';

export class ReminderEngine {
  constructor(
    private reminderRepo: ReminderRepository,
    private notificationEngine: NotificationEngine
  ) {}

  async createReminder(userId: string, data: Partial<Reminder>): Promise<Reminder> {
    const reminder = await this.reminderRepo.create(userId, data);
    
    // Automatically log this action in NEXA Activity Center
    await this.notificationEngine.createHistoryLog(userId, {
      type: 'REMINDER',
      title: `Created: ${reminder.title}`,
      description: `NEXA scheduled study session reminder for ${reminder.time}.`,
      source_id: reminder.id,
      status: 'completed',
      metadata: { priority: reminder.priority, repeat: reminder.repeat }
    });

    // Schedule actual notifications if active
    if (reminder.active) {
      await this.scheduleReminder(userId, reminder.id);
    }

    return reminder;
  }

  async updateReminder(userId: string, id: string, data: Partial<Reminder>): Promise<Reminder | null> {
    const reminder = await this.reminderRepo.update(userId, id, data);
    if (reminder) {
      await this.notificationEngine.createHistoryLog(userId, {
        type: 'REMINDER',
        title: `Updated: ${reminder.title}`,
        description: `NEXA modified and re-scheduled reminder details.`,
        source_id: reminder.id,
        status: 'completed',
        metadata: { active: reminder.active, priority: reminder.priority }
      });

      if (reminder.active) {
        await this.scheduleReminder(userId, reminder.id);
      } else {
        await this.cancelReminder(userId, reminder.id);
      }
    }
    return reminder;
  }

  async deleteReminder(userId: string, id: string): Promise<boolean> {
    // Get reminder title before deleting to write a rich history log
    const reminder = await this.reminderRepo.getById(id);
    const title = reminder ? reminder.title : id;
    const success = await this.reminderRepo.delete(userId, id);
    if (success) {
      await this.cancelReminder(userId, id);
      await this.notificationEngine.createHistoryLog(userId, {
        type: 'REMINDER',
        title: `Reminder Deleted`,
        description: `Permanently removed reminder: ${title}`,
        source_id: id,
        status: 'completed'
      });
    }
    return success;
  }

  async triggerReminder(userId: string, id: string): Promise<Reminder | null> {
    const reminder = await this.reminderRepo.update(userId, id, { status: 'triggered' });
    if (reminder) {
      await this.notificationEngine.createHistoryLog(userId, {
        type: 'REMINDER',
        title: `Reminder Triggered`,
        description: `NEXA broadcasted alert: "${reminder.title}"`,
        source_id: reminder.id,
        status: 'completed'
      });
    }
    return reminder;
  }

  async completeReminder(userId: string, id: string): Promise<Reminder | null> {
    const reminder = await this.reminderRepo.update(userId, id, { status: 'completed', active: false });
    if (reminder) {
      await this.notificationEngine.createHistoryLog(userId, {
        type: 'REMINDER',
        title: `Reminder Completed`,
        description: `Task successfully marked complete: "${reminder.title}"`,
        source_id: reminder.id,
        status: 'completed'
      });
    }
    return reminder;
  }

  async cancelReminderState(userId: string, id: string): Promise<Reminder | null> {
    const reminder = await this.reminderRepo.update(userId, id, { status: 'cancelled', active: false });
    if (reminder) {
      await this.notificationEngine.createHistoryLog(userId, {
        type: 'REMINDER',
        title: `Reminder Cancelled`,
        description: `Task schedule cancelled: "${reminder.title}"`,
        source_id: reminder.id,
        status: 'completed'
      });
      await this.cancelReminder(userId, id);
    }
    return reminder;
  }

  async listReminders(userId: string): Promise<Reminder[]> {
    return this.reminderRepo.list(userId);
  }

  async scheduleReminder(userId: string, id: string): Promise<boolean> {
    const reminder = await this.reminderRepo.getById(id);
    if (!reminder) return false;

    console.log(`[ReminderEngine] Scheduling hardware level alert cron for reminder: ${reminder.title}`);
    
    // Wire to NotificationEngine
    const dateStr = `${reminder.date}T${reminder.time}:00`;
    await this.notificationEngine.scheduleNotification(
      userId,
      `Reminder: ${reminder.title}`,
      `Time to start your scheduled activity. Priority: ${reminder.priority}`,
      dateStr
    );

    return true;
  }

  async cancelReminder(userId: string, id: string): Promise<boolean> {
    console.log(`[ReminderEngine] Cancelling active crons and alerts for reminder id ${id}`);
    await this.notificationEngine.cancelNotification(userId, `rem-alert-${id}`);
    return true;
  }
}
