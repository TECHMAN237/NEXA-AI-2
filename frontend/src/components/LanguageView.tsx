import React, { useState, useEffect } from 'react';
import { ArrowLeft, Check, Globe, Volume2, Sparkles, Radio } from 'lucide-react';
import { ProfileService } from '../services/ProfileService.js';
import { ProfileManager } from '../services/ProfileManager.js';
import { SpeechService } from '../services/SpeechService.js';
import { GEMINI_VOICE_PROFILES } from '../utils/voiceUtils.js';

interface LanguageViewProps {
  onBack: () => void;
  onRefreshData?: () => void;
}

export default function LanguageView({ onBack, onRefreshData }: LanguageViewProps) {
  const [selectedLang, setSelectedLang] = useState('en');
  const [selectedVoice, setSelectedVoice] = useState<string>(() => SpeechService.getPreferredVoice());
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const loadSettings = async () => {
      const savedLang = await ProfileService.getLanguage();
      const savedVoice = await ProfileService.getVoiceGender();
      if (savedLang) setSelectedLang(savedLang);
      if (savedVoice) {
        const mapped = savedVoice === 'female' ? 'Aoede' : savedVoice === 'male' ? 'Puck' : savedVoice;
        setSelectedVoice(mapped);
        SpeechService.setPreferredVoice(mapped);
      }
    };
    loadSettings();
    return () => {
      SpeechService.stopSpeaking();
    };
  }, []);

  const selectLanguage = async (langId: string) => {
    setSelectedLang(langId);
    await ProfileService.setLanguage(langId);
    
    // Immediately propagate language choice to the profile so that the rest of the application updates
    await ProfileManager.updateProfileField({ language: langId === 'en' ? 'English' : 'Français' });
    if (onRefreshData) {
      onRefreshData();
    }

    setMessage(`Assistant localized to ${langId === 'en' ? 'English (US)' : 'Français (EU)'}!`);
    setTimeout(() => setMessage(''), 2500);
  };

  const selectVoice = async (voiceId: string) => {
    setSelectedVoice(voiceId);
    SpeechService.setPreferredVoice(voiceId);
    await ProfileService.setVoiceGender(voiceId);
    if (onRefreshData) {
      onRefreshData();
    }
    const profile = GEMINI_VOICE_PROFILES.find(v => v.id === voiceId);
    setMessage(`Gemini Neural Voice set to ${profile ? profile.label : voiceId}!`);
    setTimeout(() => setMessage(''), 2500);
  };

  const previewVoice = (voiceId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    SpeechService.stopSpeaking();
    setPreviewingVoice(voiceId);
    SpeechService.setPreferredVoice(voiceId);

    const sampleText = selectedLang === 'fr'
      ? `Bonjour ! Je suis Xena avec la voix ${voiceId}. Prête à organiser votre journée d'étude.`
      : `Hi there! I'm Xena speaking with the ${voiceId} neural voice. Ready to help you plan your studies today.`;

    SpeechService.speak(sampleText, () => {
      setPreviewingVoice(null);
      SpeechService.setPreferredVoice(selectedVoice);
    });
  };

  return (
    <div className="flex flex-col h-full bg-[#0B0E14] text-white px-4 pt-4 pb-20 overflow-y-auto custom-scrollbar">
      {/* Header */}
      <div className="flex items-center space-x-3 mb-6">
        <button 
          onClick={onBack}
          className="p-2 rounded-lg bg-nexa-card hover:bg-nexa-border text-gray-400 hover:text-white transition cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-xl font-bold font-display tracking-tight text-white">Language & Neural Voice</h1>
          <p className="text-[10px] text-gray-400">Configure Gemini Live & Neural Speech voice identity</p>
        </div>
      </div>

      {/* Toast Notification */}
      {message && (
        <div className="mb-4 p-3 rounded-xl bg-nexa-blue/10 border border-nexa-blue/30 text-nexa-glow text-xs flex items-center space-x-2">
          <Check className="w-4 h-4" />
          <span>{message}</span>
        </div>
      )}

      {/* Language Section */}
      <div className="bg-[#151A24] border border-nexa-border rounded-2xl p-4 mb-4 space-y-3">
        <div className="flex items-center space-x-2 pb-2 border-b border-nexa-border/50">
          <Globe className="w-4 h-4 text-nexa-blue" />
          <h3 className="text-xs font-bold text-gray-300 font-display uppercase tracking-wider">Interface Localization</h3>
        </div>

        <div className="space-y-2">
          {[
            { id: 'en', label: 'English (US & Global)', extra: 'Natural conversational English prosody & academic terms' },
            { id: 'fr', label: 'Français (EU)', extra: 'Interface française complète et voix naturelle bilingue' }
          ].map((lang) => {
            const isSelected = selectedLang === lang.id;
            return (
              <button 
                key={lang.id}
                onClick={() => selectLanguage(lang.id)}
                className={`w-full text-left p-3 rounded-xl border transition flex items-center justify-between cursor-pointer ${
                  isSelected 
                    ? 'bg-nexa-blue/10 border-nexa-blue text-white' 
                    : 'bg-[#0F131A] border-nexa-border text-gray-400 hover:border-nexa-blue/40'
                }`}
              >
                <div>
                  <div className={`text-xs font-semibold ${isSelected ? 'text-white' : 'text-gray-300'}`}>{lang.label}</div>
                  <div className="text-[10px] text-gray-500 mt-0.5">{lang.extra}</div>
                </div>
                {isSelected && (
                  <div className="p-1 rounded-full bg-nexa-blue text-white">
                    <Check className="w-3.5 h-3.5" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Gemini Neural Voice Persona Section */}
      <div className="bg-[#151A24] border border-nexa-border rounded-2xl p-4 mb-4 space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-nexa-border/50">
          <div className="flex items-center space-x-2">
            <Radio className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs font-bold text-gray-300 font-display uppercase tracking-wider">Gemini Neural Voice Identity</h3>
          </div>
          <span className="text-[9px] px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 font-semibold">
            24kHz HD Audio
          </span>
        </div>

        <div className="space-y-2.5">
          {GEMINI_VOICE_PROFILES.map((voice) => {
            const isSelected = selectedVoice === voice.id;
            const isPreviewing = previewingVoice === voice.id;
            return (
              <div
                key={voice.id}
                onClick={() => selectVoice(voice.id)}
                className={`w-full text-left p-3.5 rounded-xl border transition flex items-center justify-between cursor-pointer ${
                  isSelected 
                    ? 'bg-nexa-blue/10 border-nexa-blue text-white shadow-lg' 
                    : 'bg-[#0F131A] border-nexa-border text-gray-400 hover:border-nexa-blue/30'
                }`}
              >
                <div className="pr-3">
                  <div className="flex items-center space-x-2">
                    <span className={`text-xs font-semibold ${isSelected ? 'text-white' : 'text-gray-200'}`}>
                      {voice.label}
                    </span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-cyan-300 font-medium">
                      {voice.badge}
                    </span>
                  </div>
                  <div className="text-[10px] text-gray-400 mt-1">{voice.description}</div>
                </div>
                <div className="flex items-center space-x-2 flex-shrink-0">
                  <button
                    type="button"
                    onClick={(e) => previewVoice(voice.id, e)}
                    className={`px-2.5 py-1.5 rounded-lg text-[10px] font-semibold flex items-center space-x-1 border transition cursor-pointer ${
                      isPreviewing
                        ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 animate-pulse'
                        : 'bg-white/5 border-white/10 text-gray-300 hover:text-white hover:bg-white/10'
                    }`}
                    title={`Preview ${voice.name}`}
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>{isPreviewing ? 'Playing...' : 'Sample'}</span>
                  </button>
                  {isSelected && (
                    <div className="p-1 rounded-full bg-nexa-blue text-white">
                      <Check className="w-3.5 h-3.5" />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="p-3.5 rounded-xl bg-nexa-card/40 border border-nexa-border/50 text-[10px] text-gray-400 flex items-start space-x-2">
        <Sparkles className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
        <span className="leading-relaxed">
          Powered by <strong>Gemini Live (gemini-3.8-live)</strong> &amp; <strong>Gemini Neural Speech (gemini-3.8-flash-lite-tts)</strong> with gapless 24kHz PCM streaming and automatic fallback.
        </span>
      </div>
    </div>
  );
}
