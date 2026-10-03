// Xena AI Voice Utility for Human-Like Neural Text-to-Speech & Conversational Prosody
import { SpeechService } from '../services/SpeechService.js';

export interface GeminiVoiceProfile {
  id: string;
  name: string;
  gender: 'female' | 'male' | 'neutral';
  label: string;
  description: string;
  badge: string;
}

export const GEMINI_VOICE_PROFILES: GeminiVoiceProfile[] = [
  {
    id: 'Aoede',
    name: 'Aoede',
    gender: 'female',
    label: 'Aoede (Warm & Natural)',
    description: 'Expressive, warm conversational companion voice with natural rhythm',
    badge: 'Recommended'
  },
  {
    id: 'Kore',
    name: 'Kore',
    gender: 'female',
    label: 'Kore (Clear & Articulate)',
    description: 'Crisp, poised academic mentor voice ideal for study guidance',
    badge: 'HD Neural'
  },
  {
    id: 'Zephyr',
    name: 'Zephyr',
    gender: 'neutral',
    label: 'Zephyr (Calm & Balanced)',
    description: 'Smooth, relaxed conversational delivery for focused sessions',
    badge: 'Live Ready'
  },
  {
    id: 'Puck',
    name: 'Puck',
    gender: 'male',
    label: 'Puck (Friendly & Dynamic)',
    description: 'Upbeat, natural male companion voice with conversational warmth',
    badge: 'HD Neural'
  },
  {
    id: 'Fenrir',
    name: 'Fenrir',
    gender: 'male',
    label: 'Fenrir (Deep & Resonant)',
    description: 'Calm, grounded studio-quality male voice',
    badge: 'Studio'
  }
];

export function detectLanguage(text: string): string {
  if (!text) return 'en-US';
  const lower = text.toLowerCase();
  const frenchKeywords = [
    'bonjour', 'rappelle', 'rappeler', 'devoir', 'examen', 'cours', 'heures', 'réunion',
    'reunion', 'rendez-vous', 'demain', "aujourd'hui", 'salut', 'merci', 'à', 'é', 'è', 'ê', 'ç'
  ];
  const hasFrench = frenchKeywords.some(k => lower.includes(k));
  if (hasFrench) {
    return 'fr-FR';
  }
  return 'en-US';
}

/**
 * Transforms Markdown cards, bullet lists, course codes, and technical formatting
 * into warm, natural human-spoken sentences.
 */
export function formatTextForNaturalSpeech(text: string): string {
  if (!text || !text.trim()) return '';

  let spoken = text.trim();

  // Convert structured "## Reminder Created" Markdown card into a natural human sentence
  if (/##\s*Reminder\s+Created/i.test(spoken)) {
    const taskMatch = spoken.match(/\*\*Task:\*\*\s*([^\n]+)/i);
    const dateMatch = spoken.match(/\*\*Date:\*\*\s*([^\n]+)/i);
    const timeMatch = spoken.match(/\*\*Time:\*\*\s*([^\n]+)/i);
    const task = taskMatch ? taskMatch[1].trim() : 'your task';
    const date = dateMatch ? dateMatch[1].trim() : 'today';
    const time = timeMatch ? timeMatch[1].trim().replace(/^0(\d:)/, '$1') : '';
    spoken = time
      ? `Got it! I've set a reminder for ${task} on ${date} at ${time}.`
      : `Got it! I've set a reminder for ${task} on ${date}.`;
  }

  spoken = spoken
    .replace(/^#+\s+(.+)$/gm, '$1.')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^[•\-*]\s+/gm, '')
    .replace(/^[✓✗]\s*/gm, '')
    .replace(/\|/g, ', ')
    .replace(/-{3,}/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`{1,3}([^`]+)`{1,3}/g, '$1')
    // Space out course codes (e.g., CSC305 -> C S C 305, CS-305 -> C S 305)
    .replace(/\b([A-Z]{2,4})-?(\d{3})\b/g, (_, letters: string, digits: string) => `${letters.split('').join(' ')} ${digits}`)
    // Naturalize time ranges (08:00 – 10:00 -> 8:00 to 10:00)
    .replace(/\b0?(\d{1,2}:\d{2})\s*[–—-]\s*0?(\d{1,2}:\d{2})\b/g, '$1 to $2')
    // Naturalize leading zero in 12-hour times (09:00 PM -> 9:00 PM)
    .replace(/\b0(\d:\d{2}\s*(?:AM|PM|am|pm))\b/g, '$1')
    // Naturalize shorthand durations
    .replace(/\b1h\b/g, '1 hour')
    .replace(/\b(\d+(?:\.\d+)?)h\b/g, '$1 hours')
    .replace(/\b(\d+)m\b/g, '$1 minutes')
    .replace(/\n+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\.\.+/g, '.')
    .trim();

  return spoken;
}

/**
 * Get available browser fallback voices and pick the most human/natural sounding voice
 */
export function getBestHumanVoice(langPreference?: string, voiceNamePreference?: string): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;

  const voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return null;

  const targetLang = langPreference || 'en-US';

  if (voiceNamePreference && voiceNamePreference !== 'default' && voiceNamePreference !== 'system') {
    const matched = voices.find(v => v.name.toLowerCase().includes(voiceNamePreference.toLowerCase()));
    if (matched) return matched;
  }

  const premiumKeywords = [
    'natural', 'online', 'enhanced', 'neural', 'google', 'siri', 'samantha',
    'ava', 'allison', 'karen', 'daniel', 'serena', 'oliver', 'victoria', 'fiona', 'moira', 'alex', 'jenny', 'guy', 'sonia', 'denise', 'amelie', 'thomas'
  ];

  const targetPrefix = targetLang.slice(0, 2).toLowerCase();
  const langVoices = voices.filter(v => v.lang.toLowerCase().replace('_', '-').startsWith(targetPrefix));

  for (const keyword of premiumKeywords) {
    const found = langVoices.find(v => v.name.toLowerCase().includes(keyword));
    if (found) return found;
  }

  if (langVoices.length > 0) {
    return langVoices[0];
  }

  for (const keyword of premiumKeywords) {
    const found = voices.find(v => v.name.toLowerCase().includes(keyword));
    if (found) return found;
  }

  return voices[0] || null;
}

/**
 * Speak text using Gemini 3.8 Neural Voice (with automatic browser neural fallback)
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
    SpeechService.speak(
      text,
      {
        onEnd: () => {
          options?.onEnd?.();
          resolve();
        },
        onError: () => {
          options?.onEnd?.();
          resolve();
        }
      },
      {
        voiceName: options?.voiceName,
        rate: options?.rate
      }
    );
  });
}
