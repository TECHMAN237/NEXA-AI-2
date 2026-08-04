import { StorageService } from './StorageService.js';
import { MemoryVaultItem } from '../types.js';

const STORAGE_KEY = 'nexa_memory_vault';

const DEFAULT_VAULT_ITEMS: MemoryVaultItem[] = [
  {
    id: 'vault-1',
    user_id: 'user-1',
    title: 'Passport Location',
    content: 'My passport is inside the blue drawer in the study desk.',
    category: 'Location',
    tags: ['important', 'documents'],
    created_at: new Date().toISOString()
  },
  {
    id: 'vault-2',
    user_id: 'user-1',
    title: 'Parking Spot Level',
    content: 'I parked at level B2, spot #44.',
    category: 'Location',
    tags: ['car', 'parking'],
    created_at: new Date().toISOString()
  },
  {
    id: 'vault-3',
    user_id: 'user-1',
    title: 'Supervisor Preferences',
    content: 'My supervisor Dr. Vance prefers afternoon meetings after 2 PM.',
    category: 'Work',
    tags: ['university', 'meeting'],
    created_at: new Date().toISOString()
  }
];

export class MemoryVaultService {
  static async getVaultItems(): Promise<MemoryVaultItem[]> {
    try {
      const res = await fetch('/api/memory-vault');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          await StorageService.save(STORAGE_KEY, data);
          return data;
        }
      }
    } catch (e) {
      console.warn('Backend memory vault fetch failed, falling back to local storage');
    }

    const localData = (await StorageService.findAll(STORAGE_KEY)) as MemoryVaultItem[];
    if (!localData || localData.length === 0) {
      await StorageService.save(STORAGE_KEY, DEFAULT_VAULT_ITEMS);
      return DEFAULT_VAULT_ITEMS;
    }
    return localData;
  }

  static async saveVaultItems(items: MemoryVaultItem[]): Promise<void> {
    await StorageService.save(STORAGE_KEY, items);
  }

  static async addVaultItem(
    title: string,
    content: string,
    category: 'Personal' | 'Location' | 'Ideas' | 'Work' | 'Credentials' | 'General' = 'General',
    tags: string[] = []
  ): Promise<MemoryVaultItem> {
    const items = await this.getVaultItems();
    const newItem: MemoryVaultItem = {
      id: `vault-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      user_id: 'user-1',
      title: title.trim() || 'Saved Vault Note',
      content: content.trim() || title.trim(),
      category,
      tags,
      created_at: new Date().toISOString()
    };

    items.unshift(newItem);
    await this.saveVaultItems(items);

    try {
      await fetch('/api/memory-vault', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content, category, tags })
      });
    } catch (e) {
      console.error('Failed to sync added memory vault note to backend:', e);
    }

    return newItem;
  }

  static async updateVaultItem(id: string, updates: Partial<MemoryVaultItem>): Promise<MemoryVaultItem | null> {
    const items = await this.getVaultItems();
    const index = items.findIndex(item => item.id === id);
    if (index === -1) return null;

    items[index] = {
      ...items[index],
      ...updates,
      updated_at: new Date().toISOString()
    };

    await this.saveVaultItems(items);

    try {
      await fetch(`/api/memory-vault/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
    } catch (e) {
      console.error('Failed to sync updated memory vault note to backend:', e);
    }

    return items[index];
  }

  static async deleteVaultItem(id: string): Promise<boolean> {
    const items = await this.getVaultItems();
    const filtered = items.filter(item => item.id !== id);
    if (filtered.length === items.length) return false;

    await this.saveVaultItems(filtered);

    try {
      await fetch(`/api/memory-vault/${id}`, { method: 'DELETE' });
    } catch (e) {
      console.error('Failed to sync deleted memory vault note to backend:', e);
    }

    return true;
  }

  static async convertVaultItem(
    id: string,
    targetModule: 'REMINDER' | 'EVENT' | 'PLANNING' | 'STUDY_TRACKING',
    extra?: { date?: string; time?: string; priority?: 'low' | 'medium' | 'high' }
  ): Promise<any> {
    try {
      const res = await fetch(`/api/memory-vault/${id}/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetModule, ...extra })
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.warn('Backend conversion request failed:', e);
    }
    return { success: false };
  }
}
