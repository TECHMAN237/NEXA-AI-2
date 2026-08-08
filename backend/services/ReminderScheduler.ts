import { dbService } from '../server/db.js';
import { reminderEngine, notificationEngine } from '../utils/container.js';

export function parseReminderDateTime(dateStr?: string, timeStr?: string, scheduledAt?: string): Date | null {
  if (scheduledAt) {
    const d = new Date(scheduledAt);
    if (!isNaN(d.getTime())) return d;
  }
  if (!dateStr) return null;

  const parts = dateStr.split('-');
  if (parts.length !== 3) return null;

  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);

  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;

  let hours = 0;
  let minutes = 0;
  let seconds = 0;

  if (timeStr) {
    const timeParts = timeStr.trim().split(':');
    if (timeParts.length >= 2) {
      hours = parseInt(timeParts[0], 10) || 0;
      minutes = parseInt(timeParts[1], 10) || 0;
      seconds = timeParts[2] ? parseInt(timeParts[2], 10) || 0 : 0;
    }
  }

  return new Date(year, month, day, hours, minutes, seconds, 0);
}

export class ReminderScheduler {
  private intervalId: NodeJS.Timeout | null = null;
  private isProcessing = false;

  public start() {
    if (this.intervalId) return;
    console.log('[ReminderScheduler] Starting background reminder scheduler loop (3s interval)...');
    
    // Immediate check on boot to process any pending reminders from persistent store
    this.checkPendingReminders();
    this.intervalId = setInterval(() => this.checkPendingReminders(), 3000);
  }

  public stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private serverBootTime = Date.now();

  public async checkPendingReminders() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const db = dbService.getDb();
      const reminders = db.reminders || [];
      const now = new Date();

      for (const r of reminders) {
        // Only monitor active reminders that are scheduled or active
        if (
          r.active === false || 
          r.status === 'completed' || 
          r.status === 'cancelled' || 
          r.status === 'archived' || 
          r.status === 'triggered'
        ) {
          continue;
        }

        const scheduledDate = parseReminderDateTime(r.date, r.time, r.scheduled_at);
        if (!scheduledDate) continue;

        const scheduledTime = scheduledDate.getTime();
        const isDue = now.getTime() >= scheduledTime;
        // If a reminder is more than 10 minutes past due upon server startup/boot, mark it as triggered silently to prevent login popup spam
        const isStale = (now.getTime() - scheduledTime) > 10 * 60 * 1000 && (scheduledTime < this.serverBootTime);

        if (isDue) {
          const userId = r.user_id || 'user-1';

          if (isStale) {
            console.log(`[ReminderScheduler] Stale overdue reminder skipped on boot: "${r.title}"`);
            await reminderEngine.triggerReminder(userId, r.id);
            continue;
          }

          console.log(`[ReminderScheduler] Reminder triggered: "${r.title}" (Scheduled: ${r.date} ${r.time})`);

          // Mark reminder as triggered atomically
          await reminderEngine.triggerReminder(userId, r.id);

          // Log in notification history
          await notificationEngine.createHistoryLog(userId, {
            type: 'REMINDER',
            title: `Reminder Triggered: "${r.title}"`,
            description: r.description || `It is time for your scheduled reminder "${r.title}".`,
            source_id: r.id,
            status: 'completed'
          });

          // Reschedule recurrence if applicable
          if (r.repeat && r.repeat !== 'none') {
            this.scheduleNextRecurrence(userId, r, scheduledDate);
          }
        }
      }
    } catch (err) {
      console.error('[ReminderScheduler] Error checking pending reminders:', err);
    } finally {
      this.isProcessing = false;
    }
  }

  private async scheduleNextRecurrence(userId: string, reminder: any, currentDate: Date) {
    const nextDate = new Date(currentDate);
    if (reminder.repeat === 'daily') {
      nextDate.setDate(nextDate.getDate() + 1);
    } else if (reminder.repeat === 'weekly') {
      nextDate.setDate(nextDate.getDate() + 7);
    } else if (reminder.repeat === 'monthly') {
      nextDate.setMonth(nextDate.getMonth() + 1);
    }

    const year = nextDate.getFullYear();
    const month = String(nextDate.getMonth() + 1).padStart(2, '0');
    const day = String(nextDate.getDate()).padStart(2, '0');
    const newDateStr = `${year}-${month}-${day}`;

    await reminderEngine.createReminder(userId, {
      title: reminder.title,
      description: reminder.description,
      date: newDateStr,
      time: reminder.time,
      repeat: reminder.repeat,
      priority: reminder.priority,
      voice_notification: reminder.voice_notification,
      active: true,
      category: reminder.category,
      status: 'scheduled',
      selected_actions: reminder.selected_actions,
      sound_enabled: reminder.sound_enabled,
      sound_name: reminder.sound_name,
      voice_speed: reminder.voice_speed,
      voice_name: reminder.voice_name
    });
  }
}

export const reminderScheduler = new ReminderScheduler();
