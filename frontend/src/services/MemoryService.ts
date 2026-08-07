import { StorageService } from './StorageService.js';
import { Memory } from '../types.js';
import { getApiUrl } from '../config/api.js';

export class MemoryService {
  static async getMemories(): Promise<Memory[]> {
    return StorageService.findAll('nexa_memories');
  }

  static async saveMemories(memories: Memory[]): Promise<void> {
    await StorageService.save('nexa_memories', memories);
  }

  static async addMemory(text: string, category: string): Promise<Memory> {
    const memories = await this.getMemories();
    const newMemory: Memory = {
      id: `mem-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      user_id: 'user-1',
      text,
      category,
      created_at: new Date().toISOString()
    };
    memories.push(newMemory);
    await this.saveMemories(memories);

    // Sync to backend
    try {
      await fetch(getApiUrl('/api/memories'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, category })
      });
    } catch (e) {
      console.error('Error syncing added memory to backend:', e);
    }

    return newMemory;
  }

  static async updateMemory(id: string, text: string): Promise<void> {
    const memories = await this.getMemories();
    const index = memories.findIndex(m => m.id === id);
    if (index !== -1) {
      memories[index].text = text;
      await this.saveMemories(memories);
    }

    // Sync to backend
    try {
      await fetch(getApiUrl(`/api/memories/${id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
    } catch (e) {
      console.error('Error syncing updated memory to backend:', e);
    }
  }

  static async deleteMemory(id: string): Promise<void> {
    const memories = await this.getMemories();
    const filtered = memories.filter(m => m.id !== id);
    await this.saveMemories(filtered);

    // Sync to backend
    try {
      await fetch(getApiUrl(`/api/memories/${id}`), { method: 'DELETE' });
    } catch (e) {
      console.error('Error syncing deleted memory to backend:', e);
    }
  }

  static async clearAllMemories(): Promise<void> {
    await StorageService.save('nexa_memories', []);
  }

  static async exportMemories(): Promise<string> {
    const memories = await this.getMemories();
    return JSON.stringify(memories, null, 2);
  }

  static async importMemories(jsonString: string): Promise<void> {
    try {
      const parsed = JSON.parse(jsonString);
      if (Array.isArray(parsed)) {
        const validated = parsed.filter(item => item && typeof item.text === 'string');
        await this.saveMemories(validated);
      } else {
        throw new Error('Invalid memories format. Must be a JSON array.');
      }
    } catch (e) {
      console.error('Import memory error:', e);
      throw e;
    }
  }
}
