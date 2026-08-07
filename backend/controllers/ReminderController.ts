import { Request, Response } from 'express';
import { ReminderEngine } from '../engines/ReminderEngine.js';

export class ReminderController {
  constructor(private reminderEngine: ReminderEngine) {}

  async list(req: Request, res: Response, userId: string) {
    try {
      const list = await this.reminderEngine.listReminders(userId);
      res.json(list);
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Internal Server Error' });
    }
  }

  async create(req: Request, res: Response, userId: string) {
    try {
      const { 
        title, 
        description, 
        date, 
        time, 
        repeat, 
        priority, 
        voice_notification, 
        active,
        category,
        status,
        selected_actions,
        sound_enabled,
        sound_name,
        voice_speed,
        voice_name
      } = req.body;
      if (!title) {
        return res.status(400).json({ error: 'Title is required' });
      }

      const reminder = await this.reminderEngine.createReminder(userId, {
        title,
        description,
        date,
        time,
        repeat,
        priority,
        voice_notification,
        active,
        category,
        status,
        selected_actions,
        sound_enabled,
        sound_name,
        voice_speed,
        voice_name
      });
      res.status(201).json(reminder);
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Internal Server Error' });
    }
  }

  async update(req: Request, res: Response, userId: string) {
    try {
      const { id } = req.params;
      const updated = await this.reminderEngine.updateReminder(userId, id, req.body);
      if (!updated) {
        return res.status(404).json({ error: 'Reminder not found' });
      }
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Internal Server Error' });
    }
  }

  async delete(req: Request, res: Response, userId: string) {
    try {
      const { id } = req.params;
      const deleted = await this.reminderEngine.deleteReminder(userId, id);
      res.json({ success: deleted });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Internal Server Error' });
    }
  }

  async trigger(req: Request, res: Response, userId: string) {
    try {
      const { id } = req.params;
      const triggered = await this.reminderEngine.triggerReminder(userId, id);
      if (!triggered) {
        return res.status(404).json({ error: 'Reminder not found' });
      }
      res.json(triggered);
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Internal Server Error' });
    }
  }

  async complete(req: Request, res: Response, userId: string) {
    try {
      const { id } = req.params;
      const completed = await this.reminderEngine.completeReminder(userId, id);
      if (!completed) {
        return res.status(404).json({ error: 'Reminder not found' });
      }
      res.json(completed);
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Internal Server Error' });
    }
  }

  async cancelState(req: Request, res: Response, userId: string) {
    try {
      const { id } = req.params;
      const cancelled = await this.reminderEngine.cancelReminderState(userId, id);
      if (!cancelled) {
        return res.status(404).json({ error: 'Reminder not found' });
      }
      res.json(cancelled);
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Internal Server Error' });
    }
  }
}
