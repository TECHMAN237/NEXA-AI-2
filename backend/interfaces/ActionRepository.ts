import { SmartAction } from '../models/SmartAction.js';

export interface ActionRepository {
  getById(id: string): Promise<SmartAction | null>;
  list(userId: string): Promise<SmartAction[]>;
  create(userId: string, data: Partial<SmartAction>): Promise<SmartAction>;
  update(userId: string, id: string, data: Partial<SmartAction>): Promise<SmartAction | null>;
  delete(userId: string, id: string): Promise<boolean>;
}
