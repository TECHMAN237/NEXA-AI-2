import { IContextBuilder, AIContext, UserIntent } from './types.js';
import { ProfileManager } from '../services/ProfileManager.js';
import { ReminderService } from '../services/ReminderService.js';
import { StudyService } from '../services/StudyService.js';
import { ProfileService } from '../services/ProfileService.js';

/**
 * Context Builder for Xena AI.
 * Implements token minimization by selectively building only relevant context for the current request.
 * Prevents bloating AI prompts with unneeded database records.
 */
export class ContextBuilder implements IContextBuilder {
  /**
   * Builds minimal context tailored to user query and detected intent.
   */
  public async buildContext(
    _userId?: string,
    query?: string,
    intentHint?: UserIntent
  ): Promise<AIContext> {
    const timestamp = new Date().toISOString();
    const queryLower = (query || '').toLowerCase();

    // 1. Core lightweight profile context (always small & lightweight)
    let userName = 'User';
    let language = 'en';
    let voiceGender = 'female';
    let profileData: any = null;

    try {
      const [profile, lang, gender] = await Promise.all([
        ProfileManager.loadProfile().catch(() => null),
        ProfileService.getLanguage().catch(() => 'en'),
        ProfileService.getVoiceGender().catch(() => 'female')
      ]);

      if (profile) {
        profileData = profile;
        userName = profile.full_name || 'User';
      }
      language = lang || 'en';
      voiceGender = gender || 'female';
    } catch (err) {
      console.warn('[ContextBuilder] Profile lookup fallback:', err);
    }

    const timezone = typeof Intl !== 'undefined' && Intl.DateTimeFormat
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : 'UTC';

    const baseContext: AIContext = {
      userName,
      language,
      timezone,
      profile: profileData ? {
        full_name: profileData.full_name,
        email: profileData.email,
        language,
        voice_gender: voiceGender
      } : undefined,
      timestamp
    };

    // 2. Determine what additional selective data is genuinely needed
    const needsReminders =
      (intentHint && intentHint.includes('REMINDER')) ||
      queryLower.includes('remind') ||
      queryLower.includes('reminder') ||
      queryLower.includes('task');

    const needsEvents =
      (intentHint && intentHint.includes('EVENT')) ||
      queryLower.includes('event') ||
      queryLower.includes('meeting') ||
      queryLower.includes('calendar') ||
      queryLower.includes('schedule');

    const needsExams =
      (intentHint && intentHint.includes('STUDY')) ||
      queryLower.includes('study') ||
      queryLower.includes('exam') ||
      queryLower.includes('course') ||
      queryLower.includes('revision');

    // 3. Fetch ONLY the needed arrays in parallel with limits to minimize tokens
    try {
      const fetches: Promise<void>[] = [];

      if (needsReminders) {
        fetches.push(
          ReminderService.getReminders()
            .then(reminders => {
              // Filter active reminders and limit to top 5
              baseContext.reminders = (reminders || [])
                .filter(r => r && r.active !== false && r.status !== 'completed')
                .slice(0, 5)
                .map(r => ({
                  id: r.id,
                  title: r.title,
                  date: r.date,
                  time: r.time,
                  priority: r.priority
                }));
            })
            .catch(() => {})
        );
      }

      if (needsEvents) {
        fetches.push(
          ProfileService.getEvents()
            .then(events => {
              baseContext.events = (events || [])
                .slice(0, 5)
                .map(e => ({
                  id: e.id,
                  title: e.title,
                  date: e.date,
                  time: e.time,
                  location: e.location
                }));
            })
            .catch(() => {})
        );
      }

      if (needsExams) {
        fetches.push(
          StudyService.getExams()
            .then(exams => {
              baseContext.exams = (exams || [])
                .slice(0, 3)
                .map(ex => ({
                  id: ex.id,
                  course: ex.course,
                  exam_date: ex.exam_date,
                  progress: ex.progress
                }));
            })
            .catch(() => {})
        );
      }

      if (fetches.length > 0) {
        await Promise.all(fetches);
      }
    } catch (err) {
      console.warn('[ContextBuilder] Selective context collection notice:', err);
    }

    return baseContext;
  }
}
