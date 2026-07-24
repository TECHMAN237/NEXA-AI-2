import { IContextBuilder, AIContext } from './types.js';
import { ProfileManager } from '../services/ProfileManager.js';
import { MemoryService } from '../services/MemoryService.js';
import { ReminderService } from '../services/ReminderService.js';
import { PlanningService } from '../services/PlanningService.js';
import { StudyService } from '../services/StudyService.js';
import { ProfileService } from '../services/ProfileService.js';
import { NotificationService } from '../services/NotificationService.js';

export class ContextBuilder implements IContextBuilder {
  /**
   * Collects complete application context safely from all business services.
   */
  async buildContext(_userId?: string): Promise<AIContext> {
    const timestamp = new Date().toISOString();

    try {
      const [
        profile,
        memories,
        reminders,
        tasks,
        plans,
        exams,
        studySessions,
        events,
        notificationHistory,
        connectedApps,
        language,
        voiceGender
      ] = await Promise.all([
        ProfileManager.loadProfile().catch(() => null),
        MemoryService.getMemories().catch(() => []),
        ReminderService.getReminders().catch(() => []),
        PlanningService.getTasks().catch(() => []),
        PlanningService.getPlans().catch(() => []),
        StudyService.getExams().catch(() => []),
        StudyService.getStudySessions().catch(() => []),
        ProfileService.getEvents().catch(() => []),
        NotificationService.getNotificationHistory().catch(() => []),
        ProfileService.getAppConnections().catch(() => ({})),
        ProfileService.getLanguage().catch(() => 'en'),
        ProfileService.getVoiceGender().catch(() => 'female')
      ]);

      return {
        profile,
        memories,
        reminders,
        tasks,
        plans,
        exams,
        studySessions,
        events,
        notificationHistory,
        connectedApps,
        language,
        voiceGender,
        timestamp
      };
    } catch (err) {
      console.warn('[NEXA AI Core ContextBuilder] Safe context fallback applied:', err);
      return {
        timestamp
      };
    }
  }
}
