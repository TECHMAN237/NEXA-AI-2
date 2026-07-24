export interface StudyExam {
  id: string;
  user_id: string;
  course: string;
  exam_date: string; // YYYY-MM-DD
  difficulty: 'low' | 'medium' | 'high';
  study_hours_per_day: number;
  preferred_study_time: string; // e.g. "20:00 - 23:00"
  available_days: string[]; // e.g. ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
  remaining_chapters: number;
  progress: number; // percentage (e.g. 35)
  created_at: string;
  auto_reminders?: boolean;
  reminder_intervals?: string[];
}
