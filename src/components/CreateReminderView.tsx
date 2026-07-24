import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ChevronLeft, Calendar, Clock, RotateCcw, AlertTriangle, Sparkles, 
  Volume2, Bell, AppWindow, FileText, CheckCircle2, Trash2, Play 
} from 'lucide-react';
import { Reminder } from '../types.js';
import { ProfileService } from '../services/ProfileService.js';

interface CreateReminderViewProps {
  onBack: () => void;
  onReminderSaved: () => void;
  reminderToEdit?: Reminder;
  reminders?: Reminder[];
  playAlertSound?: (soundName: string) => void;
  setActiveTriggeredReminder?: (reminder: Reminder) => void;
}

export default function CreateReminderView({ 
  onBack, 
  onReminderSaved, 
  reminderToEdit,
  reminders = [],
  playAlertSound,
  setActiveTriggeredReminder
}: CreateReminderViewProps) {
  const [devModeEnabled, setDevModeEnabled] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      const enabled = await ProfileService.isDevModeEnabled();
      setDevModeEnabled(enabled || process.env.NODE_ENV === 'development');
    };
    loadSettings();
  }, []);

  const [title, setTitle] = useState(reminderToEdit?.title || '');
  const [description, setDescription] = useState(reminderToEdit?.description || '');
  const [date, setDate] = useState(reminderToEdit?.date || '2025-05-21');
  const [time, setTime] = useState(reminderToEdit?.time || '18:00');
  const [repeat, setRepeat] = useState<'none' | 'daily' | 'weekly' | 'monthly'>(reminderToEdit?.repeat || 'none');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>(reminderToEdit?.priority || 'medium');
  const [voiceNotification, setVoiceNotification] = useState(reminderToEdit?.voice_notification !== false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  // New Advanced Settings
  const [category, setCategory] = useState(reminderToEdit?.category || 'General');
  const [soundEnabled, setSoundEnabled] = useState(reminderToEdit?.sound_enabled !== false);
  const [soundName, setSoundName] = useState(reminderToEdit?.sound_name || 'default');
  const [voiceSpeed, setVoiceSpeed] = useState(reminderToEdit?.voice_speed !== undefined ? reminderToEdit.voice_speed : 1.0);
  const [voiceName, setVoiceName] = useState(reminderToEdit?.voice_name || 'default');

  // AI Actions / Connected Actions States
  const [actionSendNotif, setActionSendNotif] = useState(true);
  const [actionPlayVoice, setActionPlayVoice] = useState(true);
  const [actionOpenApp, setActionOpenApp] = useState(false);
  const [actionOpenDoc, setActionOpenDoc] = useState(false);
  const [selectedApp, setSelectedApp] = useState('PDF Reader');
  const [selectedDoc, setSelectedDoc] = useState('CSC301 Study Syllabus.pdf');

  // Effect to load edit mode configurations
  React.useEffect(() => {
    if (reminderToEdit) {
      setTitle(reminderToEdit.title);
      setDescription(reminderToEdit.description || '');
      setDate(reminderToEdit.date);
      setTime(reminderToEdit.time);
      setRepeat(reminderToEdit.repeat);
      setPriority(reminderToEdit.priority);
      setVoiceNotification(reminderToEdit.voice_notification);
      setCategory(reminderToEdit.category || 'General');
      setSoundEnabled(reminderToEdit.sound_enabled !== false);
      setSoundName(reminderToEdit.sound_name || 'default');
      setVoiceSpeed(reminderToEdit.voice_speed !== undefined ? reminderToEdit.voice_speed : 1.0);
      setVoiceName(reminderToEdit.voice_name || 'default');

      if (reminderToEdit.selected_actions) {
        const actions = reminderToEdit.selected_actions;
        setActionSendNotif(actions.some((a: any) => a.type === "SEND_NOTIFICATION"));
        setActionPlayVoice(actions.some((a: any) => a.type === "VOICE_ALERT"));
        
        const appAction = actions.find((a: any) => a.type === "OPEN_APP");
        if (appAction) {
          setActionOpenApp(true);
          setSelectedApp(appAction.targetApp);
        } else {
          setActionOpenApp(false);
        }

        const docAction = actions.find((a: any) => a.type === "OPEN_DOCUMENT");
        if (docAction) {
          setActionOpenDoc(true);
          setSelectedDoc(docAction.payload?.file || 'CSC301 Study Syllabus.pdf');
        } else {
          setActionOpenDoc(false);
        }
      }
    }
  }, [reminderToEdit]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Please specify a reminder title.');
      return;
    }
    setError('');
    setIsSaving(true);

    // Build standard Smart Actions payload
    const selectedActionsList = [];
    if (actionSendNotif) {
      selectedActionsList.push({
        id: `action-notif-${Date.now()}`,
        type: "SEND_NOTIFICATION",
        targetApp: "NEXA Alerts",
        executionTime: time,
        payload: { title, text: "Time to start your scheduled activity." },
        status: "active"
      });
    }
    if (actionPlayVoice && voiceNotification) {
      selectedActionsList.push({
        id: `action-voice-${Date.now()}`,
        type: "VOICE_ALERT",
        targetApp: "NEXA Voice Synth",
        executionTime: time,
        payload: { text: `Hello! This is NEXA reminding you to: ${title}` },
        status: "active"
      });
    }
    if (actionOpenApp) {
      selectedActionsList.push({
        id: `action-app-${Date.now()}`,
        type: "OPEN_APP",
        targetApp: selectedApp,
        executionTime: time,
        payload: { app: selectedApp },
        status: "active"
      });
    }
    if (actionOpenDoc) {
      selectedActionsList.push({
        id: `action-doc-${Date.now()}`,
        type: "OPEN_DOCUMENT",
        targetApp: "PDF Reader",
        executionTime: time,
        payload: { file: selectedDoc },
        status: "active"
      });
    }

    const endpoint = reminderToEdit ? `/api/reminders/${reminderToEdit.id}` : '/api/reminders';
    const method = reminderToEdit ? 'PUT' : 'POST';

    try {
      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          date,
          time,
          repeat,
          priority,
          voice_notification: voiceNotification,
          active: reminderToEdit ? reminderToEdit.active : true,
          category,
          status: reminderToEdit ? reminderToEdit.status : 'scheduled',
          selected_actions: selectedActionsList,
          sound_enabled: soundEnabled,
          sound_name: soundName,
          voice_speed: voiceSpeed,
          voice_name: voiceName
        })
      });

      if (res.ok) {
        onReminderSaved(); // triggers reload and redirects back or showing success toast
        onBack();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to save reminder.');
      }
    } catch (e) {
      console.error(e);
      setError('Network error saving reminder.');
    } finally {
      setIsSaving(false);
    }
  };

  // Generate responsive preview sentence
  const getPreviewText = () => {
    if (!title) return "Enter a title above to preview your NEXA notification.";
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const dParts = date.split('-');
    let dateStr = date;
    if (dParts.length === 3) {
      const year = dParts[0];
      const monthIdx = parseInt(dParts[1], 10) - 1;
      const day = dParts[2];
      dateStr = `${months[monthIdx]} ${day}, ${year}`;
    }
    return `NEXA will remind you to "${title}" on ${dateStr} at ${time}${repeat !== 'none' ? ` (repeating ${repeat})` : ''}.`;
  };

  return (
    <div id="create-reminder-view" className="flex flex-col h-full bg-[#0B0E14] overflow-y-auto custom-scrollbar px-4 pt-4 pb-20">
      
      {/* Navigation Header */}
      <div className="flex items-center space-x-3 mb-6">
        <button 
          onClick={onBack}
          className="p-2 rounded-xl bg-nexa-card border border-nexa-border text-gray-400 hover:text-white transition cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-white font-display">Create Reminder</h1>
          <p className="text-[10px] text-gray-500">Plan ahead with proactive voice alerts</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-red-950/40 border border-red-900 text-red-300 rounded-xl p-3 text-xs flex items-center space-x-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Form */}
      <form onSubmit={handleSave} className="space-y-4">
        {/* Title Field */}
        <div>
          <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Reminder Title</label>
          <input 
            type="text" 
            placeholder="Enter reminder title (e.g. Study Computer Architecture)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-[#151A24] text-sm text-white border border-nexa-border rounded-xl px-4 py-3 focus:outline-none focus:border-nexa-blue transition"
          />
        </div>

        {/* Description Field */}
        <div>
          <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Description (Optional)</label>
          <textarea 
            placeholder="Describe what needs to be done..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full bg-[#151A24] text-xs text-white border border-nexa-border rounded-xl px-4 py-3 focus:outline-none focus:border-nexa-blue transition resize-none"
          />
        </div>

        {/* Date & Time Row */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 flex items-center space-x-1">
              <Calendar className="w-3.5 h-3.5 text-nexa-blue" />
              <span>Date</span>
            </label>
            <input 
              type="date" 
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full bg-[#151A24] text-xs text-white border border-nexa-border rounded-xl px-3 py-3 focus:outline-none focus:border-nexa-blue cursor-pointer"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 flex items-center space-x-1">
              <Clock className="w-3.5 h-3.5 text-nexa-blue" />
              <span>Time</span>
            </label>
            <input 
              type="time" 
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full bg-[#151A24] text-xs text-white border border-nexa-border rounded-xl px-3 py-3 focus:outline-none focus:border-nexa-blue cursor-pointer"
            />
          </div>
        </div>

        {/* Repeat & Category Row */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 flex items-center space-x-1">
              <RotateCcw className="w-3.5 h-3.5 text-nexa-purple" />
              <span>Repeat</span>
            </label>
            <select 
              value={repeat} 
              onChange={(e) => setRepeat(e.target.value as any)}
              className="w-full bg-[#151A24] text-xs text-white border border-nexa-border rounded-xl px-3 py-3 focus:outline-none focus:border-nexa-blue cursor-pointer"
            >
              <option value="none">None</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5 flex items-center space-x-1">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              <span>Category</span>
            </label>
            <select 
              value={category} 
              onChange={(e) => setCategory(e.target.value)}
              className="w-full bg-[#151A24] text-xs text-white border border-nexa-border rounded-xl px-3 py-3 focus:outline-none focus:border-nexa-blue cursor-pointer"
            >
              <option value="General">General</option>
              <option value="Study">Study</option>
              <option value="Planning">Planning</option>
              <option value="Event">Event</option>
              <option value="Personal">Personal</option>
              <option value="Health">Health</option>
              <option value="Miscellaneous">Miscellaneous</option>
            </select>
          </div>
        </div>

        {/* Priority Segmented Controls */}
        <div>
          <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Priority</label>
          <div className="grid grid-cols-3 gap-2">
            {(['low', 'medium', 'high'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPriority(p)}
                className={`py-2 px-3 text-xs font-semibold rounded-xl border capitalize transition-all cursor-pointer ${
                  priority === p 
                    ? p === 'high' ? 'bg-red-500/10 border-red-500 text-red-400' 
                      : p === 'medium' ? 'bg-amber-500/10 border-amber-500 text-amber-400' 
                      : 'bg-green-500/10 border-green-500 text-green-400'
                    : 'bg-[#151A24] border-nexa-border text-gray-400 hover:border-gray-700'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Sound & Voice Settings Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Sound Notification Card */}
          <div className="p-3.5 bg-[#121620]/70 border border-nexa-border rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="p-1.5 bg-cyan-500/10 text-cyan-400 rounded-lg">
                  <Bell className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-white">Sound Alert</p>
                  <p className="text-[9px] text-gray-500">Play alert sound on trigger</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSoundEnabled(!soundEnabled)}
                className={`w-11 h-6 rounded-full p-0.5 transition-all duration-300 focus:outline-none cursor-pointer flex items-center ${
                  soundEnabled ? 'bg-nexa-blue' : 'bg-gray-800'
                }`}
              >
                <div className={`w-5 h-5 rounded-full bg-white shadow transition-all duration-300 transform ${
                  soundEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}></div>
              </button>
            </div>

            {soundEnabled && (
              <div className="space-y-1.5 pt-1.5 border-t border-white/5">
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest font-mono">Select Predefined Sound</label>
                <select
                  value={soundName}
                  onChange={(e) => setSoundName(e.target.value)}
                  className="w-full bg-[#151A24] text-[11px] text-white border border-nexa-border rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-nexa-blue cursor-pointer"
                >
                  <option value="default">Default Beep</option>
                  <option value="digital_chimes">Digital Chimes</option>
                  <option value="gentle_flute">Gentle Flute</option>
                  <option value="cosmic_beep">Cosmic Beep</option>
                  <option value="tech_pulse">Tech Pulse</option>
                </select>
              </div>
            )}
          </div>

          {/* Voice Notification Card */}
          <div className="p-3.5 bg-[#121620]/70 border border-nexa-border rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="p-1.5 bg-nexa-purple/10 text-nexa-purple rounded-lg">
                  <Volume2 className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-white">Voice Notification</p>
                  <p className="text-[9px] text-gray-500">Audio narration via Speech Synthesis</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setVoiceNotification(!voiceNotification)}
                className={`w-11 h-6 rounded-full p-0.5 transition-all duration-300 focus:outline-none cursor-pointer flex items-center ${
                  voiceNotification ? 'bg-nexa-purple' : 'bg-gray-800'
                }`}
              >
                <div className={`w-5 h-5 rounded-full bg-white shadow transition-all duration-300 transform ${
                  voiceNotification ? 'translate-x-5' : 'translate-x-0'
                }`}></div>
              </button>
            </div>

            {voiceNotification && (
              <div className="space-y-2 pt-1.5 border-t border-white/5 text-[11px]">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest font-mono mb-1">Voice Profile</label>
                    <select
                      value={voiceName}
                      onChange={(e) => setVoiceName(e.target.value)}
                      className="w-full bg-[#151A24] text-[11px] text-white border border-nexa-border rounded-lg px-2 py-1 focus:outline-none focus:border-nexa-blue cursor-pointer"
                    >
                      <option value="default">Default System</option>
                      <option value="alloy">Alloy (Soft)</option>
                      <option value="echo">Echo (Warm)</option>
                      <option value="onyx">Onyx (Deep)</option>
                      <option value="nova">Nova (Bright)</option>
                      <option value="shimmer">Shimmer (Clear)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest font-mono mb-1">Voice Speed: {voiceSpeed}x</label>
                    <input
                      type="range"
                      min="0.5"
                      max="2.0"
                      step="0.1"
                      value={voiceSpeed}
                      onChange={(e) => setVoiceSpeed(parseFloat(e.target.value))}
                      className="w-full h-1 bg-[#151A24] rounded-lg appearance-none cursor-pointer accent-nexa-purple mt-2"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* AI Actions / Connected Actions Section */}
        <div className="bg-nexa-card/40 border border-nexa-border rounded-2xl p-4.5 space-y-4">
          <div className="flex items-center justify-between pb-2.5 border-b border-nexa-border/40">
            <div className="flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-nexa-glow" />
              <span className="text-xs font-bold text-white uppercase tracking-wider">AI Device Automation Actions</span>
            </div>
            <span className="text-[9px] font-bold text-nexa-glow bg-nexa-blue/10 px-2 py-0.5 rounded-full uppercase tracking-wider font-mono">NEXA Core Link</span>
          </div>

          <p className="text-[10px] text-gray-400 leading-normal">
            Define automatic tasks NEXA will trigger across your hardware matrix at the scheduled timestamp. Stored securely for future device execution.
          </p>

          {/* Toggle Buttons */}
          <div className="grid grid-cols-2 gap-2.5">
            {/* Send Notification Toggle */}
            <button
              type="button"
              onClick={() => setActionSendNotif(!actionSendNotif)}
              className={`p-2.5 rounded-xl border text-left transition flex flex-col justify-between h-[68px] cursor-pointer ${
                actionSendNotif ? 'bg-cyan-950/20 border-cyan-500/40 text-cyan-300' : 'bg-[#151A24] border-nexa-border/60 text-gray-400 hover:border-gray-700'
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <Bell className="w-3.5 h-3.5" />
                <span className={`w-1.5 h-1.5 rounded-full ${actionSendNotif ? 'bg-nexa-glow animate-pulse' : 'bg-transparent'}`}></span>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider">Send Notification</span>
            </button>

            {/* Voice Reminder Toggle */}
            <button
              type="button"
              onClick={() => setActionPlayVoice(!actionPlayVoice)}
              className={`p-2.5 rounded-xl border text-left transition flex flex-col justify-between h-[68px] cursor-pointer ${
                actionPlayVoice ? 'bg-purple-950/20 border-purple-500/40 text-purple-300' : 'bg-[#151A24] border-nexa-border/60 text-gray-400 hover:border-gray-700'
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <Volume2 className="w-3.5 h-3.5" />
                <span className={`w-1.5 h-1.5 rounded-full ${actionPlayVoice ? 'bg-purple-400 animate-pulse' : 'bg-transparent'}`}></span>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider">Voice Reminder</span>
            </button>

            {/* Open Application Toggle */}
            <button
              type="button"
              onClick={() => setActionOpenApp(!actionOpenApp)}
              className={`p-2.5 rounded-xl border text-left transition flex flex-col justify-between h-[68px] cursor-pointer ${
                actionOpenApp ? 'bg-blue-950/20 border-blue-500/40 text-blue-300' : 'bg-[#151A24] border-nexa-border/60 text-gray-400 hover:border-gray-700'
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <AppWindow className="w-3.5 h-3.5" />
                <span className={`w-1.5 h-1.5 rounded-full ${actionOpenApp ? 'bg-blue-400 animate-pulse' : 'bg-transparent'}`}></span>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider">Open App</span>
            </button>

            {/* Open Document Toggle */}
            <button
              type="button"
              onClick={() => setActionOpenDoc(!actionOpenDoc)}
              className={`p-2.5 rounded-xl border text-left transition flex flex-col justify-between h-[68px] cursor-pointer ${
                actionOpenDoc ? 'bg-amber-950/20 border-amber-500/40 text-amber-300' : 'bg-[#151A24] border-nexa-border/60 text-gray-400 hover:border-gray-700'
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <FileText className="w-3.5 h-3.5" />
                <span className={`w-1.5 h-1.5 rounded-full ${actionOpenDoc ? 'bg-amber-400 animate-pulse' : 'bg-transparent'}`}></span>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider">Open Document</span>
            </button>
          </div>

          {/* Conditional Selectors */}
          <AnimatePresence>
            {actionOpenApp && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-2 pt-1 overflow-hidden"
              >
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest font-mono">Select Target Application</label>
                <select
                  value={selectedApp}
                  onChange={(e) => setSelectedApp(e.target.value)}
                  className="w-full bg-[#151A24] text-xs text-white border border-nexa-border rounded-xl px-3 py-2.5 focus:outline-none focus:border-nexa-blue cursor-pointer"
                >
                  <option value="PDF Reader">PDF Reader</option>
                  <option value="Calendar">Calendar</option>
                  <option value="Notes">Notes</option>
                  <option value="Browser">Browser</option>
                  <option value="YouTube">YouTube</option>
                  <option value="Google Drive">Google Drive</option>
                </select>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {actionOpenDoc && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-2 pt-1 overflow-hidden"
              >
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest font-mono">Select Target File / Document</label>
                <select
                  value={selectedDoc}
                  onChange={(e) => setSelectedDoc(e.target.value)}
                  className="w-full bg-[#151A24] text-xs text-white border border-nexa-border rounded-xl px-3 py-2.5 focus:outline-none focus:border-nexa-blue cursor-pointer"
                >
                  <option value="CSC301 Study Syllabus.pdf">CSC301 Study Syllabus.pdf</option>
                  <option value="Computer Architecture Notes.pdf">Computer Architecture Notes.pdf</option>
                  <option value="Daily Routine Schedule.docx">Daily Routine Schedule.docx</option>
                  <option value="NEXA AI Integration Manual.epub">NEXA AI Integration Manual.epub</option>
                </select>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Submit Save Button */}
        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          type="submit"
          disabled={isSaving}
          className="w-full py-3.5 rounded-xl bg-gradient-to-r from-nexa-blue to-nexa-purple text-white text-xs font-bold tracking-wider uppercase shadow-lg hover:brightness-110 cursor-pointer disabled:opacity-50 transition"
        >
          {isSaving ? "Saving..." : reminderToEdit ? "Update Reminder" : "Save Reminder"}
        </motion.button>
      </form>

      {/* AI Preview Section */}
      <div className="mt-6 bg-[#111621] border border-nexa-border rounded-2xl p-4 flex items-start space-x-3">
        <div className="w-10 h-10 rounded-full bg-slate-900 border border-nexa-blue/40 flex items-center justify-center relative flex-shrink-0">
          {/* Minimal 2D Robot facial representation */}
          <div className="flex space-x-1.5">
            <span className="w-1 h-1 bg-nexa-glow rounded-full animate-ping"></span>
            <span className="w-1 h-1 bg-nexa-glow rounded-full"></span>
          </div>
        </div>

        <div className="flex-1">
          <div className="flex items-center space-x-1 mb-1">
            <Sparkles className="w-3 h-3 text-nexa-glow" />
            <span className="text-[10px] font-bold text-nexa-glow uppercase tracking-wider">AI Preview</span>
          </div>
          <p className="text-xs text-gray-300 leading-relaxed font-medium">
            {getPreviewText()}
          </p>
        </div>
      </div>

      {/* Developer Testing Section */}
      {devModeEnabled && (
        <div id="developer-testing-panel" className="mt-6 bg-slate-950/60 border border-red-500/30 rounded-2xl p-4 space-y-4">
          <div className="flex justify-between items-center border-b border-white/5 pb-2.5">
            <div className="flex items-center space-x-2">
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
              </span>
              <h3 className="text-xs font-bold text-white uppercase tracking-wider font-display">Developer Testing</h3>
            </div>
            <span className="text-[9px] font-mono font-semibold text-red-400 bg-red-950/40 border border-red-500/10 px-2 py-0.5 rounded-full">DEV MODE</span>
          </div>

          <p className="text-[10px] text-gray-400 leading-normal font-mono">
            Execute manual diagnostic triggers and modify active notification/reminder database arrays in the local sandbox.
          </p>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                const target: Reminder = reminderToEdit || {
                  id: `dev-notif-${Date.now()}`,
                  user_id: 'user-1',
                  title: title.trim() || '⚡ Dev Testing Reminder Title',
                  description: description.trim() || 'This is a live preview notification test triggered manually from Developer Mode.',
                  date,
                  time,
                  priority,
                  repeat,
                  category,
                  active: true,
                  sound_enabled: soundEnabled,
                  sound_name: soundName,
                  voice_notification: voiceNotification,
                  voice_speed: voiceSpeed,
                  voice_name: voiceName,
                  status: 'triggered',
                  created_at: new Date().toISOString()
                };
                if (playAlertSound && soundEnabled) {
                  playAlertSound(soundName || 'default');
                }
                if (setActiveTriggeredReminder) {
                  setActiveTriggeredReminder(target);
                }
              }}
              className="bg-slate-900 hover:bg-slate-800 border border-nexa-border text-[11px] font-semibold text-gray-300 rounded-xl px-3 py-2.5 transition flex items-center justify-center space-x-1.5 cursor-pointer"
            >
              <Bell className="w-3.5 h-3.5 text-amber-500" />
              <span>Trigger Notification</span>
            </button>

            <button
              type="button"
              onClick={async () => {
                try {
                  const res = await fetch('/api/reminders/reformulate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      title: title.trim() || 'Complete your scheduled study task',
                      description: description.trim() || ''
                    })
                  });
                  let speechText = '';
                  if (res.ok) {
                    const data = await res.json();
                    speechText = data.speechText;
                  } else {
                    speechText = `Hello. This is NEXA AI. I'm reminding you that you scheduled: ${title.trim() || 'your study task'}.`;
                  }

                  if ('speechSynthesis' in window) {
                    window.speechSynthesis.cancel();
                    const utterance = new SpeechSynthesisUtterance(speechText);
                    utterance.rate = voiceSpeed;
                    if (voiceName && voiceName !== 'default') {
                      const voices = window.speechSynthesis.getVoices();
                      const matchedVoice = voices.find(v => v.name.toLowerCase().includes(voiceName.toLowerCase()));
                      if (matchedVoice) utterance.voice = matchedVoice;
                    }
                    window.speechSynthesis.speak(utterance);
                  } else {
                    alert("Speech synthesis is not supported in this browser.");
                  }
                } catch (e) {
                  console.error(e);
                }
              }}
              className="bg-slate-900 hover:bg-slate-800 border border-nexa-border text-[11px] font-semibold text-gray-300 rounded-xl px-3 py-2.5 transition flex items-center justify-center space-x-1.5 cursor-pointer"
            >
              <Volume2 className="w-3.5 h-3.5 text-purple-400" />
              <span>Trigger Voice</span>
            </button>

            <button
              type="button"
              onClick={async () => {
                // Trigger full reminder
                const target: Reminder = reminderToEdit || {
                  id: `dev-notif-${Date.now()}`,
                  user_id: 'user-1',
                  title: title.trim() || '⚡ Dev Testing Reminder Title',
                  description: description.trim() || 'This is a live preview notification test triggered manually from Developer Mode.',
                  date,
                  time,
                  priority,
                  repeat,
                  category,
                  active: true,
                  sound_enabled: soundEnabled,
                  sound_name: soundName,
                  voice_notification: voiceNotification,
                  voice_speed: voiceSpeed,
                  voice_name: voiceName,
                  status: 'triggered',
                  created_at: new Date().toISOString()
                };
                if (playAlertSound && soundEnabled) {
                  playAlertSound(soundName || 'default');
                }
                if (setActiveTriggeredReminder) {
                  setActiveTriggeredReminder(target);
                }
                // Play voice alert if enabled
                if (voiceNotification) {
                  try {
                    const res = await fetch('/api/reminders/reformulate', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        title: title.trim() || 'Complete your scheduled study task',
                        description: description.trim() || ''
                      })
                    });
                    let speechText = '';
                    if (res.ok) {
                      const data = await res.json();
                      speechText = data.speechText;
                    } else {
                      speechText = `Hello. This is NEXA AI. I'm reminding you that you scheduled: ${title.trim() || 'your study task'}.`;
                    }

                    if ('speechSynthesis' in window) {
                      window.speechSynthesis.cancel();
                      const utterance = new SpeechSynthesisUtterance(speechText);
                      utterance.rate = voiceSpeed;
                      if (voiceName && voiceName !== 'default') {
                        const voices = window.speechSynthesis.getVoices();
                        const matchedVoice = voices.find(v => v.name.toLowerCase().includes(voiceName.toLowerCase()));
                        if (matchedVoice) utterance.voice = matchedVoice;
                      }
                      window.speechSynthesis.speak(utterance);
                    }
                  } catch (e) {
                    console.error(e);
                  }
                }
              }}
              className="bg-slate-900 hover:bg-slate-800 border border-nexa-border text-[11px] font-semibold text-gray-300 rounded-xl px-3 py-2.5 transition flex items-center justify-center space-x-1.5 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
              <span>Trigger Full</span>
            </button>

            <button
              type="button"
              onClick={async () => {
                const targetId = reminderToEdit?.id || (reminders && reminders.length > 0 ? reminders[reminders.length - 1].id : null);
                if (targetId) {
                  try {
                    const res = await fetch(`/api/reminders/${targetId}/complete`, { method: 'PUT' });
                    if (res.ok) {
                      onReminderSaved(); // trigger refetch
                      alert("Reminder successfully marked as completed in DB!");
                    } else {
                      alert("Failed to complete reminder.");
                    }
                  } catch (e) {
                    console.error(e);
                  }
                } else {
                  alert("No active reminder target found to complete. Please save a reminder first.");
                }
              }}
              className="bg-slate-900 hover:bg-slate-800 border border-nexa-border text-[11px] font-semibold text-gray-300 rounded-xl px-3 py-2.5 transition flex items-center justify-center space-x-1.5 cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
              <span>Mark Completed</span>
            </button>

            <button
              type="button"
              onClick={async () => {
                if (confirm("Clear all reminder logs and activity history? This is irreversible.")) {
                  try {
                    const res = await fetch('/api/notification-history', { method: 'DELETE' });
                    if (res.ok) {
                      onReminderSaved(); // trigger refetch
                      alert("Ledger activities and reminder history successfully cleared from DB!");
                    } else {
                      alert("Failed to clear history.");
                    }
                  } catch (e) {
                    console.error(e);
                  }
                }
              }}
              className="bg-red-950/25 hover:bg-red-950/50 border border-red-900/40 text-[11px] font-semibold text-red-400 rounded-xl px-3 py-2.5 transition flex items-center justify-center space-x-1.5 cursor-pointer col-span-2"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear Reminder History</span>
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
