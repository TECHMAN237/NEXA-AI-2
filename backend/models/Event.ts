export interface Event {
  id: string;
  user_id: string;
  title: string;
  date: string;
  time: string;
  location: string;
  description: string;
  reminder_time: string; // e.g., "30 minutes before"
  participants: string[]; // names of participants
  created_at: string;
}
