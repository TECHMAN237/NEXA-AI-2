import { NotificationRepository } from '../interfaces/NotificationRepository.js';
import { Notification } from '../models/Notification.js';
import { dbService } from '../server/db.js';

export class NotificationRepositoryImpl implements NotificationRepository {
  async getById(id: string): Promise<Notification | null> {
    const list = dbService.getDb().notifications || [];
    return list.find((item: any) => item.id === id) || null;
  }

  async list(userId: string): Promise<Notification[]> {
    const list = dbService.getDb().notifications || [];
    return list.filter((item: any) => item.user_id === userId);
  }

  async create(userId: string, data: Partial<Notification>): Promise<Notification> {
    const db = dbService.getDb();
    if (!db.notifications) db.notifications = [];

    const newNotification: Notification = {
      id: `notif-${Date.now()}`,
      user_id: userId,
      title: data.title || 'Notification',
      text: data.text || '',
      date: data.date || new Date().toISOString(),
      read: !!data.read,
      created_at: new Date().toISOString()
    };

    db.notifications.push(newNotification);
    dbService.writeDb(db);
    return newNotification;
  }

  async update(userId: string, id: string, data: Partial<Notification>): Promise<Notification | null> {
    const db = dbService.getDb();
    if (!db.notifications) db.notifications = [];
    
    const idx = db.notifications.findIndex((item: any) => item.id === id && item.user_id === userId);
    if (idx === -1) return null;

    db.notifications[idx] = { ...db.notifications[idx], ...data };
    dbService.writeDb(db);
    return db.notifications[idx];
  }

  async delete(userId: string, id: string): Promise<boolean> {
    const db = dbService.getDb();
    if (!db.notifications) return false;
    const initialLen = db.notifications.length;
    db.notifications = db.notifications.filter((item: any) => !(item.id === id && item.user_id === userId));
    if (db.notifications.length !== initialLen) {
      dbService.writeDb(db);
      return true;
    }
    return false;
  }

  // History Logs delegation
  async listHistory(userId: string): Promise<any[]> {
    return dbService.getNotificationHistory(userId);
  }

  async createHistory(userId: string, log: { type: string; title: string; description: string; source_id?: string; status: string; metadata?: any }): Promise<any> {
    return dbService.createNotificationHistory(userId, log);
  }

  async deleteHistory(userId: string, id: string): Promise<boolean> {
    return dbService.deleteNotificationHistory(userId, id);
  }
}
