export interface PlanTimelineItem {
  id: string;
  time: string;
  title: string;
  duration: string;
  color?: string;
  description?: string;
  priority?: 'low' | 'medium' | 'high';
  reminder_enabled?: boolean;
}

export interface Planning {
  id: string;
  user_id: string;
  date: string; // YYYY-MM-DD
  timeline: PlanTimelineItem[];
  suggestions: string;
  created_at: string;
}
