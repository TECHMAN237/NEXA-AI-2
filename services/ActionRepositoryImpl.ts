import { ActionRepository } from '../interfaces/ActionRepository.js';
import { SmartAction } from '../models/SmartAction.js';
import { dbService } from '../server/db.js';

export class ActionRepositoryImpl implements ActionRepository {
  async getById(id: string): Promise<SmartAction | null> {
    const db = dbService.getDb();
    const list = db.smart_actions || [];
    return list.find((item: any) => item.id === id) || null;
  }

  async list(userId: string): Promise<SmartAction[]> {
    const db = dbService.getDb();
    const list = db.smart_actions || [];
    return list.filter((item: any) => item.user_id === userId);
  }

  async create(userId: string, data: Partial<SmartAction>): Promise<SmartAction> {
    const db = dbService.getDb();
    if (!db.smart_actions) db.smart_actions = [];

    const newAction: SmartAction = {
      id: `action-${Date.now()}`,
      user_id: userId,
      type: data.type || 'OPEN_APP',
      app: data.app || '',
      document: data.document || '',
      enabled: data.enabled !== undefined ? data.enabled : true,
      created_at: new Date().toISOString()
    };

    db.smart_actions.push(newAction);
    dbService.writeDb(db);
    return newAction;
  }

  async update(userId: string, id: string, data: Partial<SmartAction>): Promise<SmartAction | null> {
    const db = dbService.getDb();
    if (!db.smart_actions) db.smart_actions = [];
    
    const idx = db.smart_actions.findIndex((item: any) => item.id === id && item.user_id === userId);
    if (idx === -1) return null;

    db.smart_actions[idx] = { ...db.smart_actions[idx], ...data };
    dbService.writeDb(db);
    return db.smart_actions[idx];
  }

  async delete(userId: string, id: string): Promise<boolean> {
    const db = dbService.getDb();
    if (!db.smart_actions) return false;
    const initialLen = db.smart_actions.length;
    db.smart_actions = db.smart_actions.filter((item: any) => !(item.id === id && item.user_id === userId));
    if (db.smart_actions.length !== initialLen) {
      dbService.writeDb(db);
      return true;
    }
    return false;
  }
}
