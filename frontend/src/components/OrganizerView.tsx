import React from 'react';
import { motion } from 'motion/react';
import { Bell, Clock, BookOpen, Calendar, ChevronRight, Brain } from 'lucide-react';

interface OrganizerViewProps {
  onNavigate: (view: string) => void;
}

export default function OrganizerView({ onNavigate }: OrganizerViewProps) {
  const services = [
    {
      id: 'create-reminder',
      title: 'Create Reminder',
      description: 'Create intelligent reminders with voice notification support.',
      icon: Bell,
      color: 'from-amber-400 to-orange-500',
      badgeColor: 'bg-amber-500/10 text-amber-400',
      view: 'create-reminder'
    },
    {
      id: 'planning',
      title: 'Planning',
      description: 'Organize tasks across today, this week or future dates.',
      icon: Clock,
      color: 'from-purple-400 to-indigo-500',
      badgeColor: 'bg-purple-500/10 text-purple-400',
      view: 'planning'
    },
    {
      id: 'study-tracking',
      title: 'Study Tracking',
      description: 'Track exams, automatically build study plans, monitor progress and receive proactive reminders.',
      icon: BookOpen,
      color: 'from-blue-400 to-cyan-500',
      badgeColor: 'bg-blue-500/10 text-blue-400',
      view: 'study'
    },
    {
      id: 'add-event',
      title: 'Add Event',
      description: 'Create meetings, church events, conferences, appointments or personal events.',
      icon: Calendar,
      color: 'from-teal-400 to-emerald-500',
      badgeColor: 'bg-teal-500/10 text-teal-400',
      view: 'add-event'
    }
  ];

  return (
    <div id="organizer-view" className="flex flex-col h-full bg-[#0B0E14] overflow-y-auto custom-scrollbar px-4 pt-4 pb-20">
      
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-white font-display">Organizer</h1>
        <p className="text-xs text-gray-400 mt-1 font-medium">What would you like to organize today?</p>
      </div>

      {/* Services List */}
      <div className="space-y-4">
        {services.map((svc, idx) => {
          const IconComponent = svc.icon;
          return (
            <motion.div
              key={svc.id}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1, duration: 0.4 }}
              className="bg-[#151A24] border border-nexa-border rounded-2xl p-4 flex flex-col justify-between hover:border-gray-700 transition relative overflow-hidden group"
            >
              {/* Decorative Glow Spot */}
              <div className="absolute top-0 right-0 w-24 h-24 bg-white/[0.01] rounded-full blur-2xl group-hover:bg-white/[0.03] transition-all duration-500"></div>

              <div className="flex items-start space-x-4 mb-4">
                {/* Colored Icon Container */}
                <div className={`p-3 rounded-xl bg-gradient-to-br ${svc.color} text-white shadow-lg`}>
                  <IconComponent className="w-5 h-5" />
                </div>

                <div className="flex-1">
                  <div className="flex items-center space-x-2">
                    <h2 className="text-sm font-semibold text-white font-display tracking-tight group-hover:text-nexa-glow transition">
                      {svc.title}
                    </h2>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider ${svc.badgeColor}`}>
                      MVP
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                    {svc.description}
                  </p>
                </div>
              </div>

              {/* Action Button */}
              <div className="flex justify-end pt-2 border-t border-nexa-border/40">
                <button
                  onClick={() => onNavigate(svc.view)}
                  className="bg-[#1D2533] hover:bg-nexa-blue hover:text-white text-gray-300 text-xs font-semibold px-4 py-2 rounded-xl transition-all duration-300 flex items-center space-x-1 cursor-pointer"
                >
                  <span>Open Tool</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Vault Memory Informational Section */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45, duration: 0.4 }}
        className="mt-4 bg-gradient-to-r from-cyan-950/40 to-slate-900/60 border border-cyan-500/20 rounded-2xl p-4 relative overflow-hidden"
      >
        <div className="flex items-start space-x-3">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            <Brain className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h3 className="text-xs font-bold text-white tracking-tight uppercase font-display">
              Vault Memory
            </h3>
            <p className="text-xs text-gray-300 mt-1 leading-relaxed">
              Start your phrase with <strong className="text-cyan-300 font-mono">'Vault'</strong> to tell Xena about something you want to keep in mind.
            </p>
            <div className="mt-2 text-[11px] text-cyan-300/90 bg-cyan-500/10 border border-cyan-500/20 rounded-lg px-2.5 py-1.5 font-mono">
              Example: "Vault I prefer studying in the evening."
            </div>
          </div>
        </div>
      </motion.div>

      {/* Quick Stats Summary Footer */}
      <div className="mt-6 bg-nexa-card/40 border border-nexa-border rounded-xl p-3 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-nexa-glow opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-nexa-glow"></span>
          </span>
          <span className="text-[10px] text-gray-400 font-medium">All systems online</span>
        </div>
        <span className="text-[9px] text-gray-500 font-mono tracking-widest uppercase">XENA CLOUD BASE</span>
      </div>

    </div>
  );
}
