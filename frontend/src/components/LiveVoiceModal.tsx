import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Mic, MicOff, Volume2, VolumeX, X, Sparkles, AlertCircle, Loader2, RefreshCw, Radio
} from 'lucide-react';
import { SpeechService } from '../services/SpeechService.js';
import MarkdownRenderer from './MarkdownRenderer.js';
import { getApiUrl } from '../config/api.js';

interface LiveVoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRefreshData?: () => void;
  profileName?: string;
}

export interface LiveMessage {
  id: string;
  sender: 'user' | 'xena';
  text: string;
  timestamp: string;
}

export const LiveVoiceModal: React.FC<LiveVoiceModalProps> = ({
  isOpen,
  onClose,
  onRefreshData,
  profileName
}) => {
  const [modeState, setModeState] = useState<'idle' | 'listening' | 'thinking' | 'speaking'>('idle');
  const [liveTranscript, setLiveTranscript] = useState('');
  const [messages, setMessages] = useState<LiveMessage[]>([]);
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [audioSpectrum, setAudioSpectrum] = useState<number[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isOpenRef = useRef(isOpen);
  const isProcessingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    isOpenRef.current = isOpen;
    if (isOpen) {
      setMessages([
        {
          id: `welcome-${Date.now()}`,
          sender: 'xena',
          text: `Hi ${profileName ? profileName.split(' ')[0] : 'there'}, I'm listening. How can I help you today?`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
      setErrorMessage(null);
      setLiveTranscript('');
      
      // Greet user by voice, then start automatic continuous listening loop!
      const initialGreeting = `Hi ${profileName ? profileName.split(' ')[0] : 'there'}, I'm listening. How can I help you today?`;
      setModeState('speaking');
      SpeechService.speak(initialGreeting, () => {
        if (isOpenRef.current) {
          startListeningPass();
        }
      });
    } else {
      handleExit();
    }

    return () => {
      handleExit();
    };
  }, [isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, liveTranscript, modeState]);

  const handleExit = () => {
    isOpenRef.current = false;
    isProcessingRef.current = false;
    if (abortControllerRef.current) {
      try { abortControllerRef.current.abort(); } catch (e) {}
      abortControllerRef.current = null;
    }
    SpeechService.stopSpeaking();
    SpeechService.cleanup();
    setModeState('idle');
    setLiveTranscript('');
  };

  const onCloseModal = () => {
    handleExit();
    onClose();
  };

  // Start a single recording pass in the continuous voice loop
  const startListeningPass = () => {
    if (!isOpenRef.current || isProcessingRef.current) return;

    // Abort pending request if any
    if (abortControllerRef.current) {
      try { abortControllerRef.current.abort(); } catch (e) {}
      abortControllerRef.current = null;
    }

    // Stop ongoing TTS before starting microphone
    SpeechService.stopSpeaking();

    setModeState('listening');
    setLiveTranscript('');
    setErrorMessage(null);

    SpeechService.startRecording({
      onStart: () => {
        if (!isOpenRef.current) return;
        setModeState('listening');
      },
      onAudioLevel: (level, spectrum) => {
        if (!isOpenRef.current) return;
        setAudioLevel(level);
        setAudioSpectrum(spectrum);
      },
      onResult: (transcript) => {
        if (!isOpenRef.current) return;
        setLiveTranscript(transcript);
      },
      onError: (err) => {
        console.warn('[LIVE_MODE_VOICE_ERROR]', err);
        if (!isOpenRef.current) return;
        setModeState('idle');
        setErrorMessage(err || "Microphone access is required for Live Mode.");
      },
      onEnd: (finalTranscript, speechDetected) => {
        if (!isOpenRef.current) return;

        const sttEndTime = Date.now();
        const cleanSpeech = finalTranscript.trim();

        if (cleanSpeech && speechDetected) {
          processUserSpeech(cleanSpeech, sttEndTime);
        } else {
          // If no speech detected, return to listening after short pause
          setLiveTranscript('');
          setModeState('idle');
          if (isOpenRef.current) {
            setTimeout(() => {
              if (isOpenRef.current && modeState === 'idle') {
                startListeningPass();
              }
            }, 800);
          }
        }
      }
    });
  };

  // Process user speech with Xena AI brain (Fast Live Mode Endpoint)
  const processUserSpeech = async (userText: string, sttEndTime?: number) => {
    if (isProcessingRef.current || !isOpenRef.current) return;
    isProcessingRef.current = true;

    const sttEnd = sttEndTime || Date.now();
    const aiStart = Date.now();

    // Abort any existing ongoing fetch request
    if (abortControllerRef.current) {
      try { abortControllerRef.current.abort(); } catch (e) {}
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setModeState('thinking');
    setLiveTranscript('');

    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Append user message to live history
    const userMsg: LiveMessage = {
      id: `u-${Date.now()}`,
      sender: 'user',
      text: userText,
      timestamp: timeStr
    };
    setMessages(prev => [...prev, userMsg]);

    try {
      const res = await fetch(getApiUrl('/api/chat/live'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: userText, type: 'voice' }),
        signal: abortController.signal
      });

      const aiEnd = Date.now();
      const aiFirstResponse = aiEnd;

      if (!isOpenRef.current) {
        isProcessingRef.current = false;
        return;
      }

      if (res.ok) {
        const data = await res.json();
        const replyText = data.replyText || data.assistantMessage?.text || "Done. Is there anything else you need?";

        // Refresh app state (reminders, events, tasks, etc.)
        if (onRefreshData) onRefreshData();

        // Append Xena message
        const xenaMsg: LiveMessage = {
          id: `x-${Date.now()}`,
          sender: 'xena',
          text: replyText,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        setMessages(prev => [...prev, xenaMsg]);

        // Speak response by Voice & when finished, automatically listen again!
        setModeState('speaking');
        isProcessingRef.current = false;

        const ttsStart = Date.now();

        SpeechService.speak(replyText, {
          onStart: () => {
            const ttsFirstAudio = Date.now();
            const playbackStart = ttsFirstAudio;

            const aiFirstSec = ((aiFirstResponse - aiStart) / 1000).toFixed(2);
            const ttsFirstSec = ((ttsFirstAudio - ttsStart) / 1000).toFixed(2);
            const totalLatencySec = ((playbackStart - sttEnd) / 1000).toFixed(2);

            console.log(`[VOICE_LATENCY_METRICS]
STT_END: ${new Date(sttEnd).toISOString()}
AI_START: ${new Date(aiStart).toISOString()}
AI_FIRST_RESPONSE: ${new Date(aiFirstResponse).toISOString()}
AI_END: ${new Date(aiEnd).toISOString()}
TTS_START: ${new Date(ttsStart).toISOString()}
TTS_FIRST_AUDIO: ${new Date(ttsFirstAudio).toISOString()}
PLAYBACK_START: ${new Date(playbackStart).toISOString()}

Summary Metrics:
- AI Generation Latency: ${aiFirstSec}s
- TTS First Audio Latency: ${ttsFirstSec}s
- TOTAL Response Latency (End of speech -> Audio playing): ${totalLatencySec}s`);
          },
          onEnd: () => {
            if (isOpenRef.current) {
              setTimeout(() => {
                if (isOpenRef.current) {
                  startListeningPass();
                }
              }, 200);
            }
          }
        });

      } else {
        throw new Error("API response not ok");
      }
    } catch (e: any) {
      if (e.name === 'AbortError') {
        console.log('[LIVE_MODE] Request aborted due to user interrupt.');
        isProcessingRef.current = false;
        return;
      }

      console.error('[LIVE_MODE_PROCESSING_ERROR]', e);
      isProcessingRef.current = false;

      if (!isOpenRef.current) return;

      const fallbackReply = "I had a connection issue. Could you please say that again?";
      const xenaMsg: LiveMessage = {
        id: `x-${Date.now()}`,
        sender: 'xena',
        text: fallbackReply,
        timestamp: timeStr
      };
      setMessages(prev => [...prev, xenaMsg]);

      setModeState('speaking');
      SpeechService.speak(fallbackReply, () => {
        if (isOpenRef.current) {
          startListeningPass();
        }
      });
    }
  };

  // User taps Orb to control or interrupt
  const handleOrbTap = () => {
    if (modeState === 'speaking' || modeState === 'thinking') {
      // Interruption: Abort ongoing requests & stop speech immediately -> listen
      if (abortControllerRef.current) {
        try { abortControllerRef.current.abort(); } catch (e) {}
        abortControllerRef.current = null;
      }
      isProcessingRef.current = false;
      SpeechService.stopSpeaking();
      startListeningPass();
    } else if (modeState === 'listening') {
      // Force finalize recording
      SpeechService.stopRecording();
    } else if (modeState === 'idle') {
      startListeningPass();
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-[#06080E]/95 backdrop-blur-2xl flex flex-col justify-between p-4 sm:p-6 text-white overflow-hidden selection:bg-nexa-blue/30"
      >
        {/* TOP HEADER BAR */}
        <div className="flex items-center justify-between border-b border-nexa-border/60 pb-3 relative z-20">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-nexa-blue via-nexa-purple to-cyan-400 p-0.5 flex items-center justify-center shadow-[0_0_15px_rgba(0,229,255,0.4)]">
              <div className="w-full h-full bg-[#0B0E14] rounded-[10px] flex items-center justify-center">
                <Radio className="w-4 h-4 text-nexa-glow animate-pulse" />
              </div>
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-sm font-bold font-display uppercase tracking-wider text-white">XENA LIVE VOICE</h2>
                <span className="text-[8px] bg-red-500/20 text-red-400 border border-red-500/30 px-1.5 py-0.2 rounded font-mono font-bold animate-pulse">
                  LIVE
                </span>
              </div>
              <p className="text-[9.5px] text-gray-400 font-mono">Continuous Hands-Free Conversation</p>
            </div>
          </div>

          {/* STATE INDICATOR BADGE */}
          <div className="flex items-center space-x-3">
            <div className={`px-3 py-1 rounded-full border text-[10px] font-bold font-mono tracking-wider uppercase flex items-center space-x-1.5 shadow-lg ${
              modeState === 'listening' ? 'bg-red-500/10 border-red-500/50 text-red-400 animate-pulse' :
              modeState === 'thinking' ? 'bg-nexa-purple/20 border-nexa-purple text-nexa-glow' :
              modeState === 'speaking' ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300' :
              'bg-gray-800 border-gray-700 text-gray-400'
            }`}>
              <span className={`w-2 h-2 rounded-full ${
                modeState === 'listening' ? 'bg-red-500 animate-ping' :
                modeState === 'thinking' ? 'bg-nexa-glow animate-spin' :
                modeState === 'speaking' ? 'bg-cyan-400 animate-bounce' : 'bg-gray-500'
              }`}></span>
              <span>
                {modeState === 'listening' ? 'LISTENING' :
                 modeState === 'thinking' ? 'THINKING' :
                 modeState === 'speaking' ? 'SPEAKING' : 'TAP TO TALK'}
              </span>
            </div>

            {/* EXIT BUTTON */}
            <button
              onClick={onCloseModal}
              className="px-3 py-1.5 rounded-xl bg-red-500/15 hover:bg-red-500/30 border border-red-500/40 text-red-300 hover:text-white text-xs font-bold transition flex items-center space-x-1 cursor-pointer"
              title="Exit Live Mode"
            >
              <X className="w-4 h-4" />
              <span className="hidden sm:inline">Exit</span>
            </button>
          </div>
        </div>

        {/* ERROR / PERMISSION BANNER */}
        {errorMessage && (
          <div className="my-2 p-2.5 rounded-xl bg-red-950/80 border border-red-500/50 text-red-200 text-xs flex items-center justify-between z-20">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button
              onClick={startListeningPass}
              className="text-[10px] font-bold uppercase bg-red-500/30 hover:bg-red-500/50 px-2 py-1 rounded text-white ml-2 cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {/* CENTRAL ROBOT AVATAR & AUDIO VISUALIZER STAGE */}
        <div className="flex flex-col items-center justify-center my-2 relative z-10">
          
          {/* Ambient Glow Rays */}
          <div className={`absolute w-72 h-72 rounded-full blur-3xl transition-all duration-500 ${
            modeState === 'listening' ? 'bg-red-500/20 animate-pulse' :
            modeState === 'thinking' ? 'bg-nexa-purple/25 animate-spin' :
            modeState === 'speaking' ? 'bg-nexa-glow/25' : 'bg-nexa-blue/10'
          }`}></div>

          {/* Interactive Floating Avatar Orb */}
          <motion.div
            onClick={handleOrbTap}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="relative w-40 h-40 sm:w-48 sm:h-48 cursor-pointer flex flex-col items-center justify-center group"
          >
            {/* Outer Cybernetic Ring */}
            <div className={`absolute inset-0 rounded-full border-2 transition-all duration-300 ${
              modeState === 'listening' ? 'border-red-500 ring-4 ring-red-500/20 shadow-[0_0_40px_rgba(239,68,68,0.4)]' :
              modeState === 'thinking' ? 'border-nexa-glow ring-4 ring-nexa-glow/20 shadow-[0_0_40px_rgba(0,229,255,0.4)]' :
              modeState === 'speaking' ? 'border-cyan-400 ring-4 ring-cyan-400/20 shadow-[0_0_40px_rgba(34,211,238,0.4)]' :
              'border-nexa-border hover:border-nexa-blue'
            }`}>
              <div className="w-full h-full rounded-full border border-dashed border-cyan-400/20 animate-[spin_40s_linear_infinite]"></div>
            </div>

            {/* 3D Robot Image Core */}
            <div className="w-32 h-32 sm:w-38 sm:h-38 rounded-full bg-slate-900 overflow-hidden border-2 border-cyan-400/80 relative z-10 flex items-center justify-center shadow-2xl">
              <img
                src="/src/assets/images/nexa_robot_avatar_1784050933373.jpg"
                alt="Xena Live Companion"
                referrerPolicy="no-referrer"
                className={`w-full h-full object-cover select-none transition-transform duration-500 ${
                  modeState === 'speaking' ? 'scale-105' : ''
                }`}
              />

              {/* State Pulse Badge Overlay */}
              <div className="absolute inset-0 bg-black/10 flex items-center justify-center pointer-events-none">
                {modeState === 'listening' && (
                  <div className="p-3 rounded-full bg-red-600/80 text-white shadow-lg animate-pulse">
                    <Mic className="w-6 h-6" />
                  </div>
                )}
                {modeState === 'thinking' && (
                  <div className="p-3 rounded-full bg-nexa-purple/80 text-white shadow-lg animate-spin">
                    <Loader2 className="w-6 h-6" />
                  </div>
                )}
                {modeState === 'speaking' && (
                  <div className="p-3 rounded-full bg-cyan-500/80 text-white shadow-lg animate-bounce">
                    <Volume2 className="w-6 h-6" />
                  </div>
                )}
              </div>
            </div>

            {/* Tap Action Hint */}
            <div className="absolute -bottom-6 text-[9px] font-mono tracking-widest text-gray-400 uppercase bg-[#0B0E14]/80 px-2.5 py-0.5 rounded-full border border-nexa-border z-20">
              {modeState === 'speaking' ? 'Tap to Interrupt' :
               modeState === 'listening' ? 'Tap to Send' : 'Tap to Talk'}
            </div>
          </motion.div>

          {/* REAL-TIME AUDIO SIGNAL SPECTRUM WAVEFORM */}
          {modeState === 'listening' && (
            <div className="mt-8 flex items-center space-x-1.5 h-8 px-4 bg-black/40 rounded-full border border-red-500/30">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-ping mr-2"></span>
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => {
                const specVal = audioSpectrum[i * 2] || 0;
                const signal = specVal > 0 ? (specVal / 255) * 100 : audioLevel;
                const barH = Math.max(4, Math.min(28, Math.round((signal / 100) * 28)));
                return (
                  <div
                    key={i}
                    className="w-1 bg-gradient-to-t from-red-500 via-amber-400 to-cyan-300 rounded-full transition-all duration-75"
                    style={{ height: `${barH}px` }}
                  />
                );
              })}
            </div>
          )}

          {modeState === 'speaking' && (
            <div className="mt-8 flex items-center space-x-1.5 h-8 px-4 bg-black/40 rounded-full border border-cyan-400/30">
              <Volume2 className="w-4 h-4 text-cyan-300 animate-pulse mr-2" />
              {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                <div
                  key={i}
                  className="w-1 bg-gradient-to-t from-cyan-500 to-nexa-glow rounded-full animate-[pulse_0.6s_infinite] h-6"
                  style={{ animationDelay: `${i * 0.1}s` }}
                />
              ))}
            </div>
          )}

          {modeState === 'thinking' && (
            <div className="mt-8 flex items-center space-x-2 text-xs text-nexa-glow font-mono animate-pulse">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Xena is understanding & preparing response...</span>
            </div>
          )}
        </div>

        {/* LIVE TRANSCRIPT & DIALOGUE LOG */}
        <div className="flex-1 bg-[#0A0E17]/90 border border-nexa-border/80 rounded-2xl p-3 sm:p-4 my-2 flex flex-col overflow-hidden relative shadow-inner">
          <div className="flex items-center justify-between border-b border-nexa-border/40 pb-2 mb-2 text-[10px] font-mono text-gray-400 uppercase tracking-wider">
            <span className="flex items-center space-x-1.5">
              <Sparkles className="w-3 h-3 text-nexa-glow" />
              <span>Session Dialogue Log</span>
            </span>
            <span>{messages.length} exchanges</span>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 pr-1 text-xs">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 leading-relaxed ${
                    m.sender === 'user'
                      ? 'bg-gradient-to-r from-nexa-blue to-blue-600 text-white rounded-tr-none border border-blue-400/30 shadow-md'
                      : 'bg-[#141B28] text-gray-200 border border-nexa-border rounded-tl-none shadow-sm'
                  }`}
                >
                  {m.sender === 'user' ? (
                    <p className="whitespace-pre-wrap">{m.text}</p>
                  ) : (
                    <MarkdownRenderer content={m.text} />
                  )}
                  <div className={`text-[8px] font-mono mt-1 ${m.sender === 'user' ? 'text-blue-200/60 text-right' : 'text-gray-500'}`}>
                    {m.timestamp}
                  </div>
                </div>
              </div>
            ))}

            {/* LIVE SPEECH TRANSCRIPTION PREVIEW */}
            {liveTranscript && (
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl rounded-tr-none px-3.5 py-2.5 bg-red-950/40 border border-red-500/40 text-red-200 font-mono text-xs animate-pulse">
                  <span className="text-[9px] uppercase font-bold text-red-400 block mb-0.5">Listening...</span>
                  {liveTranscript}
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* BOTTOM ACTION BAR */}
        <div className="pt-2 flex items-center justify-between border-t border-nexa-border/60 text-xs relative z-20">
          <div className="flex items-center space-x-2 text-[10px] text-gray-400 font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-nexa-glow animate-ping"></span>
            <span>NO MANUAL TYPING NEEDED</span>
          </div>

          <button
            onClick={modeState === 'listening' ? () => SpeechService.stopRecording() : startListeningPass}
            className={`px-4 py-2 rounded-xl border text-xs font-bold uppercase font-mono transition flex items-center space-x-2 cursor-pointer ${
              modeState === 'listening'
                ? 'bg-red-600 hover:bg-red-700 text-white border-red-400 shadow-lg shadow-red-600/30'
                : 'bg-nexa-blue/20 hover:bg-nexa-blue/40 text-nexa-glow border-nexa-blue/50'
            }`}
          >
            {modeState === 'listening' ? (
              <>
                <MicOff className="w-4 h-4" />
                <span>Finish Speaking</span>
              </>
            ) : (
              <>
                <Mic className="w-4 h-4" />
                <span>Start Talking</span>
              </>
            )}
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
