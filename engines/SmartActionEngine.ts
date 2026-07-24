import { ActionRepository } from '../interfaces/ActionRepository.js';
import { SmartAction } from '../models/SmartAction.js';
import { NotificationEngine } from './NotificationEngine.js';

export class SmartActionEngine {
  constructor(
    private actionRepo: ActionRepository,
    private notificationEngine: NotificationEngine
  ) {}

  async registerAction(userId: string, data: Partial<SmartAction>): Promise<SmartAction> {
    const action = await this.actionRepo.create(userId, data);

    await this.notificationEngine.createHistoryLog(userId, {
      type: 'AI_ACTION',
      title: `Registered: ${action.type}`,
      description: `New automated smart action linked: Open ${action.app || action.document}.`,
      source_id: action.id,
      status: 'completed',
      metadata: { action_type: action.type, target: action.app || action.document }
    });

    return action;
  }

  async updateAction(userId: string, id: string, data: Partial<SmartAction>): Promise<SmartAction | null> {
    return this.actionRepo.update(userId, id, data);
  }

  async deleteAction(userId: string, id: string): Promise<boolean> {
    return this.actionRepo.delete(userId, id);
  }

  async executeAction(userId: string, id: string): Promise<{ success: boolean; output: string }> {
    const action = await this.actionRepo.getById(id);
    if (!action) {
      return { success: false, output: 'Smart action not found.' };
    }

    if (!action.enabled) {
      return { success: false, output: 'Smart action is currently disabled.' };
    }

    console.log(`[SmartActionEngine] Executing system hook: ${action.type} -> ${action.app || action.document}`);

    const resultMsg = action.type === 'OPEN_APP'
      ? `System launched application: ${action.app}`
      : `System loaded active study document: ${action.document}`;

    // Add entry into activity history
    await this.notificationEngine.createHistoryLog(userId, {
      type: 'AI_ACTION',
      title: `NEXA executed automated task`,
      description: `Executed action: ${action.type}`,
      source_id: action.id,
      status: 'completed',
      metadata: { action_type: action.type, document_name: action.document || action.app }
    });

    return { success: true, output: resultMsg };
  }
}
