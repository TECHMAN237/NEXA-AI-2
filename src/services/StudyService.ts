import { StorageService } from './StorageService.js';
import { Exam, StudySession } from '../types.js';

export class StudyService {
  static async getExams(): Promise<Exam[]> {
    return StorageService.findAll('nexa_exams');
  }

  static async saveExams(exams: Exam[]): Promise<void> {
    await StorageService.save('nexa_exams', exams);
  }

  static async getStudySessions(): Promise<StudySession[]> {
    return StorageService.findAll('nexa_study_sessions');
  }

  static async saveStudySessions(sessions: StudySession[]): Promise<void> {
    await StorageService.save('nexa_study_sessions', sessions);
  }
}
