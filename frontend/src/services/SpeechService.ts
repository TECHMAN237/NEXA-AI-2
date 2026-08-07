import { ProfileManager } from './ProfileManager.js';

function logTelemetry(event: string, details?: any) {
  const now = Date.now();
  console.log(`[VOICE_TELEMETRY] ${event} t=${now}`, details ? JSON.stringify(details) : '');
}

export interface VoiceRecordingCallbacks {
  onStart?: () => void;
  onAudioLevel?: (level: number, spectrum: number[]) => void;
  onResult?: (transcript: string, isFinal: boolean) => void;
  onError?: (errorMessage: string) => void;
  onEnd?: (finalTranscript: string, speechDetected: boolean) => void;
}

export class SpeechService {
  private static mediaStream: MediaStream | null = null;
  private static audioContext: AudioContext | null = null;
  private static analyser: AnalyserNode | null = null;
  private static animFrameId: number | null = null;
  private static recognition: any = null;
  private static mediaRecorder: MediaRecorder | null = null;
  private static audioChunks: Blob[] = [];
  private static isListening: boolean = false;

  // Session tracking & race condition prevention
  private static activeSessionId: number = 0;
  private static processedSessionId: number = -1;
  private static activeAbortController: AbortController | null = null;
  private static sessionStartTime: number = 0;
  private static sessionStopTime: number = 0;

  // Transcription accumulation & session state
  private static accumulatedFinalTranscript: string = '';
  private static currentSessionFinal: string = '';
  private static currentSessionInterim: string = '';
  private static peakVolume: number = 0;
  private static callbacks: VoiceRecordingCallbacks | null = null;
  private static profileName: string | null = null;

  /**
   * Check if voice recording or speech recognition is supported in current browser
   */
  static isVoiceSupported(): boolean {
    const hasMedia = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
    const hasSpeech = typeof window !== 'undefined' && (!!(window as any).SpeechRecognition || !!(window as any).webkitSpeechRecognition);
    return hasMedia || hasSpeech;
  }

  /**
   * Start Microphone capture, MediaRecorder audio buffering, and Speech Recognition
   */
  static async startRecording(callbacks: VoiceRecordingCallbacks): Promise<boolean> {
    // Abort any previous pending STT request
    if (this.activeAbortController) {
      try { this.activeAbortController.abort(); } catch (e) {}
      this.activeAbortController = null;
    }

    this.activeSessionId++;
    const currentSessionId = this.activeSessionId;
    this.sessionStartTime = Date.now();
    this.sessionStopTime = 0;

    logTelemetry('recording_started', { sessionId: currentSessionId });

    this.callbacks = callbacks;
    this.accumulatedFinalTranscript = '';
    this.currentSessionFinal = '';
    this.currentSessionInterim = '';
    this.audioChunks = [];
    this.peakVolume = 0;
    this.isListening = true;

    // Load active profile name for contextual proper-name recognition
    try {
      ProfileManager.loadProfile().then(p => {
        if (p?.full_name) {
          this.profileName = p.full_name;
        }
      }).catch(() => {});
    } catch (e) {}

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      console.warn('[VOICE] getUserMedia not available in environment');
      if (callbacks.onError) {
        callbacks.onError('Microphone access is required for voice input.');
      }
      return false;
    }

    try {
      // 1. Request microphone permissions & active MediaStream
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 44100
        } 
      });
      console.log('[VOICE] Microphone permission granted');
      this.mediaStream = stream;

      // 2. Setup MediaRecorder to capture continuous raw audio for Gemini AI STT
      if (typeof MediaRecorder !== 'undefined') {
        try {
          let mimeType = 'audio/webm;codecs=opus';
          if (!MediaRecorder.isTypeSupported(mimeType)) {
            if (MediaRecorder.isTypeSupported('audio/webm')) mimeType = 'audio/webm';
            else if (MediaRecorder.isTypeSupported('audio/mp4')) mimeType = 'audio/mp4';
            else if (MediaRecorder.isTypeSupported('audio/ogg')) mimeType = 'audio/ogg';
            else mimeType = '';
          }

          this.mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
          this.mediaRecorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) {
              this.audioChunks.push(event.data);
            }
          };

          // Register onstop listener to trigger finalization automatically
          this.mediaRecorder.onstop = () => {
            console.log(`[VOICE] MediaRecorder onstop event fired for session ${currentSessionId}`);
            this.finishRecordingSession(currentSessionId);
          };

          this.mediaRecorder.start(200);
          console.log('[VOICE] MediaRecorder active with mimeType:', this.mediaRecorder.mimeType);
        } catch (mrErr) {
          console.warn('[VOICE] MediaRecorder initialization warning:', mrErr);
        }
      }

      // 3. Setup Web Audio API AnalyserNode for Real-Time Audio Level & Waveform
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtxClass) {
        try {
          this.audioContext = new AudioCtxClass();
          const source = this.audioContext.createMediaStreamSource(stream);
          this.analyser = this.audioContext.createAnalyser();
          this.analyser.fftSize = 64;
          source.connect(this.analyser);

          const dataArray = new Uint8Array(this.analyser.frequencyBinCount);

          const updateVolumeLoop = () => {
            if (!this.isListening || !this.analyser) return;
            this.analyser.getByteFrequencyData(dataArray);

            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
              sum += dataArray[i];
            }
            const avg = sum / dataArray.length;
            const level = Math.min(100, Math.round((avg / 128) * 100));

            if (level > this.peakVolume) {
              this.peakVolume = level;
            }

            if (this.callbacks?.onAudioLevel) {
              this.callbacks.onAudioLevel(level, Array.from(dataArray));
            }

            this.animFrameId = requestAnimationFrame(updateVolumeLoop);
          };

          this.animFrameId = requestAnimationFrame(updateVolumeLoop);
        } catch (audioErr) {
          console.warn('[VOICE] AudioContext setup warning:', audioErr);
        }
      }

      // 4. Setup Web Speech API for Real-Time Interim Visual Feedback
      const SpeechRecognitionClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognitionClass) {
        if (this.recognition) {
          try { this.recognition.abort(); } catch (e) {}
        }

        this.recognition = new SpeechRecognitionClass();
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = 'en-US';

        this.recognition.onstart = () => {
          console.log('[VOICE] Live SpeechRecognition active');
          if (this.callbacks?.onStart) this.callbacks.onStart();
        };

        this.recognition.onresult = (event: any) => {
          let sessionFinal = '';
          let sessionInterim = '';

          for (let i = 0; i < event.results.length; ++i) {
            const res = event.results[i];
            if (res.isFinal) {
              sessionFinal += (sessionFinal ? ' ' : '') + res[0].transcript.trim();
            } else {
              sessionInterim += (sessionInterim ? ' ' : '') + res[0].transcript.trim();
            }
          }

          this.currentSessionFinal = sessionFinal;
          this.currentSessionInterim = sessionInterim;

          const currentDisplay = [
            this.accumulatedFinalTranscript,
            this.currentSessionFinal,
            this.currentSessionInterim
          ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

          if (this.callbacks?.onResult && currentSessionId === this.activeSessionId) {
            this.callbacks.onResult(currentDisplay, false);
          }
        };

        this.recognition.onerror = (event: any) => {
          console.warn('[VOICE] SpeechRecognition event error:', event.error);
          if (event.error === 'no-speech') {
            return;
          }
          if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
            if (this.callbacks?.onError && currentSessionId === this.activeSessionId) {
              this.callbacks.onError('Microphone access was denied. Please grant microphone permissions.');
            }
            this.cleanup();
          }
        };

        this.recognition.onend = () => {
          console.log('[VOICE] SpeechRecognition engine onend triggered');

          if (this.currentSessionFinal) {
            this.accumulatedFinalTranscript = [
              this.accumulatedFinalTranscript,
              this.currentSessionFinal
            ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
            this.currentSessionFinal = '';
            this.currentSessionInterim = '';
          }

          if (this.isListening && this.recognition && currentSessionId === this.activeSessionId) {
            console.log('[VOICE] Restarting SpeechRecognition engine during speech...');
            try {
              this.recognition.start();
              return;
            } catch (e) {
              console.warn('[VOICE] Could not auto-restart recognition:', e);
            }
          }
        };

        this.recognition.start();
      } else {
        if (callbacks.onStart) callbacks.onStart();
      }

      return true;

    } catch (err: any) {
      console.error('[VOICE] Microphone permission error:', err);
      this.cleanup();
      if (callbacks.onError) {
        const isDenied = err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError' || (err.message && err.message.toLowerCase().includes('denied'));
        const msg = isDenied
          ? 'Microphone access was denied. Please grant microphone permissions in your browser or open app in a new tab.'
          : 'Microphone access is required for voice input.';
        callbacks.onError(msg);
      }
      return false;
    }
  }

  /**
   * Stop Recording safely and process recorded audio blob
   */
  static stopRecording(): void {
    const currentSessionId = this.activeSessionId;
    this.sessionStopTime = Date.now();
    const duration = this.sessionStopTime - this.sessionStartTime;

    logTelemetry('recording_stopped', { sessionId: currentSessionId, durationMs: duration });
    this.isListening = false;

    if (this.recognition) {
      try { this.recognition.stop(); } catch (e) {}
    }

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop();
        // onstop will trigger finishRecordingSession automatically
      } catch (e) {
        this.finishRecordingSession(currentSessionId);
      }
    } else {
      this.finishRecordingSession(currentSessionId);
    }
  }

  /**
   * Finalize the recording session: Fast two-phase transcript delivery
   */
  private static async finishRecordingSession(sessionId: number): Promise<void> {
    if (this.processedSessionId === sessionId) {
      console.log(`[VOICE] Session ${sessionId} already finalized. Skipping duplicate call.`);
      return;
    }
    this.processedSessionId = sessionId;

    if (sessionId !== this.activeSessionId) {
      console.log(`[VOICE] Session ${sessionId} is obsolete (active is ${this.activeSessionId}). Discarding.`);
      return;
    }

    const audioReadyTime = Date.now();
    const webSpeechText = [
      this.accumulatedFinalTranscript,
      this.currentSessionFinal,
      this.currentSessionInterim
    ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

    const normalizedWebSpeech = this.normalizeAndCorrectTranscript(webSpeechText, this.profileName);
    const hasWebSpeech = normalizedWebSpeech.length > 0;

    logTelemetry('audio_ready', {
      sessionId,
      audioChunks: this.audioChunks.length,
      webSpeechText: normalizedWebSpeech,
      peakVolume: this.peakVolume
    });

    const speechDetected = hasWebSpeech || this.peakVolume > 15;

    // PHASE 1: INSTANT DELIVERY IF WEBSPEECH WAS ACTIVE & PRODUCED TEXT
    if (hasWebSpeech) {
      const totalLatency = Date.now() - (this.sessionStopTime || audioReadyTime);
      logTelemetry('final_transcript_ready', {
        sessionId,
        source: 'webspeech_fast',
        transcript: normalizedWebSpeech,
        latencyMs: totalLatency
      });
      logTelemetry('composer_updated', { sessionId });

      // Deliver text to composer instantly! User can click Send immediately!
      if (this.callbacks?.onEnd && sessionId === this.activeSessionId) {
        this.callbacks.onEnd(normalizedWebSpeech, true);
      }

      // Stop audio tracks so mic turns off immediately
      this.cleanupMediaStream();

      // PHASE 2: OPTIONAL NON-BLOCKING BACKGROUND CLOUD REFINEMENT
      if (this.audioChunks.length > 0) {
        this.triggerBackgroundRefinement(sessionId, normalizedWebSpeech);
      }
      return;
    }

    // PHASE 1 FALLBACK: NO WEBSPEECH AVAILABLE -> CLOUD STT REQUIRED AS PRIMARY
    if (this.audioChunks.length > 0) {
      await this.performCloudStt(sessionId, speechDetected);
    } else {
      logTelemetry('final_transcript_ready', { sessionId, source: 'none', transcript: '' });
      if (this.callbacks?.onEnd && sessionId === this.activeSessionId) {
        this.callbacks.onEnd('', false);
      }
      this.cleanup();
    }
  }

  /**
   * Perform Cloud Gemini Speech-To-Text as primary engine with 5s hard timeout
   */
  private static async performCloudStt(sessionId: number, speechDetectedByVolume: boolean): Promise<void> {
    const sttStartTime = Date.now();
    logTelemetry('transcription_started', { sessionId });

    let cloudTranscript = '';
    let success = false;

    try {
      const mimeType = this.mediaRecorder?.mimeType || 'audio/webm';
      const audioBlob = new Blob(this.audioChunks, { type: mimeType });
      logTelemetry('audio_ready', { sessionId, sizeBytes: audioBlob.size, mimeType });

      if (audioBlob.size > 800) {
        const audioBase64 = await this.blobToBase64(audioBlob);

        const abortController = new AbortController();
        this.activeAbortController = abortController;

        const timeoutId = setTimeout(() => {
          console.warn(`[VOICE] STT request for session ${sessionId} exceeded 5000ms threshold. Aborting.`);
          abortController.abort();
        }, 5000);

        try {
          const res = await fetch('/api/stt/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audioBase64, mimeType }),
            signal: abortController.signal
          });

          clearTimeout(timeoutId);

          if (res.ok) {
            const data = await res.json();
            if (data.transcript && data.transcript.trim()) {
              cloudTranscript = data.transcript.trim();
              success = true;
            }
          }
        } catch (fetchErr: any) {
          clearTimeout(timeoutId);
          if (fetchErr.name === 'AbortError') {
            console.warn(`[VOICE] Session ${sessionId} STT request aborted on timeout.`);
          } else {
            console.warn(`[VOICE] Session ${sessionId} STT fetch error:`, fetchErr);
          }
        }
      }
    } catch (e) {
      console.error(`[VOICE] Session ${sessionId} audio conversion error:`, e);
    }

    if (sessionId !== this.activeSessionId) {
      console.log(`[VOICE] Session ${sessionId} superseded, ignoring result.`);
      return;
    }

    const sttDuration = Date.now() - sttStartTime;
    logTelemetry('transcription_response_received', { sessionId, durationMs: sttDuration, success });

    const normalized = this.normalizeAndCorrectTranscript(cloudTranscript, this.profileName);
    const hasValidSpeech = normalized.length > 0 || speechDetectedByVolume;

    logTelemetry('final_transcript_ready', {
      sessionId,
      source: success ? 'gemini_stt' : 'fallback_empty',
      transcript: normalized,
      totalLatencyMs: Date.now() - (this.sessionStopTime || sttStartTime)
    });
    logTelemetry('composer_updated', { sessionId });

    if (this.callbacks?.onEnd && sessionId === this.activeSessionId) {
      if (!success && !normalized && speechDetectedByVolume) {
        if (this.callbacks.onError) {
          this.callbacks.onError('Voice transcription timed out. Please try again.');
        }
      }
      this.callbacks.onEnd(normalized, hasValidSpeech);
    }

    this.cleanup();
  }

  /**
   * Optional background contextual refinement pass (non-blocking)
   */
  private static async triggerBackgroundRefinement(sessionId: number, currentTranscript: string): Promise<void> {
    logTelemetry('refinement_started', { sessionId });
    const refStartTime = Date.now();

    try {
      const mimeType = this.mediaRecorder?.mimeType || 'audio/webm';
      const audioBlob = new Blob(this.audioChunks, { type: mimeType });
      if (audioBlob.size <= 800) return;

      const audioBase64 = await this.blobToBase64(audioBlob);

      const abortController = new AbortController();
      this.activeAbortController = abortController;
      const timeoutId = setTimeout(() => abortController.abort(), 4000); // 4s timeout for non-blocking refinement

      const res = await fetch('/api/stt/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioBase64, mimeType }),
        signal: abortController.signal
      });

      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        const refinedRaw = data.transcript ? data.transcript.trim() : '';
        if (refinedRaw && sessionId === this.activeSessionId) {
          const refinedNormalized = this.normalizeAndCorrectTranscript(refinedRaw, this.profileName);
          const refDuration = Date.now() - refStartTime;
          logTelemetry('refinement_completed', { sessionId, durationMs: refDuration, refinedText: refinedNormalized });

          if (refinedNormalized && refinedNormalized !== currentTranscript) {
            logTelemetry('composer_updated', { sessionId, updatedByRefinement: true });
            if (this.callbacks?.onResult) {
              this.callbacks.onResult(refinedNormalized, true);
            }
          }
        }
      }
    } catch (e: any) {
      logTelemetry('refinement_failed_keeping_original', { sessionId, reason: e.message || 'aborted' });
    } finally {
      this.cleanup();
    }
  }

  /**
   * Convert Blob to Base64 helper
   */
  private static blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1] || '';
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Helper to resolve mid-speech self-corrections (e.g. "CEE-305... I mean CS-305")
   */
  private static resolveSelfCorrections(text: string): string {
    let result = text;
    // Handle explicit self-correction phrases: "I mean", "actually", "sorry,", "no,"
    // e.g. "CEE-305 I mean CS-305" -> "CS-305"
    // e.g. "at 7 PM actually 8 PM" -> "at 8 PM"
    result = result.replace(/\b([A-Z0-9\-]+|[a-z0-9]+(?:\s+[a-z0-9]+)?)\s+(?:i mean|i meant|sorry|actually|no wait)\s+([A-Z0-9\-]+|[a-z0-9]+(?:\s+[a-z0-9]+)?)\b/gi, (match, initial, correction) => {
      return correction;
    });
    return result;
  }

  /**
   * Contextual normalization & vocabulary correction layer
   */
  public static normalizeAndCorrectTranscript(text: string, profileName?: string | null): string {
    if (!text || !text.trim()) return '';

    let normalized = text.trim();

    // 0. Resolve Self-Corrections
    normalized = this.resolveSelfCorrections(normalized);

    // 1. Contextual Xena Vocabulary Normalization
    // A. Vault vs Volts/Bolts/Faults/Valts
    normalized = normalized.replace(/^(volts?|bolts?|faults?|valts?)\b/i, 'Vault');
    normalized = normalized.replace(/\b(in|to|into|my|the|add to|save to)\s+(volts?|bolts?|faults?|valts?)\b/gi, (match, prefix) => {
      return `${prefix} Vault`;
    });
    normalized = normalized.replace(/\b(volts?|bolts?|faults?|valts?)\s+memory\b/gi, 'Vault memory');

    // B. Xena vs Zena/Zina/Sena
    normalized = normalized.replace(/\b(hey|hi|hello|ask|dear)?\s*(zena|zina|sena)\b/gi, (match, prefix) => {
      return prefix ? `${prefix} Xena` : 'Xena';
    });

    // C. Study Tracking
    normalized = normalized.replace(/\bstudy\s+track(ing|er)?\b/gi, 'Study Tracking');

    // D. My Items / Organizer
    normalized = normalized.replace(/\bmy\s+items\b/gi, 'My Items');
    normalized = normalized.replace(/\borganiser\b/gi, 'Organizer');

    // 2. Proper Name Contextual Correction
    if (profileName && profileName.trim()) {
      const firstName = profileName.trim().split(' ')[0];
      if (firstName && firstName.length >= 3 && !['user', 'alex'].includes(firstName.toLowerCase())) {
        const nameRegex = /\b(my name is|i am|i'm|call me)\s+([a-zA-Z]+)\b/gi;
        normalized = normalized.replace(nameRegex, (match, prefix, spokenName) => {
          if (isPhoneticallySimilar(spokenName, firstName)) {
            return `${prefix} ${firstName}`;
          }
          return match;
        });
      }
    }

    // 3. Sentence Capitalization & Punctuation
    if (normalized.length > 0) {
      normalized = normalized.charAt(0).toUpperCase() + normalized.slice(1);
    }

    if (normalized.length > 0 && !/[.!?]$/.test(normalized)) {
      normalized += '.';
    }

    return normalized;
  }

  /**
   * Clean up MediaStream, AudioContext, Analyser, and MediaRecorder
   */
  private static cleanupMediaStream(): void {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.mediaRecorder) {
      if (this.mediaRecorder.state !== 'inactive') {
        try { this.mediaRecorder.stop(); } catch (e) {}
      }
      this.mediaRecorder = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => {
        try { track.stop(); } catch (e) {}
      });
      this.mediaStream = null;
    }
    if (this.audioContext) {
      try { this.audioContext.close(); } catch (e) {}
      this.audioContext = null;
    }
    this.analyser = null;
    this.isListening = false;
  }

  /**
   * Clean up all MediaStream tracks, AudioContext nodes, timers, and pending requests
   */
  static cleanup(): void {
    this.cleanupMediaStream();
    this.audioChunks = [];
    if (this.activeAbortController) {
      try { this.activeAbortController.abort(); } catch (e) {}
      this.activeAbortController = null;
    }
  }

  /**
   * Text To Speech (Read Aloud)
   */
  static speak(
    text: string,
    callbacks?: (() => void) | { onStart?: () => void; onEnd?: () => void; onError?: (err: any) => void }
  ): void {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      if (typeof callbacks === 'function') callbacks();
      else if (callbacks?.onEnd) callbacks.onEnd();
      return;
    }

    const ttsStartTime = Date.now();
    const onEndCb = typeof callbacks === 'function' ? callbacks : callbacks?.onEnd;
    const onStartCb = typeof callbacks !== 'function' ? callbacks?.onStart : undefined;

    try {
      window.speechSynthesis.cancel(); // Stop ongoing speech

      const cleanText = text
        .replace(/#+\s+/g, '')
        .replace(/\*+/g, '')
        .replace(/\|/g, ' ')
        .replace(/-{3,}/g, '')
        .replace(/\[.*?\]\(.*?\)/g, '')
        .replace(/`{1,3}.*?`{1,3}/g, '')
        .trim();

      if (!cleanText) {
        if (onEndCb) onEndCb();
        return;
      }

      logTelemetry('tts_start', { textLength: cleanText.length });

      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;

      let firstAudioFired = false;

      utterance.onstart = () => {
        if (!firstAudioFired) {
          firstAudioFired = true;
          const ttsFirstAudioTime = Date.now();
          logTelemetry('tts_first_audio', { latencyMs: ttsFirstAudioTime - ttsStartTime });
          logTelemetry('playback_start', { latencyMs: ttsFirstAudioTime - ttsStartTime });
        }
        if (onStartCb) onStartCb();
      };

      utterance.onend = () => {
        logTelemetry('tts_end', { durationMs: Date.now() - ttsStartTime });
        if (onEndCb) onEndCb();
      };

      utterance.onerror = (err) => {
        console.warn('Text-To-Speech error:', err);
        if (onEndCb) onEndCb();
      };

      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.error('Text-To-Speech error:', e);
      if (onEndCb) onEndCb();
    }
  }

  /**
   * Stop Text To Speech
   */
  static stopSpeaking(): void {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch (e) {}
    }
  }
}

/**
 * Phonetic similarity helper for proper name contextual corrections
 */
function isPhoneticallySimilar(a: string, b: string): boolean {
  const s1 = a.toLowerCase();
  const s2 = b.toLowerCase();
  if (s1 === s2) return true;

  const dist = editDistance(s1, s2);
  if (dist <= 2) return true;

  if ((s1.endsWith('ly') || s1.endsWith('ey')) && (s2.endsWith('ly') || s2.endsWith('ey')) && dist <= 3) {
    return true;
  }

  return false;
}

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[a.length][b.length];
}

