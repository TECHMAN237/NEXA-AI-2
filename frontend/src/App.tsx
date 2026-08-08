import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  MessageSquare, LayoutGrid, ClipboardList, User, Sparkles, Volume2, Mic,
  Bell, VolumeX, Terminal, ExternalLink, CheckCircle2, AlertTriangle, Clock
} from 'lucide-react';

// Import Views
import AssistantView from './components/AssistantView.js';
import OrganizerView from './components/OrganizerView.js';
import CreateReminderView from './components/CreateReminderView.js';
import PlanningView from './components/PlanningView.js';
import StudyTrackingView from './components/StudyTrackingView.js';
import AddEventView from './components/AddEventView.js';
import MyItemsView from './components/MyItemsView.js';
import ProfileView from './components/ProfileView.js';
import MemoryView from './components/MemoryView.js';
import InteractiveWidget from './components/InteractiveWidget.js';
import ActivityView from './components/ActivityView.js';
import { LiveVoiceModal } from './components/LiveVoiceModal.js';

// New Profile Sub-Views
import AccountView from './components/AccountView.js';
import PermissionsView from './components/PermissionsView.js';
import ConnectedAppsView from './components/ConnectedAppsView.js';
import PrivacyView from './components/PrivacyView.js';
import FullChatView from './components/FullChatView.js';
import LanguageView from './components/LanguageView.js';
import AboutView from './components/AboutView.js';
import TeamView from './components/TeamView.js';
import { getApiUrl } from './config/api.js';
import AuthLayout from './components/AuthLayout.js';
import { speakHumanVoice } from './utils/voiceUtils.js';

// Types
import { Reminder, Task, Exam, Event as NexaEvent, Memory, Profile } from './types.js';
import { actionExecutionEngine } from './ai/ActionExecutionEngine.js';

// Clean Layered Services
import { UserService } from './services/UserService.js';
import { ReminderService } from './services/ReminderService.js';
import { PlanningService } from './services/PlanningService.js';
import { StudyService } from './services/StudyService.js';
import { ProfileService } from './services/ProfileService.js';
import { ProfileManager } from './services/ProfileManager.js';
import { SpeechService } from './services/SpeechService.js';

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isAuthChecking, setIsAuthChecking] = useState<boolean>(true);

  useEffect(() => {
    const initAuth = async () => {
      const auth = await UserService.isAuthenticated();
      setIsAuthenticated(auth);
      setIsAuthChecking(false);
      
      const localProfile = await ProfileManager.loadProfile();
      if (localProfile) {
        setProfile(localProfile);
      }
    };
    initAuth();
  }, []);
  const [activeView, setActiveView] = useState<string>('assistant');
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [events, setEvents] = useState<NexaEvent[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isGlobalLiveVoiceOpen, setIsGlobalLiveVoiceOpen] = useState(false);
  const [activityCount, setActivityCount] = useState<number>(5);
  const [reminderToEdit, setReminderToEdit] = useState<Reminder | null>(null);
  const [activeTriggeredReminder, setActiveTriggeredReminder] = useState<Reminder | null>(null);
  
  // Custom toast notification state
  const [toasts, setToasts] = useState<Array<{ id: string; text: string; type: string }>>([]);

  const showToast = (text: string, type: 'success' | 'info' | 'error' = 'success') => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    setToasts(prev => [...prev, { id, text, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  // NEXA Orb State Management
  const [orbState, setOrbState] = useState<'idle' | 'listening' | 'thinking' | 'completed'>('idle');
  const [showQuickPanel, setShowQuickPanel] = useState(false);
  const [quickInput, setQuickInput] = useState('');
  const [quickPanelFeedback, setQuickPanelFeedback] = useState('');
  const [panelVoiceState, setPanelVoiceState] = useState<'idle' | 'listening' | 'processing'>('idle');
  const pressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isLongPressRef = useRef(false);

  useEffect(() => {
    fetchData();
    const unregister = actionExecutionEngine.registerRefreshCallback(() => {
      fetchData();
    });
    return () => {
      unregister();
    };
  }, []);

  const fetchData = async () => {
    try {
      const [remindersRes, tasksRes, examsRes, eventsRes, memoriesRes, profileRes, activitiesRes] = await Promise.all([
        fetch(getApiUrl('/api/reminders')),
        fetch(getApiUrl('/api/tasks')),
        fetch(getApiUrl('/api/exams')),
        fetch(getApiUrl('/api/events')),
        fetch(getApiUrl('/api/memories')),
        fetch(getApiUrl('/api/profile')),
        fetch(getApiUrl('/api/notification-history'))
      ]);

      const safeJson = async (res: Response) => {
        if (!res.ok) return null;
        const ct = res.headers.get('content-type');
        if (ct && ct.includes('application/json')) {
          try {
            return await res.json();
          } catch {
            return null;
          }
        }
        return null;
      };

      const remindersData = await safeJson(remindersRes);
      if (remindersData) {
        setReminders(remindersData);
        await ReminderService.saveReminders(remindersData);
      }
      const tasksData = await safeJson(tasksRes);
      if (tasksData) {
        setTasks(tasksData);
        await PlanningService.saveTasks(tasksData);
      }
      const examsData = await safeJson(examsRes);
      if (examsData) {
        setExams(examsData);
        await StudyService.saveExams(examsData);
      }
      const eventsData = await safeJson(eventsRes);
      if (eventsData) {
        setEvents(eventsData);
        await ProfileService.saveEvents(eventsData);
      }
      const memoriesData = await safeJson(memoriesRes);
      if (memoriesData) setMemories(memoriesData);
      
      const profileData = await safeJson(profileRes);
      if (profileData) {
        const localProfile = await ProfileManager.loadProfile();
        if (localProfile?.avatar_url && localProfile.avatar_url.startsWith('data:image/') && (!profileData.avatar_url || profileData.avatar_url.includes('unsplash'))) {
          profileData.avatar_url = localProfile.avatar_url;
        }
        setProfile(profileData);
        await ProfileManager.saveProfile(profileData);
      }
      const activitiesData = await safeJson(activitiesRes);
      if (activitiesData && Array.isArray(activitiesData)) {
        setActivityCount(activitiesData.length);
      }
    } catch (e) {
      console.error('Error fetching dashboard states:', e);
    }
  };

  // Predefined synthesized alert sounds using Web Audio API
  const playAlertSound = (soundType: string = 'default') => {
    if (soundType === 'none') return;
    const audioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!audioContextClass) return;
    try {
      const ctx = new audioContextClass();
      const now = ctx.currentTime;
      
      if (soundType === 'digital_chimes') {
        const notes = [659.25, 783.99, 987.77]; // E5, G5, B5
        notes.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + idx * 0.15);
          gain.gain.setValueAtTime(0, now + idx * 0.15);
          gain.gain.linearRampToValueAtTime(0.06, now + idx * 0.15 + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.15 + 0.4);
          osc.start(now + idx * 0.15);
          osc.stop(now + idx * 0.15 + 0.4);
        });
      } else if (soundType === 'cosmic_beep') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(1500, now + 0.3);
        gain.gain.setValueAtTime(0.06, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
      } else if (soundType === 'tech_pulse') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'square';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.setValueAtTime(880, now + 0.08);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
      } else if (soundType === 'gentle_flute') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, now);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.08, now + 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc.start(now);
        osc.stop(now + 0.5);
      } else {
        // default high double beep
        [0, 0.25].forEach((delay) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.type = 'sine';
          osc.frequency.setValueAtTime(880, now + delay);
          gain.gain.setValueAtTime(0.07, now + delay);
          gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.18);
          osc.start(now + delay);
          osc.stop(now + delay + 0.2);
        });
      }
    } catch (err) {
      console.error('AudioContext synth error:', err);
    }
  };

  const triggeredSessionIdsRef = useRef<Set<string>>(new Set());

  // Background reminder ticking effect
  useEffect(() => {
    const parseReminderDateTime = (reminder: Reminder): Date | null => {
      if (reminder.scheduled_at) {
        const d = new Date(reminder.scheduled_at);
        if (!isNaN(d.getTime())) return d;
      }
      if (!reminder.date) return null;
      const timeStr = reminder.time ? (reminder.time.split(':').length === 2 ? `${reminder.time}:00` : reminder.time) : '00:00:00';
      const d = new Date(`${reminder.date}T${timeStr}`);
      return isNaN(d.getTime()) ? null : d;
    };

    const sessionStartTime = Date.now();

    const checkScheduledReminders = async () => {
      if (reminders.length === 0) return;
      const now = new Date();

      for (const r of reminders) {
        if (!r.active || r.status === 'completed' || r.status === 'cancelled' || r.status === 'archived' || r.status === 'triggered') {
          continue;
        }

        const scheduledDate = parseReminderDateTime(r);
        if (!scheduledDate) continue;

        const scheduledTime = scheduledDate.getTime();
        const isDue = now.getTime() >= scheduledTime;
        const isStale = (now.getTime() - scheduledTime) > 10 * 60 * 1000 && (scheduledTime < sessionStartTime);

        if (isDue && !triggeredSessionIdsRef.current.has(r.id)) {
          triggeredSessionIdsRef.current.add(r.id);

          if (isStale) {
            // Silently mark stale overdue reminders as triggered on login
            try {
              await fetch(getApiUrl(`/api/reminders/${r.id}/trigger`), { method: 'PUT' });
            } catch (e) {}
            continue;
          }
          
          // Show the fullscreen glowing warning overlay
          setActiveTriggeredReminder(r);
          
          // Play the configured Sound Alarm
          if (r.sound_enabled !== false) {
            playAlertSound(r.sound_name || 'default');
          }

          // Play Speech Synthesis if voice notification is enabled on the reminder
          if (r.voice_notification !== false) {
            fetch(getApiUrl('/api/reminders/reformulate'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ title: r.title, description: r.description || '' })
            })
            .then(res => {
              if (res.ok) return res.json();
              throw new Error("Failed to reformulate");
            })
            .then(data => {
              try {
                speakHumanVoice(data.speechText, { voiceName: r.voice_name, rate: r.voice_speed });
              } catch (voiceErr) {
                console.warn('[VOICE] Autoplay or TTS execution blocked by browser policy:', voiceErr);
              }
            })
            .catch(err => {
              console.error('Speech synthesis error, using dynamic fallback:', err);
              const speechText = `Reminder: It's time to ${r.title.toLowerCase()}.`;
              try {
                speakHumanVoice(speechText, { voiceName: r.voice_name, rate: r.voice_speed });
              } catch (voiceErr) {
                console.warn('[VOICE] Autoplay or TTS execution blocked by browser policy:', voiceErr);
              }
            });
          }

          // Trigger backend endpoint to shift reminder's status to 'triggered' and write History Logs
          try {
            await fetch(getApiUrl(`/api/reminders/${r.id}/trigger`), { method: 'PUT' });
          } catch (apiErr) {
            console.error('Error triggering reminder in DB:', apiErr);
          }
          
          await fetchData();
          break; // process one at a time to prevent overlay clutter
        }
      }
    };

    function isStale(val: boolean) {
      return val;
    }

    const interval = setInterval(checkScheduledReminders, 2000);
    return () => clearInterval(interval);
  }, [reminders]);

  // Navigations routing map
  const renderCurrentView = () => {
    switch (activeView) {
      case 'assistant':
        return (
          <AssistantView 
            onNavigate={setActiveView} 
            reminders={reminders} 
            exams={exams} 
            events={events} 
            tasks={tasks}
            onRefreshData={fetchData} 
            profile={profile}
          />
        );
      case 'organizer':
        return <OrganizerView onNavigate={setActiveView} />;
      case 'create-reminder':
        return (
          <CreateReminderView 
            onBack={() => {
              setReminderToEdit(null);
              setActiveView('organizer');
            }} 
            onReminderSaved={() => {
              setReminderToEdit(null);
              fetchData();
            }} 
            reminderToEdit={reminderToEdit || undefined} 
            reminders={reminders}
            playAlertSound={playAlertSound}
            setActiveTriggeredReminder={setActiveTriggeredReminder}
          />
        );
      case 'planning':
        return <PlanningView onBack={() => setActiveView('organizer')} tasks={tasks} onTaskSaved={fetchData} />;
      case 'study':
        return <StudyTrackingView onBack={() => setActiveView('organizer')} exams={exams} onExamSaved={fetchData} />;
      case 'add-event':
        return <AddEventView onBack={() => setActiveView('organizer')} onEventSaved={fetchData} />;
      case 'my-items':
        return (
          <MyItemsView 
            reminders={reminders} 
            tasks={tasks} 
            exams={exams} 
            events={events} 
            onRefreshData={fetchData} 
            onEditReminder={(r) => {
              setReminderToEdit(r);
              setActiveView('create-reminder');
            }}
            playAlertSound={playAlertSound}
            setActiveTriggeredReminder={setActiveTriggeredReminder}
          />
        );
      case 'profile':
        return (
          <ProfileView 
            profile={profile} 
            onNavigate={setActiveView} 
            onLogout={async () => {
              await UserService.logout();
              setIsAuthenticated(false);
            }} 
            onRefreshData={fetchData}
          />
        );
      case 'memory':
        return <MemoryView onBack={() => setActiveView('profile')} memories={memories} onMemorySaved={fetchData} />;
      case 'activity':
        return <ActivityView onBack={() => setActiveView('assistant')} />;
      case 'demos':
        return <InteractiveWidget />;
      
      // Profile sub-routes
      case 'account':
        return (
          <AccountView 
            onBack={() => setActiveView('profile')} 
            profile={profile} 
            onRefreshData={fetchData} 
            onLogout={async () => {
              await UserService.logout();
              setIsAuthenticated(false);
            }} 
          />
        );
      case 'permissions':
        return <PermissionsView onBack={() => setActiveView('profile')} />;
      case 'connected-apps':
        return <ConnectedAppsView onBack={() => setActiveView('profile')} />;
      case 'privacy':
        return <PrivacyView onBack={() => setActiveView('profile')} onNavigate={setActiveView} />;
      case 'full-chat':
        return <FullChatView onBack={() => setActiveView('assistant')} onRefreshData={fetchData} />;
      case 'language':
        return <LanguageView onBack={() => setActiveView('profile')} />;
      case 'about':
        return <AboutView onBack={() => setActiveView('profile')} />;
      case 'team':
        return <TeamView onBack={() => setActiveView('profile')} />;
      
      default:
        return <div className="text-white text-center pt-20">View not found</div>;
    }
  };

  // Orb actions and trigger timers
  const handleOrbLongPressStart = (e: React.MouseEvent | React.TouchEvent) => {
    isLongPressRef.current = false;
    pressTimerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      triggerVoiceAssistant();
    }, 500);
  };

  const handleOrbLongPressEnd = (e: React.MouseEvent | React.TouchEvent) => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
    }
    if (isLongPressRef.current) {
      stopVoiceAssistant();
    }
  };

  const triggerVoiceAssistant = () => {
    setOrbState('listening');
    setShowQuickPanel(false);

    SpeechService.startRecording({
      onStart: () => {
        setOrbState('listening');
      },
      onError: (err) => {
        console.warn('[VOICE] Orb recording error:', err);
        setOrbState('idle');
      },
      onEnd: (finalTranscript, speechDetected) => {
        const cleanSpeech = finalTranscript.trim();
        setOrbState('idle');
        if (speechDetected && cleanSpeech) {
          setQuickInput(cleanSpeech);
          setShowQuickPanel(true);
        }
      }
    });
  };

  const stopVoiceAssistant = () => {
    SpeechService.stopRecording();
  };

  const handleOrbClick = () => {
    if (!isLongPressRef.current) {
      setPanelVoiceState('idle');
      setShowQuickPanel(prev => !prev);
    }
  };

  const handlePanelVoiceToggle = () => {
    if (panelVoiceState === 'idle') {
      setPanelVoiceState('listening');
      SpeechService.startRecording({
        onStart: () => {
          setPanelVoiceState('listening');
        },
        onResult: (transcript) => {
          setQuickInput(transcript);
        },
        onError: (err) => {
          console.warn('[VOICE] QuickPanel voice error:', err);
          setPanelVoiceState('idle');
          setQuickPanelFeedback(err || 'Microphone access is required for voice input.');
          setTimeout(() => setQuickPanelFeedback(''), 4000);
        },
        onEnd: (finalTranscript, speechDetected) => {
          setPanelVoiceState('idle');
          const cleanSpeech = finalTranscript.trim();

          if (!speechDetected || !cleanSpeech) {
            setQuickPanelFeedback("I didn't hear anything. Please try again.");
            setTimeout(() => setQuickPanelFeedback(''), 4000);
            return;
          }

          setQuickInput(cleanSpeech);
        }
      });
    } else if (panelVoiceState === 'listening') {
      SpeechService.stopRecording();
    }
  };

  const executeQuickCommand = async (textToRun?: string) => {
    const text = textToRun || quickInput;
    if (!text.trim()) return;

    setQuickPanelFeedback('Xena AI is executing requested command...');
    setOrbState('thinking');

    try {
      const res = await fetch(getApiUrl('/api/chat/message'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, type: 'text' })
      });

      if (res.ok) {
        setOrbState('completed');
        setQuickPanelFeedback('Operation processed successfully!');
        await fetchData();
        setTimeout(() => {
          setOrbState('idle');
          setQuickPanelFeedback('');
          setQuickInput('');
          setShowQuickPanel(false);
        }, 1500);
      } else {
        setOrbState('idle');
        setQuickPanelFeedback('Error executing command. Try again.');
        setTimeout(() => setQuickPanelFeedback(''), 3000);
      }
    } catch (e) {
      console.error(e);
      setOrbState('idle');
      setQuickPanelFeedback('Connection failure.');
      setTimeout(() => setQuickPanelFeedback(''), 3000);
    }
  };

  if (isAuthChecking) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0B0E14] text-white">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-8 h-8 border-4 border-nexa-blue border-t-transparent rounded-full animate-spin"></div>
          <span className="text-xs text-gray-400 font-mono">Calibrating session...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <AuthLayout
        onSuccess={async (userData) => {
          await UserService.setAuthenticated(true);
          setIsAuthenticated(true);
          if (profile) {
            setProfile({
              ...profile,
              full_name: userData.name,
              email: userData.email
            });
          }
          fetchData();
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#06080C] text-white flex flex-col justify-between selection:bg-nexa-blue/30 selection:text-white relative">
      
      {/* Top Welcome Title for Desktop Header */}
      <header className="w-full bg-[#0B0E14] border-b border-nexa-border py-4 px-6 md:px-8 flex justify-between items-center relative z-30">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-nexa-blue to-nexa-purple flex items-center justify-center shadow-md">
            <span className="text-white font-black text-sm tracking-widest font-display">X</span>
          </div>
          <div>
            <h1 className="text-base font-bold font-display tracking-tight text-white flex items-center space-x-1.5">
              <span>Xena AI</span>
              <span className="text-[8px] bg-nexa-blue/20 text-nexa-glow border border-nexa-glow/20 px-1.5 py-0.5 rounded font-mono">v1.0</span>
            </h1>
          </div>
        </div>

        {/* Global Premium indicator status */}
        <div className="flex items-center space-x-4">
          {/* History Button (Entry Point) */}
          <button 
            onClick={() => setActiveView('activity')}
            className={`flex items-center space-x-2 text-xs font-bold font-mono uppercase px-3 py-1.5 rounded-xl border transition-all duration-300 relative bg-[#1A2230]/65 border-cyan-500/50 hover:border-nexa-glow hover:shadow-[0_0_15px_rgba(0,229,255,0.3)] text-nexa-glow`}
          >
            <span className="relative flex h-2 w-2 mr-0.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
            </span>
            <span>History 🔔</span>
            <span className="bg-cyan-500/20 text-cyan-400 border border-cyan-400/35 px-1.5 py-0.2 rounded text-[10px] ml-0.5">{activityCount}</span>
          </button>

          <button 
            onClick={() => setActiveView('demos')}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition ${
              activeView === 'demos' ? 'bg-nexa-glow/10 border-nexa-glow text-nexa-glow' : 'bg-nexa-card border-nexa-border text-gray-400 hover:text-white'
            }`}
          >
            Interactive Demos
          </button>
          <div className="hidden md:flex items-center space-x-2 text-[11px] text-gray-400 font-mono">
            <span className="w-2 h-2 rounded-full bg-nexa-glow animate-pulse"></span>
            <span>AGENT INTEGRITY ACTIVE</span>
          </div>
        </div>
      </header>

      {/* Main Responsive Routing Canvas Stage */}
      <main className="flex-1 w-full max-w-5xl mx-auto flex flex-col bg-[#0B0E14] md:border-x border-nexa-border shadow-2xl relative overflow-hidden min-h-[calc(100vh-140px)] pb-28">
        <div className="flex-1 h-full overflow-hidden">
          {renderCurrentView()}
        </div>
      </main>

      {/* Floating Bottom Glass Navigation Bar with central NEXA Orb */}
      <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 w-full max-w-md px-4 z-40">
        <div className="bg-[#0F131A]/95 border border-nexa-border/90 rounded-2xl py-2.5 px-6 flex justify-between items-center backdrop-blur-xl shadow-[0_15px_35px_rgba(0,0,0,0.7)]">
          
          {/* Left Buttons Group */}
          <div className="flex space-x-8">
            <button 
              onClick={() => setActiveView('assistant')}
              className={`flex flex-col items-center justify-center cursor-pointer transition-all duration-300 py-1 ${
                activeView === 'assistant' ? 'text-nexa-glow scale-105' : 'text-gray-500 hover:text-white'
              }`}
            >
              <MessageSquare className="w-5 h-5 mb-0.5" />
              <span className="text-[10px] font-bold tracking-tight font-display">Assistant</span>
            </button>

            <button 
              onClick={() => setActiveView('organizer')}
              className={`flex flex-col items-center justify-center cursor-pointer transition-all duration-300 py-1 ${
                ['organizer', 'create-reminder', 'planning', 'study', 'add-event'].includes(activeView) ? 'text-nexa-glow scale-105' : 'text-gray-500 hover:text-white'
              }`}
            >
              <LayoutGrid className="w-5 h-5 mb-0.5" />
              <span className="text-[10px] font-bold tracking-tight font-display">Organizer</span>
            </button>
          </div>

          {/* Center: THE NEXA ORB Floating Button (Futuristic Glass Core Design) */}
          <div className="relative -top-6">
            <motion.button 
              onMouseDown={handleOrbLongPressStart}
              onMouseUp={handleOrbLongPressEnd}
              onTouchStart={handleOrbLongPressStart}
              onTouchEnd={handleOrbLongPressEnd}
              onClick={handleOrbClick}
              whileHover={{ scale: 1.15 }}
              whileTap={{ scale: 0.95 }}
              className={`w-16 h-16 rounded-full bg-gradient-to-tr from-nexa-blue/80 via-nexa-purple/75 to-cyan-400/90 flex items-center justify-center cursor-pointer border border-cyan-400/80 relative shadow-[0_0_25px_rgba(0,229,255,0.6)] group overflow-hidden ${
                orbState === 'listening' ? 'ring-4 ring-nexa-glow animate-pulse' :
                orbState === 'thinking' ? 'ring-4 ring-nexa-purple' :
                orbState === 'completed' ? 'ring-4 ring-emerald-500' : ''
              }`}
            >
              {/* Floating ambient transparent glass reflection layer */}
              <div className="absolute inset-0.5 rounded-full bg-gradient-to-b from-white/25 to-transparent backdrop-blur-[2px] z-10 pointer-events-none"></div>
              
              {/* Internal energy core glowing bubble */}
              <div className="absolute w-10 h-10 rounded-full bg-cyan-400/35 filter blur-md animate-pulse"></div>
              
              {/* Cyan border ring overlay */}
              <div className="absolute inset-0 rounded-full border border-cyan-300/30"></div>

              {/* Wave pulse/ring during active states */}
              {orbState === 'listening' && (
                <div className="absolute inset-0 bg-nexa-glow/30 animate-ping rounded-full"></div>
              )}
              {orbState === 'thinking' && (
                <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-cyan-400/40 to-transparent animate-spin rounded-full"></div>
              )}

              {/* Central logo with high contrast depth shadow */}
              <span className="text-2xl font-black text-white font-display tracking-widest select-none z-20 drop-shadow-[0_2px_8px_rgba(0,229,255,0.8)]">X</span>
            </motion.button>
            <div className="text-[8px] text-gray-500 mt-1.5 text-center font-mono tracking-wider uppercase font-semibold select-none">
              {orbState === 'listening' ? "Speak Now" : 
               orbState === 'thinking' ? "Thinking" : 
               orbState === 'completed' ? "Completed" : "Xena Orb"}
            </div>
          </div>

          {/* Right Buttons Group */}
          <div className="flex space-x-8">
            <button 
              onClick={() => setActiveView('my-items')}
              className={`flex flex-col items-center justify-center cursor-pointer transition-all duration-300 py-1 ${
                activeView === 'my-items' ? 'text-nexa-glow scale-105' : 'text-gray-500 hover:text-white'
              }`}
            >
              <ClipboardList className="w-5 h-5 mb-0.5" />
              <span className="text-[10px] font-bold tracking-tight font-display">My Items</span>
            </button>

            <button 
              onClick={() => setActiveView('profile')}
              className={`flex flex-col items-center justify-center cursor-pointer transition-all duration-300 py-1 ${
                ['profile', 'account', 'permissions', 'connected-apps', 'privacy', 'memory'].includes(activeView) ? 'text-nexa-glow scale-105' : 'text-gray-500 hover:text-white'
              }`}
            >
              <User className="w-5 h-5 mb-0.5" />
              <span className="text-[10px] font-bold tracking-tight font-display">Profile</span>
            </button>
          </div>

        </div>
      </div>

      {/* Voice Recording overlay simulation */}
      <AnimatePresence>
        {orbState === 'listening' && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 flex flex-col items-center justify-center pointer-events-none select-none">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="flex flex-col items-center space-y-6 bg-slate-900/90 border border-nexa-blue/30 rounded-3xl p-8 shadow-2xl"
            >
              <Mic className="w-12 h-12 text-nexa-glow animate-bounce" />
              <div className="text-center">
                <h4 className="text-sm font-bold uppercase tracking-wider text-white">Xena Voice Capturing</h4>
                <p className="text-xs text-gray-400 mt-1">Release physical hold on the Xena Orb to process speaking context</p>
              </div>

              {/* sound wave visualizer */}
              <div className="flex items-end justify-center space-x-1.5 h-10 w-48">
                <div className="w-1.5 bg-nexa-glow rounded-full animate-[pulse_0.6s_infinite] h-8"></div>
                <div className="w-1.5 bg-nexa-purple rounded-full animate-[pulse_0.8s_infinite] h-4"></div>
                <div className="w-1.5 bg-nexa-glow rounded-full animate-[pulse_0.5s_infinite] h-10"></div>
                <div className="w-1.5 bg-nexa-purple rounded-full animate-[pulse_0.7s_infinite] h-6"></div>
                <div className="w-1.5 bg-nexa-glow rounded-full animate-[pulse_0.9s_infinite] h-5"></div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Quick AI Command Panel Modal */}
      <AnimatePresence>
        {showQuickPanel && (
          <div className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-md bg-[#111621] border border-nexa-border rounded-2xl p-5 text-white shadow-2xl space-y-4"
            >
              <div className="flex justify-between items-center border-b border-nexa-border pb-3">
                <div className="flex items-center space-x-2.5">
                  <span className="w-3 h-3 rounded-full bg-nexa-glow animate-pulse"></span>
                  <h3 className="text-sm font-bold font-display uppercase tracking-wider">Quick AI Command Node</h3>
                </div>
                <button 
                  onClick={() => setShowQuickPanel(false)}
                  className="text-gray-500 hover:text-white font-semibold text-xs transition p-1 cursor-pointer"
                >
                  ✕
                </button>
              </div>              {panelVoiceState === 'listening' ? (
                <div className="flex flex-col items-center justify-center py-6 space-y-4 bg-slate-900/50 rounded-2xl border border-nexa-blue/20 p-4">
                  <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/40 flex items-center justify-center relative">
                    <div className="absolute inset-0 rounded-full bg-red-500/15 animate-ping"></div>
                    <Mic className="w-6 h-6 text-red-500 animate-pulse" />
                  </div>
                  <div className="text-center">
                    <p className="text-xs font-bold text-red-400">Xena Voice Live Capturing...</p>
                    <p className="text-[10px] text-gray-500 mt-0.5 font-mono">Capturing raw audio spectrum analysis</p>
                  </div>

                  {/* Audio Waveform */}
                  <div className="flex items-end justify-center space-x-1.5 h-10 w-44">
                    <div className="w-1.5 bg-red-500 rounded-full animate-[pulse_0.4s_infinite] h-8"></div>
                    <div className="w-1.5 bg-nexa-blue rounded-full animate-[pulse_0.6s_infinite] h-4"></div>
                    <div className="w-1.5 bg-red-500 rounded-full animate-[pulse_0.3s_infinite] h-10"></div>
                    <div className="w-1.5 bg-nexa-purple rounded-full animate-[pulse_0.5s_infinite] h-6"></div>
                    <div className="w-1.5 bg-red-500 rounded-full animate-[pulse_0.7s_infinite] h-5"></div>
                  </div>

                  <button 
                    onClick={handlePanelVoiceToggle}
                    className="w-full py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase tracking-wider transition shadow-lg shadow-red-600/20 cursor-pointer"
                  >
                    Finish & Process
                  </button>
                </div>
              ) : panelVoiceState === 'processing' ? (
                <div className="flex flex-col items-center justify-center py-8 space-y-4 bg-slate-900/50 rounded-2xl border border-nexa-blue/20 p-4">
                  <div className="w-12 h-12 rounded-full border border-dashed border-nexa-glow animate-spin flex items-center justify-center">
                    <div className="w-8 h-8 rounded-full bg-nexa-blue/20 animate-pulse"></div>
                  </div>
                  <div className="text-center">
                    <p className="text-xs font-bold text-nexa-glow animate-pulse">Xena Decrypting Audio Matrix...</p>
                    <p className="text-[9px] text-gray-500 mt-0.5 font-mono">Building natural language parsing trees</p>
                  </div>
                </div>
              ) : quickPanelFeedback ? (
                <div className="p-4 bg-nexa-blue/10 border border-nexa-blue/30 text-nexa-glow rounded-xl text-xs flex items-center space-x-2">
                  <span className="w-2 h-2 rounded-full bg-nexa-glow animate-ping"></span>
                  <span>{quickPanelFeedback}</span>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* PRIMARY ACTION: Large central Talk to NEXA button */}
                  <button 
                    onClick={() => {
                      setShowQuickPanel(false);
                      setIsGlobalLiveVoiceOpen(true);
                    }}
                    className="w-full bg-gradient-to-tr from-nexa-blue/20 to-nexa-purple/20 hover:from-nexa-blue/30 hover:to-nexa-purple/30 border-2 border-nexa-blue/60 hover:border-nexa-glow rounded-2xl p-5 flex flex-col items-center justify-center text-center transition-all duration-300 group relative overflow-hidden cursor-pointer shadow-[0_0_20px_rgba(0,229,255,0.15)] hover:shadow-[0_0_25px_rgba(0,229,255,0.3)]"
                  >
                    <div className="absolute top-0 right-0 w-24 h-24 bg-nexa-glow/10 rounded-full blur-2xl group-hover:bg-nexa-glow/20 transition duration-500"></div>
                    
                    <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-nexa-blue to-nexa-purple flex items-center justify-center text-white text-xl shadow-lg shadow-nexa-blue/30 mb-2.5 group-hover:scale-110 transition duration-300">
                      🎙️
                    </div>
                    
                    <div className="text-sm font-extrabold text-white font-display uppercase tracking-widest flex items-center space-x-1.5">
                      <span>Talk to Xena AI (Live Voice)</span>
                      <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-ping"></span>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1 max-w-[280px]">
                      Hands-free continuous multi-turn live voice conversation
                    </p>
                  </button>

                  <div className="relative flex items-center py-1">
                    <div className="flex-grow border-t border-nexa-border/40"></div>
                    <span className="flex-shrink mx-3 text-[9px] font-bold text-gray-500 uppercase tracking-widest font-mono">Or Text Command</span>
                    <div className="flex-grow border-t border-nexa-border/40"></div>
                  </div>

                  <div className="relative">
                    <input 
                      type="text"
                      placeholder="Type quick prompt (e.g. 'Add reminder buy milk')"
                      value={quickInput}
                      onChange={(e) => setQuickInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && executeQuickCommand()}
                      className="w-full bg-[#0F131A] text-xs text-white border border-nexa-border rounded-xl px-4.5 py-3 pr-12 focus:outline-none focus:border-nexa-blue"
                    />
                    <button 
                      onClick={() => executeQuickCommand()}
                      className="absolute right-2 top-2 p-1.5 rounded-lg bg-nexa-blue hover:bg-blue-600 transition cursor-pointer"
                    >
                      <span className="text-xs">➔</span>
                    </button>
                  </div>

                  <div className="text-[9.5px] font-bold text-gray-400 uppercase tracking-widest pl-1 font-mono">Quick Shortcuts</div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { name: 'Create Reminder', icon: '⏰', view: 'create-reminder', desc: 'Set time alert' },
                      { name: 'Planning', icon: '📅', view: 'planning', desc: 'Schedules timeline' },
                      { name: 'Study Tracking', icon: '🎓', view: 'study', desc: 'Exam milestones' },
                      { name: 'Add Event', icon: '📍', view: 'add-event', desc: 'Calendar entry' }
                    ].map((btn, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          setShowQuickPanel(false);
                          setActiveView(btn.view);
                        }}
                        className="p-3 bg-nexa-card/40 border border-nexa-border/60 hover:border-nexa-blue/50 rounded-xl text-left hover:bg-nexa-border/20 transition cursor-pointer"
                      >
                        <span className="text-base">{btn.icon}</span>
                        <div className="text-[10.5px] font-bold mt-1 text-white">{btn.name}</div>
                        <p className="text-[9px] text-gray-500 mt-0.5">{btn.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="text-[9px] text-center text-gray-500 font-mono tracking-wider">
                XENA AGENT DIRECT TUNNEL • ENCRYPTED
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Footer System protocols active */}
      <footer className="w-full py-4 text-center text-[10px] text-gray-600 font-mono">
        <p>STEEVEZALI INC • XENA AI SECURITY PROTOCOLS ENCRYPTED</p>
      </footer>

      {/* Global Real-time Reminder Trigger Notification Modal Overlay */}
      <AnimatePresence>
        {activeTriggeredReminder && (
          <div className="fixed inset-0 z-50 bg-[#04060A]/95 backdrop-blur-md flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 30 }}
              className="w-full max-w-lg bg-[#0E131F] border-2 border-cyan-500/80 rounded-2xl p-6 shadow-[0_0_50px_rgba(0,229,255,0.35)] space-y-6 relative overflow-hidden text-white"
            >
              {/* Futuristic animated backdrop rays */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[350px] h-[350px] bg-cyan-500/5 rounded-full blur-3xl pointer-events-none"></div>
              
              <div className="flex items-center justify-between border-b border-nexa-border pb-4 relative z-10">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-nexa-blue flex items-center justify-center animate-pulse shadow-[0_0_15px_rgba(0,229,255,0.4)]">
                    <Bell className="w-5 h-5 text-white animate-bounce" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold font-mono tracking-widest text-cyan-400 uppercase">Xena Broadcast Alert</h2>
                    <p className="text-[10px] text-gray-500 font-mono">BROADCASTING AT CH-{activeTriggeredReminder.id.slice(0,4).toUpperCase()}</p>
                  </div>
                </div>
                <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-[10px] font-bold font-mono px-2.5 py-1 rounded-full uppercase tracking-wider animate-pulse">
                  Alarm Active 🚨
                </div>
              </div>

              {/* Reminder Details Block */}
              <div className="space-y-3 relative z-10">
                <span className="text-[10px] font-bold text-cyan-300 bg-cyan-950/40 border border-cyan-500/30 px-2.5 py-0.5 rounded-md uppercase font-mono">
                  {activeTriggeredReminder.category || 'General'}
                </span>
                <h1 className="text-2xl font-extrabold tracking-tight text-white leading-tight">
                  {activeTriggeredReminder.title}
                </h1>
                {activeTriggeredReminder.description && (
                  <p className="text-xs text-gray-300 bg-slate-900/60 p-3 rounded-xl border border-nexa-border/40 font-medium">
                    {activeTriggeredReminder.description}
                  </p>
                )}
                <div className="flex items-center space-x-4 text-xs text-gray-400 font-mono">
                  <span className="flex items-center space-x-1">
                    <Clock className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Time scheduled: {activeTriggeredReminder.time}</span>
                  </span>
                  <span>•</span>
                  <span>Repeat: {activeTriggeredReminder.repeat || 'none'}</span>
                </div>
              </div>

              {/* Sound / Speech Active Indicator */}
              <div className="bg-cyan-950/20 border border-cyan-500/20 rounded-xl p-3 flex items-center justify-between text-xs text-cyan-300 relative z-10">
                <div className="flex items-center space-x-2.5">
                  <div className="flex items-end space-x-1 h-5 w-6">
                    <span className="w-1 bg-cyan-400 rounded-full animate-[pulse_0.4s_infinite] h-4"></span>
                    <span className="w-1 bg-cyan-400 rounded-full animate-[pulse_0.6s_infinite] h-2"></span>
                    <span className="w-1 bg-cyan-400 rounded-full animate-[pulse_0.3s_infinite] h-5"></span>
                    <span className="w-1 bg-cyan-400 rounded-full animate-[pulse_0.5s_infinite] h-3"></span>
                  </div>
                  <div>
                    <span className="font-bold text-cyan-300">Active Audio Narration:</span>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {activeTriggeredReminder.voice_notification 
                        ? `Speech Synthesizer running (${activeTriggeredReminder.voice_name || 'System Voice'})` 
                        : 'Predefined beep chime active'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
                  }}
                  className="px-2 py-1 rounded bg-slate-900 border border-cyan-500/30 text-[10px] uppercase font-bold text-gray-300 hover:text-white hover:border-cyan-400 cursor-pointer"
                >
                  Mute Voice 🔇
                </button>
              </div>

              {/* Smart Actions Execution Box */}
              {activeTriggeredReminder.selected_actions && activeTriggeredReminder.selected_actions.length > 0 && (
                <div className="space-y-2 bg-slate-950/50 border border-nexa-border rounded-xl p-4.5 relative z-10">
                  <div className="flex items-center space-x-1.5 pb-2 border-b border-white/5">
                    <Sparkles className="w-3.5 h-3.5 text-nexa-glow" />
                    <span className="text-[10px] font-bold text-gray-300 uppercase tracking-wider font-mono">AI Smart Hardware Linkages Stored</span>
                  </div>
                  <div className="space-y-2 pt-1">
                    {activeTriggeredReminder.selected_actions.map((act: any, idx: number) => (
                      <div key={idx} className="flex items-start space-x-2 text-xs">
                        <span className="text-[10px] text-nexa-glow font-mono mt-0.5">[{idx+1}]</span>
                        <div>
                          <span className="font-bold text-white capitalize">{act.type.replace('_', ' ')}</span>
                          <span className="text-gray-500 text-[10px] ml-1.5 font-mono">➔ {act.targetApp}</span>
                          {act.payload && act.payload.file && (
                            <p className="text-[10px] text-cyan-400 mt-0.5 bg-[#151D2A] px-2 py-0.5 rounded font-mono border border-cyan-500/10 inline-block">
                              📄 {act.payload.file}
                            </p>
                          )}
                          {act.payload && act.payload.app && (
                            <p className="text-[10px] text-cyan-400 mt-0.5 bg-[#151D2A] px-2 py-0.5 rounded font-mono border border-cyan-500/10 inline-block">
                              🖥️ Launch App: {act.payload.app}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions Button Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 relative z-10">
                <button
                  type="button"
                  onClick={async () => {
                    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
                    
                    const snoozedTime = new Date(Date.now() + 5 * 60 * 1000);
                    const snoozedDateStr = snoozedTime.getFullYear() + '-' + 
                                           String(snoozedTime.getMonth() + 1).padStart(2, '0') + '-' + 
                                           String(snoozedTime.getDate()).padStart(2, '0');
                    const snoozedTimeStr = String(snoozedTime.getHours()).padStart(2, '0') + ':' + 
                                           String(snoozedTime.getMinutes()).padStart(2, '0');
                    
                    try {
                      await fetch(getApiUrl(`/api/reminders/${activeTriggeredReminder.id}`), {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          ...activeTriggeredReminder,
                          date: snoozedDateStr,
                          time: snoozedTimeStr,
                          status: 'scheduled'
                        })
                      });
                      
                      triggeredSessionIdsRef.current.delete(activeTriggeredReminder.id);
                      playAlertSound('gentle_flute');
                      setActiveTriggeredReminder(null);
                      await fetchData();
                      showToast("Reminder postponed for 5 minutes.", "success");
                    } catch (err) {
                      console.error(err);
                    }
                  }}
                  className="w-full py-3 rounded-xl bg-[#1C2433] hover:bg-[#253045] active:scale-95 text-white border border-nexa-border text-xs font-bold uppercase tracking-wider transition cursor-pointer text-center flex items-center justify-center space-x-1.5"
                >
                  <span>Snooze 5 Minutes 💤</span>
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
                    try {
                      const res = await fetch(getApiUrl(`/api/reminders/${activeTriggeredReminder.id}/complete`), { method: 'PUT' });
                      if (res.ok) {
                        playAlertSound('digital_chimes');
                        setActiveTriggeredReminder(null);
                        await fetchData();
                        showToast("Reminder completed.", "success");
                      }
                    } catch (err) {
                      console.error(err);
                    }
                  }}
                  className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-slate-950 text-xs font-bold uppercase tracking-wider transition shadow-lg shadow-emerald-500/20 cursor-pointer text-center flex items-center justify-center space-x-1.5"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-slate-950" />
                  <span>Mark as Completed</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
                    setActiveTriggeredReminder(null);
                    showToast("Reminder dismissed.", "success");
                  }}
                  className="w-full py-3 rounded-xl bg-[#0F131A] hover:bg-[#1A2230] active:scale-95 text-gray-400 hover:text-white border border-nexa-border text-xs font-bold uppercase tracking-wider transition cursor-pointer text-center"
                >
                  <span>Dismiss</span>
                </button>
              </div>

              <div className="text-[9px] text-center text-cyan-500/50 font-mono tracking-widest uppercase relative z-10 pt-2 border-t border-cyan-500/10">
                XENA AUTOMATION PLATFORM • END-TO-END VERIFIED
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Global Live Voice Modal */}
      <LiveVoiceModal
        isOpen={isGlobalLiveVoiceOpen}
        onClose={() => setIsGlobalLiveVoiceOpen(false)}
        onRefreshData={fetchData}
        profileName={profile?.full_name}
      />

      {/* Floating Toast Notifications */}
      <div className="fixed top-6 right-6 z-[9999] flex flex-col space-y-3 pointer-events-none max-w-sm w-full">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: -20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85, transition: { duration: 0.15 } }}
              className="pointer-events-auto w-full bg-[#0E131F]/95 border border-emerald-500/30 text-white rounded-xl p-3.5 shadow-[0_4px_25px_rgba(16,185,129,0.18)] flex items-center space-x-3 backdrop-blur-md"
            >
              <div className="flex-shrink-0 bg-emerald-500/10 p-1.5 rounded-lg border border-emerald-500/20">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold text-gray-200 font-sans tracking-wide leading-tight">
                  {toast.text}
                </p>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
