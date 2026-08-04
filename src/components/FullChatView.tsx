import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import { 
  ArrowLeft, Send, Mic, Sparkles, Trash2, Volume2, ShieldAlert, Check, Cpu 
} from 'lucide-react';
import { Message } from '../types.js';

interface FullChatViewProps {
  onBack: () => void;
  onRefreshData: () => void;
}

export default function FullChatView({ onBack, onRefreshData }: FullChatViewProps) {
  const [inputText, setInputText] = useState('');
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [showVoiceOrb, setShowVoiceOrb] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchMessages();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [chatMessages, isLoading]);

  const fetchMessages = async () => {
    try {
      const res = await fetch('/api/chat/messages');
      if (res.ok) {
        const data = await res.json();
        setChatMessages(data);
      }
    } catch (e) {
      console.error('Error fetching chat messages:', e);
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

    // Add user message optimistically
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
      const response = await fetch('/api/chat/stream', {
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

        let doneReading = false;
        while (!doneReading) {
          const { value, done } = await reader.read();
          if (done) {
            doneReading = true;
            break;
          }
          const chunkStr = decoder.decode(value, { stream: true });
          const lines = chunkStr.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.chunk) {
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
                }
              } catch (parseErr) {}
            }
          }
        }
        await fetchMessages();
        onRefreshData();
      } else {
        const res = await fetch('/api/chat/message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, type: 'text' })
        });

        if (res.ok) {
          await fetchMessages();
          onRefreshData();
        }
      }
    } catch (e) {
      console.error('Error sending message:', e);
      const errorMsg: Message = {
        id: `temp-a-${Date.now()}`,
        conversation_id: 'conv-1',
        sender: 'assistant',
        text: 'Connection reset. Unable to bridge request to cloud brain.',
        created_at: new Date().toISOString(),
        type: 'text'
      };
      setChatMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearHistory = async () => {
    if (confirm('Are you sure you want to permanently clear your chat history logs?')) {
      try {
        const res = await fetch('/api/chat/clear', { method: 'POST' });
        if (res.ok) {
          setChatMessages([]);
          setSuccessMsg('History successfully wiped!');
          setTimeout(() => setSuccessMsg(''), 2500);
          onRefreshData();
        }
      } catch (e) {
        console.error('Error clearing chat history:', e);
      }
    }
  };

  const handleVoiceToggle = () => {
    if (isListening) {
      setIsListening(false);
      setShowVoiceOrb(false);
      // Mock random transcript submission
      const mockTranscripts = [
        "Plan study slots for tomorrow morning",
        "Remind me to read Computer Architecture book at 4 PM",
        "Track software engineering deadline next week",
        "Find study spaces nearby"
      ];
      const randomText = mockTranscripts[Math.floor(Math.random() * mockTranscripts.length)];
      handleSendMessage(randomText);
    } else {
      setIsListening(true);
      setShowVoiceOrb(true);
      
      // Beep tone
      const audioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (audioCtx) {
        try {
          const ctx = new audioCtx();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.setValueAtTime(600, ctx.currentTime);
          gain.gain.setValueAtTime(0.05, ctx.currentTime);
          osc.start();
          osc.stop(ctx.currentTime + 0.1);
        } catch (e) {}
      }
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0B0E14] text-white px-4 pt-4 pb-24 overflow-hidden">
      {/* Header Bar */}
      <div className="flex items-center justify-between pb-4 border-b border-nexa-border mb-4">
        <div className="flex items-center space-x-3">
          <button 
            onClick={onBack}
            className="p-2 rounded-lg bg-nexa-card hover:bg-nexa-border text-gray-400 hover:text-white transition cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-base font-bold font-display tracking-tight text-white flex items-center space-x-2">
              <span>Xena AI Agent</span>
              <span className="w-1.5 h-1.5 rounded-full bg-nexa-glow animate-ping"></span>
            </h1>
            <p className="text-[9px] text-gray-400 font-mono">SECURE AGENT DIRECT ENVELOPE</p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {chatMessages.length > 0 && (
            <button 
              onClick={handleClearHistory}
              className="p-2 rounded-lg bg-nexa-card hover:bg-red-950/20 text-gray-400 hover:text-red-400 transition cursor-pointer"
              title="Clear conversation log"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          <span className="text-[9px] font-mono tracking-widest text-nexa-glow bg-nexa-blue/10 border border-nexa-blue/20 px-2 py-0.5 rounded-full uppercase">
            ONLINE
          </span>
        </div>
      </div>

      {/* Success Notification */}
      {successMsg && (
        <div className="mb-3 p-2.5 rounded-xl bg-teal-500/10 border border-teal-500/30 text-teal-400 text-[11px] flex items-center space-x-1.5">
          <Check className="w-3.5 h-3.5" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Voice Assistant Overlay */}
      <AnimatePresence>
        {showVoiceOrb && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mb-3 p-3.5 rounded-xl bg-gradient-to-r from-nexa-blue/15 to-nexa-purple/15 border border-nexa-blue/30 flex items-center justify-between"
          >
            <div className="flex items-center space-x-3">
              <Volume2 className="w-4.5 h-4.5 text-nexa-glow animate-bounce" />
              <div>
                <p className="text-xs font-semibold text-nexa-glow">Orb Voice Link Enabled</p>
                <p className="text-[10px] text-gray-400">Capturing local audio environment...</p>
              </div>
            </div>
            <div className="flex items-end justify-center space-x-1 h-6">
              <div className="w-1 bg-nexa-glow rounded-full animate-[pulse_0.4s_infinite] h-4"></div>
              <div className="w-1 bg-nexa-purple rounded-full animate-[pulse_0.6s_infinite] h-6"></div>
              <div className="w-1 bg-nexa-glow rounded-full animate-[pulse_0.3s_infinite] h-3"></div>
              <div className="w-1 bg-nexa-purple rounded-full animate-[pulse_0.5s_infinite] h-5"></div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Core Message Stream View */}
      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 mb-4 pr-1">
        {chatMessages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-4">
            <div className="w-12 h-12 rounded-full bg-nexa-blue/10 border border-nexa-blue/30 flex items-center justify-center text-nexa-glow shadow-[0_0_15px_rgba(0,229,255,0.1)]">
              <Cpu className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-white font-display">Begin Interactive Dialogue</h3>
              <p className="text-[10.5px] text-gray-400 mt-1 max-w-xs leading-relaxed">
                Xena AI listens, schedules, and categorizes goals using standard schema definitions. Try typing a direct instruction:
              </p>
            </div>

            <div className="w-full max-w-sm grid grid-cols-1 gap-2 pt-2">
              {[
                { title: "Plan upcoming study goals", subtitle: "Assign focus blocks to high priority exams" },
                { title: "Set interactive event schedule", subtitle: "Add lecture timelines for tomorrow morning" },
                { title: "Track Computer Architecture Exam", subtitle: "Set target date for August 20" }
              ].map((rec, i) => (
                <button 
                  key={i}
                  onClick={() => handleSendMessage(rec.title)}
                  className="p-3 bg-[#151A24] border border-nexa-border rounded-xl hover:border-nexa-blue/50 text-left transition cursor-pointer group"
                >
                  <div className="text-[11px] font-bold text-white group-hover:text-nexa-glow transition">{rec.title}</div>
                  <div className="text-[9px] text-gray-500 mt-0.5">{rec.subtitle}</div>
                </button>
              ))}
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
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 leading-relaxed text-xs shadow-md ${
                msg.sender === 'user' 
                  ? 'bg-gradient-to-tr from-nexa-blue to-blue-600 text-white rounded-tr-none border border-blue-400/20' 
                  : 'bg-[#151A24] text-gray-200 border border-nexa-border rounded-tl-none'
              }`}>
                {msg.sender === 'user' ? (
                  <p className="whitespace-pre-wrap">{msg.text}</p>
                ) : (
                  <div className="markdown-content">
                    <ReactMarkdown>{msg.text}</ReactMarkdown>
                  </div>
                )}
                <div className={`text-[8px] mt-1 text-right font-mono ${msg.sender === 'user' ? 'text-blue-200/60' : 'text-gray-500'}`}>
                  {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          ))
        )}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-[#151A24] border border-nexa-border text-nexa-glow rounded-2xl rounded-tl-none px-4 py-3 flex items-center space-x-2 shadow-sm">
              <span className="text-xs font-semibold animate-pulse">Xena AI is thinking...</span>
              <span className="w-1.5 h-1.5 bg-nexa-glow rounded-full animate-bounce"></span>
              <span className="w-1.5 h-1.5 bg-nexa-purple rounded-full animate-bounce [animation-delay:0.2s]"></span>
              <span className="w-1.5 h-1.5 bg-nexa-glow rounded-full animate-bounce [animation-delay:0.4s]"></span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Form Bar */}
      <div className="bg-[#0F131A] border border-nexa-border rounded-2xl p-2.5 flex items-center space-x-2">
        <input 
          type="text" 
          placeholder="Type deep instruction here..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
          className="flex-1 bg-[#090C12] text-xs text-white border border-nexa-border rounded-xl px-4 py-3 focus:outline-none focus:border-nexa-blue"
        />
        <button 
          onClick={handleVoiceToggle}
          className={`p-3 rounded-xl border border-nexa-border hover:border-nexa-blue/40 transition flex-shrink-0 cursor-pointer ${
            isListening ? 'bg-red-950/30 text-red-400 border-red-500/40' : 'bg-[#151A24] text-gray-400 hover:text-white'
          }`}
          title="Voice Command"
        >
          <Mic className="w-4 h-4" />
        </button>
        <button 
          onClick={() => handleSendMessage()}
          className="p-3 rounded-xl bg-gradient-to-tr from-nexa-blue to-blue-600 text-white hover:opacity-90 shadow-lg shadow-nexa-blue/20 transition flex-shrink-0 cursor-pointer font-bold"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
