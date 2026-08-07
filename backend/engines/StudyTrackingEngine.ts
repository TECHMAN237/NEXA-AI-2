import { StudyRepository } from '../interfaces/StudyRepository.js';
import { StudyExam } from '../models/StudyExam.js';
import { StudySession } from '../models/StudySession.js';
import { NotificationEngine } from './NotificationEngine.js';
import { ReminderEngine } from './ReminderEngine.js';

export function calculateExamReminderDate(examDateStr: string, interval: string): string {
  try {
    const examDate = new Date(examDateStr);
    if (isNaN(examDate.getTime())) {
      return examDateStr;
    }

    let daysToSubtract = 0;
    const lower = interval.toLowerCase();
    if (lower.includes("month")) {
      daysToSubtract = 30;
    } else if (lower.includes("week") && lower.includes("2")) {
      daysToSubtract = 14;
    } else if (lower.includes("week")) {
      daysToSubtract = 7;
    } else if (lower.includes("3 day")) {
      daysToSubtract = 3;
    } else if (lower.includes("1 day")) {
      daysToSubtract = 1;
    } else if (lower.includes("exam day")) {
      daysToSubtract = 0;
    }

    const reminderDate = new Date(examDate.getTime() - daysToSubtract * 24 * 60 * 60 * 1000);
    const year = reminderDate.getFullYear();
    const month = String(reminderDate.getMonth() + 1).padStart(2, '0');
    const day = String(reminderDate.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  } catch (err) {
    console.error("Error calculating exam reminder date:", err);
    return examDateStr;
  }
}

export class StudyTrackingEngine {
  constructor(
    private studyRepo: StudyRepository,
    private notificationEngine: NotificationEngine,
    private reminderEngine: ReminderEngine
  ) {}

  async createExam(userId: string, data: Partial<StudyExam>): Promise<StudyExam> {
    const exam = await this.studyRepo.createExam(userId, data);
    
    // Auto calculate countdown when created
    const daysLeft = this.calculateCountdown(exam.exam_date);

    await this.notificationEngine.createHistoryLog(userId, {
      type: 'STUDY',
      title: `Exam Tracking: ${exam.course}`,
      description: `NEXA registered exam countdown. Exam in ${daysLeft} days.`,
      source_id: exam.id,
      status: 'completed',
      metadata: { course: exam.course, difficulty: exam.difficulty, days_left: daysLeft }
    });

    // Auto-schedule proximity reminders through centralized ReminderEngine
    await this.syncExamReminders(userId, exam);

    return exam;
  }

  async updateExam(userId: string, id: string, data: Partial<StudyExam>): Promise<StudyExam | null> {
    const exam = await this.studyRepo.updateExam(userId, id, data);
    if (exam) {
      const progress = await this.calculateProgress(exam);
      const finalExam = await this.studyRepo.updateExam(userId, id, { progress, auto_reminders: data.auto_reminders, reminder_intervals: data.reminder_intervals });
      if (finalExam) {
        await this.syncExamReminders(userId, finalExam);
        return finalExam;
      }
    }
    return exam;
  }

  async deleteExam(userId: string, id: string): Promise<boolean> {
    const reminders = await this.reminderEngine.listReminders(userId);
    const examReminders = reminders.filter(r => r.source_id === id && r.category === 'Study Tracking');
    for (const r of examReminders) {
      await this.reminderEngine.deleteReminder(userId, r.id);
    }
    return this.studyRepo.deleteExam(userId, id);
  }

  async generateStudyPlan(userId: string, examId: string): Promise<StudySession[]> {
    const exam = await this.studyRepo.getExamById(examId);
    if (!exam) throw new Error("Exam not found");

    console.log(`[StudyTrackingEngine] Auto-generating study sessions plan for exam: ${exam.course}`);
    const sessions: StudySession[] = [];
    const countdown = this.calculateCountdown(exam.exam_date);
    
    // Let's schedule study sessions dynamically
    const sessionsToCreate = Math.min(exam.remaining_chapters, Math.max(3, countdown));
    
    for (let i = 1; i <= sessionsToCreate; i++) {
      const sessionDate = new Date();
      sessionDate.setDate(sessionDate.getDate() + i);
      const dateStr = sessionDate.toISOString().split('T')[0];

      const newSession = await this.studyRepo.createStudySession(userId, {
        exam_id: examId,
        title: `Study Session: ${exam.course} - Chapter ${i}`,
        date: dateStr,
        time: exam.preferred_study_time.split(' - ')[0] || '19:00',
        duration_minutes: exam.study_hours_per_day * 60,
        status: 'scheduled'
      });
      sessions.push(newSession);
    }

    await this.notificationEngine.createHistoryLog(userId, {
      type: 'STUDY',
      title: `Study Plan Generated: ${exam.course}`,
      description: `NEXA generated ${sessions.length} study sessions for your revision.`,
      source_id: exam.id,
      status: 'completed',
      metadata: { course: exam.course, sessions_count: sessions.length }
    });

    return sessions;
  }

  async calculateProgress(exam: StudyExam): Promise<number> {
    const sessions = await this.studyRepo.listStudySessions(exam.user_id);
    const examSessions = sessions.filter(s => s.exam_id === exam.id);
    if (examSessions.length === 0) return exam.progress;

    const completed = examSessions.filter(s => s.status === 'completed').length;
    const computedProgress = Math.round((completed / examSessions.length) * 100);
    return computedProgress;
  }

  calculateCountdown(examDateStr: string): number {
    const examDate = new Date(examDateStr);
    const today = new Date();
    // Reset time components
    examDate.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    
    const diffMs = examDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays);
  }

  // Generate a singular instant study prep alert
  async generateStudyReminder(userId: string, examId: string): Promise<boolean> {
    const exam = await this.studyRepo.getExamById(examId);
    if (!exam) return false;

    const countdown = this.calculateCountdown(exam.exam_date);
    
    await this.reminderEngine.createReminder(userId, {
      title: `Instant Prep: ${exam.course}`,
      description: `Your exam is in ${countdown} days. Complete your chapter readings!`,
      date: new Date().toISOString().split('T')[0],
      time: new Date().toTimeString().split(' ')[0].substring(0, 5),
      repeat: 'none',
      priority: 'high',
      voice_notification: true,
      active: true,
      category: 'Study Tracking',
      status: 'scheduled',
      source_id: examId,
      sound_enabled: true,
      sound_name: 'default',
      voice_speed: 1.0,
      voice_name: 'default'
    });

    return true;
  }

  // Synchronize proximity exam reminders with standard ReminderEngine
  private async syncExamReminders(userId: string, exam: StudyExam): Promise<void> {
    try {
      const reminders = await this.reminderEngine.listReminders(userId);
      const examReminders = reminders.filter(r => r.source_id === exam.id && r.category === 'Study Tracking');
      
      for (const r of examReminders) {
        await this.reminderEngine.deleteReminder(userId, r.id);
      }

      if (exam.auto_reminders !== false) {
        const intervals = exam.reminder_intervals || [
          '1 month before',
          '2 weeks before',
          '1 week before',
          '3 days before',
          '1 day before',
          'Exam day'
        ];

        const todayStr = new Date().toISOString().split('T')[0];
        const preferredTime = exam.preferred_study_time ? exam.preferred_study_time.split(' - ')[0] : '09:00';

        for (const interval of intervals) {
          const reminderDate = calculateExamReminderDate(exam.exam_date, interval);
          
          if (reminderDate >= todayStr) {
            await this.reminderEngine.createReminder(userId, {
              title: `${exam.course} Revision Reminder (${interval})`,
              description: `NEXA AI automated proximity alert for your upcoming ${exam.course} exam scheduled on ${exam.exam_date}.`,
              date: reminderDate,
              time: preferredTime,
              repeat: 'none',
              priority: 'high',
              voice_notification: true,
              active: true,
              category: 'Study Tracking',
              status: 'scheduled',
              source_id: exam.id,
              sound_enabled: true,
              sound_name: 'default',
              voice_speed: 1.0,
              voice_name: 'default'
            });
          }
        }
      }
    } catch (e) {
      console.error("[StudyTrackingEngine] Failed to sync exam reminders:", e);
    }
  }
}
