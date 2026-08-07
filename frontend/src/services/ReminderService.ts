import { StorageService } from './StorageService.js';
import { Reminder } from '../types.js';

const STORAGE_KEY = 'nexa_reminders';

export class ReminderService {
  static async getReminders(): Promise<Reminder[]> {
    try {
      const res = await fetch('/api/reminders');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          await StorageService.save(STORAGE_KEY, data);
          return data;
        }
      }
    } catch (e) {
      console.warn('Backend fetch failed for reminders, using local fallback');
    }

    const localData = (await StorageService.findAll(STORAGE_KEY)) as Reminder[];
    return localData || [];
  }

  static async saveReminders(reminders: Reminder[]): Promise<void> {
    await StorageService.save(STORAGE_KEY, reminders);
  }

  static async addReminder(
    title: string,
    date: string,
    time: string = '09:00',
    repeat: 'none' | 'daily' | 'weekly' | 'monthly' = 'none',
    priority: 'low' | 'medium' | 'high' = 'medium',
    voice_notification: boolean = true,
    description: string = ''
  ): Promise<Reminder> {
    const reminders = await this.getReminders();
    const newRem: Reminder = {
      id: `rem-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      user_id: 'user-1',
      title: title.trim(),
      description,
      date,
      time,
      repeat,
      priority,
      voice_notification,
      active: true,
      created_at: new Date().toISOString(),
      status: 'scheduled'
    };

    reminders.unshift(newRem);
    await this.saveReminders(reminders);

    try {
      await fetch('/api/reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newRem)
      });
    } catch (e) {
      console.error('Failed to sync added reminder to backend:', e);
    }

    return newRem;
  }

  static async updateReminder(id: string, updates: Partial<Reminder>): Promise<Reminder | null> {
    const reminders = await this.getReminders();
    const index = reminders.findIndex(r => r.id === id);
    if (index === -1) return null;

    reminders[index] = { ...reminders[index], ...updates };
    await this.saveReminders(reminders);

    try {
      await fetch(`/api/reminders/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
    } catch (e) {
      console.error('Failed to sync updated reminder to backend:', e);
    }

    return reminders[index];
  }

  static async deleteReminder(id: string): Promise<boolean> {
    const reminders = await this.getReminders();
    const filtered = reminders.filter(r => r.id !== id);
    if (filtered.length === reminders.length) return false;

    await this.saveReminders(filtered);

    try {
      await fetch(`/api/reminders/${id}`, { method: 'DELETE' });
    } catch (e) {
      console.error('Failed to sync deleted reminder to backend:', e);
    }

    return true;
  }

  static async isAutoVoiceReminderEnabled(): Promise<boolean> {
    const val = await StorageService.find('auto_voice_reminder');
    return val !== 'false';
  }

  static async setAutoVoiceReminderEnabled(enabled: boolean): Promise<void> {
    await StorageService.save('auto_voice_reminder', enabled ? 'true' : 'false');
  }
}
