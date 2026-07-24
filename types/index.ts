export * from '../models/Reminder.js';
export * from '../models/Planning.js';
export * from '../models/PlanningTask.js';
export * from '../models/StudyExam.js';
export * from '../models/StudySession.js';
export * from '../models/Event.js';
export * from '../models/SmartAction.js';
export * from '../models/Notification.js';

export interface BackendResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
