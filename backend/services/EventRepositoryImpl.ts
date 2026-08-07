import { EventRepository } from '../interfaces/EventRepository.js';
import { Event } from '../models/Event.js';
import { dbService } from '../server/db.js';

export class EventRepositoryImpl implements EventRepository {
  async getById(id: string): Promise<Event | null> {
    const list = dbService.getDb().events || [];
    return list.find((item: any) => item.id === id) || null;
  }

  async list(userId: string): Promise<Event[]> {
    return dbService.getEvents(userId);
  }

  async create(userId: string, data: Partial<Event>): Promise<Event> {
    return dbService.createEvent(userId, {
      title: data.title || 'Untitled Event',
      date: data.date || new Date().toISOString().split('T')[0],
      time: data.time || '12:00',
      location: data.location || 'Online',
      description: data.description || '',
      reminder_time: data.reminder_time || '30 minutes before',
      participants: data.participants || []
    });
  }

  async update(userId: string, id: string, data: Partial<Event>): Promise<Event | null> {
    const res = dbService.updateEvent(userId, id, data);
    return res !== undefined ? res : null;
  }

  async delete(userId: string, id: string): Promise<boolean> {
    return dbService.deleteEvent(userId, id);
  }
}
