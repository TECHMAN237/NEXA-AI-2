import { Planning } from '../models/Planning.js';
import { PlanningTask } from '../models/PlanningTask.js';

export interface PlanningRepository {
  getPlanById(id: string): Promise<Planning | null>;
  getPlanByDate(userId: string, date: string): Promise<Planning | null>;
  listPlans(userId: string): Promise<Planning[]>;
  createPlan(userId: string, data: Partial<Planning>): Promise<Planning>;
  updatePlan(userId: string, id: string, data: Partial<Planning>): Promise<Planning | null>;
  deletePlan(userId: string, id: string): Promise<boolean>;

  getTaskById(id: string): Promise<PlanningTask | null>;
  listTasks(userId: string): Promise<PlanningTask[]>;
  createTask(userId: string, data: Partial<PlanningTask>): Promise<PlanningTask>;
  updateTask(userId: string, id: string, data: Partial<PlanningTask>): Promise<PlanningTask | null>;
  deleteTask(userId: string, id: string): Promise<boolean>;
}
