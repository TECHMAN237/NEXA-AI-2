import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ChevronLeft, Sparkles, Plus, RefreshCw, Trash2, Calendar, 
  Clock, AlertTriangle, BookOpen, User, CheckSquare, Bell, Volume2, AppWindow, FileText
} from 'lucide-react';
import { Plan, Task } from '../types.js';

interface PlanningViewProps {
  onBack: () => void;
  tasks: Task[];
  onTaskSaved: () => void;
}

export default function PlanningView({ onBack, tasks, onTaskSaved }: PlanningViewProps) {
  const [selectedDay, setSelectedDay] = useState('21'); // Default to Tue 21st May
  const [currentPlan, setCurrentPlan] = useState<Plan | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  
  // AI Day Description State
  const [customDayPrompt, setCustomDayPrompt] = useState('');

  // Manual Schedule Block State
  const [showAddManualBlockModal, setShowAddManualBlockModal] = useState(false);
  const [manualTitle, setManualTitle] = useState('');
  const [manualDescription, setManualDescription] = useState('');
  const [manualDate, setManualDate] = useState(`2025-05-21`);
  const [manualStartTime, setManualStartTime] = useState('09:00');
  const [manualEndTime, setManualEndTime] = useState('10:00');
  const [manualPriority, setManualPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [manualCategory, setManualCategory] = useState('Study');
  const [manualColor, setManualColor] = useState('blue');

  // Sync manual block date with selected day automatically
  useEffect(() => {
    setManualDate(`2025-05-${selectedDay}`);
  }, [selectedDay]);

  // New task form state
  const [taskTitle, setTaskTitle] = useState('');
  const [taskTime, setTaskTime] = useState('09:00');
  const [taskDuration, setTaskDuration] = useState('2');
  const [taskPriority, setTaskPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [taskReminderEnabled, setTaskReminderEnabled] = useState(true);
  const [manualReminderEnabled, setManualReminderEnabled] = useState(true);
  const [infoNotice, setInfoNotice] = useState<string | null>(null);

  // Automation states mapped by timeline item id
  const [automations, setAutomations] = useState<Record<string, { id: string; type: 'OPEN_APP' | 'OPEN_DOCUMENT'; app: string; document: string; enabled: boolean }>>({
    'time-1': { id: 'time-1', type: 'OPEN_DOCUMENT', app: 'PDF Reader', document: 'Computer Architecture Notes.pdf', enabled: true },
    'time-4': { id: 'time-4', type: 'OPEN_APP', app: 'Notes', document: 'Data Structures Outline', enabled: false }
  });

  // Modal / interactive builder for automations
  const [editingAutoId, setEditingAutoId] = useState<string | null>(null);
  const [editingAutoTitle, setEditingAutoTitle] = useState('');
  const [autoType, setAutoType] = useState<'OPEN_APP' | 'OPEN_DOCUMENT'>('OPEN_DOCUMENT');
  const [autoApp, setAutoApp] = useState('PDF Reader');
  const [autoDoc, setAutoDoc] = useState('CSC301 Study Syllabus.pdf');

  const handleToggleAutomation = (itemId: string) => {
    if (!automations[itemId]) return;
    setAutomations(prev => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        enabled: !prev[itemId].enabled
      }
    }));
    triggerNotice("Automation sync state altered on hardware matrix.");
  };

  const handleRemoveAutomation = (itemId: string) => {
    setAutomations(prev => {
      const copy = { ...prev };
      delete copy[itemId];
      return copy;
    });
    triggerNotice("AI device automation action removed.");
  };

  const handleEditAutomation = (itemId: string, itemTitle: string) => {
    const existing = automations[itemId];
    setEditingAutoId(itemId);
    setEditingAutoTitle(itemTitle);
    if (existing) {
      setAutoType(existing.type);
      setAutoApp(existing.app);
      setAutoDoc(existing.document);
    } else {
      setAutoType('OPEN_DOCUMENT');
      setAutoApp('PDF Reader');
      setAutoDoc('CSC301 Notes PDF');
    }
  };

  const handleSaveAutomation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAutoId) return;

    setAutomations(prev => ({
      ...prev,
      [editingAutoId]: {
        id: editingAutoId,
        type: autoType,
        app: autoApp,
        document: autoDoc,
        enabled: true
      }
    }));

    setEditingAutoId(null);
    triggerNotice(`Device automation saved for: ${editingAutoTitle}`);
  };

  const triggerNotice = (msg: string) => {
    setInfoNotice(msg);
    setTimeout(() => {
      setInfoNotice(null);
    }, 4000);
  };

  useEffect(() => {
    fetchActivePlan();
  }, [selectedDay]);

  const fetchActivePlan = async () => {
    try {
      const res = await fetch('/api/plans');
      if (res.ok) {
        const plans: Plan[] = await res.json();
        const targetDate = `2025-05-${selectedDay}`;
        const planForDay = plans.find(p => p.date === targetDate);
        if (planForDay) {
          setCurrentPlan(planForDay);
        } else {
          // If no generated plan, load a placeholder plan or let user generate
          setCurrentPlan(null);
        }
      }
    } catch (e) {
      console.error('Error fetching plans:', e);
    }
  };

  const calculateDuration = (start: string, end: string): string => {
    try {
      const [startH, startM] = start.split(':').map(Number);
      const [endH, endM] = end.split(':').map(Number);
      const diffMinutes = (endH * 60 + endM) - (startH * 60 + startM);
      if (diffMinutes <= 0) return '1h';
      if (diffMinutes % 60 === 0) {
        return `${diffMinutes / 60}h`;
      }
      return `${diffMinutes}m`;
    } catch {
      return '1h';
    }
  };

  const handleCreateManualBlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualTitle.trim()) return;

    const duration = calculateDuration(manualStartTime, manualEndTime);
    const newBlock = {
      id: `manual-${Date.now()}`,
      time: `${manualStartTime} - ${manualEndTime}`,
      title: manualTitle,
      duration,
      color: manualColor,
      description: manualDescription,
      priority: manualPriority,
      category: manualCategory,
      reminder_enabled: manualReminderEnabled
    };

    try {
      const targetDate = manualDate || `2025-05-${selectedDay}`;
      const resList = await fetch('/api/plans');
      let planForDay: Plan | null = null;
      if (resList.ok) {
        const plans: Plan[] = await resList.json();
        planForDay = plans.find(p => p.date === targetDate) || null;
      }

      if (planForDay) {
        const updatedTimeline = [...planForDay.timeline, newBlock];
        const res = await fetch(`/api/plans/${planForDay.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ timeline: updatedTimeline })
        });
        if (res.ok) {
          const updated = await res.json();
          if (targetDate === `2025-05-${selectedDay}`) {
            setCurrentPlan(updated);
          }
          triggerNotice("Manual planning block appended to schedule.");
        }
      } else {
        const res = await fetch('/api/plans', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            date: targetDate,
            timeline: [newBlock],
            suggestions: "Manually constructed daily plan timeline."
          })
        });
        if (res.ok) {
          const created = await res.json();
          if (targetDate === `2025-05-${selectedDay}`) {
            setCurrentPlan(created);
          }
          triggerNotice("Manual daily plan scheduled.");
        }
      }

      setShowAddManualBlockModal(false);
      setManualTitle('');
      setManualDescription('');
      setManualStartTime('09:00');
      setManualEndTime('10:00');
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteTimelineItem = async (itemId: string) => {
    if (!currentPlan) return;
    if (!confirm('Delete this schedule block?')) return;

    const updatedTimeline = currentPlan.timeline.filter(item => item.id !== itemId);
    
    try {
      const res = await fetch(`/api/plans/${currentPlan.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timeline: updatedTimeline })
      });
      if (res.ok) {
        const updated = await res.json();
        setCurrentPlan(updated);
        triggerNotice("Schedule block deleted.");
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleGeneratePlan = async () => {
    setIsGenerating(true);
    const targetDate = `2025-05-${selectedDay}`;

    try {
      const res = await fetch('/api/plans/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          date: targetDate,
          customPrompt: customDayPrompt 
        })
      });

      if (res.ok) {
        const newPlan = await res.json();
        setCurrentPlan(newPlan);
        setCustomDayPrompt('');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim()) return;

    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: taskTitle,
          date: `2025-05-${selectedDay}`,
          time: taskTime,
          duration_hours: Number(taskDuration),
          priority: taskPriority,
          status: 'pending',
          reminder_enabled: taskReminderEnabled
        })
      });

      if (res.ok) {
        onTaskSaved();
        setShowAddTaskModal(false);
        setTaskTitle('');
        // If there's an active plan, we can trigger re-generation or just reload
        handleGeneratePlan();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (confirm('Delete this task?')) {
      try {
        const res = await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
        if (res.ok) {
          onTaskSaved();
          handleGeneratePlan(); // Refresh timeline plan
        }
      } catch (e) {
        console.error(e);
      }
    }
  };

  const daysOfWeek = [
    { label: 'Mon', num: '20' },
    { label: 'Tue', num: '21' },
    { label: 'Wed', num: '22' },
    { label: 'Thu', num: '23' },
    { label: 'Fri', num: '24' },
    { label: 'Sat', num: '25' },
    { label: 'Sun', num: '26' }
  ];

  // Helper to color-code timeline items
  const getColorClass = (color?: string) => {
    switch (color) {
      case 'blue': return 'bg-blue-500/10 border-blue-500 text-blue-300';
      case 'purple': return 'bg-purple-500/10 border-purple-500 text-purple-300';
      case 'slate': return 'bg-slate-700/10 border-slate-600 text-slate-300';
      case 'teal': return 'bg-teal-500/10 border-teal-500 text-teal-300';
      case 'green': return 'bg-green-500/10 border-green-500 text-green-300';
      case 'orange': return 'bg-orange-500/10 border-orange-500 text-orange-300';
      default: return 'bg-indigo-500/10 border-indigo-500 text-indigo-300';
    }
  };

  return (
    <div id="planning-view" className="flex flex-col h-full bg-[#0B0E14] overflow-y-auto custom-scrollbar px-4 pt-4 pb-20">
      
      {/* Navigation Header */}
      <div className="flex items-center space-x-3 mb-4">
        <button 
          onClick={onBack}
          className="p-2 rounded-xl bg-nexa-card border border-nexa-border text-gray-400 hover:text-white transition cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-white font-display">Planning</h1>
          <p className="text-[10px] text-gray-500">Weekly Calendar Schedule & AI Blocks</p>
        </div>
      </div>

      {/* Floating Info Notice */}
      <AnimatePresence>
        {infoNotice && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mb-4 bg-nexa-blue/10 border border-nexa-blue/30 text-nexa-glow px-4.5 py-3 rounded-xl text-[11px] font-semibold flex items-center space-x-2.5 shadow-lg shadow-nexa-blue/5"
          >
            <span className="w-2 h-2 rounded-full bg-nexa-glow animate-ping flex-shrink-0"></span>
            <span>{infoNotice}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Date Strips (May 20 – May 26) */}
      <div className="flex justify-between bg-nexa-card/40 border border-nexa-border rounded-2xl p-2 mb-4">
        {daysOfWeek.map((d) => (
          <button
            key={d.num}
            onClick={() => setSelectedDay(d.num)}
            className={`flex flex-col items-center justify-center w-10 py-2.5 rounded-xl transition cursor-pointer ${
              selectedDay === d.num 
                ? 'bg-nexa-blue text-white shadow-lg shadow-nexa-blue/30 font-bold' 
                : 'text-gray-400 hover:bg-nexa-card/80 hover:text-white'
            }`}
          >
            <span className="text-[9px] uppercase font-semibold">{d.label}</span>
            <span className="text-xs mt-1">{d.num}</span>
          </button>
        ))}
      </div>

      {/* Interactive Timeline Schedule Header */}
      <div className="flex justify-between items-center mb-3">
        <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Timeline</h2>
        <span className="text-[10px] text-gray-500 font-semibold font-mono">May {selectedDay}, 2025</span>
      </div>

      {/* Timeline List */}
      <div className="space-y-3 mb-6 relative">
        {isGenerating ? (
          /* Apple-Style Skeleton Loaders */
          <div className="space-y-3 py-4">
            {[1, 2, 3].map((n) => (
              <div key={n} className="flex space-x-3 animate-pulse">
                <div className="w-12 h-4 bg-gray-800 rounded mt-2"></div>
                <div className="flex-1 h-14 bg-gray-800/50 rounded-xl border border-gray-800"></div>
              </div>
            ))}
            <div className="text-center text-xs text-nexa-glow font-semibold mt-2 animate-bounce">
              NEXA AI is building your optimized timeline blocks...
            </div>
          </div>
        ) : currentPlan ? (
          currentPlan.timeline.map((item) => (
            <div key={item.id} className="flex space-x-3 items-start group">
              {/* Left Time label */}
              <div className="w-16 pt-2 flex flex-col justify-center text-right">
                <span className="text-[10px] font-semibold text-gray-400 font-mono tracking-tighter">
                  {item.time.split(' ')[0]}
                </span>
                <span className="text-[8px] text-gray-600 font-mono tracking-widest uppercase">
                  {item.duration}
                </span>
              </div>

              {/* Connected line visual dot */}
              <div className="relative flex flex-col items-center self-stretch justify-center">
                <div className="w-2 h-2 rounded-full bg-nexa-blue mt-3.5 z-10 shadow-[0_0_8px_#2979FF]"></div>
                <div className="w-0.5 flex-1 bg-nexa-border absolute top-5 -bottom-5"></div>
              </div>

              {/* Right Content Block Card */}
              <div className={`flex-1 border rounded-2xl p-3.5 transition group-hover:border-gray-500 relative ${getColorClass(item.color)}`}>
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-xs font-semibold text-white tracking-tight">{item.title}</h3>
                    {item.description && (
                      <p className="text-[10px] text-gray-400 mt-1 font-medium">{item.description}</p>
                    )}
                    {item.category && (
                      <span className="inline-block mt-1.5 px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[8px] font-bold uppercase tracking-wider text-gray-300">
                        {item.category}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center space-x-1.5">
                    <span className="text-[8px] font-mono tracking-widest opacity-60 uppercase">{item.time}</span>
                    <button
                      type="button"
                      onClick={() => handleDeleteTimelineItem(item.id)}
                      className="text-gray-500 hover:text-red-400 p-1 rounded transition cursor-pointer"
                      title="Delete Block"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* AI Automation Action Block */}
                {(() => {
                  const auto = automations[item.id];
                  return (
                    <div className="mt-3 pt-2.5 border-t border-white/10 flex flex-col space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-1 text-[9.5px] text-nexa-glow font-bold uppercase tracking-wider font-mono">
                          <Sparkles className="w-3 h-3 text-nexa-glow animate-pulse" />
                          <span>AI Automation Action</span>
                        </div>
                        {/* Mini Toggle Switch */}
                        {auto && (
                          <button
                            type="button"
                            onClick={() => handleToggleAutomation(item.id)}
                            className={`w-7 h-4 rounded-full p-0.5 transition-colors duration-200 cursor-pointer flex items-center ${
                              auto.enabled ? 'bg-cyan-400' : 'bg-gray-700'
                            }`}
                          >
                            <div className={`w-3 h-3 rounded-full bg-white shadow transition-transform duration-200 transform ${
                              auto.enabled ? 'translate-x-3' : 'translate-x-0'
                            }`}></div>
                          </button>
                        )}
                      </div>

                      {auto ? (
                        <div className="bg-black/30 border border-white/5 rounded-xl p-2 text-[10px] text-gray-300">
                          <div className="font-mono text-[8px] text-gray-500 uppercase">At scheduled time:</div>
                          <div className="mt-1 flex items-center space-x-1 font-medium text-[10.5px]">
                            <span className="text-gray-400">{auto.type === 'OPEN_DOCUMENT' ? '📄' : '📱'}</span>
                            <span className="text-white">Open {auto.type === 'OPEN_DOCUMENT' ? 'document' : 'app'}:</span>
                            <span className="text-nexa-glow font-semibold truncate max-w-[120px]">{auto.type === 'OPEN_DOCUMENT' ? auto.document : auto.app}</span>
                          </div>
                          
                          <div className="mt-2 flex items-center justify-end space-x-2 border-t border-white/5 pt-1.5">
                            <button
                              type="button"
                              onClick={() => handleEditAutomation(item.id, item.title)}
                              className="text-[8.5px] font-bold text-gray-400 hover:text-white uppercase tracking-widest cursor-pointer hover:underline"
                            >
                              Edit Action
                            </button>
                            <span className="text-gray-700 text-[8px]">•</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveAutomation(item.id)}
                              className="text-[8.5px] font-bold text-red-400 hover:text-red-300 uppercase tracking-widest cursor-pointer hover:underline"
                            >
                              Remove Action
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleEditAutomation(item.id, item.title)}
                          className="text-left w-full bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl py-1.5 px-3.5 text-[9.5px] text-gray-400 font-semibold flex items-center justify-between transition cursor-pointer"
                        >
                          <span>No automation action linked. Configure?</span>
                          <Plus className="w-2.5 h-2.5 text-cyan-400" />
                        </button>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-10 bg-nexa-card/30 border border-nexa-border border-dashed rounded-2xl p-6 text-gray-500">
            <Calendar className="w-8 h-8 text-gray-600 mx-auto mb-2" />
            <p className="text-xs">No schedule generated for this day.</p>
            <p className="text-[10px] text-gray-600 mt-1">Tap the Generate button below for customized NEXA AI scheduling blocks.</p>
          </div>
        )}
      </div>

      {/* AI Suggestions Box (Screen 4 Layout) */}
      {currentPlan?.suggestions && (
        <div className="mb-4 bg-[#111621] border border-nexa-border rounded-2xl p-4">
          <div className="flex items-center space-x-1.5 mb-1.5">
            <Sparkles className="w-3.5 h-3.5 text-nexa-glow animate-pulse" />
            <span className="text-[10px] font-bold text-nexa-glow uppercase tracking-wider">AI Suggestions</span>
          </div>
          <p className="text-xs text-gray-300 leading-relaxed font-medium">
            {currentPlan.suggestions}
          </p>
        </div>
      )}

      {/* AI Planning Generator Custom Day Description Input */}
      <div className="mb-4 bg-nexa-card/40 border border-nexa-border rounded-2xl p-4">
        <div className="flex items-center space-x-1.5 mb-2.5">
          <Sparkles className="w-3.5 h-3.5 text-nexa-blue" />
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">AI Day Scheduler</span>
        </div>
        <textarea
          rows={3}
          placeholder='Describe your day (e.g., "I have a class from 8am to 10am, and then I want to study for 2 hours in the afternoon. Can you schedule my day?")'
          value={customDayPrompt}
          onChange={(e) => setCustomDayPrompt(e.target.value)}
          className="w-full bg-[#0B0E14] text-xs text-white border border-nexa-border rounded-xl px-3.5 py-2.5 focus:outline-none focus:border-nexa-blue placeholder:text-gray-600 resize-none font-medium leading-relaxed"
        />
      </div>

      {/* Timeline Quick Operations Toolbar */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <button 
          onClick={() => setShowAddTaskModal(true)}
          className="bg-nexa-card hover:bg-nexa-card/80 border border-nexa-border hover:border-gray-700 rounded-xl py-3 px-2 text-[10px] font-bold text-gray-300 flex items-center justify-center space-x-1.5 cursor-pointer transition"
        >
          <Plus className="w-3.5 h-3.5 text-nexa-blue" />
          <span>Add Task (List)</span>
        </button>
        <button 
          onClick={() => setShowAddManualBlockModal(true)}
          className="bg-nexa-card hover:bg-nexa-card/80 border border-nexa-border hover:border-gray-700 rounded-xl py-3 px-2 text-[10px] font-bold text-gray-300 flex items-center justify-center space-x-1.5 cursor-pointer transition"
        >
          <Plus className="w-3.5 h-3.5 text-nexa-purple" />
          <span>Add Block (Manual Plan)</span>
        </button>
      </div>

      {/* Generate Planning Gradient Trigger Button */}
      <motion.button
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        onClick={handleGeneratePlan}
        className="w-full py-3.5 rounded-xl bg-gradient-to-r from-nexa-blue to-nexa-purple text-white text-xs font-bold tracking-wider uppercase shadow-lg cursor-pointer flex items-center justify-center space-x-1.5 hover:brightness-110 transition"
      >
        <Sparkles className="w-4 h-4" />
        <span>Generate Planning</span>
      </motion.button>

      {/* Inline Form Modal for Adding Tasks */}
      <AnimatePresence>
        {editingAutoId && (
          <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center px-4 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-nexa-card border border-nexa-border w-full max-w-sm rounded-2xl p-5 shadow-[0_0_50px_rgba(0,229,255,0.15)]"
            >
              <div className="flex items-center space-x-2 mb-2">
                <Sparkles className="w-4 h-4 text-nexa-glow" />
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">Configure AI Action</h3>
              </div>
              <p className="text-[10px] text-gray-400 mb-4">Set automatic hardware level actions for task: <span className="text-white font-semibold">"{editingAutoTitle}"</span></p>
              
              <form onSubmit={handleSaveAutomation} className="space-y-4">
                <div>
                  <label className="block text-[9.5px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 font-mono">Action Type</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setAutoType('OPEN_DOCUMENT')}
                      className={`py-2 px-3 text-xs font-semibold rounded-xl border transition-all cursor-pointer text-center ${
                        autoType === 'OPEN_DOCUMENT' 
                          ? 'bg-amber-500/10 border-amber-500 text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.2)]' 
                          : 'bg-[#151A24] border-nexa-border text-gray-400 hover:border-gray-700'
                      }`}
                    >
                      📄 Open Document
                    </button>
                    <button
                      type="button"
                      onClick={() => setAutoType('OPEN_APP')}
                      className={`py-2 px-3 text-xs font-semibold rounded-xl border transition-all cursor-pointer text-center ${
                        autoType === 'OPEN_APP' 
                          ? 'bg-blue-500/10 border-blue-500 text-blue-400 shadow-[0_0_12px_rgba(59,130,246,0.2)]' 
                          : 'bg-[#151A24] border-nexa-border text-gray-400 hover:border-gray-700'
                      }`}
                    >
                      📱 Open App
                    </button>
                  </div>
                </div>

                {autoType === 'OPEN_APP' ? (
                  <div>
                    <label className="block text-[9.5px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 font-mono">Target App</label>
                    <select 
                      value={autoApp} 
                      onChange={(e) => setAutoApp(e.target.value)}
                      className="w-full bg-[#0B0E14] text-xs text-white border border-nexa-border rounded-xl px-3 py-2.5 focus:outline-none focus:border-nexa-blue cursor-pointer"
                    >
                      <option value="PDF Reader">PDF Reader</option>
                      <option value="Calendar">Calendar</option>
                      <option value="Notes">Notes</option>
                      <option value="Browser">Browser</option>
                      <option value="YouTube">YouTube</option>
                      <option value="Google Drive">Google Drive</option>
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="block text-[9.5px] font-bold text-gray-400 uppercase tracking-widest mb-1.5 font-mono">Select Document / File</label>
                    <select 
                      value={autoDoc} 
                      onChange={(e) => setAutoDoc(e.target.value)}
                      className="w-full bg-[#0B0E14] text-xs text-white border border-nexa-border rounded-xl px-3 py-2.5 focus:outline-none focus:border-nexa-blue cursor-pointer"
                    >
                      <option value="CSC301 Notes PDF">CSC301 Notes PDF</option>
                      <option value="Computer Architecture Syllabus.pdf">Computer Architecture Syllabus.pdf</option>
                      <option value="Advanced Microcontrollers Chapter 4.pdf">Advanced Microcontrollers Chapter 4.pdf</option>
                      <option value="Project Milestones Checklist.xlsx">Project Milestones Checklist.xlsx</option>
                    </select>
                  </div>
                )}

                <div className="flex space-x-2 pt-2 justify-end">
                  <button 
                    type="button" 
                    onClick={() => setEditingAutoId(null)}
                    className="bg-transparent text-gray-400 hover:text-white text-xs px-4 py-2 uppercase tracking-wider font-semibold font-mono"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className="bg-gradient-to-r from-nexa-blue to-nexa-purple text-white text-xs font-bold uppercase tracking-wider px-5 py-2.5 rounded-xl shadow-lg cursor-pointer"
                  >
                    Set Trigger
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Inline Form Modal for Adding Tasks */}
      <AnimatePresence>
        {showAddTaskModal && (
          <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center px-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-nexa-card border border-nexa-border w-full max-w-sm rounded-2xl p-5"
            >
              <h3 className="text-sm font-semibold text-white mb-4">Add Schedule Task</h3>
              <form onSubmit={handleAddTask} className="space-y-3">
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Task Title</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Revision Chapter 5"
                    value={taskTitle}
                    onChange={(e) => setTaskTitle(e.target.value)}
                    className="w-full bg-[#0B0E14] text-xs text-white border border-nexa-border rounded-xl px-3 py-2.5 focus:outline-none focus:border-nexa-blue"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Start Time</label>
                    <input 
                      type="time" 
                      value={taskTime}
                      onChange={(e) => setTaskTime(e.target.value)}
                      className="w-full bg-[#0B0E14] text-xs text-white border border-nexa-border rounded-xl px-3 py-2 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Duration (Hours)</label>
                    <input 
                      type="number" 
                      min="1" 
                      max="12"
                      value={taskDuration}
                      onChange={(e) => setTaskDuration(e.target.value)}
                      className="w-full bg-[#0B0E14] text-xs text-white border border-nexa-border rounded-xl px-3 py-2 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Priority</label>
                  <select 
                    value={taskPriority} 
                    onChange={(e) => setTaskPriority(e.target.value as any)}
                    className="w-full bg-[#0B0E14] text-xs text-white border border-nexa-border rounded-xl px-3 py-2.5"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>

                <div className="flex items-center justify-between bg-[#0B0E14] border border-nexa-border rounded-xl px-3.5 py-2.5">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Set Reminder Alert</span>
                  <button
                    type="button"
                    onClick={() => setTaskReminderEnabled(!taskReminderEnabled)}
                    className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-250 cursor-pointer flex items-center ${
                      taskReminderEnabled ? 'bg-nexa-blue' : 'bg-gray-800'
                    }`}
                  >
                    <div className={`w-3.5 h-3.5 rounded-full bg-white shadow transition-transform duration-250 transform ${
                      taskReminderEnabled ? 'translate-x-4' : 'translate-x-0'
                    }`}></div>
                  </button>
                </div>

                <div className="flex space-x-2 pt-2 justify-end">
                  <button 
                    type="button" 
                    onClick={() => setShowAddTaskModal(false)}
                    className="bg-transparent text-gray-400 hover:text-white text-xs px-4 py-2"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className="bg-nexa-blue text-white text-xs font-semibold px-4 py-2 rounded-lg"
                  >
                    Add Block
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Manual Planning Block Modal */}
      <AnimatePresence>
        {showAddManualBlockModal && (
          <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center px-4 overflow-y-auto py-10">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-nexa-card border border-nexa-border w-full max-w-sm rounded-2xl p-5 my-auto"
            >
              <div className="flex items-center space-x-2 mb-3">
                <Calendar className="w-4 h-4 text-nexa-purple" />
                <h3 className="text-sm font-semibold text-white">Create Planning Manually</h3>
              </div>
              <form onSubmit={handleCreateManualBlock} className="space-y-3.5">
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Title <span className="text-red-500">*</span></label>
                  <input 
                    type="text" 
                    placeholder="e.g. Advanced Microcontrollers Lab"
                    value={manualTitle}
                    onChange={(e) => setManualTitle(e.target.value)}
                    className="w-full bg-[#0B0E14] text-xs text-white border border-nexa-border rounded-xl px-3 py-2.5 focus:outline-none focus:border-nexa-purple"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Description <span className="text-gray-600 font-normal">(optional)</span></label>
                  <textarea 
                    placeholder="Describe specific tasks or notes..."
                    value={manualDescription}
                    onChange={(e) => setManualDescription(e.target.value)}
                    rows={2}
                    className="w-full bg-[#0B0E14] text-xs text-white border border-nexa-border rounded-xl px-3 py-2 focus:outline-none focus:border-nexa-purple resize-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Date <span className="text-red-500">*</span></label>
                    <input 
                      type="date" 
                      value={manualDate}
                      onChange={(e) => setManualDate(e.target.value)}
                      className="w-full bg-[#0B0E14] text-xs text-white border border-nexa-border rounded-xl px-2.5 py-2 focus:outline-none focus:border-nexa-purple"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Priority <span className="text-red-500">*</span></label>
                    <select 
                      value={manualPriority} 
                      onChange={(e) => setManualPriority(e.target.value as any)}
                      className="w-full bg-[#0B0E14] text-xs text-white border border-nexa-border rounded-xl px-2.5 py-2.5 focus:outline-none focus:border-nexa-purple cursor-pointer"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Start Time <span className="text-red-500">*</span></label>
                    <input 
                      type="time" 
                      value={manualStartTime}
                      onChange={(e) => setManualStartTime(e.target.value)}
                      className="w-full bg-[#0B0E14] text-xs text-white border border-nexa-border rounded-xl px-3 py-2 focus:outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">End Time <span className="text-red-500">*</span></label>
                    <input 
                      type="time" 
                      value={manualEndTime}
                      onChange={(e) => setManualEndTime(e.target.value)}
                      className="w-full bg-[#0B0E14] text-xs text-white border border-nexa-border rounded-xl px-3 py-2 focus:outline-none"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Category <span className="text-red-500">*</span></label>
                  <select 
                    value={manualCategory} 
                    onChange={(e) => setManualCategory(e.target.value)}
                    className="w-full bg-[#0B0E14] text-xs text-white border border-nexa-border rounded-xl px-3 py-2.5 focus:outline-none focus:border-nexa-purple cursor-pointer"
                  >
                    <option value="Study">Study</option>
                    <option value="Work">Work</option>
                    <option value="Personal">Personal</option>
                    <option value="Leisure">Leisure</option>
                    <option value="Health">Health</option>
                    <option value="General">General</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Color Label <span className="text-red-500">*</span></label>
                  <div className="flex items-center space-x-2.5">
                    {['blue', 'purple', 'slate', 'teal', 'green', 'orange'].map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setManualColor(c)}
                        className={`w-6 h-6 rounded-full border transition relative flex items-center justify-center cursor-pointer ${
                          c === 'blue' ? 'bg-blue-500/30 border-blue-500' :
                          c === 'purple' ? 'bg-purple-500/30 border-purple-500' :
                          c === 'slate' ? 'bg-slate-500/30 border-slate-400' :
                          c === 'teal' ? 'bg-teal-500/30 border-teal-500' :
                          c === 'green' ? 'bg-green-500/30 border-green-500' :
                          'bg-orange-500/30 border-orange-500'
                        } ${manualColor === c ? 'ring-2 ring-white scale-110' : 'hover:scale-105'}`}
                      >
                        {manualColor === c && <div className="w-1.5 h-1.5 rounded-full bg-white"></div>}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between bg-[#0B0E14] border border-nexa-border rounded-xl px-3.5 py-3">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Set Reminder Alert</span>
                  <button
                    type="button"
                    onClick={() => setManualReminderEnabled(!manualReminderEnabled)}
                    className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-250 cursor-pointer flex items-center ${
                      manualReminderEnabled ? 'bg-nexa-purple' : 'bg-gray-800'
                    }`}
                  >
                    <div className={`w-3.5 h-3.5 rounded-full bg-white shadow transition-transform duration-250 transform ${
                      manualReminderEnabled ? 'translate-x-4' : 'translate-x-0'
                    }`}></div>
                  </button>
                </div>

                <div className="flex space-x-2 pt-3 justify-end">
                  <button 
                    type="button" 
                    onClick={() => setShowAddManualBlockModal(false)}
                    className="bg-transparent text-gray-400 hover:text-white text-xs px-4 py-2 font-semibold font-mono uppercase tracking-wider"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className="bg-gradient-to-r from-nexa-blue to-nexa-purple text-white text-xs font-bold uppercase tracking-wider px-5 py-2.5 rounded-xl shadow-lg cursor-pointer"
                  >
                    Add Block
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
