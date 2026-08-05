import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowLeft, Send, Mic, Sparkles, Trash2, Volume2, ShieldAlert, Check, Cpu, VolumeX
} from 'lucide-react';
import { Message } from '../types.js';
import MarkdownRenderer from './MarkdownRenderer.js';
import { SpeechService } from '../services/SpeechService.js';
import { ChatComposer } from './ChatComposer.js';

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
  const [liveTranscript, setLiveTranscript] = useState('');
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [audioSpectrum, setAudioSpectrum] = useState<number[]>([]);
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);
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
      const contentType = res.headers.get('content-type');
      if (res.ok && contentType && contentType.includes('application/json')) {
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
      SpeechService.stopRecording();
      setIsListening(false);
      setShowVoiceOrb(false);
    } else {
      setLiveTranscript('');
      setAudioLevel(0);
      setAudioSpectrum([]);

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
          console.warn('[VOICE] Error:', err);
          setIsListening(false);
          setShowVoiceOrb(false);
          setAudioLevel(0);
          setAudioSpectrum([]);
          setSuccessMsg(err || "Microphone access is required for voice input.");
          setTimeout(() => setSuccessMsg(''), 4000);
        },
        onEnd: (finalTranscript, speechDetected) => {
          setIsListening(false);
          setShowVoiceOrb(false);
          setAudioLevel(0);
          setAudioSpectrum([]);

          const cleanSpeech = finalTranscript.trim();

          if (!speechDetected || !cleanSpeech) {
            setSuccessMsg("I didn't hear anything. Please try again.");
            setTimeout(() => setSuccessMsg(''), 4000);
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
            className="mb-3 p-3.5 rounded-xl bg-gradient-to-r from-nexa-blue/20 to-nexa-purple/20 border border-nexa-blue/40 flex items-center justify-between shadow-[0_0_20px_rgba(0,229,255,0.15)]"
          >
            <div className="flex items-center space-x-3 max-w-[75%]">
              <Mic className="w-5 h-5 text-nexa-glow animate-pulse flex-shrink-0" />
              <div className="overflow-hidden">
                <p className="text-xs font-bold text-nexa-glow flex items-center space-x-1.5">
                  <span>Listening...</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-ping"></span>
                </p>
                <p className="text-[11px] text-gray-200 truncate font-mono mt-0.5">
                  {liveTranscript || "Speak your instruction clearly..."}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2 flex-shrink-0">
              {/* Real-time audio signal volume visualizer */}
              <div className="flex items-end justify-center space-x-1 h-7 px-1 bg-black/30 rounded-lg border border-nexa-blue/30">
                {[0, 1, 2, 3, 4, 5, 6].map((i) => {
                  const specVal = audioSpectrum[i * 2] || 0;
                  const signal = specVal > 0 ? (specVal / 255) * 100 : audioLevel;
                  const barH = Math.max(3, Math.min(26, Math.round((signal / 100) * 26)));
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
                className="ml-2 px-2.5 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/40 text-[10px] rounded-lg font-bold transition cursor-pointer"
              >
                Stop
              </button>
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
                  <div>
                    <MarkdownRenderer content={msg.text} />
                    <div className="flex items-center justify-between mt-2 pt-1 border-t border-nexa-border/40 text-[9px] text-gray-500">
                      <button
                        onClick={() => handleSpeakMessage(msg.id, msg.text)}
                        className={`flex items-center space-x-1 px-1.5 py-0.5 rounded hover:bg-white/10 transition cursor-pointer ${
                          speakingMsgId === msg.id ? 'text-nexa-glow font-bold animate-pulse' : 'text-gray-400 hover:text-white'
                        }`}
                        title="Listen to message"
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
                      <span className="font-mono">
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                )}
                {msg.sender === 'user' && (
                  <div className="text-[8px] mt-1 text-right font-mono text-blue-200/60">
                    {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                )}
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

      {/* Multiline Input Form Composer */}
      <div className="pt-2">
        <ChatComposer
          inputText={inputText}
          setInputText={setInputText}
          onSendMessage={handleSendMessage}
          isLoading={isLoading}
          placeholder="Type or speak deep instruction..."
        />
      </div>
    </div>
  );
}
