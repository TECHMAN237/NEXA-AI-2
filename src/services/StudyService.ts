import { StorageService } from './StorageService.js';
import { Exam } from '../types.js';

export class StudyService {
  static async getExams(): Promise<Exam[]> {
    return StorageService.findAll('nexa_exams');
  }

  static async saveExams(exams: Exam[]): Promise<void> {
    await StorageService.save('nexa_exams', exams);
  }
}
