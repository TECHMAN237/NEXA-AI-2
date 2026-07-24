import { Request, Response } from 'express';
import { SmartActionEngine } from '../engines/SmartActionEngine.js';

export class ActionController {
  constructor(private actionEngine: SmartActionEngine) {}

  async list(req: Request, res: Response, userId: string) {
    try {
      const list = await this.actionEngine['actionRepo'].list(userId);
      res.json(list);
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Internal Server Error' });
    }
  }

  async create(req: Request, res: Response, userId: string) {
    try {
      const action = await this.actionEngine.registerAction(userId, req.body);
      res.status(201).json(action);
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Internal Server Error' });
    }
  }

  async update(req: Request, res: Response, userId: string) {
    try {
      const { id } = req.params;
      const updated = await this.actionEngine.updateAction(userId, id, req.body);
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Internal Server Error' });
    }
  }

  async delete(req: Request, res: Response, userId: string) {
    try {
      const { id } = req.params;
      const success = await this.actionEngine.deleteAction(userId, id);
      res.json({ success });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Internal Server Error' });
    }
  }

  async execute(req: Request, res: Response, userId: string) {
    try {
      const { id } = req.params;
      const outcome = await this.actionEngine.executeAction(userId, id);
      res.json(outcome);
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Internal Server Error' });
    }
  }
}
