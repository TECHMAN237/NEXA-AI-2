import { StorageService } from './StorageService.js';
import { StudyTrackingData } from '../types.js';
import { getApiUrl } from '../config/api.js';

const STUDY_TRACKING_KEY = 'nexa_study_tracking';

const DEFAULT_TRACKING: StudyTrackingData = {
  id: 'study-tracking-user-1',
  user_id: 'user-1',
  normal_exam_date: '',
  continuous_assessment_date: '',
  subjects: [],
  hours_per_day: 2,
  preferred_start_time: '20:00',
  preferred_end_time: '22:00',
  available_days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
  study_plan: [],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};

export class StudyTrackingService {
  static async getStudyTracking(): Promise<StudyTrackingData> {
    try {
      const res = await fetch(getApiUrl('/api/study-tracking'));
      if (res.ok) {
        const data = await res.json();
        if (data && typeof data === 'object' && data.id) {
          await StorageService.save(STUDY_TRACKING_KEY, data);
          return data;
        }
      }
    } catch (e) {
      console.warn('Backend fetch failed for study tracking, using local fallback');
    }

    const localData = (await StorageService.find(STUDY_TRACKING_KEY, 'study-tracking-user-1')) as StudyTrackingData;
    return localData || DEFAULT_TRACKING;
  }

  static async updateStudyTracking(updates: Partial<StudyTrackingData>): Promise<StudyTrackingData> {
    try {
      const res = await fetch(getApiUrl('/api/study-tracking'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      if (res.ok) {
        const data = await res.json();
        await StorageService.save(STUDY_TRACKING_KEY, data);
        return data;
      }
    } catch (e) {
      console.error('Failed to update study tracking via backend:', e);
    }

    const current = await this.getStudyTracking();
    const updated = { ...current, ...updates, updated_at: new Date().toISOString() };
    await StorageService.save(STUDY_TRACKING_KEY, updated);
    return updated;
  }
}
