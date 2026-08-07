import React, { useState, useRef, useEffect } from 'react';
import { Mic, MicOff, Send, Sparkles, AlertCircle, Loader2 } from 'lucide-react';
import { SpeechService } from '../services/SpeechService.js';

export interface ChatComposerProps {
  inputText: string;
  setInputText: (val: string) => void;
  onSendMessage: (textToSend?: string) => void;
  isLoading?: boolean;
  placeholder?: string;
}

export const ChatComposer: React.FC<ChatComposerProps> = ({
  inputText,
  setInputText,
  onSendMessage,
  isLoading = false,
  placeholder = "Type or speak deep instruction..."
}) => {
  const [isListening, setIsListening] = useState(false);
  const [isProcessingStt, setIsProcessingStt] = useState(false);
  const [audioLevels, setAudioLevels] = useState<number[]>([10, 20, 15, 30, 25, 10, 15, 5]);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [toastNotice, setToastNotice] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow textarea height
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      const maxPx = 140; // Max ~5-6 lines before internal vertical scrolling
      textareaRef.current.style.height = `${Math.min(scrollHeight, maxPx)}px`;
    }
  }, [inputText]);

  // Handle voice recording toggle
  const handleVoiceToggle = async () => {
    setVoiceError(null);
    setToastNotice(null);

    if (isListening) {
      setIsListening(false);
      // Only show processing indicator if we don't already have text in input
      if (!inputText.trim()) {
        setIsProcessingStt(true);
      }
      SpeechService.stopRecording();
      return;
    }

    const started = await SpeechService.startRecording({
      onStart: () => {
        setIsListening(true);
        setIsProcessingStt(false);
      },
      onAudioLevel: (level, spectrum) => {
        if (spectrum && spectrum.length >= 8) {
          const bars = Array.from(spectrum.slice(0, 8)).map(val => Math.max(8, Math.round((val / 255) * 100)));
          setAudioLevels(bars);
        } else {
          const mockBars = Array.from({ length: 8 }, () => Math.max(10, Math.min(100, level * (0.5 + Math.random()))));
          setAudioLevels(mockBars);
        }
      },
      onResult: (liveText) => {
        if (liveText && liveText.trim()) {
          setInputText(liveText);
        }
      },
      onError: (errorMsg) => {
        console.warn('[VOICE_COMPOSER_ERROR]', errorMsg);
        setIsListening(false);
        setIsProcessingStt(false);
        setVoiceError(errorMsg);
      },
      onEnd: (finalTranscript, speechDetected) => {
        console.log('[VOICE_COMPOSER_END] Final:', finalTranscript, 'Detected:', speechDetected);
        setIsListening(false);
        setIsProcessingStt(false);

        if (finalTranscript && finalTranscript.trim()) {
          setInputText(finalTranscript.trim());
        } else if (!speechDetected && !inputText.trim()) {
          setToastNotice("I didn't hear anything. Please try again.");
          setTimeout(() => setToastNotice(null), 4000);
        }
      }
    });

    if (!started) {
      setIsListening(false);
      setIsProcessingStt(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Detect mobile touch
    const isMobile = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

    if (e.key === 'Enter' && !e.shiftKey) {
      if (!isMobile) {
        e.preventDefault();
        if (inputText.trim() && !isLoading && !isListening) {
          onSendMessage();
        }
      }
    }
  };

  return (
    <div className="w-full space-y-2">
      {/* Toast Notice Banner */}
      {toastNotice && (
        <div className="bg-amber-950/60 border border-amber-500/30 text-amber-300 text-xs px-3 py-2 rounded-xl flex items-center space-x-2 animate-fadeIn">
          <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
          <span>{toastNotice}</span>
        </div>
      )}

      {/* Permission / Error Banner */}
      {voiceError && (
        <div className="bg-red-950/60 border border-red-500/30 text-red-300 text-xs px-3 py-2 rounded-xl flex items-center justify-between animate-fadeIn">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <span>{voiceError}</span>
          </div>
          <button 
            onClick={() => setVoiceError(null)}
            className="text-[10px] uppercase font-bold text-red-400 hover:text-white ml-2"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Composer Box */}
      <div className={`bg-[#0F131A] border transition-all duration-200 rounded-2xl p-2 flex items-end space-x-2 ${
        isListening ? 'border-red-500/60 ring-2 ring-red-500/20 bg-[#140D12]' : 'border-nexa-border focus-within:border-nexa-blue focus-within:ring-1 focus-within:ring-nexa-blue/30'
      }`}>
        {/* Multiline Textarea */}
        <div className="flex-1 min-w-0 relative flex flex-col justify-center py-1">
          <textarea
            ref={textareaRef}
            rows={1}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isListening ? "Listening... Speak naturally..." : isProcessingStt ? "Transcribing speech with AI..." : placeholder}
            disabled={isLoading || isProcessingStt}
            className="w-full bg-transparent text-xs text-white placeholder-gray-500 focus:outline-none resize-none overflow-y-auto max-h-36 leading-relaxed px-2 font-sans"
            style={{ minHeight: '38px' }}
          />

          {/* Real-time Waveform Audio Meter while listening */}
          {isListening && (
            <div className="flex items-center space-x-1.5 px-2 pt-1 pb-0.5">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-ping mr-1"></span>
              <span className="text-[10px] font-bold text-red-400 font-mono tracking-wider mr-2 uppercase">Recording</span>
              <div className="flex items-end space-x-1 h-4">
                {audioLevels.map((lvl, idx) => (
                  <div
                    key={idx}
                    className="w-1 bg-gradient-to-t from-red-500 to-amber-400 rounded-full transition-all duration-75"
                    style={{ height: `${Math.max(15, lvl)}%` }}
                  />
                ))}
              </div>
            </div>
          )}

          {/* AI STT Processing Indicator */}
          {isProcessingStt && (
            <div className="flex items-center space-x-2 px-2 pt-1">
              <Loader2 className="w-3.5 h-3.5 text-nexa-glow animate-spin" />
              <span className="text-[10px] font-medium text-nexa-glow font-mono animate-pulse">
                Transcribing audio...
              </span>
            </div>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center space-x-1.5 flex-shrink-0 pb-0.5">
          {/* Microphone Toggle Button */}
          <button
            type="button"
            onClick={handleVoiceToggle}
            disabled={isLoading || isProcessingStt}
            className={`p-2.5 rounded-xl border transition flex-shrink-0 cursor-pointer ${
              isListening
                ? 'bg-red-500 text-white border-red-400 shadow-lg shadow-red-500/30 animate-pulse'
                : 'bg-[#151A24] text-gray-400 hover:text-white border-nexa-border hover:border-nexa-blue/40'
            }`}
            title={isListening ? "Stop Listening & Process Speech" : "Start Voice Input"}
          >
            {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>

          {/* Send Button */}
          <button
            type="button"
            onClick={() => {
              if (inputText.trim() && !isLoading && !isListening) {
                onSendMessage();
              }
            }}
            disabled={!inputText.trim() || isLoading || isListening || isProcessingStt}
            className={`p-2.5 rounded-xl border transition flex-shrink-0 cursor-pointer ${
              inputText.trim() && !isLoading && !isListening && !isProcessingStt
                ? 'bg-gradient-to-tr from-nexa-blue to-blue-600 text-white border-blue-400/30 shadow-lg shadow-nexa-blue/20 hover:opacity-90 active:scale-95'
                : 'bg-[#121620] text-gray-600 border-nexa-border cursor-not-allowed opacity-50'
            }`}
            title="Send Message"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin text-nexa-glow" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Optional subtle status / character count */}
      {inputText.length > 0 && (
        <div className="flex items-center justify-end px-2 text-[9px] text-gray-500 font-mono">
          <span>{inputText.length} chars</span>
        </div>
      )}
    </div>
  );
};
