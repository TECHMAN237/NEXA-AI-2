import { Request, Response } from 'express';
import { PlanningEngine } from '../engines/PlanningEngine.js';
import { generateAILinePlanning } from '../server/gemini.js';

export class PlanningController {
  constructor(private planningEngine: PlanningEngine) {}

  async listTasks(req: Request, res: Response, userId: string) {
    try {
      const list = await this.planningEngine['planningRepo'].listTasks(userId);
      res.json(list);
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Internal Server Error' });
    }
  }

  async createTask(req: Request, res: Response, userId: string) {
    try {
      const { title, date, time, duration_hours, priority, status } = req.body;
      const task = await this.planningEngine.createTask(userId, {
        title,
        date,
        time,
        duration_hours,
        priority,
        status
      });
      res.status(201).json(task);
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Internal Server Error' });
    }
  }

  async updateTask(req: Request, res: Response, userId: string) {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const updated = await this.planningEngine.moveTask(userId, id, status);
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Internal Server Error' });
    }
  }

  async deleteTask(req: Request, res: Response, userId: string) {
    try {
      const { id } = req.params;
      const deleted = await this.planningEngine.deleteTask(userId, id);
      res.json({ success: deleted });
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Internal Server Error' });
    }
  }

  async listPlans(req: Request, res: Response, userId: string) {
    try {
      const list = await this.planningEngine['planningRepo'].listPlans(userId);
      res.json(list);
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Internal Server Error' });
    }
  }

  async createPlan(req: Request, res: Response, userId: string) {
    try {
      const plan = await this.planningEngine.createPlanning(userId, req.body);
      res.status(201).json(plan);
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Internal Server Error' });
    }
  }

  async updatePlan(req: Request, res: Response, userId: string) {
    try {
      const { id } = req.params;
      const updated = await this.planningEngine.updatePlanning(userId, id, req.body);
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Internal Server Error' });
    }
  }

  async generatePlan(req: Request, res: Response, userId: string) {
    try {
      const { date, customPrompt } = req.body;
      const targetDate = date || new Date().toISOString().split('T')[0];
      const aiResult = await generateAILinePlanning(userId, targetDate, customPrompt);
      
      const plan = await this.planningEngine.createPlanning(userId, {
        date: targetDate,
        timeline: aiResult.timeline,
        suggestions: aiResult.suggestions
      });
      res.json(plan);
    } catch (e: any) {
      res.status(500).json({ error: e.message || 'Internal Server Error' });
    }
  }
}
