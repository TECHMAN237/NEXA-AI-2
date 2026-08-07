export interface StudySession {
  id: string;
  user_id: string;
  exam_id: string;
  title: string;
  date: string;
  time: string;
  duration_minutes: number;
  status: 'scheduled' | 'completed';
  created_at: string;
}
