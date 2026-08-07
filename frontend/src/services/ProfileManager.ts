import { StorageService } from './StorageService.js';
import { Profile } from '../types.js';
import { getApiUrl } from '../config/api.js';

export class ProfileManager {
  static async loadProfile(): Promise<Profile | null> {
    const raw = await StorageService.find('nexa_profile');
    if (!raw) {
      // Fallback default profile matching initial UI spec
      return {
        id: 'user-1',
        user_id: 'user-1',
        email: 'steevezali@gmail.com',
        full_name: 'Alex T.',
        avatar_url: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80',
        premium: true,
        language: 'English',
        theme: 'Dark',
        notifications_enabled: true,
        connected_apps: ['googleCalendar', 'notion', 'pdfReader', 'maps'],
        created_at: new Date().toISOString()
      };
    }
    return raw;
  }

  static async saveProfile(profile: Profile): Promise<void> {
    await StorageService.save('nexa_profile', profile);
  }

  static async updateProfileField(fields: Partial<Profile>): Promise<Profile> {
    const profile = await this.loadProfile() || {
      id: 'user-1',
      user_id: 'user-1',
      email: 'steevezali@gmail.com',
      full_name: 'Alex T.',
      avatar_url: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80',
      premium: true,
      language: 'English',
      theme: 'Dark',
      notifications_enabled: true,
      connected_apps: ['googleCalendar', 'notion', 'pdfReader', 'maps'],
      created_at: new Date().toISOString()
    };
    const updated = { ...profile, ...fields };
    await this.saveProfile(updated);
    
    // Propagate changes immediately to the database (local profile API) so that the backend remains synchronized
    try {
      await fetch(getApiUrl('/api/profile'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields)
      });
    } catch (e) {
      console.error('Error syncing profile changes to server API:', e);
    }

    return updated;
  }

  static cropToSquareAndResize(file: File, size = 150): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(event.target?.result as string);
            return;
          }

          const minDim = Math.min(img.width, img.height);
          const sx = (img.width - minDim) / 2;
          const sy = (img.height - minDim) / 2;

          ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.onerror = () => reject(new Error('Invalid image'));
        img.src = event.target?.result as string;
      };
      reader.onerror = () => reject(new Error('File reading failed'));
      reader.readAsDataURL(file);
    });
  }

  static async exportSettings(): Promise<string> {
    return StorageService.export();
  }

  static async importSettings(data: string): Promise<void> {
    await StorageService.import(data);
  }
}
