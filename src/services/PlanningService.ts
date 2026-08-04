import { StorageService } from './StorageService.js';
import { Task, Plan } from '../types.js';

const TASKS_KEY = 'nexa_tasks';
const PLANS_KEY = 'nexa_plans';

export class PlanningService {
  static async getTasks(): Promise<Task[]> {
    try {
      const res = await fetch('/api/tasks');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          await StorageService.save(TASKS_KEY, data);
          return data;
        }
      }
    } catch (e) {
      console.warn('Backend fetch failed for tasks, using local fallback');
    }

    const localData = (await StorageService.findAll(TASKS_KEY)) as Task[];
    return localData || [];
  }

  static async saveTasks(tasks: Task[]): Promise<void> {
    await StorageService.save(TASKS_KEY, tasks);
  }

  static async addTask(
    title: string,
    date: string = new Date().toISOString().split('T')[0],
    time: string = '18:00',
    duration_hours: number = 1,
    priority: 'low' | 'medium' | 'high' = 'medium',
    status: 'pending' | 'in_progress' | 'completed' = 'pending'
  ): Promise<Task> {
    const tasks = await this.getTasks();
    const newTask: Task = {
      id: `task-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      user_id: 'user-1',
      title: title.trim(),
      date,
      time,
      duration_hours,
      priority,
      status,
      created_at: new Date().toISOString()
    };

    tasks.unshift(newTask);
    await this.saveTasks(tasks);

    try {
      await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTask)
      });
    } catch (e) {
      console.error('Failed to sync added task to backend:', e);
    }

    return newTask;
  }

  static async updateTask(id: string, updates: Partial<Task>): Promise<Task | null> {
    const tasks = await this.getTasks();
    const index = tasks.findIndex(t => t.id === id);
    if (index === -1) return null;

    tasks[index] = { ...tasks[index], ...updates };
    await this.saveTasks(tasks);

    try {
      await fetch(`/api/tasks/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
    } catch (e) {
      console.error('Failed to sync updated task to backend:', e);
    }

    return tasks[index];
  }

  static async deleteTask(id: string): Promise<boolean> {
    const tasks = await this.getTasks();
    const filtered = tasks.filter(t => t.id !== id);
    if (filtered.length === tasks.length) return false;

    await this.saveTasks(filtered);

    try {
      await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
    } catch (e) {
      console.error('Failed to sync deleted task to backend:', e);
    }

    return true;
  }

  static async getPlans(): Promise<Plan[]> {
    try {
      const res = await fetch('/api/plans');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          await StorageService.save(PLANS_KEY, data);
          return data;
        }
      }
    } catch (e) {
      console.warn('Backend fetch failed for plans, using local fallback');
    }

    const localData = (await StorageService.findAll(PLANS_KEY)) as Plan[];
    return localData || [];
  }

  static async savePlans(plans: Plan[]): Promise<void> {
    await StorageService.save(PLANS_KEY, plans);
  }
}
