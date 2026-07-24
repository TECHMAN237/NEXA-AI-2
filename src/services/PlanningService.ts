import { StorageService } from './StorageService.js';
import { Task } from '../types.js';

export class PlanningService {
  static async getTasks(): Promise<Task[]> {
    return StorageService.findAll('nexa_tasks');
  }

  static async saveTasks(tasks: Task[]): Promise<void> {
    await StorageService.save('nexa_tasks', tasks);
  }

  static async getPlans(): Promise<any[]> {
    return StorageService.findAll('nexa_plans');
  }

  static async savePlans(plans: any[]): Promise<void> {
    await StorageService.save('nexa_plans', plans);
  }
}
