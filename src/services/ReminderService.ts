import { StorageService } from './StorageService.js';
import { Reminder } from '../types.js';

export class ReminderService {
  static async getReminders(): Promise<Reminder[]> {
    return StorageService.findAll('nexa_reminders');
  }

  static async saveReminders(reminders: Reminder[]): Promise<void> {
    await StorageService.save('nexa_reminders', reminders);
  }

  static async isAutoVoiceReminderEnabled(): Promise<boolean> {
    const val = await StorageService.find('auto_voice_reminder');
    return val !== 'false';
  }

  static async setAutoVoiceReminderEnabled(enabled: boolean): Promise<void> {
    await StorageService.save('auto_voice_reminder', enabled ? 'true' : 'false');
  }
}
