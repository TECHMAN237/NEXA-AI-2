export class PayloadValidator {
  static validateReminder(body: any): { valid: boolean; error?: string } {
    if (!body.title || typeof body.title !== 'string') {
      return { valid: false, error: 'Title must be a valid string.' };
    }
    if (body.repeat && !['none', 'daily', 'weekly', 'monthly'].includes(body.repeat)) {
      return { valid: false, error: 'Repeat must be none, daily, weekly, or monthly.' };
    }
    if (body.priority && !['low', 'medium', 'high'].includes(body.priority)) {
      return { valid: false, error: 'Priority must be low, medium, or high.' };
    }
    return { valid: true };
  }

  static validateTask(body: any): { valid: boolean; error?: string } {
    if (!body.title || typeof body.title !== 'string') {
      return { valid: false, error: 'Task title must be a valid string.' };
    }
    if (body.duration_hours !== undefined && (typeof body.duration_hours !== 'number' || body.duration_hours < 0)) {
      return { valid: false, error: 'Duration hours must be a positive number.' };
    }
    if (body.priority && !['low', 'medium', 'high'].includes(body.priority)) {
      return { valid: false, error: 'Priority must be low, medium, or high.' };
    }
    if (body.status && !['pending', 'completed', 'in_progress'].includes(body.status)) {
      return { valid: false, error: 'Status must be pending, completed, or in_progress.' };
    }
    return { valid: true };
  }

  static validateExam(body: any): { valid: boolean; error?: string } {
    if (!body.course || typeof body.course !== 'string') {
      return { valid: false, error: 'Course name must be a valid string.' };
    }
    if (body.remaining_chapters !== undefined && (typeof body.remaining_chapters !== 'number' || body.remaining_chapters < 0)) {
      return { valid: false, error: 'Remaining chapters must be a non-negative number.' };
    }
    return { valid: true };
  }

  static validateEvent(body: any): { valid: boolean; error?: string } {
    if (!body.title || typeof body.title !== 'string') {
      return { valid: false, error: 'Event title must be a valid string.' };
    }
    return { valid: true };
  }
}
