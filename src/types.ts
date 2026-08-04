export interface User {
  id: string;
  email: string;
  password?: string;
  full_name: string;
  created_at: string;
}

export interface Profile {
  id: string;
  user_id: string;
  email: string;
  full_name: string;
  avatar_url?: string;
  premium: boolean;
  language: string;
  theme: string;
  notifications_enabled: boolean;
  connected_apps: string[];
  created_at: string;
}

export interface Conversation {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender: 'user' | 'assistant';
  text: string;
  created_at: string;
  type: 'text' | 'voice' | 'system';
}

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
}

export interface Task {
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

export interface Plan {
  id: string;
  user_id: string;
  date: string; // YYYY-MM-DD
  timeline: PlanTimelineItem[];
  suggestions: string;
  created_at: string;
}

export interface Exam {
  id: string;
  user_id: string;
  course: string;
  exam_date: string; // YYYY-MM-DD
  difficulty: 'low' | 'medium' | 'high';
  study_hours_per_day: number;
  preferred_study_time: string; // e.g. "20:00 - 23:00"
  available_days: string[]; // e.g. ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
  remaining_chapters: number;
  progress: number; // e.g. 35
  created_at: string;
  auto_reminders?: boolean;
  reminder_intervals?: string[];
}

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

export interface Event {
  id: string;
  user_id: string;
  title: string;
  date: string;
  time: string;
  location: string;
  description: string;
  reminder_time: string; // e.g., "30 minutes before"
  participants: string[]; // participant names or avatars
  created_at: string;
}

export interface Memory {
  id: string;
  user_id: string;
  text: string;
  category: string;
  created_at: string;
}

export interface MemoryVaultItem {
  id: string;
  user_id: string;
  title: string;
  content: string;
  category?: 'Personal' | 'Location' | 'Ideas' | 'Work' | 'Credentials' | 'General';
  tags?: string[];
  created_at: string;
  updated_at?: string;
}

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  text: string;
  date: string;
  read: boolean;
  created_at: string;
}

export type SupportedIntentType = 
  | 'NORMAL_CHAT'
  | 'REMINDER'
  | 'PLANNING'
  | 'EVENT'
  | 'VIEW_UPCOMING_EVENTS'
  | 'QUERY_EVENTS'
  | 'STUDY_TRACKING'
  | 'MEMORY_VAULT'
  | 'PROFILE'
  | 'SETTINGS'
  | 'GENERAL_HELP'
  | 'AMBIGUOUS';

export interface SingleActionPayload {
  intent: SupportedIntentType;
  action: 'CREATE' | 'READ' | 'UPDATE' | 'DELETE' | 'SEARCH' | 'NO_OP';
  payload: Record<string, any>;
  confidence?: number;
}

// AI Intent output format with multi-intent detection & ambiguity support
export interface IntentClassification {
  intent: SupportedIntentType;
  intents?: SupportedIntentType[];
  actions?: SingleActionPayload[];
  extractedData?: {
    title?: string;
    date?: string;
    time?: string;
    course?: string;
    difficulty?: string;
    priority?: 'low' | 'medium' | 'high';
    location?: string;
    description?: string;
    content?: string;
    category?: string;
    [key: string]: any;
  };
  explanation: string;
  clarificationPrompt?: string;
  missingFields?: string[];
}

export interface SmartAction {
  id: string;
  type: "OPEN_APP" | "OPEN_DOCUMENT" | "SEND_NOTIFICATION" | "VOICE_ALERT";
  targetApp: string;
  executionTime: string;
  payload: any;
  status: "active" | "inactive";
}

export interface Activity {
  id: string;
  type: "REMINDER" | "EVENT" | "STUDY" | "PLANNING" | "AI_ACTION";
  title: string;
  description: string;
  timestamp: string;
  status: "completed" | "pending" | "failed";
  metadata?: any;
}

