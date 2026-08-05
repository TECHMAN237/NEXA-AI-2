import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { ChevronLeft, BookOpen, Calendar, Clock, Sparkles, Bell, Plus, Trash2, CheckCircle2 } from 'lucide-react';
import { StudyTrackingData, StudySubject } from '../types.js';
import { StudyTrackingService } from '../services/StudyTrackingService.js';
import { generateSubjectStudyPlan, generateExamReminders } from '../utils/studyPlanGenerator.js';

interface StudyTrackingViewProps {
  onBack: () => void;
  exams?: any[];
  onExamSaved?: () => void;
}

export default function StudyTrackingView({ onBack, onExamSaved }: StudyTrackingViewProps) {
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  // Form State
  const [normalExamDate, setNormalExamDate] = useState('2026-08-20');
  const [continuousAssessmentDate, setContinuousAssessmentDate] = useState('2026-06-10');
  const [subjects, setSubjects] = useState<StudySubject[]>([
    { id: 'subj-1', name: 'Mathematics', level: 30 },
    { id: 'subj-2', name: 'Java', level: 15 },
    { id: 'subj-3', name: 'Computer Architecture', level: 60 }
  ]);
  const [hoursPerDay, setHoursPerDay] = useState(2);
  const [preferredStartTime, setPreferredStartTime] = useState('20:00');
  const [preferredEndTime, setPreferredEndTime] = useState('22:00');
  const [availableDays, setAvailableDays] = useState<string[]>(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
  const [studyPlan, setStudyPlan] = useState<any[]>([]);

  const daysList = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await StudyTrackingService.getStudyTracking();
      if (data) {
        if (data.normal_exam_date) setNormalExamDate(data.normal_exam_date);
        if (data.continuous_assessment_date) setContinuousAssessmentDate(data.continuous_assessment_date);
        if (data.subjects && data.subjects.length > 0) setSubjects(data.subjects);
        if (data.hours_per_day) setHoursPerDay(data.hours_per_day);
        if (data.preferred_start_time) setPreferredStartTime(data.preferred_start_time);
        if (data.preferred_end_time) setPreferredEndTime(data.preferred_end_time);
        if (data.available_days && data.available_days.length > 0) setAvailableDays(data.available_days);
        if (data.study_plan && data.study_plan.length > 0) setStudyPlan(data.study_plan);
      }
    } catch (e) {
      console.error('Failed to load study tracking data:', e);
    } finally {
      setLoading(false);
    }
  };

  const toggleDay = (day: string) => {
    if (availableDays.includes(day)) {
      setAvailableDays(availableDays.filter(d => d !== day));
    } else {
      setAvailableDays([...availableDays, day]);
    }
  };

  const handleAddSubject = () => {
    const newSubj: StudySubject = {
      id: `subj-${Date.now()}`,
      name: '',
      level: 50
    };
    setSubjects([...subjects, newSubj]);
  };

  const handleRemoveSubject = (id: string) => {
    setSubjects(subjects.filter(s => s.id !== id));
  };

  const handleSubjectChange = (id: string, field: 'name' | 'level', value: string | number) => {
    setSubjects(subjects.map(s => {
      if (s.id === id) {
        return { ...s, [field]: value };
      }
      return s;
    }));
  };

  const handleGeneratePlan = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSaving(true);
    setSuccessMsg('');

    try {
      const validSubjects = subjects.filter(s => s.name.trim().length > 0);
      const generatedPlan = generateSubjectStudyPlan(
        validSubjects.length > 0 ? validSubjects : subjects,
        hoursPerDay,
        preferredStartTime,
        preferredEndTime,
        availableDays
      );

      const payload: Partial<StudyTrackingData> = {
        normal_exam_date: normalExamDate,
        continuous_assessment_date: continuousAssessmentDate,
        subjects: validSubjects,
        hours_per_day: hoursPerDay,
        preferred_start_time: preferredStartTime,
        preferred_end_time: preferredEndTime,
        available_days: availableDays,
        study_plan: generatedPlan
      };

      const updated = await StudyTrackingService.updateStudyTracking(payload);
      setStudyPlan(updated.study_plan || generatedPlan);
      setSuccessMsg('Study plan generated and saved successfully!');
      onExamSaved?.();
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      console.error('Error saving study tracking plan:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const getDaysLeft = (dateStr: string) => {
    if (!dateStr) return 0;
    try {
      const targetDate = new Date(dateStr + 'T00:00:00');
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const diffMs = targetDate.getTime() - now.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      return diffDays > 0 ? diffDays : 0;
    } catch {
      return 0;
    }
  };

  const examReminders = generateExamReminders(
    subjects.map(s => s.name).join(', ') || 'Exam Session',
    normalExamDate
  );

  return (
    <div id="study-tracking-view" className="flex flex-col h-full bg-[#0B0E14] overflow-y-auto custom-scrollbar px-4 pt-4 pb-24">
      {/* Header */}
      <div className="flex items-center space-x-3 mb-5">
        <button 
          onClick={onBack}
          className="p-2 rounded-xl bg-nexa-card border border-nexa-border text-gray-400 hover:text-white transition cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-white font-display">Study Tracking MVP</h1>
          <p className="text-[10px] text-gray-400">Assessment periods, subject levels, availability & weighted timetable</p>
        </div>
      </div>

      {successMsg && (
        <div className="mb-4 p-3 bg-green-500/10 border border-green-500/30 rounded-xl text-green-400 text-xs flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      <form onSubmit={handleGeneratePlan} className="space-y-5">

        {/* 1. ACADEMIC PERIODS */}
        <div className="bg-nexa-card/90 border border-nexa-border rounded-2xl p-4 space-y-4">
          <div className="flex items-center justify-between border-b border-white/5 pb-3">
            <div className="flex items-center space-x-2">
              <Calendar className="w-4 h-4 text-cyan-400" />
              <h2 className="text-xs font-bold text-white uppercase tracking-wider font-display">
                1. Academic Assessment Periods
              </h2>
            </div>
            <span className="text-[9px] font-mono text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-500/30">
              {getDaysLeft(normalExamDate)} Days to Normal Exam
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                Normal Examination Session
              </label>
              <input 
                type="date" 
                value={normalExamDate}
                onChange={(e) => setNormalExamDate(e.target.value)}
                className="w-full bg-[#0B0E14] text-xs text-white border border-nexa-border rounded-xl px-3 py-2.5 focus:outline-none focus:border-cyan-400 transition"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                Continuous Assessment Period
              </label>
              <input 
                type="date" 
                value={continuousAssessmentDate}
                onChange={(e) => setContinuousAssessmentDate(e.target.value)}
                className="w-full bg-[#0B0E14] text-xs text-white border border-nexa-border rounded-xl px-3 py-2.5 focus:outline-none focus:border-cyan-400 transition"
              />
            </div>
          </div>
        </div>

        {/* 2. MY SUBJECTS & LEVELS */}
        <div className="bg-nexa-card/90 border border-nexa-border rounded-2xl p-4 space-y-4">
          <div className="flex items-center justify-between border-b border-white/5 pb-3">
            <div className="flex items-center space-x-2">
              <BookOpen className="w-4 h-4 text-purple-400" />
              <h2 className="text-xs font-bold text-white uppercase tracking-wider font-display">
                2. My Subjects & Preparation Level (%)
              </h2>
            </div>
            <button
              type="button"
              onClick={handleAddSubject}
              className="px-2.5 py-1 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/40 rounded-lg text-purple-300 text-[10px] font-bold flex items-center space-x-1 transition cursor-pointer"
            >
              <Plus className="w-3 h-3" />
              <span>Add Subject</span>
            </button>
          </div>

          <p className="text-[10px] text-gray-400">
            Enter your subjects and current confidence level (%). Weaker subjects will automatically receive more study time.
          </p>

          <div className="space-y-3">
            {subjects.map((subj) => (
              <div key={subj.id} className="bg-[#0B0E14] border border-nexa-border rounded-xl p-3 flex flex-col md:flex-row items-center gap-3">
                <div className="flex-1 w-full">
                  <label className="block text-[9px] font-bold text-gray-500 uppercase mb-1">Subject Name</label>
                  <input 
                    type="text"
                    value={subj.name}
                    onChange={(e) => handleSubjectChange(subj.id, 'name', e.target.value)}
                    placeholder="e.g. Mathematics"
                    className="w-full bg-[#111621] text-xs text-white border border-nexa-border/60 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-purple-400"
                  />
                </div>

                <div className="w-full md:w-48">
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-[9px] font-bold text-gray-500 uppercase">Level / Confidence</label>
                    <span className="text-xs font-mono font-bold text-purple-400">{subj.level}%</span>
                  </div>
                  <input 
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={subj.level}
                    onChange={(e) => handleSubjectChange(subj.id, 'level', Number(e.target.value))}
                    className="w-full accent-purple-500 cursor-pointer"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => handleRemoveSubject(subj.id)}
                  className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition self-end md:self-center cursor-pointer"
                  title="Remove subject"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}

            {subjects.length === 0 && (
              <div className="text-center py-4 text-xs text-gray-500">
                No subjects added yet. Click "Add Subject" to begin.
              </div>
            )}
          </div>
        </div>

        {/* 3. STUDY AVAILABILITY */}
        <div className="bg-nexa-card/90 border border-nexa-border rounded-2xl p-4 space-y-4">
          <div className="flex items-center space-x-2 border-b border-white/5 pb-3">
            <Clock className="w-4 h-4 text-blue-400" />
            <h2 className="text-xs font-bold text-white uppercase tracking-wider font-display">
              3. Study Availability
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                Hours Per Day
              </label>
              <input 
                type="number" 
                min="1" 
                max="12"
                value={hoursPerDay}
                onChange={(e) => setHoursPerDay(Number(e.target.value))}
                className="w-full bg-[#0B0E14] text-xs text-white border border-nexa-border rounded-xl px-3 py-2 focus:outline-none focus:border-blue-400"
                required
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                Start Time
              </label>
              <input 
                type="text" 
                placeholder="20:00"
                value={preferredStartTime}
                onChange={(e) => setPreferredStartTime(e.target.value)}
                className="w-full bg-[#0B0E14] text-xs text-white border border-nexa-border rounded-xl px-3 py-2 focus:outline-none focus:border-blue-400"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                End Time
              </label>
              <input 
                type="text" 
                placeholder="22:00"
                value={preferredEndTime}
                onChange={(e) => setPreferredEndTime(e.target.value)}
                className="w-full bg-[#0B0E14] text-xs text-white border border-nexa-border rounded-xl px-3 py-2 focus:outline-none focus:border-blue-400"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
              Available Study Days
            </label>
            <div className="flex justify-between gap-1.5">
              {daysList.map((day) => {
                const isActive = availableDays.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(day)}
                    className={`flex-1 py-2 rounded-lg border text-[10px] font-bold transition flex items-center justify-center cursor-pointer ${
                      isActive 
                        ? 'bg-blue-600 border-blue-500 text-white shadow-md shadow-blue-900/30' 
                        : 'bg-[#0B0E14] border-nexa-border text-gray-500 hover:text-white'
                    }`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* 4. GENERATE STUDY PLAN BUTTON */}
        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          type="submit"
          disabled={isSaving}
          className="w-full py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 via-blue-600 to-purple-600 text-white text-xs font-bold tracking-wider uppercase cursor-pointer transition shadow-lg shadow-cyan-950/40 flex items-center justify-center space-x-2"
        >
          <Sparkles className="w-4 h-4 text-cyan-200 animate-pulse" />
          <span>{isSaving ? "Generating Study Plan..." : "4. Generate Study Plan"}</span>
        </motion.button>
      </form>

      {/* 5. GENERATED TIMETABLE */}
      {studyPlan && studyPlan.length > 0 && (
        <div className="mt-6 bg-[#111621] border border-nexa-border rounded-2xl p-4 space-y-4">
          <div className="flex items-center justify-between border-b border-white/5 pb-3">
            <div className="flex items-center space-x-2">
              <Calendar className="w-4 h-4 text-cyan-400" />
              <h2 className="text-xs font-bold text-white uppercase tracking-wider font-display">
                5. Personalized Study Timetable
              </h2>
            </div>
            <span className="text-[9px] text-gray-400 font-mono">
              {studyPlan.length} Active Days
            </span>
          </div>

          <div className="space-y-3">
            {studyPlan.map((dayItem: any, dIdx: number) => (
              <div key={dIdx} className="bg-[#0B0E14] border border-nexa-border/70 rounded-xl p-3 space-y-2">
                <div className="text-xs font-bold text-cyan-300 flex items-center space-x-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                  <span>{dayItem.day}</span>
                </div>
                <div className="space-y-1.5 pl-3 border-l border-cyan-500/20">
                  {dayItem.slots?.map((slot: any, sIdx: number) => (
                    <div key={sIdx} className="flex items-center justify-between text-[11px] bg-white/[0.03] p-2 rounded-lg border border-white/5">
                      <span className="font-mono text-cyan-400 font-semibold">{slot.time}</span>
                      <span className="text-gray-200 font-medium">{slot.activity}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 6. EXAM PROXIMITY REMINDERS */}
      <div className="mt-6 bg-[#111621] border border-nexa-border rounded-2xl p-4 space-y-4">
        <div className="flex items-center justify-between border-b border-white/5 pb-3">
          <div className="flex items-center space-x-2">
            <Bell className="w-4 h-4 text-amber-400" />
            <h2 className="text-xs font-bold text-white uppercase tracking-wider font-display">
              6. Scheduled Exam Proximity Reminders
            </h2>
          </div>
          <span className="text-[9px] font-bold text-amber-400 bg-amber-950/40 px-2 py-0.5 rounded border border-amber-500/30 uppercase font-mono">
            Automated
          </span>
        </div>

        <div className="space-y-2.5">
          {examReminders.map((rem, idx) => (
            <div 
              key={rem.id || idx}
              className="flex items-center justify-between bg-[#0B0E14] border border-nexa-border/70 rounded-xl p-3"
            >
              <div className="flex items-center space-x-3">
                <div className="p-1.5 bg-amber-500/10 text-amber-400 rounded-lg">
                  <Bell className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-white">{rem.title}</h4>
                  <p className="text-[10px] text-gray-400 font-mono mt-0.5">
                    Trigger date: {rem.date} ({rem.milestone})
                  </p>
                </div>
              </div>
              <span className="text-[9px] font-bold text-green-400 bg-green-950/40 border border-green-500/30 px-2 py-0.5 rounded-full uppercase">
                Active
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
