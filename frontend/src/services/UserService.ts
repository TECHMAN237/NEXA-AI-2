import { StorageService } from './StorageService.js';

export class UserService {
  static async isAuthenticated(): Promise<boolean> {
    const val = await StorageService.find('nexa_authenticated');
    return val === 'true';
  }

  static async setAuthenticated(auth: boolean): Promise<void> {
    await StorageService.save('nexa_authenticated', auth ? 'true' : 'false');
  }

  static async logout(): Promise<void> {
    await StorageService.clear('nexa_authenticated');
  }
}
