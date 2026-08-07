import { NotificationRepository } from '../interfaces/NotificationRepository.js';
import { Notification } from '../models/Notification.js';

export class NotificationEngine {
  constructor(private notificationRepo: NotificationRepository) {}

  async scheduleNotification(userId: string, title: string, text: string, date: string): Promise<Notification> {
    console.log(`[NotificationEngine] Scheduling notification for user ${userId}: "${title}" at ${date}`);
    return this.notificationRepo.create(userId, {
      title,
      text,
      date,
      read: false
    });
  }

  async cancelNotification(userId: string, id: string): Promise<boolean> {
    console.log(`[NotificationEngine] Cancelling notification: ${id} for user ${userId}`);
    return this.notificationRepo.delete(userId, id);
  }

  async createVoiceReminder(userId: string, text: string): Promise<{ success: boolean; voiceText: string }> {
    console.log(`[NotificationEngine] Synthesizing voice note: "${text}" for user ${userId}`);
    // Simulate smart audio queue
    return { success: true, voiceText: text };
  }

  async playReminderSound(userId: string, soundName: string): Promise<{ success: boolean; sound: string }> {
    console.log(`[NotificationEngine] Streaming alert sound: "${soundName}" to user ${userId} terminal`);
    return { success: true, sound: soundName };
  }

  async createHistoryLog(userId: string, log: { type: string; title: string; description: string; source_id?: string; status: string; metadata?: any }): Promise<any> {
    console.log(`[NotificationEngine] Writing entry into activity center ledger: ${log.title}`);
    return this.notificationRepo.createHistory(userId, log);
  }
}
