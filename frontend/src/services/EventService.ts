import { StorageService } from './StorageService.js';
import { Event } from '../types.js';
import { getApiUrl } from '../config/api.js';

const STORAGE_KEY = 'nexa_events';

export class EventService {
  static async getEvents(): Promise<Event[]> {
    try {
      const res = await fetch(getApiUrl('/api/events'));
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          await StorageService.save(STORAGE_KEY, data);
          return data;
        }
      }
    } catch (e) {
      console.warn('Backend events fetch failed, using local storage fallback');
    }

    const localData = (await StorageService.findAll(STORAGE_KEY)) as Event[];
    return localData || [];
  }

  static async saveEvents(events: Event[]): Promise<void> {
    await StorageService.save(STORAGE_KEY, events);
  }

  static async addEvent(
    title: string,
    date: string,
    time: string = '12:00',
    location: string = 'Tech Hub',
    description: string = '',
    reminder_time: string = '30 minutes before',
    participants: string[] = ['Alex']
  ): Promise<Event> {
    const events = await this.getEvents();
    const newEvent: Event = {
      id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      user_id: 'user-1',
      title: title.trim(),
      date,
      time,
      location,
      description: description || 'Created by Xena AI',
      reminder_time,
      participants,
      created_at: new Date().toISOString()
    };

    events.unshift(newEvent);
    await this.saveEvents(events);

    try {
      await fetch(getApiUrl('/api/events'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newEvent)
      });
    } catch (e) {
      console.error('Failed to sync added event to backend:', e);
    }

    return newEvent;
  }

  static async updateEvent(id: string, updates: Partial<Event>): Promise<Event | null> {
    const events = await this.getEvents();
    const index = events.findIndex(e => e.id === id);
    if (index === -1) return null;

    events[index] = { ...events[index], ...updates };
    await this.saveEvents(events);

    try {
      await fetch(getApiUrl(`/api/events/${id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
    } catch (e) {
      console.error('Failed to sync updated event to backend:', e);
    }

    return events[index];
  }

  static async deleteEvent(id: string): Promise<boolean> {
    const events = await this.getEvents();
    const filtered = events.filter(e => e.id !== id);
    if (filtered.length === events.length) return false;

    await this.saveEvents(filtered);

    try {
      await fetch(getApiUrl(`/api/events/${id}`), { method: 'DELETE' });
    } catch (e) {
      console.error('Failed to sync deleted event to backend:', e);
    }

    return true;
  }
}
