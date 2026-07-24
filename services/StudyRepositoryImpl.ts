import { StudyRepository } from '../interfaces/StudyRepository.js';
import { StudyExam } from '../models/StudyExam.js';
import { StudySession } from '../models/StudySession.js';
import { dbService } from '../server/db.js';

export class StudyRepositoryImpl implements StudyRepository {
  async getExamById(id: string): Promise<StudyExam | null> {
    const list = dbService.getDb().exams || [];
    return list.find((item: any) => item.id === id) || null;
  }

  async listExams(userId: string): Promise<StudyExam[]> {
    return dbService.getExams(userId);
  }

  async createExam(userId: string, data: Partial<StudyExam>): Promise<StudyExam> {
    return dbService.createExam(userId, {
      course: data.course || 'Unknown Course',
      exam_date: data.exam_date || new Date().toISOString().split('T')[0],
      difficulty: data.difficulty || 'medium',
      study_hours_per_day: data.study_hours_per_day || 2,
      preferred_study_time: data.preferred_study_time || '18:00 - 20:00',
      available_days: data.available_days || ['Mon', 'Wed', 'Fri'],
      remaining_chapters: data.remaining_chapters || 5,
      progress: data.progress || 0
    });
  }

  async updateExam(userId: string, id: string, data: Partial<StudyExam>): Promise<StudyExam | null> {
    return dbService.updateExam(userId, id, data);
  }

  async deleteExam(userId: string, id: string): Promise<boolean> {
    return dbService.deleteExam(userId, id);
  }

  async getStudySessionById(id: string): Promise<StudySession | null> {
    const db = dbService.getDb();
    const list = db.study_sessions || [];
    return list.find((item: any) => item.id === id) || null;
  }

  async listStudySessions(userId: string): Promise<StudySession[]> {
    const db = dbService.getDb();
    const list = db.study_sessions || [];
    return list.filter((item: any) => item.user_id === userId);
  }

  async createStudySession(userId: string, data: Partial<StudySession>): Promise<StudySession> {
    const db = dbService.getDb();
    if (!db.study_sessions) db.study_sessions = [];
    const newSession: StudySession = {
      id: `session-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      user_id: userId,
      exam_id: data.exam_id || '',
      title: data.title || 'Study Session',
      date: data.date || new Date().toISOString().split('T')[0],
      time: data.time || '19:00',
      duration_minutes: data.duration_minutes || 60,
      status: data.status || 'scheduled',
      created_at: new Date().toISOString()
    };
    db.study_sessions.push(newSession);
    dbService.writeDb(db);
    return newSession;
  }

  async updateStudySession(userId: string, id: string, data: Partial<StudySession>): Promise<StudySession | null> {
    const db = dbService.getDb();
    if (!db.study_sessions) db.study_sessions = [];
    const idx = db.study_sessions.findIndex((item: any) => item.id === id && item.user_id === userId);
    if (idx === -1) return null;
    db.study_sessions[idx] = { ...db.study_sessions[idx], ...data };
    dbService.writeDb(db);
    return db.study_sessions[idx];
  }

  async deleteStudySession(userId: string, id: string): Promise<boolean> {
    const db = dbService.getDb();
    if (!db.study_sessions) return false;
    const initialLen = db.study_sessions.length;
    db.study_sessions = db.study_sessions.filter((item: any) => !(item.id === id && item.user_id === userId));
    if (db.study_sessions.length !== initialLen) {
      dbService.writeDb(db);
      return true;
    }
    return false;
  }
}
