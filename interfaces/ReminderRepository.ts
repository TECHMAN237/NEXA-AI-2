import { Reminder } from '../models/Reminder.js';

export interface ReminderRepository {
  getById(id: string): Promise<Reminder | null>;
  list(userId: string): Promise<Reminder[]>;
  create(userId: string, data: Partial<Reminder>): Promise<Reminder>;
  update(userId: string, id: string, data: Partial<Reminder>): Promise<Reminder | null>;
  delete(userId: string, id: string): Promise<boolean>;
}
