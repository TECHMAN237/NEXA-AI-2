import { StorageService } from './StorageService.js';

const STORAGE_KEY = 'nexa_app_settings';

export interface AppSettings {
  theme: 'dark' | 'light' | 'system';
  autoVoiceReminder: boolean;
  language: string;
  voiceGender: 'female' | 'male';
  notificationsEnabled: boolean;
  soundEffects: boolean;
  [key: string]: any;
}

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  autoVoiceReminder: true,
  language: 'en',
  voiceGender: 'female',
  notificationsEnabled: true,
  soundEffects: true
};

export class SettingsService {
  static async getSettings(): Promise<AppSettings> {
    const saved = (await StorageService.find(STORAGE_KEY)) as AppSettings | null;
    return { ...DEFAULT_SETTINGS, ...saved };
  }

  static async saveSettings(settings: Partial<AppSettings>): Promise<AppSettings> {
    const current = await this.getSettings();
    const updated = { ...current, ...settings };
    await StorageService.save(STORAGE_KEY, updated);
    return updated;
  }

  static async updateSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): Promise<AppSettings> {
    return this.saveSettings({ [key]: value });
  }
}
