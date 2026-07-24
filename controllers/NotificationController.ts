import { Request, Response } from 'express';
import { NotificationEngine } from '../engines/NotificationEngine.js';

export class NotificationController {
  constructor(private notificationEngine: NotificationEngine) {}

  async list(req: Request, res: Response, userId: string) {
    try {
      const list = await this.notificationEngine['notificationRepo'].list(userId);
      res.json(list);
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Internal Server Error' });
    }
  }

  async markRead(req: Request, res: Response, userId: string) {
    try {
      const { id } = req.params;
      const updated = await this.notificationEngine['notificationRepo'].update(userId, id, { read: true });
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Internal Server Error' });
    }
  }

  async listHistory(req: Request, res: Response, userId: string) {
    try {
      const list = await this.notificationEngine['notificationRepo'].listHistory(userId);
      res.json(list);
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Internal Server Error' });
    }
  }

  async createHistory(req: Request, res: Response, userId: string) {
    try {
      const { type, title, description, source_id, status, metadata } = req.body;
      const newItem = await this.notificationEngine.createHistoryLog(userId, {
        type,
        title,
        description,
        source_id,
        status,
        metadata
      });
      res.status(201).json(newItem);
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Internal Server Error' });
    }
  }

  async deleteHistory(req: Request, res: Response, userId: string) {
    try {
      const { id } = req.params;
      const success = await this.notificationEngine['notificationRepo'].deleteHistory(userId, id);
      res.json({ success });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Internal Server Error' });
    }
  }
}
