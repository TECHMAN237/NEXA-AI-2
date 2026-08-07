import React, { useState } from 'react';
import { motion } from 'motion/react';
import { 
  Sparkles, Smartphone, ShieldAlert, Check, Calendar, Clock, 
  MessageSquare, Volume2, Mic, Eye, HelpCircle 
} from 'lucide-react';

export default function InteractiveWidget() {
  const [activeVisualizer, setActiveVisualizer] = useState<'widget' | 'lockscreen' | 'notification'>('widget');
  const [feedback, setFeedback] = useState<string | null>(null);

  const showFeedback = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => {
      setFeedback(null);
    }, 4000);
  };

  return (
    <div className="flex flex-col h-full bg-[#0B0E14] overflow-y-auto custom-scrollbar px-4 pt-4 pb-20">
      
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-white font-display">System Demos</h1>
        <p className="text-xs text-gray-400 mt-1">Simulate notifications, lockscreen states, & widget systems</p>
      </div>

      {/* Tabs list */}
      <div className="flex space-x-1 p-1 bg-nexa-card/40 border border-nexa-border rounded-xl mb-5">
        {[
          { id: 'widget', label: 'Android Widget' },
          { id: 'lockscreen', label: 'Lock Screen' },
          { id: 'notification', label: 'Alert Push' }
        ].map((v) => (
          <button
            key={v.id}
            onClick={() => setActiveVisualizer(v.id as any)}
            className={`flex-1 py-2 rounded-lg text-[10px] font-bold tracking-tight transition cursor-pointer ${
              activeVisualizer === v.id ? 'bg-nexa-purple text-white shadow-md' : 'text-gray-400 hover:text-white'
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {/* Transient Action Feedback Notice */}
      {feedback && (
        <motion.div 
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 bg-nexa-blue/10 border border-nexa-blue/30 text-nexa-glow px-4.5 py-3 rounded-xl text-[11px] font-semibold flex items-center space-x-2.5 shadow-lg shadow-nexa-blue/5 justify-center"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-nexa-glow animate-ping flex-shrink-0"></span>
          <span>{feedback}</span>
        </motion.div>
      )}

      {/* RENDER DYNAMIC VISUALIZERS */}
      <div className="flex-1 flex flex-col items-center justify-center py-2">
        {activeVisualizer === 'widget' && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-[280px] bg-slate-900 border border-nexa-border rounded-3xl p-4 shadow-[0_15px_30px_rgba(0,0,0,0.6)] flex flex-col justify-between overflow-hidden relative"
          >
            {/* Widget Header with profile */}
            <div className="flex justify-between items-center mb-3">
              <span className="text-[10px] font-extrabold text-white font-display tracking-widest uppercase">XENA AI</span>
              <div className="w-5 h-5 rounded-full bg-nexa-blue flex items-center justify-center text-[8px] font-bold text-white">AT</div>
            </div>

            {/* Hold to speak visual container */}
            <div className="bg-[#151A24]/90 border border-nexa-border rounded-2xl p-3 mb-3 flex items-center justify-between group">
              <div className="flex items-center space-x-2">
                <div className="p-1.5 bg-nexa-blue/10 text-nexa-blue rounded-lg animate-pulse">
                  <Mic className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[8px] text-gray-500 font-bold uppercase block">Hold to Speak</span>
                  <span className="text-[10px] text-gray-200 block font-semibold mt-0.5">Start Xena AI Session</span>
                </div>
              </div>
              <span className="text-[10px] text-nexa-blue">→</span>
            </div>

            {/* Widget calendar tasks list */}
            <div className="space-y-2 bg-[#151A24]/40 rounded-xl p-2.5 border border-nexa-border/30">
              <div className="flex justify-between text-[9px] text-gray-400">
                <span>Next Reminder</span>
                <span>15:00</span>
              </div>
              <p className="text-xs font-bold text-white leading-tight">Team Meeting</p>
              <div className="h-[1px] bg-nexa-border/30 my-1"></div>
              
              <div className="flex justify-between text-[9px] text-gray-400">
                <span>Today's Study Plan</span>
                <span>20:00</span>
              </div>
              <p className="text-xs font-bold text-nexa-glow leading-tight">Memory Hierarchy</p>
              
              <div className="h-[1px] bg-nexa-border/30 my-1"></div>
              <div className="flex justify-between text-[9px] text-gray-500 font-mono">
                <span>Exam Countdown</span>
                <span className="text-white font-bold">92 Days Left</span>
              </div>
            </div>
            
            <p className="text-[8px] text-center text-gray-600 mt-3 font-mono">XENA COMPACT HOME WIDGET</p>
          </motion.div>
        )}

        {activeVisualizer === 'lockscreen' && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-[280px] bg-gradient-to-b from-[#1C2533] to-[#0B0E14] border border-nexa-border rounded-3xl p-5 shadow-[0_15px_30px_rgba(0,0,0,0.6)] flex flex-col justify-between h-[380px] overflow-hidden"
          >
            {/* Clock */}
            <div className="text-center mt-4">
              <span className="text-xs text-gray-400 font-semibold uppercase tracking-widest font-mono">Xena Mobile OS</span>
              <h1 className="text-5xl font-light text-white tracking-wide font-display mt-2">9:30</h1>
              <p className="text-xs text-gray-400 mt-1 font-semibold">Tuesday, May 20</p>
            </div>

            {/* Glass lockscreen notification alerts */}
            <div className="space-y-2.5 my-auto">
              <div className="glassmorphism p-3 rounded-2xl border border-white/5">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[8px] font-bold text-nexa-purple uppercase tracking-wider">Next Reminder</span>
                  <span className="text-[8px] font-mono text-gray-500">15:00</span>
                </div>
                <h3 className="text-xs font-bold text-white">Team Meeting</h3>
              </div>

              <div className="glassmorphism p-3 rounded-2xl border border-white/5">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[8px] font-bold text-nexa-blue uppercase tracking-wider">Study Countdown</span>
                  <span className="text-[8px] font-mono text-gray-500">92 Days Left</span>
                </div>
                <h3 className="text-xs font-bold text-white">Computer Architecture Revision</h3>
              </div>
            </div>

            {/* Interactive Unlock Speak Orb */}
            <div className="flex flex-col items-center">
              <span className="text-[8px] text-gray-500 font-bold uppercase tracking-wider mb-2">Swipe up to unlock</span>
              <div className="w-10 h-10 rounded-full bg-nexa-purple flex items-center justify-center animate-bounce shadow-lg shadow-nexa-purple/40">
                <Mic className="w-4 h-4 text-white" />
              </div>
              <span className="text-[7px] text-gray-600 mt-1 tracking-widest uppercase">Hold to speak</span>
            </div>
          </motion.div>
        )}

        {activeVisualizer === 'notification' && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-[290px] bg-[#121620] border-l-4 border-nexa-blue rounded-r-2xl p-4 shadow-[0_10px_25px_rgba(0,0,0,0.5)] flex flex-col"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2">
                <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-nexa-blue to-nexa-purple flex items-center justify-center text-[10px] font-extrabold text-white">X</div>
                <span className="text-[9px] text-gray-400 font-semibold uppercase tracking-wider">XENA ASSISTANT • NOW</span>
              </div>
              <span className="w-1.5 h-1.5 rounded-full bg-nexa-blue animate-ping"></span>
            </div>

            <p className="text-xs text-gray-200 font-semibold leading-tight mb-3">
              📚 Time to study Data Structures. Complete chapter 5 revision block.
            </p>

            {/* Interactive Action buttons */}
            <div className="flex space-x-1.5 justify-end">
              <button onClick={() => showFeedback('Opening PDF Study Syllabus.')} className="text-[9px] font-bold bg-[#1B2533] hover:bg-gray-800 text-gray-300 border border-nexa-border px-3 py-1.5 rounded-lg cursor-pointer transition">
                Open PDF
              </button>
              <button onClick={() => showFeedback('Snoozed study session for 15 minutes.')} className="text-[9px] font-bold bg-[#1B2533] hover:bg-gray-800 text-gray-300 border border-nexa-border px-3 py-1.5 rounded-lg cursor-pointer transition">
                Snooze
              </button>
              <button onClick={() => showFeedback('Succeed: Completed study session log!')} className="text-[9px] font-bold bg-green-500 hover:bg-green-600 text-white px-3 py-1.5 rounded-lg cursor-pointer transition">
                Done
              </button>
            </div>
          </motion.div>
        )}
      </div>

      {/* Technical Note on future lockscreens */}
      <div className="mt-4 bg-nexa-card/40 border border-nexa-border rounded-2xl p-4 text-xs leading-relaxed text-gray-400">
        <div className="flex items-center space-x-1 text-white font-semibold mb-1">
          <Smartphone className="w-4 h-4 text-nexa-purple" />
          <span>Mobile Device Readiness</span>
        </div>
        <p className="text-[10px]">
          These UI components are pre-coded using standard Flexbox layouts and JSON states, which easily migrate to React Native Views, Expo Alarms, and Push Notification channels in Phase 2.
        </p>
      </div>

    </div>
  );
}
