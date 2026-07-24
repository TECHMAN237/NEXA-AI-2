import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Bell, Clock, BookOpen, Calendar, Trash2, Edit2, CheckCircle2, 
  ToggleLeft, ToggleRight, AlertTriangle, Sparkles, AlertCircle,
  Eye, Activity, FileText, Check, X, Play, Volume2, RefreshCw,
  SlidersHorizontal, Search, Settings, ChevronRight, CornerDownRight
} from 'lucide-react';
import { Reminder, Task, Exam, Event as NexaEvent } from '../types.js';
import { ProfileService } from '../services/ProfileService.js';

interface MyItemsViewProps {
  reminders: Reminder[];
  tasks: Task[];
  exams: Exam[];
  events: NexaEvent[];
  onRefreshData: () => void;
  onEditReminder?: (reminder: Reminder) => void;
  playAlertSound?: (soundName: string) => void;
  setActiveTriggeredReminder?: (reminder: Reminder) => void;
}

type TabType = 'reminders' | 'planning' | 'study' | 'events';

export default function MyItemsView({ 
  reminders = [], 
  tasks = [], 
  exams = [], 
  events = [], 
  onRefreshData,
  onEditReminder,
  playAlertSound,
  setActiveTriggeredReminder
}: MyItemsViewProps) {
  const [activeTab, setActiveTab] = useState<TabType>('reminders');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ type: TabType; id: string; title: string } | null>(null);

  useEffect(() => {
    if (feedback) {
      const timer = setTimeout(() => {
        setFeedback(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [feedback]);

  const [devModeEnabled, setDevModeEnabled] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      const enabled = await ProfileService.isDevModeEnabled();
      setDevModeEnabled(enabled);
    };
    loadSettings();
  }, []);

  // Searching, Filtering & Sorting States
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'low' | 'medium' | 'high'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'pending' | 'archived'>('all');
  const [sortBy, setSortBy] = useState<'upcoming' | 'newest' | 'oldest' | 'priority' | 'alphabetical'>('upcoming');

  // Interactive Details Modal State
  const [selectedItem, setSelectedItem] = useState<{ type: TabType; data: any } | null>(null);
  const [itemHistory, setItemHistory] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isEditingDetails, setIsEditingDetails] = useState(false);

  // Unified form fields for both Inline & Modal Editing
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editPriority, setEditPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [editRepeat, setEditRepeat] = useState<'none' | 'daily' | 'weekly' | 'monthly'>('none');
  const [editCategory, setEditCategory] = useState('General');
  
  // Module-specific edit fields
  const [editLocation, setEditLocation] = useState('');
  const [editDurationHours, setEditDurationHours] = useState(1);
  const [editProgress, setEditProgress] = useState(0);
  const [editChapters, setEditChapters] = useState(1);
  const [editStudyHours, setEditStudyHours] = useState(1);
  const [editParticipants, setEditParticipants] = useState('');
  const [editReminderTime, setEditReminderTime] = useState('30 minutes before');

  // Alarm and TTS settings
  const [editSoundEnabled, setEditSoundEnabled] = useState(true);
  const [editSoundName, setEditSoundName] = useState('default');
  const [editVoiceNotification, setEditVoiceNotification] = useState(false);
  const [editVoiceName, setEditVoiceName] = useState('default');
  const [editVoiceSpeed, setEditVoiceSpeed] = useState(1.0);

  // Automatically fetch history whenever an item details modal is opened
  useEffect(() => {
    if (selectedItem) {
      fetchItemHistory(selectedItem.data.id);
    } else {
      setItemHistory([]);
      setIsEditingDetails(false);
    }
  }, [selectedItem]);

  const handleTriggerMockNotification = () => {
    const mockReminder: Reminder = {
      id: `mock-notif-${Date.now()}`,
      user_id: 'dev-user',
      title: '🔔 Developer Mode Test Alarm',
      description: 'This is a test notification overlay triggered manually from Developer Mode.',
      date: new Date().toISOString().split('T')[0],
      time: '12:00',
      priority: 'high',
      repeat: 'none',
      category: 'General',
      active: true,
      sound_enabled: true,
      sound_name: 'default',
      voice_notification: false,
      status: 'triggered',
      created_at: new Date().toISOString()
    };
    if (playAlertSound) playAlertSound('default');
    if (setActiveTriggeredReminder) setActiveTriggeredReminder(mockReminder);
  };

  const handleTriggerMockVoice = () => {
    try {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance("Hello! This is a manual voice reminder test triggered from NEXA Developer Mode.");
        utterance.rate = 1.0;
        window.speechSynthesis.speak(utterance);
      } else {
        alert("Speech synthesis is not supported in this browser.");
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Helper helper to format log entries
  const logActivityLedger = async (type: string, title: string, description: string, sourceId: string, metadata: any = {}) => {
    try {
      await fetch('/api/notification-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          title,
          description,
          source_id: sourceId,
          status: 'completed',
          metadata
        })
      });
    } catch (e) {
      console.error('Failed to log activity ledger:', e);
    }
  };

  const startDelete = (type: TabType, id: string, title: string) => {
    setDeleteTarget({ type, id, title });
  };

  const executeDelete = async () => {
    if (!deleteTarget) return;
    const { type, id, title } = deleteTarget;
    setIsSaving(true);

    let endpoint = '';
    if (type === 'reminders') endpoint = `/api/reminders/${id}`;
    else if (type === 'planning') endpoint = `/api/tasks/${id}`;
    else if (type === 'study') endpoint = `/api/exams/${id}`;
    else if (type === 'events') endpoint = `/api/events/${id}`;

    try {
      const res = await fetch(endpoint, { method: 'DELETE' });
      if (res.ok) {
        // Log delete ledger history before wiping
        await logActivityLedger(
          type.toUpperCase(),
          `Item Deleted`,
          `User deleted item "${title}"`,
          id
        );

        if (selectedItem?.data.id === id) {
          setSelectedItem(null);
        }
        setEditingId(null);
        setFeedback({ type: 'success', message: `Successfully deleted "${title}"` });
        onRefreshData();
      } else {
        setFeedback({ type: 'error', message: 'Failed to delete item. Please try again.' });
      }
    } catch (e) {
      console.error('Delete error:', e);
      setFeedback({ type: 'error', message: 'An error occurred during deletion.' });
    } finally {
      setIsSaving(false);
      setDeleteTarget(null);
    }
  };

  // Helper to determine if item is active
  const isItemActive = (item: any) => {
    return item.active !== false;
  };

  const handleToggleActive = async (type: TabType, item: any) => {
    const currentActive = isItemActive(item);
    const nextActive = !currentActive;
    let endpoint = '';
    if (type === 'reminders') endpoint = `/api/reminders/${item.id}`;
    else if (type === 'planning') endpoint = `/api/tasks/${item.id}`;
    else if (type === 'study') endpoint = `/api/exams/${item.id}`;
    else if (type === 'events') endpoint = `/api/events/${item.id}`;

    try {
      const res = await fetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: nextActive })
      });
      if (res.ok) {
        // Log switch toggle action
        await logActivityLedger(
          type.toUpperCase(),
          `Active state: ${nextActive ? 'ON' : 'OFF'}`,
          `Item "${item.title || item.course}" active toggle switched.`,
          item.id,
          { active: nextActive }
        );

        onRefreshData();
        // Dynamically update opened modal state
        if (selectedItem?.data.id === item.id) {
          setSelectedItem(prev => prev ? { ...prev, data: { ...prev.data, active: nextActive } } : null);
        }
      }
    } catch (e) {
      console.error('Toggle active error:', e);
    }
  };

  const handleLifecycleAction = async (reminderId: string, action: 'trigger' | 'complete' | 'cancel') => {
    try {
      const res = await fetch(`/api/reminders/${reminderId}/${action}`, {
        method: 'PUT'
      });
      if (res.ok) {
        onRefreshData();
        if (selectedItem?.data.id === reminderId) {
          const updated = await res.json();
          setSelectedItem(prev => prev ? { ...prev, data: updated.reminder || prev.data } : null);
          fetchItemHistory(reminderId);
        }
      }
    } catch (e) {
      console.error(`Error on reminder lifecycle action (${action}):`, e);
    }
  };

  const fetchItemHistory = async (id: string) => {
    setIsLoadingHistory(true);
    try {
      const res = await fetch('/api/notification-history');
      if (res.ok) {
        const logs = await res.json();
        const filtered = logs.filter((log: any) => log.source_id === id);
        setItemHistory(filtered);
      }
    } catch (e) {
      console.error('Error fetching activity ledger logs:', e);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const openDetails = (type: TabType, item: any) => {
    setSelectedItem({ type, data: item });
  };

  const handleToggleTaskStatus = async (task: Task) => {
    const nextStatus = task.status === 'completed' ? 'pending' : 'completed';
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus })
      });
      if (res.ok) {
        await logActivityLedger(
          'PLANNING',
          `Task Shifted`,
          `Task objective marked ${nextStatus}`,
          task.id,
          { status: nextStatus }
        );
        onRefreshData();
        if (selectedItem?.data.id === task.id) {
          setSelectedItem(prev => prev ? { ...prev, data: { ...prev.data, status: nextStatus } } : null);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const startEdit = (item: any) => {
    setEditingId(item.id);
    setEditTitle(item.title || item.course || '');
    setEditDescription(item.description || '');
    setEditDate(item.date || item.exam_date || '');
    setEditTime(item.time || item.preferred_study_time || '12:00');
    setEditPriority(item.priority || item.difficulty || 'medium');
    setEditRepeat(item.repeat || 'none');
    setEditCategory(item.category || 'General');

    // Module-specific inputs
    setEditLocation(item.location || '');
    setEditDurationHours(item.duration_hours || 1);
    setEditProgress(item.progress || 0);
    setEditChapters(item.remaining_chapters || 1);
    setEditStudyHours(item.study_hours_per_day || 1);
    setEditParticipants(item.participants ? item.participants.join(', ') : '');
    setEditReminderTime(item.reminder_time || '30 minutes before');

    // Sound alert inputs
    setEditSoundEnabled(item.sound_enabled !== false);
    setEditSoundName(item.sound_name || 'default');
    setEditVoiceNotification(item.voice_notification || false);
    setEditVoiceName(item.voice_name || 'default');
    setEditVoiceSpeed(item.voice_speed || 1.0);
  };

  const saveEdit = async (type: TabType, id: string) => {
    setIsSaving(true);
    let endpoint = '';
    let payload: any = {
      updated_at: new Date().toISOString()
    };

    if (type === 'reminders') {
      endpoint = `/api/reminders/${id}`;
      payload = {
        ...payload,
        title: editTitle,
        description: editDescription,
        date: editDate,
        time: editTime,
        priority: editPriority,
        repeat: editRepeat,
        category: editCategory,
        sound_enabled: editSoundEnabled,
        sound_name: editSoundName,
        voice_notification: editVoiceNotification,
        voice_name: editVoiceName,
        voice_speed: Number(editVoiceSpeed)
      };
    } else if (type === 'planning') {
      endpoint = `/api/tasks/${id}`;
      payload = {
        ...payload,
        title: editTitle,
        date: editDate,
        time: editTime,
        priority: editPriority,
        duration_hours: Number(editDurationHours)
      };
    } else if (type === 'study') {
      endpoint = `/api/exams/${id}`;
      payload = {
        ...payload,
        course: editTitle,
        exam_date: editDate,
        preferred_study_time: editTime,
        difficulty: editPriority,
        study_hours_per_day: Number(editStudyHours),
        remaining_chapters: Number(editChapters),
        progress: Number(editProgress)
      };
    } else if (type === 'events') {
      endpoint = `/api/events/${id}`;
      const parsedParticipants = editParticipants ? editParticipants.split(',').map(p => p.trim()).filter(Boolean) : [];
      payload = {
        ...payload,
        title: editTitle,
        description: editDescription,
        date: editDate,
        time: editTime,
        location: editLocation,
        reminder_time: editReminderTime,
        participants: parsedParticipants
      };
    }

    try {
      const res = await fetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const updatedData = await res.json();
        
        await logActivityLedger(
          type.toUpperCase(),
          `Item Modified`,
          `Updated details and timings for "${editTitle}"`,
          id,
          payload
        );

        setEditingId(null);
        setIsEditingDetails(false);
        setFeedback({ type: 'success', message: `Successfully updated "${editTitle}"` });
        onRefreshData();

        // If details modal is currently open, refresh its data too
        if (selectedItem?.data.id === id) {
          // Some backend endpoints wrap updated object inside a key, e.g. { reminder: {...} } or return direct item
          const freshItem = updatedData.reminder || updatedData.task || updatedData.exam || updatedData.event || updatedData;
          setSelectedItem({ type, data: { ...selectedItem.data, ...freshItem } });
        }
      } else {
        setFeedback({ type: 'error', message: 'Failed to save changes. Please try again.' });
      }
    } catch (e) {
      console.error('Save edit error:', e);
      setFeedback({ type: 'error', message: 'An error occurred while saving.' });
    } finally {
      setIsSaving(false);
    }
  };

  const getPriorityColor = (priority?: string) => {
    if (priority === 'high') return 'text-red-400 bg-red-400/10 border-red-500/20';
    if (priority === 'medium') return 'text-amber-400 bg-amber-400/10 border-amber-500/20';
    return 'text-green-400 bg-green-400/10 border-green-500/20';
  };

  const getStatusBadge = (type: TabType, item: any) => {
    if (type === 'reminders') {
      const s = item.status || 'scheduled';
      if (s === 'completed') return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
      if (s === 'triggered') return 'text-red-400 bg-red-500/10 border-red-500/20 animate-pulse';
      if (s === 'cancelled') return 'text-gray-400 bg-gray-800/50 border-gray-700/30';
      return 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20';
    }
    if (type === 'planning') {
      const s = item.status || 'pending';
      if (s === 'completed') return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
      if (s === 'in_progress') return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
      return 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20';
    }
    if (type === 'study') {
      if (item.progress >= 100) return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
      return 'text-blue-400 bg-blue-500/10 border-blue-500/20';
    }
    if (type === 'events') {
      const isPast = new Date(`${item.date}T${item.time || '00:00'}`) < new Date();
      if (isPast) return 'text-gray-400 bg-gray-800/50 border-gray-700/30';
      return 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20';
    }
    return 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20';
  };

  const getCategoryIcon = (category?: string) => {
    const c = category || 'General';
    switch (c) {
      case 'Study': return '🎓';
      case 'Planning': return '⏱️';
      case 'Event': return '📍';
      case 'Personal': return '👤';
      case 'Health': return '🍎';
      default: return '⏰';
    }
  };

  const getCategoryGradient = (category?: string) => {
    const c = category || 'General';
    switch (c) {
      case 'Study': return 'from-purple-500/20 to-indigo-500/10 border-purple-500/35';
      case 'Planning': return 'from-amber-500/20 to-orange-500/10 border-amber-500/35';
      case 'Event': return 'from-emerald-500/20 to-teal-500/10 border-emerald-500/35';
      case 'Personal': return 'from-pink-500/20 to-rose-500/10 border-pink-500/35';
      case 'Health': return 'from-red-500/20 to-rose-500/10 border-red-500/35';
      default: return 'from-cyan-500/20 to-blue-500/10 border-cyan-500/35';
    }
  };

  // Status and Search filter mapping helper
  const matchesFilters = (type: TabType, item: any) => {
    // 1. Search Query filter (matches Title, Category, Keyword)
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const title = (item.title || item.course || '').toLowerCase();
      const desc = (item.description || '').toLowerCase();
      const cat = (item.category || '').toLowerCase();
      const loc = (item.location || '').toLowerCase();
      
      const titleMatch = title.includes(q);
      const categoryMatch = cat.includes(q);
      const keywordMatch = desc.includes(q) || loc.includes(q) || String(item.priority || item.difficulty || '').toLowerCase().includes(q);
      
      if (!titleMatch && !categoryMatch && !keywordMatch) {
        return false;
      }
    }

    // 2. Status Filter mapping
    if (statusFilter !== 'all') {
      if (type === 'reminders') {
        const s = item.status || 'scheduled';
        if (statusFilter === 'completed' && s !== 'completed') return false;
        if (statusFilter === 'pending' && (s === 'completed' || s === 'archived' || s === 'cancelled')) return false;
        if (statusFilter === 'archived' && s !== 'archived' && s !== 'cancelled') return false;
      } else if (type === 'planning') {
        const s = item.status || 'pending';
        if (statusFilter === 'completed' && s !== 'completed') return false;
        if (statusFilter === 'pending' && s === 'completed') return false;
        if (statusFilter === 'archived') return false; // planning tasks don't have explicit archiving
      } else if (type === 'study') {
        const completed = item.progress >= 100 || item.status === 'completed';
        if (statusFilter === 'completed' && !completed) return false;
        if (statusFilter === 'pending' && completed) return false;
        if (statusFilter === 'archived' && item.status !== 'archived') return false;
      } else if (type === 'events') {
        const isPast = new Date(`${item.date}T${item.time || '00:00'}`) < new Date();
        if (statusFilter === 'completed' && !isPast) return false;
        if (statusFilter === 'pending' && isPast) return false;
        if (statusFilter === 'archived' && item.status !== 'archived') return false;
      }
    }

    // 3. Priority Filter mapping
    if (priorityFilter !== 'all') {
      const itemP = item.priority || item.difficulty || 'medium';
      if (itemP !== priorityFilter) return false;
    }

    return true;
  };

  const getSortedItems = (type: TabType, list: any[]) => {
    return [...list].sort((a, b) => {
      if (sortBy === 'newest') {
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return dateB - dateA;
      }
      if (sortBy === 'oldest') {
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return dateA - dateB;
      }
      if (sortBy === 'priority') {
        const pMap = { high: 3, medium: 2, low: 1 };
        const pA = a.priority || a.difficulty || 'low';
        const pB = b.priority || b.difficulty || 'low';
        return (pMap[pB as keyof typeof pMap] || 0) - (pMap[pA as keyof typeof pMap] || 0);
      }
      if (sortBy === 'alphabetical') {
        const tA = a.title || a.course || '';
        const tB = b.title || b.course || '';
        return tA.localeCompare(tB);
      }
      // default: 'upcoming' (closest future scheduled items first)
      const getComparableString = (x: any) => {
        const d = x.date || x.exam_date || '9999-12-31';
        const t = x.time || (x.preferred_study_time ? x.preferred_study_time.split(' - ')[0] : '00:00');
        return `${d}T${t}`;
      };
      return getComparableString(a).localeCompare(getComparableString(b));
    });
  };

  // Filter and sort each array
  const processedReminders = getSortedItems('reminders', reminders.filter(r => matchesFilters('reminders', r)));
  const processedTasks = getSortedItems('planning', tasks.filter(t => matchesFilters('planning', t)));
  const processedExams = getSortedItems('study', exams.filter(ex => matchesFilters('study', ex)));
  const processedEvents = getSortedItems('events', events.filter(ev => matchesFilters('events', ev)));

  const tabs: { id: TabType; label: string; icon: any }[] = [
    { id: 'reminders', label: 'Reminders', icon: Bell },
    { id: 'planning', label: 'Planning', icon: Clock },
    { id: 'study', label: 'Study Tracking', icon: BookOpen },
    { id: 'events', label: 'Events', icon: Calendar }
  ];

  return (
    <div id="my-items-view" className="flex flex-col h-full bg-[#0B0E14] overflow-y-auto custom-scrollbar px-4 pt-4 pb-20">
      
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white font-display">My Items</h1>
          <p className="text-xs text-gray-400 mt-1">Manage and audit everything scheduled in Organizer</p>
        </div>
        {/* Subtle Developer Mode Toggle Button */}
        <button 
          onClick={async () => {
            const nextVal = !devModeEnabled;
            setDevModeEnabled(nextVal);
            await ProfileService.setDevModeEnabled(nextVal);
          }}
          className={`px-2.5 py-1 rounded-lg text-[9px] font-mono uppercase font-bold tracking-tight border transition flex items-center space-x-1 cursor-pointer ${
            devModeEnabled 
              ? 'bg-amber-500/10 border-amber-500 text-amber-500' 
              : 'bg-[#151A24] border-nexa-border text-gray-500 hover:text-white'
          }`}
        >
          <span>Dev Mode</span>
          <span className={`w-1.5 h-1.5 rounded-full ${devModeEnabled ? 'bg-amber-500 animate-pulse' : 'bg-gray-600'}`}></span>
        </button>
      </div>

      {/* Tabs Header */}
      <div className="flex space-x-1.5 p-1 bg-nexa-card/40 border border-nexa-border rounded-xl mb-5">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setEditingId(null);
              }}
              className={`flex-1 flex items-center justify-center space-x-1.5 py-2.5 rounded-lg text-[10px] font-bold tracking-tight uppercase transition cursor-pointer ${
                activeTab === tab.id 
                  ? 'bg-nexa-blue text-white shadow-md' 
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* SEARCH, STATUS FILTERS & SORTING (Available on all tabs consistently) */}
      <div className="bg-nexa-card/40 border border-nexa-border rounded-xl p-3 mb-4 space-y-2.5">
        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder={`Search ${activeTab === 'study' ? 'study plans' : activeTab} by title, description or keyword...`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#151A24] text-xs text-white border border-nexa-border rounded-xl pl-9 pr-4 py-2.5 focus:outline-none focus:border-nexa-blue"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-3 top-2.5 text-gray-500 hover:text-white text-xs">
              ✕
            </button>
          )}
        </div>

        {/* Filter Badges and Sorting */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1 border-t border-white/5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center space-x-1">
              <SlidersHorizontal className="w-3 h-3 text-gray-500" />
              <span className="text-[9px] text-gray-500 font-bold uppercase tracking-wider">Status:</span>
            </div>
            <div className="flex space-x-1">
              {(['all', 'completed', 'pending', 'archived'] as const).map((status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border transition ${
                    statusFilter === status
                      ? 'bg-nexa-blue/15 border-nexa-blue text-nexa-glow'
                      : 'bg-transparent border-transparent text-gray-400 hover:text-white'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>

            {/* Priority Filter */}
            <div className="flex items-center space-x-1 border-l border-white/5 pl-2">
              <span className="text-[9px] text-gray-500 font-bold uppercase tracking-wider">Priority:</span>
            </div>
            <div className="flex space-x-1">
              {(['all', 'high', 'medium', 'low'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setPriorityFilter(p)}
                  className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase border transition ${
                    priorityFilter === p
                      ? 'bg-nexa-blue/15 border-nexa-blue text-nexa-glow'
                      : 'bg-transparent border-transparent text-gray-400 hover:text-white'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center space-x-1 text-[10px]">
            <span className="text-gray-500 font-bold uppercase tracking-wider">Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-[#151A24] text-[10px] text-white border border-nexa-border rounded px-1.5 py-0.5 focus:outline-none cursor-pointer font-bold uppercase"
            >
              <option value="upcoming">Upcoming</option>
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="priority">Priority</option>
              <option value="alphabetical">Alphabetical</option>
            </select>
          </div>
        </div>
      </div>

      {/* Content Lists */}
      <div className="space-y-3.5">
        <AnimatePresence mode="wait">
          
          {/* 1. REMINDERS MODULE */}
          {activeTab === 'reminders' && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-3"
            >
              {/* DEVELOPER TESTING PANEL */}
              {(process.env.NODE_ENV === 'development' || devModeEnabled) && (
                <div className="bg-amber-500/10 border-2 border-amber-500/30 rounded-2xl p-4 mb-2 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-xl"></div>
                  <div className="flex items-center space-x-2 text-amber-500 mb-1.5">
                    <SlidersHorizontal className="w-4 h-4 animate-pulse" />
                    <span className="text-xs font-bold uppercase tracking-wider font-mono">Developer Testing panel (Gated)</span>
                  </div>
                  <p className="text-[10px] text-gray-400 mb-3.5 leading-relaxed">
                    Testing tools for vocal reminder alarms and speech synthesis. These controls are omitted in Production mode.
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={handleTriggerMockNotification}
                      className="px-3.5 py-2.5 bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/40 hover:border-amber-500 text-amber-300 rounded-xl text-[10px] font-bold uppercase tracking-wider transition cursor-pointer flex items-center justify-center space-x-1.5"
                    >
                      <Bell className="w-3.5 h-3.5" />
                      <span>Trigger Notification</span>
                    </button>
                    <button
                      onClick={handleTriggerMockVoice}
                      className="px-3.5 py-2.5 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/40 hover:border-purple-500 text-purple-300 rounded-xl text-[10px] font-bold uppercase tracking-wider transition cursor-pointer flex items-center justify-center space-x-1.5"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                      <span>Trigger Voice Reminder</span>
                    </button>
                  </div>
                </div>
              )}

              {reminders.length === 0 ? (
                <div className="text-center py-12 bg-nexa-card/20 border border-dashed border-nexa-border rounded-2xl p-6">
                  <Bell className="w-8 h-8 text-gray-600 mx-auto mb-2" />
                  <p className="text-xs text-gray-400 font-medium">No active reminders found.</p>
                  <p className="text-[10px] text-gray-500 mt-1">Navigate to the Organizer to create your first vocal reminder alert!</p>
                </div>
              ) : processedReminders.length === 0 ? (
                <div className="text-center py-10 text-gray-500 text-xs">No reminders match your filter selections.</div>
              ) : (
                processedReminders.map((r) => (
                  <div 
                    key={r.id} 
                    className={`bg-nexa-card border border-nexa-border/80 rounded-2xl p-4 flex flex-col justify-between transition hover:border-nexa-blue/35 relative overflow-hidden group ${
                      !isItemActive(r) ? 'opacity-50' : ''
                    }`}
                  >
                    {editingId === r.id ? (
                      <div className="space-y-3">
                        <div className="text-xs font-bold text-nexa-glow font-mono mb-1">EDITING REMINDER</div>
                        <div className="space-y-2">
                          <input 
                            type="text" 
                            value={editTitle} 
                            onChange={e => setEditTitle(e.target.value)} 
                            placeholder="Reminder Title"
                            className="w-full bg-[#0B0E14] text-xs text-white border border-nexa-border rounded-lg p-2.5" 
                          />
                          <textarea 
                            value={editDescription} 
                            onChange={e => setEditDescription(e.target.value)} 
                            placeholder="Custom Description"
                            className="w-full bg-[#0B0E14] text-xs text-white border border-nexa-border rounded-lg p-2.5 h-16" 
                          />
                          <div className="grid grid-cols-2 gap-2">
                            <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} className="bg-[#0B0E14] text-xs text-white border border-nexa-border rounded-lg p-2.5" />
                            <input type="time" value={editTime} onChange={e => setEditTime(e.target.value)} className="bg-[#0B0E14] text-xs text-white border border-nexa-border rounded-lg p-2.5" />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <select 
                              value={editPriority} 
                              onChange={e => setEditPriority(e.target.value as any)} 
                              className="bg-[#0B0E14] text-xs text-white border border-nexa-border rounded-lg p-2.5"
                            >
                              <option value="low">Low Priority</option>
                              <option value="medium">Medium Priority</option>
                              <option value="high">High Priority</option>
                            </select>
                            <select 
                              value={editRepeat} 
                              onChange={e => setEditRepeat(e.target.value as any)} 
                              className="bg-[#0B0E14] text-xs text-white border border-nexa-border rounded-lg p-2.5"
                            >
                              <option value="none">No Repeat</option>
                              <option value="daily">Daily</option>
                              <option value="weekly">Weekly</option>
                              <option value="monthly">Monthly</option>
                            </select>
                          </div>
                        </div>
                        <div className="flex justify-end space-x-2 pt-2 border-t border-white/5">
                          <button 
                            onClick={() => setEditingId(null)} 
                            className="text-xs text-gray-400 hover:text-white px-3 py-1.5 cursor-pointer transition"
                          >
                            Cancel
                          </button>
                          <button 
                            onClick={() => saveEdit('reminders', r.id)} 
                            disabled={isSaving}
                            className="text-xs bg-nexa-blue hover:bg-nexa-blue/80 disabled:bg-nexa-blue/40 text-white px-4 py-1.5 rounded-lg font-bold cursor-pointer transition flex items-center justify-center space-x-1.5"
                          >
                            {isSaving && <RefreshCw className="w-3 h-3 animate-spin mr-1" />}
                            <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start space-x-3">
                            <button 
                              onClick={() => handleToggleActive('reminders', r)} 
                              className="mt-0.5 cursor-pointer flex-shrink-0"
                              title={isItemActive(r) ? "Disable reminder" : "Enable reminder"}
                            >
                              {isItemActive(r) ? <ToggleRight className="w-6 h-6 text-nexa-blue" /> : <ToggleLeft className="w-6 h-6 text-gray-600" />}
                            </button>

                            <div>
                              <div className="flex items-center space-x-2">
                                <span className={`text-xs px-1.5 py-0.5 rounded border flex items-center space-x-1 font-mono uppercase text-[9px] ${getCategoryGradient(r.category)}`}>
                                  <span>{getCategoryIcon(r.category)}</span>
                                  <span>{r.category || 'General'}</span>
                                </span>
                                
                                <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border uppercase ${getStatusBadge('reminders', r)}`}>
                                  {r.status || 'scheduled'}
                                </span>
                              </div>

                              <h3 className={`text-xs font-semibold mt-2 ${isItemActive(r) ? 'text-white' : 'text-gray-500 line-through'}`}>{r.title}</h3>
                              {r.description && (
                                <p className="text-[10px] text-gray-400 mt-1 line-clamp-1 max-w-[340px] font-medium italic">
                                  "{r.description}"
                                </p>
                              )}
                              
                              <p className="text-[10px] text-gray-400 mt-1 font-mono flex items-center space-x-1">
                                <Clock className="w-3 h-3 text-cyan-400" />
                                <span>{r.date} at {r.time} {r.repeat !== 'none' && `(repeating ${r.repeat})`}</span>
                              </p>
                            </div>
                          </div>

                          {/* Item Card Actions */}
                          <div className="flex items-center space-x-1.5 flex-shrink-0">
                            <button 
                              onClick={() => openDetails('reminders', r)}
                              className="p-1.5 rounded-lg bg-[#141C26] text-cyan-400 hover:bg-[#1A2534] hover:text-white transition cursor-pointer"
                              title="Audit Ledger History"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>

                            <button 
                              onClick={() => { startEdit(r); }} 
                              className="p-1.5 rounded-lg bg-[#141C26] text-gray-400 hover:bg-[#1A2534] hover:text-white transition cursor-pointer"
                              title="Edit reminder settings"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            
                            <button 
                              onClick={() => startDelete('reminders', r.id, r.title)} 
                              className="p-1.5 rounded-lg bg-red-950/20 text-red-400 hover:bg-red-950 hover:text-white transition cursor-pointer"
                              title="Delete reminder"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Extra indicators footer */}
                        <div className="flex items-center justify-between pt-2 border-t border-white/5 text-[9px] font-mono text-gray-500">
                          <div className="flex items-center space-x-2.5">
                            <span className={r.sound_enabled !== false ? 'text-cyan-400' : 'text-gray-600'}>
                              🔊 {r.sound_enabled !== false ? (r.sound_name || 'default') : 'muted'}
                            </span>
                            <span>•</span>
                            <span className={r.voice_notification ? 'text-purple-400' : 'text-gray-600'}>
                              🗣️ voice {r.voice_notification ? 'enabled' : 'disabled'}
                            </span>
                          </div>

                          <div className="flex items-center space-x-1">
                            {r.status === 'scheduled' && isItemActive(r) && (
                              <button
                                onClick={() => handleLifecycleAction(r.id, 'trigger')}
                                className="px-2 py-0.5 rounded bg-cyan-950/40 border border-cyan-500/20 hover:border-cyan-400 text-cyan-300 text-[8px] font-bold uppercase tracking-wider transition cursor-pointer"
                              >
                                Simulate Alarm ⚡
                              </button>
                            )}
                            {r.status === 'triggered' && (
                              <button
                                onClick={() => handleLifecycleAction(r.id, 'complete')}
                                className="px-2 py-0.5 rounded bg-emerald-950/40 border border-emerald-500/20 hover:border-emerald-400 text-emerald-300 text-[8px] font-bold uppercase tracking-wider transition cursor-pointer"
                              >
                                Mark Complete ✓
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </motion.div>
          )}

          {/* 2. PLANNING MODULE */}
          {activeTab === 'planning' && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-3"
            >
              {tasks.length === 0 ? (
                <div className="text-center py-12 bg-nexa-card/20 border border-dashed border-nexa-border rounded-2xl p-6">
                  <Clock className="w-8 h-8 text-gray-600 mx-auto mb-2" />
                  <p className="text-xs text-gray-400 font-medium">No planning tasks. Generate a timeline in Planning!</p>
                </div>
              ) : processedTasks.length === 0 ? (
                <div className="text-center py-10 text-gray-500 text-xs">No tasks match your filter selections.</div>
              ) : (
                processedTasks.map((t) => (
                  <div 
                    key={t.id} 
                    className={`bg-nexa-card border border-nexa-border/85 rounded-2xl p-4 flex flex-col justify-between hover:border-nexa-blue/35 transition ${
                      !isItemActive(t) ? 'opacity-50' : ''
                    }`}
                  >
                    {editingId === t.id ? (
                      <div className="space-y-3">
                        <div className="text-xs font-bold text-nexa-glow font-mono mb-1">EDITING TASK</div>
                        <div className="space-y-2 w-full">
                          <input 
                            type="text" 
                            value={editTitle} 
                            onChange={e => setEditTitle(e.target.value)} 
                            className="w-full bg-[#0B0E14] text-xs text-white border border-nexa-border rounded-lg p-2.5" 
                            placeholder="Task title"
                          />
                          <div className="grid grid-cols-2 gap-2">
                            <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} className="bg-[#0B0E14] text-xs text-white border border-nexa-border rounded-lg p-2.5" />
                            <input type="time" value={editTime} onChange={e => setEditTime(e.target.value)} className="bg-[#0B0E14] text-xs text-white border border-nexa-border rounded-lg p-2.5" />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <input 
                              type="number" 
                              value={editDurationHours} 
                              onChange={e => setEditDurationHours(Number(e.target.value))} 
                              className="bg-[#0B0E14] text-xs text-white border border-nexa-border rounded-lg p-2.5" 
                              placeholder="Duration hours"
                            />
                            <select 
                              value={editPriority} 
                              onChange={e => setEditPriority(e.target.value as any)} 
                              className="bg-[#0B0E14] text-xs text-white border border-nexa-border rounded-lg p-2.5"
                            >
                              <option value="low">Low Priority</option>
                              <option value="medium">Medium Priority</option>
                              <option value="high">High Priority</option>
                            </select>
                          </div>
                        </div>
                        <div className="flex justify-end space-x-2 pt-2 border-t border-white/5">
                          <button 
                            onClick={() => setEditingId(null)} 
                            className="text-xs text-gray-400 hover:text-white px-3 py-1.5 cursor-pointer transition"
                          >
                            Cancel
                          </button>
                          <button 
                            onClick={() => saveEdit('planning', t.id)} 
                            disabled={isSaving}
                            className="text-xs bg-nexa-blue hover:bg-nexa-blue/80 disabled:bg-nexa-blue/40 text-white px-4 py-1.5 rounded-lg font-bold cursor-pointer transition flex items-center justify-center space-x-1.5"
                          >
                            {isSaving && <RefreshCw className="w-3 h-3 animate-spin mr-1" />}
                            <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex justify-between items-start w-full">
                          <div className="flex items-start space-x-3">
                            {/* Toggle active switch */}
                            <button 
                              onClick={() => handleToggleActive('planning', t)} 
                              className="mt-0.5 cursor-pointer flex-shrink-0"
                              title={isItemActive(t) ? "Disable task" : "Enable task"}
                            >
                              {isItemActive(t) ? <ToggleRight className="w-6 h-6 text-nexa-blue" /> : <ToggleLeft className="w-6 h-6 text-gray-600" />}
                            </button>

                            {/* Mark complete status circle */}
                            <button 
                              onClick={() => handleToggleTaskStatus(t)} 
                              className="text-gray-500 hover:text-nexa-glow cursor-pointer mt-1"
                              title={t.status === 'completed' ? "Mark Pending" : "Mark Completed"}
                            >
                              <CheckCircle2 className={`w-5 h-5 ${t.status === 'completed' ? 'text-green-500 fill-green-500/10' : 'text-gray-600'}`} />
                            </button>

                            <div>
                              <div className="flex items-center space-x-2">
                                <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border uppercase ${getStatusBadge('planning', t)}`}>
                                  {t.status || 'pending'}
                                </span>
                                <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border uppercase ${getPriorityColor(t.priority)}`}>
                                  {t.priority}
                                </span>
                              </div>
                              <h3 className={`text-xs font-semibold mt-2 ${t.status === 'completed' ? 'text-gray-500 line-through' : 'text-white'}`}>{t.title}</h3>
                              <p className="text-[10px] text-gray-400 font-mono mt-1 flex items-center space-x-1">
                                <Clock className="w-3 h-3 text-cyan-400" />
                                <span>{t.date} at {t.time} ({t.duration_hours}h block duration)</span>
                              </p>
                            </div>
                          </div>

                          {/* Quick Actions */}
                          <div className="flex items-center space-x-1.5 flex-shrink-0">
                            <button 
                              onClick={() => openDetails('planning', t)}
                              className="p-1.5 rounded-lg bg-[#141C26] text-cyan-400 hover:bg-[#1A2534] hover:text-white transition cursor-pointer"
                              title="Audit Ledger History"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>

                            <button 
                              onClick={() => startEdit(t)} 
                              className="p-1.5 rounded-lg bg-[#141C26] text-gray-400 hover:bg-[#1A2534] hover:text-white transition cursor-pointer"
                              title="Edit task settings"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button 
                              onClick={() => startDelete('planning', t.id, t.title)} 
                              className="p-1.5 rounded-lg bg-red-950/20 text-red-400 hover:bg-red-950 hover:text-white transition cursor-pointer"
                              title="Delete planning task"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </motion.div>
          )}

          {/* 3. STUDY TRACKING MODULE */}
          {activeTab === 'study' && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-3"
            >
              {exams.length === 0 ? (
                <div className="text-center py-12 bg-nexa-card/20 border border-dashed border-nexa-border rounded-2xl p-6">
                  <BookOpen className="w-8 h-8 text-gray-600 mx-auto mb-2" />
                  <p className="text-xs text-gray-400 font-medium">No active exam logs. Set up exam tracking in Organizer!</p>
                </div>
              ) : processedExams.length === 0 ? (
                <div className="text-center py-10 text-gray-500 text-xs">No exams match your filter selections.</div>
              ) : (
                processedExams.map((ex) => (
                  <div 
                    key={ex.id} 
                    className={`bg-nexa-card border border-nexa-border/85 rounded-2xl p-4 space-y-3.5 hover:border-nexa-blue/35 transition ${
                      !isItemActive(ex) ? 'opacity-50' : ''
                    }`}
                  >
                    {editingId === ex.id ? (
                      <div className="space-y-3">
                        <div className="text-xs font-bold text-nexa-glow font-mono mb-1">EDITING EXAM STUDY PLAN</div>
                        <div className="space-y-2 w-full">
                          <input 
                            type="text" 
                            value={editTitle} 
                            onChange={e => setEditTitle(e.target.value)} 
                            className="w-full bg-[#0B0E14] text-xs text-white border border-nexa-border rounded-lg p-2.5" 
                            placeholder="Exam course name"
                          />
                          <div className="grid grid-cols-2 gap-2">
                            <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} className="bg-[#0B0E14] text-xs text-white border border-nexa-border rounded-lg p-2.5" />
                            <input type="text" value={editTime} onChange={e => setEditTime(e.target.value)} className="bg-[#0B0E14] text-xs text-white border border-nexa-border rounded-lg p-2.5" placeholder="e.g. 20:00 - 23:00" />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <input 
                              type="number" 
                              value={editStudyHours} 
                              onChange={e => setEditStudyHours(Number(e.target.value))} 
                              className="bg-[#0B0E14] text-xs text-white border border-nexa-border rounded-lg p-2.5" 
                              placeholder="Study Hours / Day"
                            />
                            <select 
                              value={editPriority} 
                              onChange={e => setEditPriority(e.target.value as any)} 
                              className="bg-[#0B0E14] text-xs text-white border border-nexa-border rounded-lg p-2.5"
                            >
                              <option value="low">Low Difficulty</option>
                              <option value="medium">Medium Difficulty</option>
                              <option value="high">High Difficulty</option>
                            </select>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <input 
                              type="number" 
                              value={editChapters} 
                              onChange={e => setEditChapters(Number(e.target.value))} 
                              className="bg-[#0B0E14] text-xs text-white border border-nexa-border rounded-lg p-2.5" 
                              placeholder="Chapters left"
                            />
                            <input 
                              type="number" 
                              value={editProgress} 
                              onChange={e => setEditProgress(Number(e.target.value))} 
                              className="bg-[#0B0E14] text-xs text-white border border-nexa-border rounded-lg p-2.5" 
                              placeholder="Progress percentage"
                            />
                          </div>
                        </div>
                        <div className="flex justify-end space-x-2 pt-2 border-t border-white/5">
                          <button 
                            onClick={() => setEditingId(null)} 
                            className="text-xs text-gray-400 hover:text-white px-3 py-1.5 cursor-pointer transition"
                          >
                            Cancel
                          </button>
                          <button 
                            onClick={() => saveEdit('study', ex.id)} 
                            disabled={isSaving}
                            className="text-xs bg-nexa-blue hover:bg-nexa-blue/80 disabled:bg-nexa-blue/40 text-white px-4 py-1.5 rounded-lg font-bold cursor-pointer transition flex items-center justify-center space-x-1.5"
                          >
                            {isSaving && <RefreshCw className="w-3 h-3 animate-spin mr-1" />}
                            <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex justify-between items-start">
                          <div className="flex items-start space-x-3">
                            {/* Toggle active switch */}
                            <button 
                              onClick={() => handleToggleActive('study', ex)} 
                              className="mt-0.5 cursor-pointer flex-shrink-0"
                              title={isItemActive(ex) ? "Disable study alerts" : "Enable study alerts"}
                            >
                              {isItemActive(ex) ? <ToggleRight className="w-6 h-6 text-nexa-blue" /> : <ToggleLeft className="w-6 h-6 text-gray-600" />}
                            </button>

                            <div>
                              <div className="flex items-center space-x-2">
                                <span className="text-[8px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">Exam Tracker</span>
                                <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border uppercase ${getPriorityColor(ex.difficulty)}`}>
                                  {ex.difficulty} difficulty
                                </span>
                              </div>
                              <h3 className="text-sm font-semibold text-white mt-1.5">{ex.course}</h3>
                              <p className="text-[10px] text-gray-400 font-mono mt-0.5">📅 Exam date: {ex.exam_date}</p>
                            </div>
                          </div>

                          {/* Quick Actions */}
                          <div className="flex items-center space-x-1.5 flex-shrink-0">
                            <button 
                              onClick={() => openDetails('study', ex)}
                              className="p-1.5 rounded-lg bg-[#141C26] text-cyan-400 hover:bg-[#1A2534] hover:text-white transition cursor-pointer"
                              title="Audit Ledger History"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>

                            <button 
                              onClick={() => startEdit(ex)} 
                              className="p-1.5 rounded-lg bg-[#141C26] text-gray-400 hover:bg-[#1A2534] hover:text-white transition cursor-pointer"
                              title="Edit exam study details"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>

                            <button 
                              onClick={() => startDelete('study', ex.id, ex.course)} 
                              className="p-1.5 rounded-lg bg-red-950/20 text-red-400 hover:bg-red-950 hover:text-white transition cursor-pointer"
                              title="Delete tracking exam"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Progress details */}
                        <div className="bg-[#0B0E14] border border-nexa-border/60 rounded-xl p-3 grid grid-cols-2 gap-2">
                          <div>
                            <span className="text-[8px] text-gray-500 uppercase font-bold block">Study Commitment</span>
                            <span className="text-xs text-white font-semibold mt-0.5 block">{ex.study_hours_per_day} Hours Daily</span>
                          </div>
                          <div>
                            <span className="text-[8px] text-gray-500 uppercase font-bold block">Preference Slot</span>
                            <span className="text-xs text-white font-semibold mt-0.5 block">{ex.preferred_study_time || 'N/A'}</span>
                          </div>
                          <div className="col-span-2 pt-2.5 border-t border-nexa-border/45">
                            <div className="flex justify-between text-[10px] text-gray-400 mb-1.5">
                              <span>Preparation progress: {ex.remaining_chapters} chapters left</span>
                              <span className="text-nexa-glow font-bold">{ex.progress || 0}%</span>
                            </div>
                            <div className="w-full bg-[#161D2B] rounded-full h-1.5 overflow-hidden">
                              <div 
                                className="bg-nexa-blue h-full rounded-full transition-all duration-300" 
                                style={{ width: `${Math.min(100, Math.max(0, ex.progress || 0))}%` }}
                              ></div>
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                ))
              )}
            </motion.div>
          )}

          {/* 4. EVENTS MODULE */}
          {activeTab === 'events' && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-3"
            >
              {events.length === 0 ? (
                <div className="text-center py-12 bg-nexa-card/20 border border-dashed border-nexa-border rounded-2xl p-6">
                  <Calendar className="w-8 h-8 text-gray-600 mx-auto mb-2" />
                  <p className="text-xs text-gray-400 font-medium">No scheduled events. Create an event in Organizer!</p>
                </div>
              ) : processedEvents.length === 0 ? (
                <div className="text-center py-10 text-gray-500 text-xs">No events match your filter selections.</div>
              ) : (
                processedEvents.map((ev) => (
                  <div 
                    key={ev.id} 
                    className={`bg-nexa-card border border-nexa-border/85 rounded-2xl p-4 flex flex-col justify-between hover:border-nexa-blue/35 transition ${
                      !isItemActive(ev) ? 'opacity-50' : ''
                    }`}
                  >
                    {editingId === ev.id ? (
                      <div className="space-y-3">
                        <div className="text-xs font-bold text-nexa-glow font-mono mb-1">EDITING EVENT</div>
                        <div className="space-y-2 w-full">
                          <input 
                            type="text" 
                            value={editTitle} 
                            onChange={e => setEditTitle(e.target.value)} 
                            className="w-full bg-[#0B0E14] text-xs text-white border border-nexa-border rounded-lg p-2.5" 
                            placeholder="Event title"
                          />
                          <textarea 
                            value={editDescription} 
                            onChange={e => setEditDescription(e.target.value)} 
                            className="w-full bg-[#0B0E14] text-xs text-white border border-nexa-border rounded-lg p-2.5 h-16" 
                            placeholder="Event description"
                          />
                          <div className="grid grid-cols-2 gap-2">
                            <input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} className="bg-[#0B0E14] text-xs text-white border border-nexa-border rounded-lg p-2.5" />
                            <input type="time" value={editTime} onChange={e => setEditTime(e.target.value)} className="bg-[#0B0E14] text-xs text-white border border-nexa-border rounded-lg p-2.5" />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <input 
                              type="text" 
                              value={editLocation} 
                              onChange={e => setEditLocation(e.target.value)} 
                              className="bg-[#0B0E14] text-xs text-white border border-nexa-border rounded-lg p-2.5" 
                              placeholder="Location (e.g. Room 402, Zoom)"
                            />
                            <input 
                              type="text" 
                              value={editReminderTime} 
                              onChange={e => setEditReminderTime(e.target.value)} 
                              className="bg-[#0B0E14] text-xs text-white border border-nexa-border rounded-lg p-2.5" 
                              placeholder="Reminder (e.g. 30 minutes before)"
                            />
                          </div>
                          <input 
                            type="text" 
                            value={editParticipants} 
                            onChange={e => setEditParticipants(e.target.value)} 
                            className="w-full bg-[#0B0E14] text-xs text-white border border-nexa-border rounded-lg p-2.5" 
                            placeholder="Participants/Attendees (comma-separated)"
                          />
                        </div>
                        <div className="flex justify-end space-x-2 pt-2 border-t border-white/5">
                          <button 
                            onClick={() => setEditingId(null)} 
                            className="text-xs text-gray-400 hover:text-white px-3 py-1.5 cursor-pointer transition"
                          >
                            Cancel
                          </button>
                          <button 
                            onClick={() => saveEdit('events', ev.id)} 
                            disabled={isSaving}
                            className="text-xs bg-nexa-blue hover:bg-nexa-blue/80 disabled:bg-nexa-blue/40 text-white px-4 py-1.5 rounded-lg font-bold cursor-pointer transition flex items-center justify-center space-x-1.5"
                          >
                            {isSaving && <RefreshCw className="w-3 h-3 animate-spin mr-1" />}
                            <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex justify-between items-start">
                          <div className="flex items-start space-x-3">
                            {/* Toggle active switch */}
                            <button 
                              onClick={() => handleToggleActive('events', ev)} 
                              className="mt-0.5 cursor-pointer flex-shrink-0"
                              title={isItemActive(ev) ? "Disable event reminders" : "Enable event reminders"}
                            >
                              {isItemActive(ev) ? <ToggleRight className="w-6 h-6 text-nexa-blue" /> : <ToggleLeft className="w-6 h-6 text-gray-600" />}
                            </button>

                            <div>
                              <div className="flex items-center space-x-2">
                                <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border uppercase ${getStatusBadge('events', ev)}`}>
                                  {new Date(`${ev.date}T${ev.time || '00:00'}`) < new Date() ? 'past event' : 'upcoming'}
                                </span>
                              </div>
                              <h3 className="text-xs font-semibold text-white mt-1.5">{ev.title}</h3>
                              <p className="text-[10px] text-gray-400 mt-1 font-mono">📅 {ev.date} at {ev.time}</p>
                              {ev.location && (
                                <p className="text-[10px] text-nexa-glow font-semibold mt-1 flex items-center space-x-1">
                                  <Sparkles className="w-3.5 h-3.5" />
                                  <span>{ev.location}</span>
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Quick Actions */}
                          <div className="flex items-center space-x-1.5 flex-shrink-0">
                            <button 
                              onClick={() => openDetails('events', ev)}
                              className="p-1.5 rounded-lg bg-[#141C26] text-cyan-400 hover:bg-[#1A2534] hover:text-white transition cursor-pointer"
                              title="Audit Ledger History"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>

                            <button 
                              onClick={() => startEdit(ev)} 
                              className="p-1.5 rounded-lg bg-[#141C26] text-gray-400 hover:bg-[#1A2534] hover:text-white transition cursor-pointer"
                              title="Edit event details"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>

                            <button 
                              onClick={() => startDelete('events', ev.id, ev.title)} 
                              className="p-1.5 rounded-lg bg-red-950/20 text-red-400 hover:bg-red-950 hover:text-white transition cursor-pointer"
                              title="Delete event"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>

                        {ev.description && (
                          <p className="text-[10px] text-gray-400 mt-3 border-t border-nexa-border/30 pt-2 leading-relaxed italic">
                            "{ev.description}"
                          </p>
                        )}

                        {ev.participants && ev.participants.length > 0 && (
                          <div className="flex items-center space-x-1.5 mt-3 pt-2.5 border-t border-white/5">
                            <span className="text-[8px] text-gray-500 font-bold uppercase">Attendees:</span>
                            <div className="flex -space-x-1.5">
                              {ev.participants.map((p, idx) => (
                                <div 
                                  key={idx} 
                                  className="w-5.5 h-5.5 rounded-full bg-nexa-blue border border-[#10141E] text-[8px] text-white flex items-center justify-center font-bold"
                                  title={p}
                                >
                                  {p[0] ? p[0].toUpperCase() : '?'}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {/* FULLY FUNCTIONAL UNIFIED DETAILS MODAL WITH LEDGER HISTORY TIMELINE */}
      <AnimatePresence>
        {selectedItem && (
          <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              className="w-full max-w-lg bg-[#10141F] border border-nexa-border rounded-2xl p-5 text-white shadow-2xl relative flex flex-col max-h-[90vh] overflow-hidden"
            >
              {/* Header */}
              <div className="flex justify-between items-start border-b border-nexa-border pb-3.5 flex-shrink-0">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-500/35 flex items-center justify-center text-xl shadow">
                    {selectedItem.type === 'reminders' && getCategoryIcon(selectedItem.data.category)}
                    {selectedItem.type === 'planning' && '⏱️'}
                    {selectedItem.type === 'study' && '🎓'}
                    {selectedItem.type === 'events' && '📍'}
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-cyan-400 uppercase tracking-widest font-mono">
                      {selectedItem.type.toUpperCase()} AUDIT PROFILE
                    </span>
                    <h3 className="text-sm font-bold uppercase text-white truncate max-w-[280px]">
                      {selectedItem.data.title || selectedItem.data.course}
                    </h3>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedItem(null)}
                  className="text-gray-400 hover:text-white font-semibold text-xs transition p-1 cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Scrollable details and history */}
              <div className="flex-1 overflow-y-auto custom-scrollbar py-4 space-y-5 pr-1">
                
                {isEditingDetails ? (
                  /* MODAL EDIT STATE */
                  <div className="space-y-4">
                    <div className="text-xs font-bold text-nexa-glow font-mono">EDIT ITEM PARAMETERS</div>
                    
                    <div className="space-y-3">
                      <div>
                        <label className="text-[10px] text-gray-400 font-bold uppercase block mb-1">Title / Course</label>
                        <input 
                          type="text" 
                          value={editTitle} 
                          onChange={e => setEditTitle(e.target.value)} 
                          className="w-full bg-[#151D2A] text-xs text-white border border-nexa-border rounded-lg p-2.5" 
                        />
                      </div>

                      {/* Reminder / Event Specific narrative description */}
                      {(selectedItem.type === 'reminders' || selectedItem.type === 'events') && (
                        <div>
                          <label className="text-[10px] text-gray-400 font-bold uppercase block mb-1">Narrative Description</label>
                          <textarea 
                            value={editDescription} 
                            onChange={e => setEditDescription(e.target.value)} 
                            className="w-full bg-[#151D2A] text-xs text-white border border-nexa-border rounded-lg p-2.5 h-16" 
                          />
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] text-gray-400 font-bold uppercase block mb-1">Scheduled Date</label>
                          <input 
                            type="date" 
                            value={editDate} 
                            onChange={e => setEditDate(e.target.value)} 
                            className="w-full bg-[#151D2A] text-xs text-white border border-nexa-border rounded-lg p-2.5" 
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-gray-400 font-bold uppercase block mb-1">Scheduled Time / Preference Slot</label>
                          <input 
                            type="text" 
                            value={editTime} 
                            onChange={e => setEditTime(e.target.value)} 
                            placeholder="e.g. 18:00 or 19:00 - 22:00"
                            className="w-full bg-[#151D2A] text-xs text-white border border-nexa-border rounded-lg p-2.5" 
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] text-gray-400 font-bold uppercase block mb-1">Priority / Difficulty</label>
                          <select 
                            value={editPriority} 
                            onChange={e => setEditPriority(e.target.value as any)} 
                            className="w-full bg-[#151D2A] text-xs text-white border border-nexa-border rounded-lg p-2.5"
                          >
                            <option value="low">Low</option>
                            <option value="medium">Medium</option>
                            <option value="high">High</option>
                          </select>
                        </div>
                        
                        {selectedItem.type === 'reminders' && (
                          <div>
                            <label className="text-[10px] text-gray-400 font-bold uppercase block mb-1">Repeat Cadence</label>
                            <select 
                              value={editRepeat} 
                              onChange={e => setEditRepeat(e.target.value as any)} 
                              className="w-full bg-[#151D2A] text-xs text-white border border-nexa-border rounded-lg p-2.5"
                            >
                              <option value="none">No Repeat</option>
                              <option value="daily">Daily</option>
                              <option value="weekly">Weekly</option>
                              <option value="monthly">Monthly</option>
                            </select>
                          </div>
                        )}

                        {selectedItem.type === 'planning' && (
                          <div>
                            <label className="text-[10px] text-gray-400 font-bold uppercase block mb-1">Duration (Hours)</label>
                            <input 
                              type="number" 
                              value={editDurationHours} 
                              onChange={e => setEditDurationHours(Number(e.target.value))} 
                              className="w-full bg-[#151D2A] text-xs text-white border border-nexa-border rounded-lg p-2.5" 
                            />
                          </div>
                        )}

                        {selectedItem.type === 'study' && (
                          <div>
                            <label className="text-[10px] text-gray-400 font-bold uppercase block mb-1">Study Hours Daily</label>
                            <input 
                              type="number" 
                              value={editStudyHours} 
                              onChange={e => setEditStudyHours(Number(e.target.value))} 
                              className="w-full bg-[#151D2A] text-xs text-white border border-nexa-border rounded-lg p-2.5" 
                            />
                          </div>
                        )}
                      </div>

                      {selectedItem.type === 'study' && (
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-[10px] text-gray-400 font-bold uppercase block mb-1">Chapters Remaining</label>
                            <input 
                              type="number" 
                              value={editChapters} 
                              onChange={e => setEditChapters(Number(e.target.value))} 
                              className="w-full bg-[#151D2A] text-xs text-white border border-nexa-border rounded-lg p-2.5" 
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-gray-400 font-bold uppercase block mb-1">Progress Percentage</label>
                            <input 
                              type="number" 
                              value={editProgress} 
                              onChange={e => setEditProgress(Number(e.target.value))} 
                              className="w-full bg-[#151D2A] text-xs text-white border border-nexa-border rounded-lg p-2.5" 
                            />
                          </div>
                        </div>
                      )}

                      {selectedItem.type === 'events' && (
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-[10px] text-gray-400 font-bold uppercase block mb-1">Event Location</label>
                              <input 
                                type="text" 
                                value={editLocation} 
                                onChange={e => setEditLocation(e.target.value)} 
                                className="w-full bg-[#151D2A] text-xs text-white border border-nexa-border rounded-lg p-2.5" 
                              />
                            </div>
                            <div>
                              <label className="text-[10px] text-gray-400 font-bold uppercase block mb-1">Reminder Trigger</label>
                              <input 
                                type="text" 
                                value={editReminderTime} 
                                onChange={e => setEditReminderTime(e.target.value)} 
                                className="w-full bg-[#151D2A] text-xs text-white border border-nexa-border rounded-lg p-2.5" 
                              />
                            </div>
                          </div>
                          <div>
                            <label className="text-[10px] text-gray-400 font-bold uppercase block mb-1">Attendees / Participants</label>
                            <input 
                              type="text" 
                              value={editParticipants} 
                              onChange={e => setEditParticipants(e.target.value)} 
                              placeholder="e.g. Alice, Bob (comma separated)"
                              className="w-full bg-[#151D2A] text-xs text-white border border-nexa-border rounded-lg p-2.5" 
                            />
                          </div>
                        </div>
                      )}

                      {/* Reminders Specific alarm tones config */}
                      {selectedItem.type === 'reminders' && (
                        <div className="bg-slate-900/40 border border-nexa-border/50 rounded-xl p-3 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-cyan-300 font-mono">Alarm Tone & Voice settings</span>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-3">
                            <label className="flex items-center space-x-2 text-xs text-gray-300 cursor-pointer">
                              <input 
                                type="checkbox" 
                                checked={editSoundEnabled} 
                                onChange={e => setEditSoundEnabled(e.target.checked)} 
                                className="rounded bg-[#151D2A] text-nexa-blue focus:ring-0" 
                              />
                              <span>Audio alarm enabled</span>
                            </label>

                            <select 
                              value={editSoundName} 
                              onChange={e => setEditSoundName(e.target.value)}
                              disabled={!editSoundEnabled}
                              className="bg-[#151D2A] text-xs text-white border border-nexa-border rounded-lg p-2"
                            >
                              <option value="default">Default Beep</option>
                              <option value="digital_chimes">Digital Chimes</option>
                              <option value="gentle_flute">Gentle Flute</option>
                              <option value="tech_pulse">Tech Pulse</option>
                            </select>
                          </div>

                          <div className="pt-2 border-t border-white/5 space-y-2">
                            <label className="flex items-center space-x-2 text-xs text-gray-300 cursor-pointer">
                              <input 
                                type="checkbox" 
                                checked={editVoiceNotification} 
                                onChange={e => setEditVoiceNotification(e.target.checked)} 
                                className="rounded bg-[#151D2A] text-nexa-blue focus:ring-0" 
                              />
                              <span>Voice Alert Text-to-Speech (TTS)</span>
                            </label>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex justify-end space-x-2 pt-3 border-t border-white/5">
                      <button 
                        onClick={() => setIsEditingDetails(false)} 
                        className="px-4 py-2 rounded-xl text-xs text-gray-400 hover:text-white transition font-bold uppercase cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button 
                        onClick={() => saveEdit(selectedItem.type, selectedItem.data.id)} 
                        disabled={isSaving}
                        className="px-5 py-2 rounded-xl text-xs bg-nexa-blue hover:bg-nexa-blue/80 disabled:bg-nexa-blue/40 text-white transition font-bold uppercase cursor-pointer flex items-center justify-center space-x-1.5"
                      >
                        {isSaving && <RefreshCw className="w-3 h-3 animate-spin mr-1" />}
                        <span>{isSaving ? 'Saving...' : 'Save Settings'}</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  /* MODAL VIEW STATE */
                  <>
                    {/* Meta Attributes Grid */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-[#151D2A] border border-nexa-border/50 rounded-xl p-3">
                        <span className="text-[9px] text-gray-500 uppercase font-bold block font-mono">Scheduled timing</span>
                        <p className="text-xs text-white font-medium mt-1 font-mono">
                          📅 {selectedItem.data.date || selectedItem.data.exam_date} 
                          { (selectedItem.data.time || selectedItem.data.preferred_study_time) && ` at ${selectedItem.data.time || selectedItem.data.preferred_study_time}` }
                        </p>
                      </div>
                      <div className="bg-[#151D2A] border border-nexa-border/50 rounded-xl p-3 flex flex-col justify-between">
                        <div>
                          <span className="text-[9px] text-gray-500 uppercase font-bold block font-mono">Attributes & states</span>
                        </div>
                        <div className="flex items-center space-x-1.5 mt-1">
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded border uppercase ${getStatusBadge(selectedItem.type, selectedItem.data)}`}>
                            {selectedItem.type === 'reminders' && (selectedItem.data.status || 'scheduled')}
                            {selectedItem.type === 'planning' && (selectedItem.data.status || 'pending')}
                            {selectedItem.type === 'study' && `progress: ${selectedItem.data.progress}%`}
                            {selectedItem.type === 'events' && (new Date(`${selectedItem.data.date}T${selectedItem.data.time || '00:00'}`) < new Date() ? 'past event' : 'scheduled')}
                          </span>
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded border uppercase ${getPriorityColor(selectedItem.data.priority || selectedItem.data.difficulty)}`}>
                            {selectedItem.data.priority || selectedItem.data.difficulty || 'medium'} priority
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Metadata dates */}
                    <div className="grid grid-cols-2 gap-3 text-[10px] text-gray-500 font-mono">
                      <div>
                        <span>Creation Date: </span>
                        <span className="text-gray-300">
                          {selectedItem.data.created_at ? new Date(selectedItem.data.created_at).toLocaleString() : 'N/A'}
                        </span>
                      </div>
                      <div>
                        <span>Last Update: </span>
                        <span className="text-gray-300">
                          {selectedItem.data.updated_at ? new Date(selectedItem.data.updated_at).toLocaleString() : (selectedItem.data.created_at ? new Date(selectedItem.data.created_at).toLocaleString() : 'Just Now')}
                        </span>
                      </div>
                    </div>

                    {/* Description or Context */}
                    <div className="space-y-1.5">
                      <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest font-mono block">Item Narratives</span>
                      <div className="bg-[#0F131C] border border-nexa-border/40 rounded-xl p-3.5 text-xs text-gray-300 leading-relaxed font-medium">
                        {selectedItem.data.description ? (
                          selectedItem.data.description
                        ) : selectedItem.type === 'study' ? (
                          <span>Revision course details for {selectedItem.data.course}. Commit {selectedItem.data.study_hours_per_day} hours per day to complete preparation.</span>
                        ) : (
                          <span className="text-gray-600 italic">No custom narrative description was registered.</span>
                        )}
                      </div>
                    </div>

                    {/* Additional Details based on Module Type */}
                    {selectedItem.type === 'events' && (selectedItem.data.location || selectedItem.data.participants) && (
                      <div className="bg-slate-900/55 border border-nexa-border/40 rounded-xl p-3.5 space-y-2 text-xs font-mono">
                        <span className="text-[10px] font-bold text-cyan-300 uppercase font-mono block">Event Coordinates</span>
                        {selectedItem.data.location && <p><span className="text-gray-500">📍 Location:</span> <span className="text-white font-medium">{selectedItem.data.location}</span></p>}
                        {selectedItem.data.reminder_time && <p><span className="text-gray-500">🔔 Reminder:</span> <span className="text-white font-medium">{selectedItem.data.reminder_time}</span></p>}
                        {selectedItem.data.participants && selectedItem.data.participants.length > 0 && (
                          <p><span className="text-gray-500">👥 Attendees:</span> <span className="text-white font-medium">{selectedItem.data.participants.join(', ')}</span></p>
                        )}
                      </div>
                    )}

                    {selectedItem.type === 'reminders' && (
                      /* Alarm Tone & TTS configs */
                      <div className="bg-slate-900/55 border border-nexa-border/40 rounded-xl p-3.5 space-y-2">
                        <div className="flex items-center justify-between pb-1.5 border-b border-white/5">
                          <span className="text-[10px] font-bold text-cyan-300 uppercase font-mono">Tone & TTS Profile Settings</span>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-xs font-mono">
                          <div>
                            <span className="text-gray-500 block text-[9px] uppercase font-bold">Sound Alarm</span>
                            <span className="text-white font-medium mt-0.5 block">
                              {selectedItem.data.sound_enabled !== false ? `🔊 Active (${selectedItem.data.sound_name || 'default'})` : '🔇 Muted / Disabled'}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-500 block text-[9px] uppercase font-bold">Speech Synthesis Voice</span>
                            <span className="text-white font-medium mt-0.5 block">
                              {selectedItem.data.voice_notification 
                                ? `🗣️ ${selectedItem.data.voice_name || 'System Voice'} (${selectedItem.data.voice_speed || '1.0'}x)` 
                                : '🔇 Voice Alert Muted'}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Active toggle in Details view */}
                    <div className="bg-slate-900/25 border border-nexa-border/40 rounded-xl p-3.5 flex items-center justify-between text-xs font-mono">
                      <span className="text-gray-400">Trigger Alert State Status:</span>
                      <div className="flex items-center space-x-2">
                        <span className={`font-bold ${isItemActive(selectedItem.data) ? 'text-cyan-400' : 'text-gray-500'}`}>
                          {isItemActive(selectedItem.data) ? 'ON (ACTIVE)' : 'OFF (DISABLED)'}
                        </span>
                        <button 
                          onClick={() => handleToggleActive(selectedItem.type, selectedItem.data)}
                          className="cursor-pointer"
                        >
                          {isItemActive(selectedItem.data) ? <ToggleRight className="w-6 h-6 text-nexa-blue" /> : <ToggleLeft className="w-6 h-6 text-gray-600" />}
                        </button>
                      </div>
                    </div>

                    {/* Selected Smart Actions */}
                    {selectedItem.type === 'reminders' && selectedItem.data.selected_actions && selectedItem.data.selected_actions.length > 0 && (
                      <div className="space-y-2 bg-[#0C101A] border border-nexa-border/60 rounded-xl p-3.5">
                        <div className="flex items-center space-x-1">
                          <Sparkles className="w-3.5 h-3.5 text-nexa-glow" />
                          <span className="text-[10px] text-gray-300 font-bold uppercase tracking-wider font-mono">AI Smart Hardware Linkages Stored</span>
                        </div>
                        <div className="space-y-2 pt-1">
                          {selectedItem.data.selected_actions.map((act: any, i: number) => (
                            <div key={i} className="bg-[#151D2A] border border-nexa-border/30 rounded-lg p-2.5 flex items-center justify-between text-xs">
                              <div>
                                <span className="font-bold text-white capitalize">{act.type.replace('_', ' ')}</span>
                                <span className="text-gray-500 text-[10px] font-mono ml-2">➔ {act.targetApp}</span>
                                {act.payload && (act.payload.file || act.payload.app) && (
                                  <p className="text-[10px] text-cyan-400 mt-1 font-mono">
                                    Data payload: {act.payload.file || act.payload.app}
                                  </p>
                                )}
                              </div>
                              <span className="text-[9px] font-bold bg-nexa-blue/15 border border-nexa-blue/20 text-cyan-300 px-2 py-0.5 rounded-full font-mono uppercase">
                                {act.status}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* LEDGER ACTIVITY HISTORY LOGS TIMELINE */}
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between pb-1 border-b border-nexa-border/40">
                        <div className="flex items-center space-x-1.5">
                          <Activity className="w-3.5 h-3.5 text-cyan-400" />
                          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest font-mono">Notification Ledger Timeline</span>
                        </div>
                        <button 
                          onClick={() => fetchItemHistory(selectedItem.data.id)}
                          className="text-gray-500 hover:text-white transition cursor-pointer p-0.5"
                          title="Reload Ledger"
                        >
                          <RefreshCw className="w-3 h-3" />
                        </button>
                      </div>

                      {isLoadingHistory ? (
                        <div className="text-center py-6 text-xs text-gray-500 font-mono animate-pulse">Loading Audit Logs...</div>
                      ) : itemHistory.length === 0 ? (
                        <div className="bg-slate-900/30 border border-nexa-border/35 rounded-xl p-4 text-center text-xs text-gray-600 font-mono space-y-1">
                          <p>No activity ledger log found in the remote database for this item.</p>
                          <p className="text-[9px] text-gray-500">Timeline events are written automatically on triggers, toggles, or updates.</p>
                        </div>
                      ) : (
                        <div className="space-y-2.5 pt-1 pl-1">
                          {itemHistory.map((log, index) => (
                            <div key={log.id} className="relative flex items-start space-x-3 text-xs group">
                              {index !== itemHistory.length - 1 && (
                                <span className="absolute left-2 top-6 bottom-0 w-[1.5px] bg-[#1F293D]" />
                              )}
                              
                              <div className="w-4 h-4 rounded-full bg-[#121926] border border-cyan-500/35 flex items-center justify-center relative z-10">
                                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                              </div>

                              <div className="flex-1 bg-[#151D2A] border border-nexa-border/30 rounded-xl p-3 space-y-1">
                                <div className="flex justify-between items-center text-[9px]">
                                  <span className="font-bold text-white font-mono uppercase tracking-wider">{log.type}</span>
                                  <span className="text-gray-500 font-mono">
                                    {log.timestamp ? new Date(log.timestamp).toLocaleString() : 'Just now'}
                                  </span>
                                </div>
                                <p className="text-[11px] text-gray-300 font-medium leading-normal">{log.message}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Action Buttons Footer (Back, Edit, Delete) */}
              <div className="border-t border-nexa-border pt-4 flex-shrink-0 flex items-center space-x-2.5">
                <button
                  onClick={() => setSelectedItem(null)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-900 hover:bg-[#1B2535] text-white border border-nexa-border text-xs font-bold uppercase tracking-wider transition text-center cursor-pointer font-sans"
                >
                  Back
                </button>
                
                {!isEditingDetails && (
                  <>
                    <button
                      onClick={() => {
                        startEdit(selectedItem.data);
                        setIsEditingDetails(true);
                      }}
                      className="flex-1 py-2.5 rounded-xl bg-nexa-blue/15 hover:bg-nexa-blue border border-nexa-blue/35 text-white text-xs font-bold uppercase tracking-wider transition text-center cursor-pointer flex items-center justify-center space-x-1.5"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      <span>Edit settings</span>
                    </button>
                    
                    <button
                      onClick={() => startDelete(selectedItem.type, selectedItem.data.id, selectedItem.data.title || selectedItem.data.course)}
                      className="flex-1 py-2.5 rounded-xl bg-red-950/20 hover:bg-red-950 text-red-400 hover:text-white border border-red-900/30 text-xs font-bold uppercase tracking-wider transition text-center cursor-pointer flex items-center justify-center space-x-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete</span>
                    </button>
                  </>
                )}
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Custom Modal */}
      <AnimatePresence>
        {deleteTarget && (
          <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center px-4 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#121620] border border-nexa-border w-full max-w-sm rounded-2xl p-5 shadow-[0_0_50px_rgba(239,68,68,0.15)]"
            >
              <div className="flex items-center space-x-2.5 text-red-400 mb-3">
                <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                <h3 className="text-sm font-bold uppercase tracking-wider font-display">Confirm Deletion</h3>
              </div>
              <p className="text-xs text-gray-300 leading-relaxed">
                Are you sure you want to permanently delete <span className="text-white font-semibold">"{deleteTarget.title}"</span>? This action cannot be undone and will remove it from all schedules.
              </p>
              
              <div className="flex space-x-3 mt-5 justify-end">
                <button
                  onClick={() => setDeleteTarget(null)}
                  className="bg-[#151A24] hover:bg-[#1C2433] text-gray-400 hover:text-white text-xs font-bold uppercase tracking-wider px-4 py-2.5 rounded-xl cursor-pointer transition border border-[#1F293D]"
                >
                  Cancel
                </button>
                <button
                  onClick={executeDelete}
                  disabled={isSaving}
                  className="bg-red-500 hover:bg-red-600 disabled:bg-red-900 text-white text-xs font-bold uppercase tracking-wider px-5 py-2.5 rounded-xl shadow-lg cursor-pointer transition flex items-center justify-center space-x-1.5"
                >
                  {isSaving ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Deleting...</span>
                    </>
                  ) : (
                    <span>Delete Permanently</span>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Floating Feedback Toasts */}
      <AnimatePresence>
        {feedback && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className={`fixed top-4 left-1/2 transform -translate-x-1/2 z-[110] flex items-center space-x-2.5 px-4 py-3 rounded-xl border shadow-xl backdrop-blur-md ${
              feedback.type === 'success' 
                ? 'bg-emerald-950/90 border-emerald-500/30 text-emerald-300' 
                : 'bg-red-950/90 border-red-500/30 text-red-300'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
            )}
            <span className="text-xs font-semibold">{feedback.message}</span>
            <button 
              onClick={() => setFeedback(null)} 
              className="text-[10px] opacity-60 hover:opacity-100 font-bold ml-1.5 cursor-pointer"
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
