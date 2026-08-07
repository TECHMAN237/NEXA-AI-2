import { Notification } from '../models/Notification.js';

export interface NotificationRepository {
  getById(id: string): Promise<Notification | null>;
  list(userId: string): Promise<Notification[]>;
  create(userId: string, data: Partial<Notification>): Promise<Notification>;
  update(userId: string, id: string, data: Partial<Notification>): Promise<Notification | null>;
  delete(userId: string, id: string): Promise<boolean>;
  
  // History logs
  listHistory(userId: string): Promise<any[]>;
  createHistory(userId: string, log: { type: string; title: string; description: string; source_id?: string; status: string; metadata?: any }): Promise<any>;
  deleteHistory(userId: string, id: string): Promise<boolean>;
}
