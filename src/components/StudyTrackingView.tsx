import React, { useState } from 'react';
import { motion } from 'motion/react';
import { ChevronLeft, Calendar, BookOpen, Clock, Award, CheckCircle2, Sparkles, AlertCircle } from 'lucide-react';
import { Exam } from '../types.js';

interface StudyTrackingViewProps {
  onBack: () => void;
  exams: Exam[];
  onExamSaved: () => void;
}

export default function StudyTrackingView({ onBack, exams, onExamSaved }: StudyTrackingViewProps) {
  const activeExam = exams[0] || null;

  // Form states
  const todayStr = new Date().toISOString().split('T')[0];
  const [course, setCourse] = useState(activeExam?.course || 'Computer Architecture');
  const [examDate, setExamDate] = useState(activeExam?.exam_date || todayStr);
  const [difficulty, setDifficulty] = useState<'low' | 'medium' | 'high'>(activeExam?.difficulty || 'high');
  const [hoursPerDay, setHoursPerDay] = useState(activeExam?.study_hours_per_day || 3);
  const [prefTime, setPrefTime] = useState(activeExam?.preferred_study_time || '20:00 - 23:00');
  const [availableDays, setAvailableDays] = useState<string[]>(activeExam?.available_days || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
  const [isSaving, setIsSaving] = useState(false);

  // Study Automation States
  const [autoCreatePlan, setAutoCreatePlan] = useState(true);
  const [autoReminder, setAutoReminder] = useState(activeExam?.auto_reminders !== false);
  const [reminderIntervals, setReminderIntervals] = useState<string[]>(
    activeExam?.reminder_intervals || [
      '1 month before',
      '2 weeks before',
      '1 week before',
      '3 days before',
      '1 day before',
      'Exam day'
    ]
  );
  const [autoOpenDoc, setAutoOpenDoc] = useState(true);
  const [autoSelectedDoc, setAutoSelectedDoc] = useState('Computer Architecture Notes.pdf');
  const [autoStartFocus, setAutoStartFocus] = useState(true);

  const daysList = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const toggleDay = (day: string) => {
    if (availableDays.includes(day)) {
      setAvailableDays(availableDays.filter(d => d !== day));
    } else {
      setAvailableDays([...availableDays, day]);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      // If there's an active exam, update it. Otherwise create a new one.
      const method = activeExam ? 'PUT' : 'POST';
      const endpoint = activeExam ? `/api/exams/${activeExam.id}` : '/api/exams';

      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          course,
          exam_date: examDate,
          difficulty,
          study_hours_per_day: hoursPerDay,
          preferred_study_time: prefTime,
          available_days: availableDays,
          remaining_chapters: activeExam?.remaining_chapters || 8,
          progress: activeExam?.progress || 35,
          auto_reminders: autoReminder,
          reminder_intervals: reminderIntervals
        })
      });

      if (res.ok) {
        onExamSaved();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSaving(false);
    }
  };

  // Compute remaining days dynamically
  const getRemainingDays = () => {
    const today = new Date('2025-05-20'); // Base date matching the UI design flow
    const exam = new Date(examDate);
    const diffTime = exam.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
  };

  return (
    <div id="study-tracking-view" className="flex flex-col h-full bg-[#0B0E14] overflow-y-auto custom-scrollbar px-4 pt-4 pb-20">
      
      {/* Navigation Header */}
      <div className="flex items-center space-x-3 mb-5">
        <button 
          onClick={onBack}
          className="p-2 rounded-xl bg-nexa-card border border-nexa-border text-gray-400 hover:text-white transition cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-white font-display">Study Tracking</h1>
          <p className="text-[10px] text-gray-500">Track exams & revision plans</p>
        </div>
      </div>

      {/* Proactive Notification Banner Alert */}
      <div className="mb-5 bg-[#1C2533] border-l-4 border-nexa-blue rounded-r-xl p-3.5 flex items-start space-x-2.5">
        <AlertCircle className="w-4 h-4 text-nexa-blue flex-shrink-0 mt-0.5" />
        <div>
          <h4 className="text-[10px] font-bold text-nexa-blue uppercase tracking-wider">Proactive Proximity Alert</h4>
          <p className="text-xs text-gray-300 mt-1 leading-relaxed">
            Your <strong>{course || "Computer Architecture"}</strong> exam is coming up. Revision suggestions are live on your timeline. Completed Chapters: 3 of 11.
          </p>
        </div>
      </div>

      {/* Exam Details Form Card */}
      <div className="bg-nexa-card/80 border border-nexa-border rounded-2xl p-4 mb-6">
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center space-x-1">
          <BookOpen className="w-4 h-4 text-nexa-blue" />
          <span>Exam Details</span>
        </h2>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Course Subject</label>
            <input 
              type="text" 
              value={course}
              onChange={(e) => setCourse(e.target.value)}
              placeholder="e.g. Computer Architecture"
              className="w-full bg-[#0B0E14] text-xs text-white border border-nexa-border rounded-xl px-3 py-2.5 focus:outline-none focus:border-nexa-blue"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Exam Date</label>
              <input 
                type="date" 
                value={examDate}
                onChange={(e) => setExamDate(e.target.value)}
                className="w-full bg-[#0B0E14] text-xs text-white border border-nexa-border rounded-xl px-2 py-2 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Difficulty</label>
              <select 
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as any)}
                className="w-full bg-[#0B0E14] text-xs text-white border border-nexa-border rounded-xl px-2 py-2"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Hours Per Day</label>
              <input 
                type="number" 
                min="1" 
                max="8"
                value={hoursPerDay}
                onChange={(e) => setHoursPerDay(Number(e.target.value))}
                className="w-full bg-[#0B0E14] text-xs text-white border border-nexa-border rounded-xl px-3 py-2 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Study Timings</label>
              <input 
                type="text" 
                placeholder="20:00 - 23:00"
                value={prefTime}
                onChange={(e) => setPrefTime(e.target.value)}
                className="w-full bg-[#0B0E14] text-xs text-white border border-nexa-border rounded-xl px-3 py-2 focus:outline-none"
              />
            </div>
          </div>

          {/* Available Days */}
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Available Study Days</label>
            <div className="flex justify-between">
              {daysList.map((day) => {
                const isActive = availableDays.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(day)}
                    className={`w-9 h-9 rounded-lg border text-[10px] font-bold transition flex items-center justify-center cursor-pointer ${
                      isActive 
                        ? 'bg-nexa-blue border-nexa-blue text-white shadow-md shadow-nexa-blue/20' 
                        : 'bg-[#0B0E14] border-nexa-border text-gray-500 hover:text-white'
                    }`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </div>

          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            type="submit"
            className="w-full py-3 rounded-xl bg-gradient-to-r from-nexa-blue to-nexa-purple text-white text-xs font-bold tracking-wider uppercase cursor-pointer transition shadow-lg mt-2"
          >
            {isSaving ? "Scheduling..." : "Generate Study Plan"}
          </motion.button>
        </form>
      </div>

      {/* Study Automation Card */}
      <div className="bg-[#121620]/90 border border-nexa-border/80 rounded-2xl p-4.5 mb-6 space-y-4 shadow-[0_4px_25px_rgba(0,229,255,0.03)]">
        <div className="flex items-center justify-between pb-2.5 border-b border-nexa-border/40">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-nexa-glow animate-pulse" />
            <span className="text-xs font-bold text-white uppercase tracking-wider font-display">Study Automation</span>
          </div>
          <span className="text-[9px] font-bold text-cyan-400 bg-cyan-400/10 px-2 py-0.5 rounded-full uppercase tracking-wider font-mono">Xena Academics</span>
        </div>

        <p className="text-[10px] text-gray-400 leading-normal">
          Define automatic workflows Xena AI should execute preceding and during your active study blocks.
        </p>

        {/* Automation Phase 1: Proactive prep */}
        <div className="space-y-3 bg-[#151A24]/60 border border-nexa-border/50 rounded-xl p-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-white uppercase tracking-wider">Proactive Preparation</span>
            <span className="text-[8px] font-mono text-gray-500 uppercase">2 weeks before exam</span>
          </div>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="w-1.5 h-1.5 rounded-full bg-nexa-blue"></div>
              <span className="text-xs font-semibold text-gray-300">Create Study Plan Automatically</span>
            </div>
            <button
              type="button"
              onClick={() => setAutoCreatePlan(!autoCreatePlan)}
              className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-250 cursor-pointer flex items-center ${
                autoCreatePlan ? 'bg-nexa-blue' : 'bg-gray-800'
              }`}
            >
              <div className={`w-3.5 h-3.5 rounded-full bg-white shadow transition-transform duration-250 transform ${
                autoCreatePlan ? 'translate-x-4' : 'translate-x-0'
              }`}></div>
            </button>
          </div>
        </div>

        {/* Automation Phase 2: Active sessions */}
        <div className="space-y-3.5 bg-[#151A24]/60 border border-nexa-border/50 rounded-xl p-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-white uppercase tracking-wider">Active Study Session Loop</span>
            <span className="text-[8px] font-mono text-gray-500 uppercase">Every study session</span>
          </div>

          {/* Option 1: Reminder Notification */}
          <div className="flex flex-col space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <button
                  type="button"
                  onClick={() => setAutoReminder(!autoReminder)}
                  className={`w-4.5 h-4.5 rounded border flex items-center justify-center transition-all cursor-pointer ${
                    autoReminder ? 'bg-cyan-500 border-cyan-400 text-black' : 'border-gray-600 text-transparent'
                  }`}
                >
                  <svg className="w-3 h-3 fill-current" viewBox="0 0 20 20"><path d="M0 11l2-2 5 5L18 3l2 2L7 18z"/></svg>
                </button>
                <span className="text-xs font-semibold text-gray-300">Reminder notification</span>
              </div>
              <span className="text-[9px] text-gray-500 font-mono uppercase">Push Alert</span>
            </div>

            {autoReminder && (
              <div className="pl-7 pt-1 space-y-2">
                <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider block">Configured Proximity Reminders:</span>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    '1 month before',
                    '2 weeks before',
                    '1 week before',
                    '3 days before',
                    '1 day before',
                    'Exam day'
                  ].map(interval => {
                    const isChecked = reminderIntervals.includes(interval);
                    return (
                      <button
                        key={interval}
                        type="button"
                        onClick={() => {
                          if (isChecked) {
                            setReminderIntervals(reminderIntervals.filter(i => i !== interval));
                          } else {
                            setReminderIntervals([...reminderIntervals, interval]);
                          }
                        }}
                        className={`py-1.5 px-2.5 rounded-lg border text-[10px] font-medium transition cursor-pointer text-left flex items-center space-x-2 ${
                          isChecked 
                            ? 'bg-cyan-500/10 border-cyan-500/30 text-white' 
                            : 'bg-[#0B0E14] border-nexa-border text-gray-500 hover:text-white'
                        }`}
                      >
                        <div className={`w-2 h-2 rounded-full ${isChecked ? 'bg-cyan-400' : 'bg-gray-700'}`} />
                        <span>{interval}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Option 2: Open Study Material */}
          <div className="flex flex-col space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <button
                  type="button"
                  onClick={() => setAutoOpenDoc(!autoOpenDoc)}
                  className={`w-4.5 h-4.5 rounded border flex items-center justify-center transition-all cursor-pointer ${
                    autoOpenDoc ? 'bg-cyan-500 border-cyan-400 text-black' : 'border-gray-600 text-transparent'
                  }`}
                >
                  <svg className="w-3 h-3 fill-current" viewBox="0 0 20 20"><path d="M0 11l2-2 5 5L18 3l2 2L7 18z"/></svg>
                </button>
                <span className="text-xs font-semibold text-gray-300">Open study material</span>
              </div>
              <span className="text-[9px] text-gray-500 font-mono uppercase">Document</span>
            </div>
            
            {autoOpenDoc && (
              <div className="pl-7">
                <select
                  value={autoSelectedDoc}
                  onChange={(e) => setAutoSelectedDoc(e.target.value)}
                  className="w-full bg-[#0B0E14] text-[11px] text-white border border-nexa-border rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-nexa-blue cursor-pointer"
                >
                  <option value="Computer Architecture Notes.pdf">Computer Architecture Notes.pdf</option>
                  <option value="Advanced Microcontrollers Chapter 4.pdf">Advanced Microcontrollers Chapter 4.pdf</option>
                  <option value="CSC301 Study Syllabus.pdf">CSC301 Study Syllabus.pdf</option>
                </select>
              </div>
            )}
          </div>

          {/* Option 3: Start Focus Mode */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <button
                type="button"
                onClick={() => setAutoStartFocus(!autoStartFocus)}
                className={`w-4.5 h-4.5 rounded border flex items-center justify-center transition-all cursor-pointer ${
                  autoStartFocus ? 'bg-cyan-500 border-cyan-400 text-black' : 'border-gray-600 text-transparent'
                }`}
              >
                <svg className="w-3 h-3 fill-current" viewBox="0 0 20 20"><path d="M0 11l2-2 5 5L18 3l2 2L7 18z"/></svg>
              </button>
              <span className="text-xs font-semibold text-gray-300">Start focus mode</span>
            </div>
            <span className="text-[9px] text-gray-500 font-mono uppercase">DND Profile</span>
          </div>
        </div>
      </div>

      {/* Study Plan Overview (Screen 5 Bottom) */}
      <div className="bg-[#111621] border border-nexa-border rounded-2xl p-4">
        <div className="flex items-center space-x-1.5 mb-4">
          <Sparkles className="w-4 h-4 text-nexa-glow animate-pulse" />
          <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider">Study Plan Overview</h3>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          {/* Countdown card */}
          <div className="bg-nexa-card border border-nexa-border rounded-xl p-3 text-center">
            <span className="text-[9px] text-gray-500 font-bold uppercase block">Exam Countdown</span>
            <span className="text-xl font-bold text-white block mt-1 font-display">
              {getRemainingDays()}
            </span>
            <span className="text-[9px] text-gray-400">Days Left</span>
          </div>

          {/* Progress Circular ring representation */}
          <div className="bg-nexa-card border border-nexa-border rounded-xl p-3 flex flex-col items-center justify-center">
            <span className="text-[9px] text-gray-500 font-bold uppercase block mb-1">Subject Progress</span>
            <div className="relative w-12 h-12 flex items-center justify-center">
              {/* Simple Ring Mockup */}
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                <path className="text-gray-800" strokeWidth="3.5" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                <path className="text-nexa-glow" strokeWidth="3.5" strokeDasharray="35, 100" strokeLinecap="round" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
              </svg>
              <span className="absolute text-[10px] font-bold text-white">35%</span>
            </div>
          </div>
        </div>

        {/* Linear progress and chapters */}
        <div className="space-y-3.5">
          <div className="flex justify-between items-center bg-nexa-card/50 border border-nexa-border rounded-xl p-3">
            <div>
              <span className="text-[9px] text-gray-500 font-bold uppercase block">Today's Topic</span>
              <span className="text-xs font-semibold text-white mt-1 block">Memory Hierarchy</span>
            </div>
            <div className="text-right">
              <span className="text-[9px] text-gray-500 font-bold uppercase block">Chapters Remaining</span>
              <span className="text-xs font-mono font-bold text-nexa-glow mt-1 block">8 / 11</span>
            </div>
          </div>

          {/* Weekly linear progress */}
          <div>
            <div className="flex justify-between text-[10px] font-semibold text-gray-400 mb-1">
              <span>Weekly Revision Progress</span>
              <span className="text-nexa-purple">45%</span>
            </div>
            <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-nexa-blue to-nexa-purple rounded-full" style={{ width: '45%' }}></div>
            </div>
          </div>

          {/* Upcoming scheduled session detail */}
          <div className="bg-[#151A24] border border-nexa-border rounded-xl p-3 flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="p-1.5 bg-nexa-purple/10 text-nexa-purple rounded-lg">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[9px] text-gray-500 font-bold uppercase">Upcoming Session</span>
                <p className="text-xs font-semibold text-white mt-0.5">Today at 20:00 - 23:00</p>
                <p className="text-[9px] text-gray-400">Topic: Cache Coherence & Hierarchy</p>
              </div>
            </div>
            <CheckCircle2 className="w-4 h-4 text-green-500" />
          </div>
        </div>
      </div>

    </div>
  );
}
