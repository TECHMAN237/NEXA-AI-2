import { StudyExam } from '../models/StudyExam.js';
import { StudySession } from '../models/StudySession.js';

export interface StudyRepository {
  getExamById(id: string): Promise<StudyExam | null>;
  listExams(userId: string): Promise<StudyExam[]>;
  createExam(userId: string, data: Partial<StudyExam>): Promise<StudyExam>;
  updateExam(userId: string, id: string, data: Partial<StudyExam>): Promise<StudyExam | null>;
  deleteExam(userId: string, id: string): Promise<boolean>;

  getStudySessionById(id: string): Promise<StudySession | null>;
  listStudySessions(userId: string): Promise<StudySession[]>;
  createStudySession(userId: string, data: Partial<StudySession>): Promise<StudySession>;
  updateStudySession(userId: string, id: string, data: Partial<StudySession>): Promise<StudySession | null>;
  deleteStudySession(userId: string, id: string): Promise<boolean>;
}
