import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Mic, Send, Bell, CloudSun, Calendar, BookOpen, Clock, AlertCircle, Sparkles, Trash2, Volume2, VolumeX, Radio
} from 'lucide-react';
import { Message, Reminder, Exam, Event as NexaEvent, Task, Profile } from '../types.js';
import MarkdownRenderer from './MarkdownRenderer.js';
import { SpeechService } from '../services/SpeechService.js';
import { ChatComposer } from './ChatComposer.js';
import { LiveVoiceModal } from './LiveVoiceModal.js';
import { getApiUrl } from '../config/api.js';

interface AssistantViewProps {
  onNavigate: (view: string) => void;
  reminders: Reminder[];
  exams: Exam[];
  events: NexaEvent[];
  tasks: Task[];
  onRefreshData: () => void;
  profile: Profile | null;
}

export default function AssistantView({ 
  onNavigate, 
  reminders, 
  exams, 
  events, 
  tasks,
  onRefreshData,
  profile
}: AssistantViewProps) {
  const [inputText, setInputText] = useState('');
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [showVoiceOrb, setShowVoiceOrb] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [audioSpectrum, setAudioSpectrum] = useState<number[]>([]);
  const [voiceFeedbackMsg, setVoiceFeedbackMsg] = useState<string>('');
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);
  const [isLiveVoiceOpen, setIsLiveVoiceOpen] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load chat messages on mount
  useEffect(() => {
    fetchMessages();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [chatMessages]);

  const fetchMessages = async () => {
    try {
      const res = await fetch(getApiUrl('/api/chat/messages'));
      const contentType = res.headers.get('content-type');
      if (res.ok && contentType && contentType.includes('application/json')) {
        const data = await res.json();
        setChatMessages(data);
      }
    } catch (e) {
      console.error('Error fetching chat:', e);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = async (textToSend?: string) => {
    const text = textToSend || inputText;
    if (!text.trim()) return;

    if (!textToSend) setInputText('');

    setIsLoading(true);

    // Optimistically add user message
    const tempUserMsg: Message = {
      id: `temp-u-${Date.now()}`,
      conversation_id: 'conv-1',
      sender: 'user',
      text,
      created_at: new Date().toISOString(),
      type: 'text'
    };
    setChatMessages(prev => [...prev, tempUserMsg]);

    try {
      const response = await fetch(getApiUrl('/api/chat/stream'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, type: 'text' })
      });

      if (response.ok && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let streamingText = '';
        const tempAssistantId = `temp-a-${Date.now()}`;
        let addedTempMessage = false;

        let buffer = '';
        let doneReading = false;
        while (!doneReading) {
          const { value, done } = await reader.read();
          if (done) {
            doneReading = true;
            break;
          }
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('data: ')) {
              try {
                const data = JSON.parse(trimmed.slice(6));
                if (data.chunk) {
                  setIsLoading(false);
                  streamingText += data.chunk;
                  if (!addedTempMessage) {
                    addedTempMessage = true;
                    setChatMessages(prev => [
                      ...prev,
                      {
                        id: tempAssistantId,
                        conversation_id: 'conv-1',
                        sender: 'assistant',
                        text: streamingText,
                        created_at: new Date().toISOString(),
                        type: 'text'
                      }
                    ]);
                  } else {
                    setChatMessages(prev =>
                      prev.map(m => (m.id === tempAssistantId ? { ...m, text: streamingText } : m))
                    );
                  }
                } else if (data.done && data.fullText && !streamingText) {
                  streamingText = data.fullText;
                  if (!addedTempMessage) {
                    addedTempMessage = true;
                    setChatMessages(prev => [
                      ...prev,
                      {
                        id: tempAssistantId,
                        conversation_id: 'conv-1',
                        sender: 'assistant',
                        text: streamingText,
                        created_at: new Date().toISOString(),
                        type: 'text'
                      }
                    ]);
                  } else {
                    setChatMessages(prev =>
                      prev.map(m => (m.id === tempAssistantId ? { ...m, text: streamingText } : m))
                    );
                  }
                }
              } catch (parseErr) {}
            }
          }
        }
        await fetchMessages();
        onRefreshData();
      } else {
        // Fallback to non-streaming endpoint
        const res = await fetch(getApiUrl('/api/chat/message'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, type: 'text' })
        });
        if (res.ok) {
          await fetchMessages();
          onRefreshData();
        }
      }
    } catch (e: any) {
      console.error('Error sending message:', e);
      const errorMsg: Message = {
        id: `temp-a-${Date.now()}`,
        conversation_id: 'conv-1',
        sender: 'assistant',
        text: `Sorry, I faced a network issue connecting to my core brain. (${e?.message || 'NetworkError'})`,
        created_at: new Date().toISOString(),
        type: 'text'
      };
      setChatMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearHistory = async () => {
    if (confirm('Are you sure you want to clear conversation history?')) {
      try {
        const res = await fetch(getApiUrl('/api/chat/clear'), { method: 'POST' });
        if (res.ok) {
          setChatMessages([]);
        }
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleNewConversation = async () => {
    try {
      const res = await fetch(getApiUrl('/api/chat/new'), { method: 'POST' });
      if (res.ok) {
        setChatMessages([]);
        onRefreshData();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleVoiceToggle = () => {
    if (isListening) {
      SpeechService.stopRecording();
      setIsListening(false);
      setShowVoiceOrb(false);
    } else {
      setLiveTranscript('');
      setAudioLevel(0);
      setAudioSpectrum([]);
      setVoiceFeedbackMsg('');

      SpeechService.startRecording({
        onStart: () => {
          setIsListening(true);
          setShowVoiceOrb(true);
        },
        onAudioLevel: (level, spectrum) => {
          setAudioLevel(level);
          setAudioSpectrum(spectrum);
        },
        onResult: (transcript) => {
          setLiveTranscript(transcript);
          setInputText(transcript);
        },
        onError: (err) => {
          console.warn('[VOICE] AssistantView error:', err);
          setIsListening(false);
          setShowVoiceOrb(false);
          setAudioLevel(0);
          setAudioSpectrum([]);
          setVoiceFeedbackMsg(err || "Microphone access is required for voice input.");
          setTimeout(() => setVoiceFeedbackMsg(''), 4000);
        },
        onEnd: (finalTranscript, speechDetected) => {
          setIsListening(false);
          setShowVoiceOrb(false);
          setAudioLevel(0);
          setAudioSpectrum([]);

          const cleanSpeech = finalTranscript.trim();

          if (!speechDetected || !cleanSpeech) {
            setVoiceFeedbackMsg("I didn't hear anything. Please try again.");
            setTimeout(() => setVoiceFeedbackMsg(''), 4000);
            setLiveTranscript('');
            return;
          }

          setInputText(cleanSpeech);
          setLiveTranscript('');
        }
      });
    }
  };

  const handleSpeakMessage = (msgId: string, text: string) => {
    if (speakingMsgId === msgId) {
      SpeechService.stopSpeaking();
      setSpeakingMsgId(null);
    } else {
      setSpeakingMsgId(msgId);
      SpeechService.speak(text, () => {
        setSpeakingMsgId(null);
      });
    }
  };

  const activeReminders = reminders.filter(r => r.active);
  const pendingTasks = tasks.filter(t => t.status !== 'completed');
  const nextEvent = events[0];
  const firstName = profile?.full_name ? profile.full_name.split(' ')[0] : 'Alex';

  return (
    <div id="assistant-view" className="flex flex-col h-full bg-[#0B0E14] overflow-y-auto custom-scrollbar px-4 pt-4 pb-20">
      
      {/* Top Welcome Header */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-full bg-slate-900 border border-nexa-blue/60 overflow-hidden flex-shrink-0 cursor-pointer" onClick={() => onNavigate('profile')}>
            <img 
              src={profile?.avatar_url || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80'} 
              alt={profile?.full_name || 'Alex T.'} 
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white font-display">Good Morning, {firstName}</h1>
            <p className="text-xs text-gray-400 font-medium">Tuesday, May 20, 2025</p>
          </div>
        </div>
        <div className="flex items-center space-x-2 bg-nexa-card/40 border border-nexa-border px-3 py-1.5 rounded-full">
          <CloudSun className="w-4 h-4 text-[#FFB300]" />
          <div className="text-xs font-semibold text-white">24°C</div>
          <div className="text-[10px] text-gray-400">Partly Cloudy</div>
        </div>
      </div>

      {/* Central Robot Visualizer */}
      <div className="flex flex-col items-center justify-center py-6 relative">
        {/* Glowing Ambient Background Circles */}
        <div className="absolute w-64 h-64 bg-nexa-blue/15 rounded-full blur-3xl -top-5 animate-pulse"></div>
        <div className="absolute w-48 h-48 bg-nexa-purple/15 rounded-full blur-3xl -bottom-5"></div>

        {/* Floating Nexa Robot Illustration */}
        <motion.div 
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          onClick={() => setIsLiveVoiceOpen(true)}
          className="relative w-44 h-44 z-10 flex flex-col items-center justify-center mb-2 cursor-pointer group"
        >
          {/* Cybernetic outer glowing ring */}
          <div className="absolute inset-0 rounded-full border border-nexa-blue/40 p-1 group-hover:border-nexa-glow transition duration-500 shadow-[0_0_35px_rgba(0,229,255,0.15)] group-hover:shadow-[0_0_45px_rgba(0,229,255,0.3)]">
            <div className="w-full h-full rounded-full border border-dashed border-nexa-purple/30 animate-[spin_60s_linear_infinite]"></div>
          </div>

          {/* Glowing core background */}
          <div className="absolute w-36 h-36 rounded-full bg-gradient-to-tr from-nexa-blue/10 to-nexa-purple/10 backdrop-blur-md"></div>

          {/* Realistic 3D Robot Avatar Image */}
          <div className="w-34 h-34 rounded-full bg-slate-900 overflow-hidden border-2 border-nexa-blue/80 relative z-10 flex items-center justify-center">
            <img 
              src="/src/assets/images/nexa_robot_avatar_1784050933373.jpg" 
              alt="Xena AI Companion" 
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover select-none"
            />
            {/* Status Pulse Dot */}
            <span className="absolute bottom-2.5 right-2.5 w-3 h-3 bg-nexa-glow rounded-full border-2 border-slate-900 animate-pulse shadow-[0_0_10px_#00E5FF]"></span>
          </div>

          {/* Metallic base connection */}
          <div className="absolute -bottom-1 w-12 h-3 bg-[#1C2533] border-b border-nexa-border rounded-b-lg -z-10 shadow-lg"></div>
        </motion.div>

        {/* PROMINENT LIVE VOICE MODE BUTTON */}
        <button
          onClick={() => setIsLiveVoiceOpen(true)}
          className="mt-2 px-5 py-2.5 bg-gradient-to-r from-nexa-blue via-nexa-purple to-cyan-400 hover:opacity-90 rounded-2xl text-xs font-black uppercase font-display tracking-widest text-white shadow-[0_0_25px_rgba(0,229,255,0.35)] hover:shadow-[0_0_35px_rgba(0,229,255,0.6)] active:scale-95 transition-all duration-300 flex items-center space-x-2 cursor-pointer z-20"
        >
          <Radio className="w-4 h-4 animate-pulse text-white" />
          <span>Talk to Xena (Live Voice)</span>
          <span className="w-2 h-2 rounded-full bg-red-400 animate-ping ml-1"></span>
        </button>

        <span className="text-[10px] text-gray-400 mt-2 tracking-widest uppercase font-mono flex items-center space-x-1.5 bg-nexa-card/30 px-3 py-1 rounded-full border border-nexa-border/40 select-none">
          <span className="w-1.5 h-1.5 rounded-full bg-nexa-glow animate-ping"></span>
          <span>XENA AI CORE v1.0 • ONLINE</span>
        </span>
      </div>

      {/* DEDICATED LIVE VOICE MODAL */}
      <LiveVoiceModal
        isOpen={isLiveVoiceOpen}
        onClose={() => setIsLiveVoiceOpen(false)}
        onRefreshData={onRefreshData}
        profileName={profile?.full_name}
      />

      {/* Voice Feedback Alert */}
      {voiceFeedbackMsg && (
        <div className="mb-3 p-2.5 rounded-xl bg-teal-500/10 border border-teal-500/30 text-teal-400 text-[11px] flex items-center space-x-1.5 animate-fadeIn">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          <span>{voiceFeedbackMsg}</span>
        </div>
      )}

      {/* Voice Assistant Visualizer Overlay */}
      <AnimatePresence>
        {showVoiceOrb && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="glassmorphism p-3.5 rounded-xl mb-4 border border-nexa-glow/40 flex items-center justify-between shadow-[0_0_15px_rgba(0,229,255,0.15)]"
          >
            <div className="flex items-center space-x-3 max-w-[75%]">
              <Mic className="w-5 h-5 text-nexa-glow animate-pulse flex-shrink-0" />
              <div className="overflow-hidden">
                <p className="text-xs font-bold text-nexa-glow flex items-center space-x-1">
                  <span>Listening...</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-ping"></span>
                </p>
                <p className="text-[10px] text-gray-300 truncate font-mono mt-0.5">
                  {liveTranscript || "Speak your query clearly..."}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2 flex-shrink-0">
              {/* Real-time audio signal volume visualizer */}
              <div className="flex items-end justify-center space-x-1 h-6 px-1.5 bg-black/30 rounded-lg border border-nexa-blue/30">
                {[0, 1, 2, 3, 4, 5, 6].map((i) => {
                  const specVal = audioSpectrum[i * 2] || 0;
                  const signal = specVal > 0 ? (specVal / 255) * 100 : audioLevel;
                  const barH = Math.max(3, Math.min(22, Math.round((signal / 100) * 22)));
                  return (
                    <div
                      key={i}
                      className="w-1 bg-gradient-to-t from-nexa-blue via-nexa-purple to-nexa-glow rounded-full transition-all duration-75"
                      style={{ height: `${barH}px` }}
                    />
                  );
                })}
              </div>
              <button
                onClick={handleVoiceToggle}
                className="ml-1 px-2.5 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/40 text-[9px] rounded-lg font-bold transition cursor-pointer"
              >
                Stop
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat History Area */}
      <div className="glassmorphism rounded-xl border border-nexa-border p-3 mb-4 flex flex-col h-64 overflow-hidden relative">
        <div className="flex justify-between items-center pb-2 mb-2 border-b border-nexa-border">
          <div className="flex items-center space-x-1.5">
            <Sparkles className="w-3.5 h-3.5 text-nexa-glow" />
            <span className="text-[11px] font-semibold tracking-wider text-gray-300 uppercase">Assistant Log</span>
          </div>
          
          <div className="flex items-center space-x-2">
            <button
              onClick={handleNewConversation}
              className="px-2.5 py-1 rounded-lg bg-nexa-card hover:bg-nexa-border border border-nexa-border text-[10px] font-bold text-gray-200 hover:text-white transition cursor-pointer"
              title="Start a new conversation"
            >
              <span>+ New Conversation</span>
            </button>
            <button 
              onClick={() => onNavigate('full-chat')}
              className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-gradient-to-r from-nexa-blue/15 to-nexa-purple/15 hover:from-nexa-blue/30 hover:to-nexa-purple/30 border border-nexa-blue/30 hover:border-nexa-glow text-[10px] font-bold text-nexa-glow hover:text-white transition-all duration-300 shadow-[0_0_10px_rgba(0,229,255,0.1)] hover:shadow-[0_0_15px_rgba(0,229,255,0.3)] cursor-pointer"
            >
              <Sparkles className="w-2.5 h-2.5 animate-pulse" />
              <span>Open Full Chat</span>
            </button>

            {chatMessages.length > 0 && (
              <button onClick={handleClearHistory} className="text-gray-500 hover:text-red-400 p-1 rounded transition cursor-pointer">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Message Container */}
        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pb-2 pr-1 text-sm">
          {chatMessages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-4 text-gray-500">
              <p className="text-xs">Ask me to schedule a study plan, save reminders, track exams or add upcoming events.</p>
              <div className="mt-3 flex flex-wrap gap-1.5 justify-center">
                <button onClick={() => handleSendMessage("Remind me to buy milk tomorrow at 10 AM")} className="text-[10px] bg-nexa-card border border-nexa-border px-2 py-1 rounded-full text-gray-300 hover:border-nexa-blue">"Remind me..."</button>
                <button onClick={() => handleSendMessage("Track my Computer Architecture exam on August 20")} className="text-[10px] bg-nexa-card border border-nexa-border px-2 py-1 rounded-full text-gray-300 hover:border-nexa-purple">"Track exam..."</button>
                <button onClick={() => handleSendMessage("Plan my day tomorrow")} className="text-[10px] bg-nexa-card border border-nexa-border px-2 py-1 rounded-full text-gray-300 hover:border-nexa-glow">"Plan my day..."</button>
              </div>
            </div>
          ) : (
            chatMessages
              .filter(msg => msg.text && msg.text.trim().length > 0)
              .map((msg) => (
              <div 
                key={msg.id} 
                className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[85%] rounded-xl px-3 py-2 leading-relaxed text-xs ${
                  msg.sender === 'user' 
                    ? 'bg-nexa-blue text-white rounded-tr-none' 
                    : 'bg-[#1D2533] text-gray-200 border border-nexa-border rounded-tl-none'
                }`}>
                  {msg.sender === 'user' ? (
                    <p className="whitespace-pre-wrap">{msg.text}</p>
                  ) : (
                    <div>
                      <MarkdownRenderer content={msg.text} />
                      <div className="flex items-center justify-end mt-1.5 pt-1 border-t border-nexa-border/40 text-[9px]">
                        <button
                          onClick={() => handleSpeakMessage(msg.id, msg.text)}
                          className={`flex items-center space-x-1 px-1.5 py-0.5 rounded hover:bg-white/10 transition cursor-pointer ${
                            speakingMsgId === msg.id ? 'text-nexa-glow font-bold animate-pulse' : 'text-gray-400 hover:text-white'
                          }`}
                          title="Listen to response"
                        >
                          {speakingMsgId === msg.id ? (
                            <>
                              <VolumeX className="w-3 h-3 text-nexa-glow" />
                              <span>Stop</span>
                            </>
                          ) : (
                            <>
                              <Volume2 className="w-3 h-3" />
                              <span>Listen</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-[#1D2533] text-nexa-glow border border-nexa-border rounded-xl rounded-tl-none px-3 py-2 flex items-center space-x-2">
                <span className="text-xs font-semibold animate-pulse">Xena AI is thinking...</span>
                <span className="w-1.5 h-1.5 bg-nexa-glow rounded-full animate-bounce"></span>
                <span className="w-1.5 h-1.5 bg-nexa-purple rounded-full animate-bounce [animation-delay:0.2s]"></span>
                <span className="w-1.5 h-1.5 bg-nexa-glow rounded-full animate-bounce [animation-delay:0.4s]"></span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Multiline Input Form Composer */}
        <div className="mt-2 pt-2 border-t border-nexa-border">
          <ChatComposer
            inputText={inputText}
            setInputText={setInputText}
            onSendMessage={handleSendMessage}
            isLoading={isLoading}
            placeholder="Ask Xena AI anything..."
          />
        </div>
      </div>

      {/* Quick Navigation Drawer Badges */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        {[
          { name: 'Reminder', view: 'create-reminder', color: 'border-amber-500/30 hover:border-amber-500 text-amber-400 bg-amber-500/5' },
          { name: 'Planning', view: 'planning', color: 'border-purple-500/30 hover:border-purple-500 text-purple-400 bg-purple-500/5' },
          { name: 'Study Prep', view: 'study', color: 'border-blue-500/30 hover:border-blue-500 text-blue-400 bg-blue-500/5' },
          { name: 'Add Event', view: 'add-event', color: 'border-teal-500/30 hover:border-teal-500 text-teal-400 bg-teal-500/5' }
        ].map((item, idx) => (
          <button 
            key={idx}
            onClick={() => onNavigate(item.view)}
            className={`border rounded-xl py-2 px-1 flex flex-col items-center justify-center cursor-pointer transition-all duration-300 group ${item.color}`}
          >
            <Sparkles className="w-4 h-4 mb-1 group-hover:animate-pulse" />
            <span className="text-[10px] font-semibold">{item.name}</span>
          </button>
        ))}
      </div>

      {/* Today's Overview Block (Screen 1 Main Feature) */}
      <div className="bg-[#111621] rounded-2xl border border-nexa-border p-4">
        <h2 className="text-sm font-semibold text-gray-300 mb-3 font-display tracking-tight">Today's Overview</h2>
        
        <div className="grid grid-cols-2 gap-2.5">
          {/* Active Reminders Card */}
          <div className="bg-[#151A24] border border-nexa-border rounded-xl p-3 flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-500">
                <Bell className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[10px] text-gray-400 font-semibold">Reminders</div>
                <div className="text-sm font-bold text-white">{activeReminders.length}</div>
              </div>
            </div>
            {activeReminders.length > 0 && <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>}
          </div>

          {/* Study Sessions Card */}
          <div className="bg-[#151A24] border border-nexa-border rounded-xl p-3 flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-500">
                <BookOpen className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[10px] text-gray-400 font-semibold">Study Sessions</div>
                <div className="text-sm font-bold text-white">{exams.length}</div>
              </div>
            </div>
            {exams.length > 0 && <span className="w-2 h-2 rounded-full bg-blue-500"></span>}
          </div>

          {/* Next Event Card */}
          <div className="col-span-2 bg-[#151A24] border border-nexa-border rounded-xl p-3 flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="p-1.5 rounded-lg bg-teal-500/10 text-teal-500">
                <Calendar className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[10px] text-gray-400 font-semibold">Next Event</div>
                <div className="text-xs font-bold text-white mt-0.5">
                  {nextEvent ? `${nextEvent.title} (${nextEvent.time})` : "No upcoming events"}
                </div>
                {nextEvent && <div className="text-[9px] text-gray-500">{nextEvent.location}</div>}
              </div>
            </div>
            <div className="text-[10px] text-gray-400 font-mono bg-nexa-border px-2 py-0.5 rounded">
              {nextEvent ? nextEvent.date : "Free"}
            </div>
          </div>

          {/* Pending Tasks Card */}
          <div className="col-span-2 bg-[#151A24] border border-nexa-border rounded-xl p-3 flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-500">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[10px] text-gray-400 font-semibold">Pending Timeline Tasks</div>
                <div className="text-xs font-bold text-white mt-0.5">
                  {pendingTasks.length > 0 ? `${pendingTasks.length} study & work tasks to do` : "All schedules done for today"}
                </div>
              </div>
            </div>
            <div className="p-1 rounded-full bg-purple-500/20 text-purple-400">
              <AlertCircle className="w-3.5 h-3.5" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
