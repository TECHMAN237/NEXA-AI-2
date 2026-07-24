import { StorageService } from './StorageService.js';

export interface AlarmSettings {
  notificationsEnabled: boolean;
  countdownAlerts: boolean;
  examAlerts: boolean;
  eventAlerts: boolean;
  planningAlerts: boolean;
  reminderAlerts: boolean;
}

export class NotificationService {
  static async getAlarmSettings(): Promise<AlarmSettings> {
    const settings = await StorageService.find('nexa_alarm_settings');
    return settings || {
      notificationsEnabled: true,
      countdownAlerts: true,
      examAlerts: true,
      eventAlerts: true,
      planningAlerts: true,
      reminderAlerts: true
    };
  }

  static async saveAlarmSettings(settings: AlarmSettings): Promise<void> {
    await StorageService.save('nexa_alarm_settings', settings);
  }

  static async getNotificationHistory(): Promise<any[]> {
    return StorageService.findAll('nexa_notification_history');
  }

  static async saveNotificationHistory(history: any[]): Promise<void> {
    await StorageService.save('nexa_notification_history', history);
  }
}
