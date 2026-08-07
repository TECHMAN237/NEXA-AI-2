import { StorageService } from './StorageService.js';
import { Exam, StudySession } from '../types.js';

const EXAMS_KEY = 'nexa_exams';
const SESSIONS_KEY = 'nexa_study_sessions';

export class StudyService {
  static async getExams(): Promise<Exam[]> {
    try {
      const res = await fetch('/api/exams');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          await StorageService.save(EXAMS_KEY, data);
          return data;
        }
      }
    } catch (e) {
      console.warn('Backend fetch failed for exams, using local fallback');
    }

    const localData = (await StorageService.findAll(EXAMS_KEY)) as Exam[];
    return localData || [];
  }

  static async saveExams(exams: Exam[]): Promise<void> {
    await StorageService.save(EXAMS_KEY, exams);
  }

  static async addExam(
    course: string,
    exam_date: string,
    difficulty: 'low' | 'medium' | 'high' = 'medium',
    study_hours_per_day: number = 3,
    preferred_study_time: string = '20:00 - 23:00',
    available_days: string[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    remaining_chapters: number = 10,
    progress: number = 0
  ): Promise<Exam> {
    const exams = await this.getExams();
    const newExam: Exam = {
      id: `exam-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      user_id: 'user-1',
      course: course.trim(),
      exam_date,
      difficulty,
      study_hours_per_day,
      preferred_study_time,
      available_days,
      remaining_chapters,
      progress,
      auto_reminders: true,
      created_at: new Date().toISOString()
    };

    exams.unshift(newExam);
    await this.saveExams(exams);

    try {
      await fetch('/api/exams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newExam)
      });
    } catch (e) {
      console.error('Failed to sync added exam to backend:', e);
    }

    return newExam;
  }

  static async updateExam(id: string, updates: Partial<Exam>): Promise<Exam | null> {
    const exams = await this.getExams();
    const index = exams.findIndex(ex => ex.id === id);
    if (index === -1) return null;

    exams[index] = { ...exams[index], ...updates };
    await this.saveExams(exams);

    try {
      await fetch(`/api/exams/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
    } catch (e) {
      console.error('Failed to sync updated exam to backend:', e);
    }

    return exams[index];
  }

  static async deleteExam(id: string): Promise<boolean> {
    const exams = await this.getExams();
    const filtered = exams.filter(ex => ex.id !== id);
    if (filtered.length === exams.length) return false;

    await this.saveExams(filtered);

    try {
      await fetch(`/api/exams/${id}`, { method: 'DELETE' });
    } catch (e) {
      console.error('Failed to sync deleted exam to backend:', e);
    }

    return true;
  }

  static async getStudySessions(): Promise<StudySession[]> {
    const localData = (await StorageService.findAll(SESSIONS_KEY)) as StudySession[];
    return localData || [];
  }

  static async saveStudySessions(sessions: StudySession[]): Promise<void> {
    await StorageService.save(SESSIONS_KEY, sessions);
  }
}
