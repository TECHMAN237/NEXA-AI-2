import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ChevronLeft, Sparkles, Search, Trash2, Eye, Filter, CheckCircle2, 
  Clock, AlertCircle, Calendar, BookOpen, AlertTriangle, Play, X, RefreshCw
} from 'lucide-react';
import { Activity } from '../types.js';

interface ActivityViewProps {
  onBack: () => void;
}

type TabType = 'ALL' | 'REMINDER' | 'STUDY' | 'EVENT' | 'PLANNING' | 'AI_ACTION';

export default function ActivityView({ onBack }: ActivityViewProps) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<TabType>('ALL');
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [infoNotice, setInfoNotice] = useState<string | null>(null);

  // Fetch activities from notification history backend API
  const fetchActivities = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/notification-history');
      if (res.ok) {
        const data = await res.json();
        // Convert to UI-friendly fields
        setActivities(data);
      }
    } catch (e) {
      console.error('Error fetching activity history:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchActivities();
  }, []);

  const triggerNotice = (msg: string) => {
    setInfoNotice(msg);
    setTimeout(() => {
      setInfoNotice(null);
    }, 3000);
  };

  const handleDeleteActivity = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this activity record from Xena AI memory?')) return;

    try {
      const res = await fetch(`/api/notification-history/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setActivities(prev => prev.filter(item => item.id !== id));
        triggerNotice("Activity record permanently deleted.");
        if (selectedActivity?.id === id) {
          setSelectedActivity(null);
        }
      }
    } catch (err) {
      console.error('Error deleting activity:', err);
    }
  };

  const handleSimulateActivity = async () => {
    const simulationPayloads = [
      {
        type: 'REMINDER',
        title: 'Study Advanced Microcontrollers',
        description: 'Xena AI reminded you to start your study session.',
        status: 'completed',
        metadata: { priority: 'high', notes: 'Exam upcoming in 5 days' }
      },
      {
        type: 'AI_ACTION',
        title: 'Hardware level optimization initiated',
        description: 'Action executed: OPEN_APP',
        status: 'completed',
        metadata: { target_app: 'Calendar', execution_context: 'Pre-meeting preparation' }
      },
      {
        type: 'STUDY',
        title: 'Advanced Microcontrollers Chapters 4-5',
        description: 'Xena AI created a revision reminder because your exam is in 5 days.',
        status: 'completed',
        metadata: { countdown_days: 5, remaining_chapters: 3, suggested_action: 'Practice past paper Q4' }
      },
      {
        type: 'EVENT',
        title: 'CSC301 Group Meeting',
        description: 'Xena AI reminded you 30 minutes before your event.',
        status: 'completed',
        metadata: { location: 'Tech Hub Library', participants: ['Sarah', 'Michael'] }
      },
      {
        type: 'PLANNING',
        title: 'Review & Notes Planning Block',
        description: 'Xena AI marked planning block as finished on schedule.',
        status: 'completed',
        metadata: { time_slot: '20:00 - 21:30' }
      }
    ];

    // Pick a random payload
    const payload = simulationPayloads[Math.floor(Math.random() * simulationPayloads.length)];

    try {
      const res = await fetch('/api/notification-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const newItem = await res.json();
        setActivities(prev => [newItem, ...prev]);
        triggerNotice(`Simulated new ${payload.type} activity entry!`);
      }
    } catch (e) {
      console.error('Error creating simulated activity:', e);
    }
  };

  // Helper to format ISO timestamp nicely
  const formatTime = (timeStr: string) => {
    try {
      const dateObj = new Date(timeStr);
      const today = new Date();
      
      const isToday = dateObj.getDate() === today.getDate() &&
                      dateObj.getMonth() === today.getMonth() &&
                      dateObj.getFullYear() === today.getFullYear();

      const timeOptions: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: false };
      const formattedTime = dateObj.toLocaleTimeString([], timeOptions);

      if (isToday) {
        return `Today - ${formattedTime}`;
      } else {
        const dateOptions: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
        return `${dateObj.toLocaleDateString([], dateOptions)} - ${formattedTime}`;
      }
    } catch (e) {
      return timeStr;
    }
  };

  const getIconForType = (type: string) => {
    switch (type) {
      case 'REMINDER':
        return <Clock className="w-4 h-4 text-amber-400" />;
      case 'STUDY':
        return <BookOpen className="w-4 h-4 text-cyan-400" />;
      case 'EVENT':
        return <Calendar className="w-4 h-4 text-purple-400" />;
      case 'PLANNING':
        return <Sparkles className="w-4 h-4 text-emerald-400" />;
      case 'AI_ACTION':
        return <Play className="w-4 h-4 text-blue-400 animate-pulse" />;
      default:
        return <AlertCircle className="w-4 h-4 text-gray-400" />;
    }
  };

  const getBadgeStyleForType = (type: string) => {
    switch (type) {
      case 'REMINDER':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'STUDY':
        return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20';
      case 'EVENT':
        return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
      case 'PLANNING':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'AI_ACTION':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      default:
        return 'bg-gray-500/10 text-gray-400 border-gray-500/20';
    }
  };

  // Filter activities
  const filteredActivities = activities.filter(act => {
    const matchesSearch = 
      act.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      act.description.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesTab = activeTab === 'ALL' || act.type === activeTab;
    
    return matchesSearch && matchesTab;
  });

  return (
    <div id="activity-view" className="flex flex-col h-full bg-[#0B0E14] overflow-y-auto custom-scrollbar px-4 pt-4 pb-24">
      
      {/* Navigation Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center space-x-3">
          <button 
            onClick={onBack}
            className="p-2 rounded-xl bg-nexa-card border border-nexa-border text-gray-400 hover:text-white transition cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div>
            <span className="text-[9px] font-bold text-nexa-glow bg-nexa-blue/10 border border-nexa-blue/20 rounded px-2 py-0.5 uppercase tracking-widest font-mono">
              Core Ledger
            </span>
            <h1 className="text-sm font-extrabold text-white uppercase tracking-wider font-display mt-0.5">
              Xena Activity
            </h1>
          </div>
        </div>

        {/* Sync Status / Simulator Button */}
        <div className="flex items-center space-x-2">
          <button
            onClick={handleSimulateActivity}
            className="p-1.5 px-3 rounded-lg bg-gradient-to-r from-nexa-blue/20 to-nexa-purple/20 hover:from-nexa-blue/35 hover:to-nexa-purple/35 border border-nexa-blue/30 text-xs font-bold font-mono tracking-wider text-nexa-glow flex items-center space-x-1.5 transition cursor-pointer"
            title="Simulate a new background AI Action performed by Xena AI"
          >
            <Sparkles className="w-3.5 h-3.5 animate-pulse" />
            <span>Simulate AI Action</span>
          </button>
        </div>
      </div>

      <div className="mb-4">
        <p className="text-[11px] text-gray-400 leading-normal">
          Everything your AI assistant did for you. Xena AI monitors schedules, manages focus loops, opens learning resources, and records all activities safely in your local matrix.
        </p>
      </div>

      {/* Info Notice Alert popup */}
      <AnimatePresence>
        {infoNotice && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mb-4 bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 px-4 py-2.5 rounded-xl text-xs font-mono flex items-center space-x-2"
          >
            <CheckCircle2 className="w-4 h-4 shrink-0 animate-bounce" />
            <span>{infoNotice}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Search & Filter bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 mb-5">
        <div className="relative md:col-span-2">
          <input 
            type="text"
            placeholder="Search activities (e.g. 'study', 'conference')"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-nexa-card text-xs text-white border border-nexa-border rounded-xl pl-9 pr-4 py-2.5 focus:outline-none focus:border-nexa-blue font-semibold placeholder:text-gray-500"
          />
          <Search className="w-4 h-4 text-gray-500 absolute left-3 top-3" />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-3 text-gray-500 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center bg-nexa-card border border-nexa-border rounded-xl px-3.5 py-2 text-xs text-gray-400">
          <Filter className="w-3.5 h-3.5 text-cyan-400 mr-2 shrink-0" />
          <span className="font-mono text-[9px] uppercase tracking-wider text-gray-500 mr-2">LEDGER METRIC:</span>
          <span className="font-bold text-white font-mono">{filteredActivities.length} items found</span>
        </div>
      </div>

      {/* Filter Category Tabs */}
      <div className="flex items-center space-x-1 overflow-x-auto pb-2 mb-5 shrink-0 custom-scrollbar scrollbar-none">
        {[
          { id: 'ALL', label: 'All' },
          { id: 'REMINDER', label: 'Reminders' },
          { id: 'STUDY', label: 'Study' },
          { id: 'EVENT', label: 'Events' },
          { id: 'PLANNING', label: 'Planning' },
          { id: 'AI_ACTION', label: 'AI Actions' }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as TabType)}
            className={`px-3.5 py-1.5 rounded-lg border text-xs font-semibold uppercase tracking-wider shrink-0 transition-all cursor-pointer ${
              activeTab === tab.id 
                ? 'bg-nexa-blue/15 border-nexa-blue text-nexa-glow shadow-[0_0_12px_rgba(0,229,255,0.15)] font-bold' 
                : 'bg-[#151A24]/40 border-nexa-border/60 text-gray-400 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-16 space-y-3">
          <RefreshCw className="w-8 h-8 text-nexa-blue animate-spin" />
          <p className="text-xs font-mono text-gray-500 uppercase tracking-widest">Accessing core notification ledger...</p>
        </div>
      ) : filteredActivities.length === 0 ? (
        /* Empty State with NEXA robot illustration */
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-nexa-card/40 border border-nexa-border rounded-2xl p-8 text-center flex flex-col items-center justify-center py-12"
        >
          {/* Futuristic NEXA Robot empty state */}
          <div className="relative w-28 h-28 rounded-full p-0.5 bg-gradient-to-tr from-nexa-blue/30 to-nexa-purple/30 shadow-[0_0_20px_rgba(0,229,255,0.15)] overflow-hidden flex items-center justify-center mb-5">
            <div className="absolute inset-0.5 rounded-full bg-slate-900/90 -z-10"></div>
            <img 
              src="/src/assets/images/nexa_robot_avatar_1784050933373.jpg" 
              alt="Xena AI Companion" 
              className="w-full h-full object-cover rounded-full select-none opacity-40 mix-blend-screen"
              referrerPolicy="no-referrer"
            />
            {/* Pulsing overlay ring */}
            <div className="absolute inset-0 rounded-full border border-nexa-glow/20 animate-[pulse_3s_infinite]"></div>
          </div>

          <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-1">
            {searchQuery ? "No matching records" : "Xena AI has not performed any action yet."}
          </h3>
          <p className="text-[10px] text-gray-500 max-w-xs leading-normal">
            {searchQuery 
              ? "Refine your search parameters or check another categories tab to locate specific activities."
              : "Once you create exam calendars, map routes, planning blocks, and trigger automations, Xena AI's persistent memory builds up here."
            }
          </p>

          {searchQuery && (
            <button 
              onClick={() => { setSearchQuery(''); setActiveTab('ALL'); }}
              className="mt-4 px-4 py-2 bg-white/5 hover:bg-white/10 text-xs font-mono text-white rounded-lg border border-white/10 cursor-pointer"
            >
              Reset Search & Filters
            </button>
          )}
        </motion.div>
      ) : (
        /* Activity Ledger List */
        <div className="space-y-3.5">
          {filteredActivities.map((act) => (
            <motion.div
              layoutId={`act-card-${act.id}`}
              key={act.id}
              className="bg-[#121620]/90 border border-nexa-border/80 hover:border-nexa-blue/40 rounded-2xl p-4 transition-all duration-300 relative shadow-[0_4px_25px_rgba(0,229,255,0.02)] hover:shadow-[0_0_20px_rgba(0,229,255,0.06)] group flex flex-col justify-between"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-3.5">
                  {/* Category Styled Icon Container */}
                  <div className={`p-2 rounded-xl border shrink-0 ${getBadgeStyleForType(act.type)}`}>
                    {getIconForType(act.type)}
                  </div>

                  <div>
                    {/* Header line with badge and date */}
                    <div className="flex items-center space-x-2">
                      <span className={`text-[8px] font-black tracking-widest font-mono border px-1.5 py-0.5 rounded uppercase ${getBadgeStyleForType(act.type)}`}>
                        {act.type.replace('_', ' ')}
                      </span>
                      <span className="text-[9px] text-gray-500 font-mono flex items-center">
                        <Clock className="w-2.5 h-2.5 text-gray-600 mr-1" />
                        {formatTime(act.timestamp || (act as any).created_at || '')}
                      </span>
                    </div>

                    {/* Title */}
                    <h3 className="text-xs font-bold text-white mt-1.5 tracking-tight group-hover:text-nexa-glow transition">
                      {act.title}
                    </h3>

                    {/* Description message */}
                    <p className="text-[10.5px] text-gray-300 mt-1 leading-relaxed">
                      {act.description}
                    </p>

                    {/* Extra context custom blocks */}
                    {act.type === 'STUDY' && act.metadata?.countdown_days && (
                      <div className="mt-3 bg-cyan-950/20 border border-cyan-500/10 rounded-xl p-2.5">
                        <div className="flex justify-between items-center text-[10px]">
                          <span className="text-gray-400">Exam Countdown:</span>
                          <span className="text-cyan-400 font-mono font-bold">{act.metadata.countdown_days} Days left</span>
                        </div>
                        <div className="mt-1.5 flex justify-between items-center text-[10px]">
                          <span className="text-gray-400">Study Progress:</span>
                          <span className="text-white font-mono">{act.metadata.progress || 35}% Done</span>
                        </div>
                        {/* Simulated visual progress bar */}
                        <div className="w-full bg-[#151A24] h-1 rounded-full overflow-hidden mt-1.5">
                          <div className="bg-cyan-400 h-full rounded-full" style={{ width: `${act.metadata.progress || 35}%` }}></div>
                        </div>
                      </div>
                    )}

                    {act.type === 'EVENT' && act.metadata?.location && (
                      <div className="mt-3 bg-purple-950/20 border border-purple-500/10 rounded-xl p-2.5 text-[10.5px] text-gray-300">
                        <div className="flex items-center text-purple-400 font-semibold mb-1">
                          📍 <span className="ml-1 uppercase tracking-wider font-mono text-[8px]">LOCATION DETAIL</span>
                        </div>
                        <div className="text-white font-medium">{act.metadata.location}</div>
                        {act.metadata.participants && (
                          <div className="mt-1 text-[9.5px] text-gray-400">
                            Participants: {act.metadata.participants.join(', ')}
                          </div>
                        )}
                      </div>
                    )}

                    {act.type === 'AI_ACTION' && act.metadata?.document_name && (
                      <div className="mt-3 bg-blue-950/20 border border-blue-500/10 rounded-xl p-2.5 text-[10.5px]">
                        <span className="text-gray-500 font-mono text-[8px] uppercase block">Hardware Action Executed</span>
                        <div className="mt-1 flex items-center space-x-1.5 font-bold text-white">
                          <span>📄</span>
                          <span className="text-nexa-glow font-mono">{act.metadata.document_name}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Status and Action dropdown/buttons */}
                <div className="flex flex-col items-end space-y-2.5 shrink-0 pl-2">
                  <span className="text-[9px] font-bold font-mono uppercase bg-emerald-400/10 text-emerald-400 border border-emerald-400/20 px-2 py-0.5 rounded-full flex items-center space-x-1">
                    <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full inline-block mr-1"></span>
                    {act.status}
                  </span>
                </div>
              </div>

              {/* Bottom Quick Row Actions */}
              <div className="mt-4 pt-2.5 border-t border-white/5 flex items-center justify-between">
                <span className="text-[8px] font-mono text-gray-500 uppercase">
                  RECORD ID: {act.id}
                </span>

                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => setSelectedActivity(act)}
                    className="text-[9.5px] font-bold font-mono uppercase text-gray-400 hover:text-white flex items-center space-x-1 cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>View Detail</span>
                  </button>
                  <span className="text-gray-700 text-xs select-none">•</span>
                  <button
                    onClick={(e) => handleDeleteActivity(act.id, e)}
                    className="text-[9.5px] font-bold font-mono uppercase text-red-400/80 hover:text-red-400 flex items-center space-x-1 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Detail Inspector Modal */}
      <AnimatePresence>
        {selectedActivity && (
          <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#111621] border border-nexa-border w-full max-w-md rounded-2xl overflow-hidden shadow-[0_0_50px_rgba(0,229,255,0.15)] flex flex-col max-h-[85vh]"
            >
              {/* Header */}
              <div className="bg-[#151A24] px-5 py-4 border-b border-nexa-border flex justify-between items-center shrink-0">
                <div className="flex items-center space-x-2">
                  <Sparkles className="w-4 h-4 text-nexa-glow" />
                  <h3 className="text-xs font-black text-white uppercase tracking-wider font-mono">Activity Metadata Inspector</h3>
                </div>
                <button
                  onClick={() => setSelectedActivity(null)}
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Scrollable Inspector Body */}
              <div className="p-5 overflow-y-auto custom-scrollbar space-y-4">
                
                {/* Details summary */}
                <div className="bg-black/30 border border-white/5 rounded-xl p-4 space-y-3.5">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-[8px] font-bold font-mono tracking-widest text-gray-500 uppercase">TITLE</span>
                      <h4 className="text-sm font-bold text-white mt-0.5">{selectedActivity.title}</h4>
                    </div>
                    <span className={`text-[8.5px] font-bold font-mono px-2 py-0.5 border rounded uppercase ${getBadgeStyleForType(selectedActivity.type)}`}>
                      {selectedActivity.type}
                    </span>
                  </div>

                  <div>
                    <span className="text-[8px] font-bold font-mono tracking-widest text-gray-500 uppercase">AI NOTIFICATION MSG</span>
                    <p className="text-xs text-gray-300 mt-1 leading-relaxed">{selectedActivity.description}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-1.5">
                    <div>
                      <span className="text-[8px] font-bold font-mono tracking-widest text-gray-500 uppercase">EXECUTION STATUS</span>
                      <span className="text-[10px] font-extrabold font-mono uppercase bg-emerald-400/10 text-emerald-400 border border-emerald-400/20 px-2 py-0.5 rounded-full flex items-center space-x-1.5 w-max mt-1">
                        <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full"></span>
                        <span>{selectedActivity.status}</span>
                      </span>
                    </div>

                    <div>
                      <span className="text-[8px] font-bold font-mono tracking-widest text-gray-500 uppercase">LEDGER TIMESTAMP</span>
                      <span className="text-[10px] font-mono text-gray-400 mt-1.5 block">
                        {formatTime(selectedActivity.timestamp || (selectedActivity as any).created_at || '')}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Raw Database Payload Schema representation */}
                <div>
                  <span className="text-[9px] font-bold font-mono text-gray-400 uppercase tracking-widest pl-1 mb-1.5 block">
                    RAW NOTIFICATION_HISTORY RECORD
                  </span>
                  <div className="bg-black/70 rounded-xl border border-nexa-border p-3.5 overflow-x-auto text-[10px] font-mono text-cyan-300 custom-scrollbar">
                    <pre>{JSON.stringify(selectedActivity, null, 2)}</pre>
                  </div>
                </div>

                {/* Developer Explanation of database integration */}
                <div className="bg-[#151A24]/60 border border-nexa-border/40 rounded-xl p-3.5 space-y-2 text-[10.5px] leading-relaxed">
                  <div className="flex items-center space-x-1.5 text-gray-400 font-bold uppercase tracking-wider font-mono text-[9px]">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <span>Database Schema Architecture</span>
                  </div>
                  <p className="text-gray-400">
                    This payload maps directly to the active PostgreSQL <code className="text-gray-200 bg-white/5 px-1 py-0.5 rounded font-mono">notification_history</code> table. Future sync pipelines automatically index user actions onto this structure.
                  </p>
                </div>

              </div>

              {/* Footer Actions */}
              <div className="bg-[#151A24] px-5 py-4 border-t border-nexa-border flex justify-between items-center shrink-0">
                <button
                  type="button"
                  onClick={async () => {
                    if (confirm('Delete this record now?')) {
                      try {
                        const res = await fetch(`/api/notification-history/${selectedActivity.id}`, { method: 'DELETE' });
                        if (res.ok) {
                          setActivities(prev => prev.filter(item => item.id !== selectedActivity.id));
                          setSelectedActivity(null);
                          triggerNotice("Activity record permanently deleted.");
                        }
                      } catch (e) {
                        console.error(e);
                      }
                    }
                  }}
                  className="px-4 py-2 bg-red-950/20 hover:bg-red-950/40 border border-red-500/20 text-red-400 text-xs font-semibold rounded-xl transition cursor-pointer"
                >
                  Delete Record
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedActivity(null)}
                  className="px-5 py-2.5 bg-gradient-to-r from-nexa-blue to-nexa-purple text-white text-xs font-bold uppercase tracking-wider rounded-xl transition shadow-lg cursor-pointer"
                >
                  Dismiss Inspector
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
