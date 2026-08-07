import { Event } from '../models/Event.js';

export interface EventRepository {
  getById(id: string): Promise<Event | null>;
  list(userId: string): Promise<Event[]>;
  create(userId: string, data: Partial<Event>): Promise<Event>;
  update(userId: string, id: string, data: Partial<Event>): Promise<Event | null>;
  delete(userId: string, id: string): Promise<boolean>;
}
