export interface StorageProvider {
  save(key: string, data: any): Promise<void>;
  update(key: string, id: string, data: any): Promise<void>;
  delete(key: string, id: string): Promise<void>;
  find(key: string, id?: string): Promise<any | null>;
  findAll(key: string): Promise<any[]>;
  clear(key: string): Promise<void>;
  export(): Promise<string>;
  import(data: string): Promise<void>;
}

export class LocalStorageProvider implements StorageProvider {
  async save(key: string, data: any): Promise<void> {
    const serialized = typeof data === 'string' ? data : JSON.stringify(data);
    localStorage.setItem(key, serialized);
  }

  async update(key: string, id: string, data: any): Promise<void> {
    const raw = localStorage.getItem(key);
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const index = parsed.findIndex((item: any) => item.id === id);
        if (index !== -1) {
          parsed[index] = { ...parsed[index], ...data };
          localStorage.setItem(key, JSON.stringify(parsed));
        }
      } else if (parsed && typeof parsed === 'object') {
        parsed[id] = { ...parsed[id], ...data };
        localStorage.setItem(key, JSON.stringify(parsed));
      }
    } catch (e) {
      console.error(`Error updating key ${key}:`, e);
    }
  }

  async delete(key: string, id: string): Promise<void> {
    const raw = localStorage.getItem(key);
    if (!raw) return;

    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const filtered = parsed.filter((item: any) => item.id !== id);
        localStorage.setItem(key, JSON.stringify(filtered));
      }
    } catch (e) {
      console.error(`Error deleting from key ${key}:`, e);
    }
  }

  async find(key: string, id?: string): Promise<any | null> {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;

    try {
      const parsed = JSON.parse(raw);
      if (id && Array.isArray(parsed)) {
        return parsed.find((item: any) => item.id === id) || null;
      }
      return parsed;
    } catch (e) {
      // If it's not valid JSON, return as string primitive
      return raw;
    }
  }

  async findAll(key: string): Promise<any[]> {
    const raw = localStorage.getItem(key);
    if (!raw) return [];

    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  async clear(key: string): Promise<void> {
    localStorage.removeItem(key);
  }

  async export(): Promise<string> {
    const data: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        data[key] = localStorage.getItem(key) || '';
      }
    }
    return JSON.stringify(data, null, 2);
  }

  async import(data: string): Promise<void> {
    try {
      const parsed = JSON.parse(data);
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === 'string') {
          localStorage.setItem(key, value);
        } else {
          localStorage.setItem(key, JSON.stringify(value));
        }
      }
    } catch (e) {
      console.error('Error importing storage backup:', e);
      throw e;
    }
  }
}
