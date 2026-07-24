import { StorageService } from './StorageService.js';

export class ProfileService {
  static async getLanguage(): Promise<string> {
    const lang = await StorageService.find('nexa_language');
    return lang || 'en';
  }

  static async setLanguage(lang: string): Promise<void> {
    await StorageService.save('nexa_language', lang);
  }

  static async getVoiceGender(): Promise<string> {
    const gender = await StorageService.find('nexa_voice_gender');
    return gender || 'female';
  }

  static async setVoiceGender(gender: string): Promise<void> {
    await StorageService.save('nexa_voice_gender', gender);
  }

  static async getAppConnections(): Promise<Record<string, boolean>> {
    const conn = await StorageService.find('nexa_app_connections');
    return conn || {
      googleCalendar: true,
      googleDrive: false,
      notion: true,
      spotify: false,
      pdfReader: true,
      maps: true
    };
  }

  static async saveAppConnections(connections: Record<string, boolean>): Promise<void> {
    await StorageService.save('nexa_app_connections', connections);
  }

  static async getPermissions(): Promise<Record<string, boolean>> {
    const perms = await StorageService.find('nexa_permissions');
    return perms || {
      microphone: true,
      notifications: true,
      calendar: true,
      location: false,
      connectedApps: true,
      deviceAutomation: false,
    };
  }

  static async savePermissions(permissions: Record<string, boolean>): Promise<void> {
    await StorageService.save('nexa_permissions', permissions);
  }

  static async getPrivacySettings(): Promise<any> {
    const privacy = await StorageService.find('nexa_privacy_settings');
    return privacy || {
      memoryControl: true,
      dataCollection: false,
      historyControl: true
    };
  }

  static async savePrivacySettings(settings: any): Promise<void> {
    await StorageService.save('nexa_privacy_settings', settings);
  }

  static async isDevModeEnabled(): Promise<boolean> {
    const val = await StorageService.find('dev_mode_enabled');
    return val === 'true';
  }

  static async setDevModeEnabled(enabled: boolean): Promise<void> {
    await StorageService.save('dev_mode_enabled', enabled ? 'true' : 'false');
  }

  static async getEvents(): Promise<any[]> {
    return StorageService.findAll('nexa_events');
  }

  static async saveEvents(events: any[]): Promise<void> {
    await StorageService.save('nexa_events', events);
  }
}
