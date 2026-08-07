export interface Reminder {
  id: string;
  user_id: string;
  title: string;
  description?: string;
  date: string;
  time: string;
  repeat: 'none' | 'daily' | 'weekly' | 'monthly';
  priority: 'low' | 'medium' | 'high';
  voice_notification: boolean;
  active: boolean;
  created_at: string;
  category?: string;
  status?: 'draft' | 'scheduled' | 'triggered' | 'completed' | 'cancelled' | 'archived';
  selected_actions?: any[];
  sound_enabled?: boolean;
  sound_name?: string;
  voice_speed?: number;
  voice_name?: string;
  source_id?: string;
}
