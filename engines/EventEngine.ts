import { EventRepository } from '../interfaces/EventRepository.js';
import { Event } from '../models/Event.js';
import { NotificationEngine } from './NotificationEngine.js';
import { ReminderEngine } from './ReminderEngine.js';

export function calculateReminderDateTime(eventDateStr: string, eventTimeStr: string, interval: string): { date: string; time: string } {
  try {
    const dt = new Date(`${eventDateStr}T${eventTimeStr}`);
    if (isNaN(dt.getTime())) {
      return { date: eventDateStr, time: eventTimeStr };
    }

    let minutesToSubtract = 0;
    const lower = interval.toLowerCase();
    if (lower.includes("minute")) {
      const match = lower.match(/(\d+)/);
      if (match) minutesToSubtract = parseInt(match[1], 10);
    } else if (lower.includes("hour")) {
      const match = lower.match(/(\d+)/);
      if (match) minutesToSubtract = parseInt(match[1], 10) * 60;
    } else if (lower.includes("day")) {
      const match = lower.match(/(\d+)/);
      if (match) minutesToSubtract = parseInt(match[1], 10) * 24 * 60;
    } else if (lower.includes("week")) {
      const match = lower.match(/(\d+)/);
      if (match) minutesToSubtract = parseInt(match[1], 10) * 7 * 24 * 60;
    }

    const reminderDt = new Date(dt.getTime() - minutesToSubtract * 60000);
    const year = reminderDt.getFullYear();
    const month = String(reminderDt.getMonth() + 1).padStart(2, '0');
    const day = String(reminderDt.getDate()).padStart(2, '0');
    const hours = String(reminderDt.getHours()).padStart(2, '0');
    const mins = String(reminderDt.getMinutes()).padStart(2, '0');

    return {
      date: `${year}-${month}-${day}`,
      time: `${hours}:${mins}`
    };
  } catch (err) {
    console.error("Error calculating reminder time:", err);
    return { date: eventDateStr, time: eventTimeStr };
  }
}

export class EventEngine {
  constructor(
    private eventRepo: EventRepository,
    private notificationEngine: NotificationEngine,
    private reminderEngine: ReminderEngine
  ) {}

  async createEvent(userId: string, data: Partial<Event>): Promise<Event> {
    const event = await this.eventRepo.create(userId, data);

    await this.notificationEngine.createHistoryLog(userId, {
      type: 'EVENT',
      title: `Event added: ${event.title}`,
      description: `New event scheduled at ${event.location || 'Online'}.`,
      source_id: event.id,
      status: 'completed',
      metadata: { location: event.location, time: event.time }
    });

    if (event.reminder_time && event.reminder_time !== 'none') {
      await this.scheduleEventReminder(userId, event.id);
    }

    return event;
  }

  async updateEvent(userId: string, id: string, data: Partial<Event>): Promise<Event | null> {
    const event = await this.eventRepo.update(userId, id, data);
    if (event) {
      await this.notificationEngine.createHistoryLog(userId, {
        type: 'EVENT',
        title: `Event updated: ${event.title}`,
        description: `Details or timings modified for this calendar event.`,
        source_id: event.id,
        status: 'completed',
        metadata: { location: event.location, time: event.time }
      });

      if (event.reminder_time && event.reminder_time !== 'none') {
        await this.scheduleEventReminder(userId, event.id);
      } else {
        // Delete reminders if set to none
        const existing = await this.reminderEngine.listReminders(userId);
        const toDelete = existing.filter(r => r.source_id === id && r.category === 'Events');
        for (const r of toDelete) {
          await this.reminderEngine.deleteReminder(userId, r.id);
        }
      }
    }
    return event;
  }

  async deleteEvent(userId: string, id: string): Promise<boolean> {
    const reminders = await this.reminderEngine.listReminders(userId);
    const eventReminders = reminders.filter(r => r.source_id === id && r.category === 'Events');
    for (const r of eventReminders) {
      await this.reminderEngine.deleteReminder(userId, r.id);
    }
    return this.eventRepo.delete(userId, id);
  }

  async scheduleEventReminder(userId: string, id: string): Promise<boolean> {
    const event = await this.eventRepo.getById(id);
    if (!event) return false;

    console.log(`[EventEngine] Scheduling unified reminder for event: "${event.title}"`);
    
    // Clear old reminders linked to this event first to avoid duplicates
    const existing = await this.reminderEngine.listReminders(userId);
    const toDelete = existing.filter(r => r.source_id === id && r.category === 'Events');
    for (const r of toDelete) {
      await this.reminderEngine.deleteReminder(userId, r.id);
    }

    if (event.reminder_time && event.reminder_time !== 'none') {
      const reminderTime = calculateReminderDateTime(event.date, event.time, event.reminder_time);
      await this.reminderEngine.createReminder(userId, {
        title: `Event: ${event.title}`,
        description: `Upcoming calendar event at ${event.location || 'Online'}. ${event.description || ''}`,
        date: reminderTime.date,
        time: reminderTime.time,
        repeat: 'none',
        priority: 'high',
        voice_notification: true,
        active: true,
        category: 'Events',
        status: 'scheduled',
        source_id: id,
        sound_enabled: true,
        sound_name: 'default',
        voice_speed: 1.0,
        voice_name: 'default'
      });
    }

    return true;
  }
}
