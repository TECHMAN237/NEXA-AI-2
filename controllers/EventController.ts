import { Request, Response } from 'express';
import { EventEngine } from '../engines/EventEngine.js';

export class EventController {
  constructor(private eventEngine: EventEngine) {}

  async list(req: Request, res: Response, userId: string) {
    try {
      const list = await this.eventEngine['eventRepo'].list(userId);
      res.json(list);
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Internal Server Error' });
    }
  }

  async create(req: Request, res: Response, userId: string) {
    try {
      const event = await this.eventEngine.createEvent(userId, req.body);
      res.status(201).json(event);
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Internal Server Error' });
    }
  }

  async update(req: Request, res: Response, userId: string) {
    try {
      const { id } = req.params;
      const updated = await this.eventEngine.updateEvent(userId, id, req.body);
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Internal Server Error' });
    }
  }

  async delete(req: Request, res: Response, userId: string) {
    try {
      const { id } = req.params;
      const success = await this.eventEngine.deleteEvent(userId, id);
      res.json({ success });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Internal Server Error' });
    }
  }
}
