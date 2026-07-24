// NEXA AI Voice Utility for Human-sounding Text-to-Speech

export function detectLanguage(text: string): string {
  if (!text) return 'en-US';
  const lower = text.toLowerCase();
  const frenchKeywords = [
    'bonjour', 'rappelle', 'rappeler', 'devoir', 'examen', 'cours', 'heures', 'réunion', 
    'reunion', 'rendez-vous', 'demain', 'aujourd\'hui', 'salut', 'merci', 'à', 'é', 'è', 'ê', 'ç', 'heures'
  ];
  const hasFrench = frenchKeywords.some(k => lower.includes(k));
  if (hasFrench) {
    return 'fr-FR';
  }
  return 'en-US';
}

/**
 * Get available voices and pick the most human/natural sounding voice
 */
export function getBestHumanVoice(langPreference?: string, voiceNamePreference?: string): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;

  const voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return null;

  const targetLang = langPreference || 'en-US';

  // 1. Check if user explicitly selected a voice name (e.g. 'Samantha', 'Google', 'Daniel', 'Karen')
  if (voiceNamePreference && voiceNamePreference !== 'default' && voiceNamePreference !== 'system') {
    const matched = voices.find(v => v.name.toLowerCase().includes(voiceNamePreference.toLowerCase()));
    if (matched) return matched;
  }

  // Keywords that identify high quality natural/human voice models across platforms (Apple, Google, Microsoft)
  const premiumKeywords = [
    'natural', 'online', 'enhanced', 'neural', 'google', 'siri', 'samantha',
    'karen', 'daniel', 'serena', 'oliver', 'victoria', 'fiona', 'moira', 'alex', 'jenny', 'guy', 'sonia', 'denise'
  ];

  const targetPrefix = targetLang.slice(0, 2).toLowerCase();
  const langVoices = voices.filter(v => v.lang.toLowerCase().replace('_', '-').startsWith(targetPrefix));

  // Search for premium natural voice in target language
  for (const keyword of premiumKeywords) {
    const found = langVoices.find(v => v.name.toLowerCase().includes(keyword));
    if (found) return found;
  }

  // If language voices exist, return the first
  if (langVoices.length > 0) {
    return langVoices[0];
  }

  // Search premium voices globally
  for (const keyword of premiumKeywords) {
    const found = voices.find(v => v.name.toLowerCase().includes(keyword));
    if (found) return found;
  }

  return voices[0] || null;
}

/**
 * Speak text using natural human voice with proper speed, pitch and accent
 */
export function speakHumanVoice(
  text: string, 
  options?: {
    rate?: number;
    pitch?: number;
    voiceName?: string;
    lang?: string;
    onEnd?: () => void;
  }
): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      resolve();
      return;
    }

    try {
      window.speechSynthesis.cancel(); // Stop any active speech

      const detectedLang = options?.lang || detectLanguage(text);
      const rate = options?.rate ?? 0.95; // 0.95 gives a natural, clear cadence
      const pitch = options?.pitch ?? 1.0;

      const runSpeech = () => {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = rate;
        utterance.pitch = pitch;
        utterance.lang = detectedLang;

        const bestVoice = getBestHumanVoice(detectedLang, options?.voiceName);
        if (bestVoice) {
          utterance.voice = bestVoice;
        }

        utterance.onend = () => {
          options?.onEnd?.();
          resolve();
        };

        utterance.onerror = (e) => {
          console.warn('SpeechSynthesis execution warning:', e);
          resolve();
        };

        window.speechSynthesis.speak(utterance);
      };

      const voices = window.speechSynthesis.getVoices();
      if (!voices || voices.length === 0) {
        let fired = false;
        const handleVoicesChanged = () => {
          if (fired) return;
          fired = true;
          window.speechSynthesis.removeEventListener('voiceschanged', handleVoicesChanged);
          runSpeech();
        };
        window.speechSynthesis.addEventListener('voiceschanged', handleVoicesChanged);
        setTimeout(() => {
          if (!fired) {
            fired = true;
            window.speechSynthesis.removeEventListener('voiceschanged', handleVoicesChanged);
            runSpeech();
          }
        }, 300);
      } else {
        runSpeech();
      }
    } catch (e) {
      console.error('speakHumanVoice exception:', e);
      resolve();
    }
  });
}
