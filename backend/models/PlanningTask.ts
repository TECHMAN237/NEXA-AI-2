export interface PlanningTask {
  id: string;
  user_id: string;
  title: string;
  date: string;
  time: string;
  duration_hours: number;
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'completed' | 'in_progress';
  created_at: string;
  reminder_enabled?: boolean;
}
