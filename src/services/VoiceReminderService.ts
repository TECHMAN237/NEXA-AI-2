import { StorageService } from './StorageService.js';

export interface VoiceSettings {
  voiceReminderEnabled: boolean;
  voiceSpeed: number;
  voiceVolume: number;
  voicePersonality: 'professional' | 'friendly' | 'motivational';
}

export class VoiceReminderService {
  static async getVoiceSettings(): Promise<VoiceSettings> {
    const settings = await StorageService.find('nexa_voice_settings');
    return settings || {
      voiceReminderEnabled: true,
      voiceSpeed: 1.0,
      voiceVolume: 0.8,
      voicePersonality: 'professional'
    };
  }

  static async saveVoiceSettings(settings: VoiceSettings): Promise<void> {
    await StorageService.save('nexa_voice_settings', settings);
  }
}
