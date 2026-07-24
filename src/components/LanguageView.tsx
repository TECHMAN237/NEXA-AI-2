import React, { useState, useEffect } from 'react';
import { ArrowLeft, Check, Globe, HelpCircle, AlertCircle } from 'lucide-react';
import { ProfileService } from '../services/ProfileService.js';
import { ProfileManager } from '../services/ProfileManager.js';

interface LanguageViewProps {
  onBack: () => void;
  onRefreshData?: () => void;
}

export default function LanguageView({ onBack, onRefreshData }: LanguageViewProps) {
  const [selectedLang, setSelectedLang] = useState('en');
  const [voiceGender, setVoiceGender] = useState('female');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const loadSettings = async () => {
      const savedLang = await ProfileService.getLanguage();
      const savedVoice = await ProfileService.getVoiceGender();
      if (savedLang) setSelectedLang(savedLang);
      if (savedVoice) setVoiceGender(savedVoice);
    };
    loadSettings();
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

  const selectVoice = async (gender: string) => {
    setVoiceGender(gender);
    await ProfileService.setVoiceGender(gender);
    if (onRefreshData) {
      onRefreshData();
    }
    setMessage(`Voice synth model set to ${gender === 'female' ? 'Aurora (Cyan)' : 'Vektor (Purple)'}!`);
    setTimeout(() => setMessage(''), 2500);
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
          <h1 className="text-xl font-bold font-display tracking-tight text-white">Language & Voice</h1>
          <p className="text-[10px] text-gray-400">Select model localization, voice frequencies & accent nodes</p>
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
            { id: 'en', label: 'English (US & Global)', extra: 'Standard high-fidelity conversational agent schema' },
            { id: 'fr', label: 'Français (EU)', extra: 'Interface française complète et réponses adaptées' }
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

      {/* Voice Synthesis Profile */}
      <div className="bg-[#151A24] border border-nexa-border rounded-2xl p-4 mb-4 space-y-3">
        <h3 className="text-xs font-bold text-gray-300 font-display uppercase tracking-wider pb-2 border-b border-nexa-border/50">Voice Synthesis Node</h3>

        <div className="grid grid-cols-2 gap-2.5">
          {[
            { id: 'female', label: 'Aurora (Female)', freq: 'Pitch 220Hz • Soft' },
            { id: 'male', label: 'Vektor (Male)', freq: 'Pitch 110Hz • Resonant' }
          ].map((voice) => {
            const isSelected = voiceGender === voice.id;
            return (
              <button 
                key={voice.id}
                onClick={() => selectVoice(voice.id)}
                className={`text-left p-3.5 rounded-xl border transition flex flex-col justify-between cursor-pointer ${
                  isSelected 
                    ? 'bg-nexa-blue/10 border-nexa-blue text-white shadow-lg' 
                    : 'bg-[#0F131A] border-nexa-border text-gray-400 hover:border-nexa-blue/30'
                }`}
              >
                <div>
                  <div className={`text-xs font-semibold ${isSelected ? 'text-white' : 'text-gray-300'}`}>{voice.label}</div>
                  <div className="text-[9px] text-gray-500 mt-1">{voice.freq}</div>
                </div>
                {isSelected && (
                  <span className="text-[9px] text-nexa-glow font-bold uppercase tracking-widest mt-3">Active</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="p-3.5 rounded-xl bg-nexa-card/40 border border-nexa-border/50 text-[10px] text-gray-500 flex items-start space-x-2">
        <AlertCircle className="w-4 h-4 text-gray-600 flex-shrink-0 mt-0.5" />
        <span className="leading-relaxed">
          NEXA AI leverages direct device text-to-speech APIs. Custom audio playback loops may require physical verification under standard media permission rules.
        </span>
      </div>
    </div>
  );
}
