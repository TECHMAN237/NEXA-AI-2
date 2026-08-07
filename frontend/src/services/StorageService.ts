import { StorageProvider, LocalStorageProvider } from './StorageProvider.js';

// Configurable Injection Point for the Storage Provider
// Changing this to a SupabaseProvider or FirebaseProvider in the future will shift the whole app's storage!
const activeProvider: StorageProvider = new LocalStorageProvider();

export class StorageService {
  static getProvider(): StorageProvider {
    return activeProvider;
  }

  static async save(key: string, data: any): Promise<void> {
    return activeProvider.save(key, data);
  }

  static async update(key: string, id: string, data: any): Promise<void> {
    return activeProvider.update(key, id, data);
  }

  static async delete(key: string, id: string): Promise<void> {
    return activeProvider.delete(key, id);
  }

  static async find(key: string, id?: string): Promise<any | null> {
    return activeProvider.find(key, id);
  }

  static async findAll(key: string): Promise<any[]> {
    return activeProvider.findAll(key);
  }

  static async clear(key: string): Promise<void> {
    return activeProvider.clear(key);
  }

  static async export(): Promise<string> {
    return activeProvider.export();
  }

  static async import(data: string): Promise<void> {
    return activeProvider.import(data);
  }
}
