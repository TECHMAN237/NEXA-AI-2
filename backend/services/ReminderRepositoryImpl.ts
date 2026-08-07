import { ReminderRepository } from '../interfaces/ReminderRepository.js';
import { Reminder } from '../models/Reminder.js';
import { dbService } from '../server/db.js';

export class ReminderRepositoryImpl implements ReminderRepository {
  async getById(id: string): Promise<Reminder | null> {
    const list = dbService.getDb().reminders || [];
    return list.find((item: any) => item.id === id) || null;
  }

  async list(userId: string): Promise<Reminder[]> {
    return dbService.getReminders(userId);
  }

  async create(userId: string, data: Partial<Reminder>): Promise<Reminder> {
    return dbService.createReminder(userId, {
      title: data.title || 'Untitled Reminder',
      description: data.description || '',
      date: data.date || new Date().toISOString().split('T')[0],
      time: data.time || '12:00',
      repeat: data.repeat || 'none',
      priority: data.priority || 'medium',
      voice_notification: !!data.voice_notification,
      active: data.active !== undefined ? data.active : true,
      category: data.category || 'General',
      status: data.status || 'scheduled',
      selected_actions: data.selected_actions || [],
      sound_enabled: data.sound_enabled !== undefined ? data.sound_enabled : true,
      sound_name: data.sound_name || 'default',
      voice_speed: data.voice_speed !== undefined ? data.voice_speed : 1.0,
      voice_name: data.voice_name || 'default'
    });
  }

  async update(userId: string, id: string, data: Partial<Reminder>): Promise<Reminder | null> {
    const res = dbService.updateReminder(userId, id, data);
    return res !== undefined ? res : null;
  }

  async delete(userId: string, id: string): Promise<boolean> {
    return dbService.deleteReminder(userId, id);
  }
}
