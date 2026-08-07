import { PlanningRepository } from '../interfaces/PlanningRepository.js';
import { Planning } from '../models/Planning.js';
import { PlanningTask } from '../models/PlanningTask.js';
import { dbService } from '../server/db.js';

export class PlanningRepositoryImpl implements PlanningRepository {
  async getPlanById(id: string): Promise<Planning | null> {
    const list = dbService.getDb().plans || [];
    return list.find((item: any) => item.id === id) || null;
  }

  async getPlanByDate(userId: string, date: string): Promise<Planning | null> {
    const list = dbService.getPlans(userId);
    return list.find((item: any) => item.date === date) || null;
  }

  async listPlans(userId: string): Promise<Planning[]> {
    return dbService.getPlans(userId);
  }

  async createPlan(userId: string, data: Partial<Planning>): Promise<Planning> {
    return dbService.createPlan(userId, {
      date: data.date || new Date().toISOString().split('T')[0],
      timeline: data.timeline || [],
      suggestions: data.suggestions || ''
    });
  }

  async updatePlan(userId: string, id: string, data: Partial<Planning>): Promise<Planning | null> {
    const db = dbService.getDb();
    if (!db.plans) db.plans = [];
    const index = db.plans.findIndex((p: any) => p.id === id && p.user_id === userId);
    if (index === -1) return null;
    db.plans[index] = { ...db.plans[index], ...data };
    dbService.writeDb(db);
    return db.plans[index];
  }

  async deletePlan(userId: string, id: string): Promise<boolean> {
    const db = dbService.getDb();
    if (!db.plans) return false;
    const initialLen = db.plans.length;
    db.plans = db.plans.filter((p: any) => !(p.id === id && p.user_id === userId));
    if (db.plans.length !== initialLen) {
      dbService.writeDb(db);
      return true;
    }
    return false;
  }

  async getTaskById(id: string): Promise<PlanningTask | null> {
    const list = dbService.getDb().tasks || [];
    return list.find((item: any) => item.id === id) || null;
  }

  async listTasks(userId: string): Promise<PlanningTask[]> {
    return dbService.getTasks(userId);
  }

  async createTask(userId: string, data: Partial<PlanningTask>): Promise<PlanningTask> {
    return dbService.createTask(userId, {
      title: data.title || 'Untitled Task',
      date: data.date || new Date().toISOString().split('T')[0],
      time: data.time || '09:00',
      duration_hours: data.duration_hours || 1,
      priority: data.priority || 'medium',
      status: data.status || 'pending'
    });
  }

  async updateTask(userId: string, id: string, data: Partial<PlanningTask>): Promise<PlanningTask | null> {
    const res = dbService.updateTask(userId, id, data);
    return res !== undefined ? res : null;
  }

  async deleteTask(userId: string, id: string): Promise<boolean> {
    return dbService.deleteTask(userId, id);
  }
}
