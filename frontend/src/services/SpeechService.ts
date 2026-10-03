import { ProfileManager } from './ProfileManager.js';
import { getApiUrl } from '../config/api.js';
import { formatTextForNaturalSpeech, getBestHumanVoice, detectLanguage } from '../utils/voiceUtils.js';
import { VoicePerformanceTracker } from '../utils/VoicePerformanceTracker.js';

function logTelemetry(event: string, details?: any) {
  const now = Date.now();
  console.log(`[VOICE_TELEMETRY] ${event} t=${now}`, details ? JSON.stringify(details) : '');
}

export interface VoiceRecordingCallbacks {
  onStart?: () => void;
  onAudioLevel?: (level: number, spectrum: number[]) => void;
  onResult?: (transcript: string, isFinal: boolean) => void;
  onFinalizedRefinement?: (refinedTranscript: string) => void;
  onError?: (errorMessage: string) => void;
  onEnd?: (finalTranscript: string, speechDetected: boolean) => void;
  autoStopOnSilence?: boolean;
  silenceTimeoutMs?: number;
  initialTranscript?: string;
  keepMicWarm?: boolean;
  turnId?: number;
}

export interface SpeakOptions {
  voiceName?: string;
  rate?: number;
  style?: string;
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
  private static lastSpeechActivityTime: number = 0;
  private static lastFinalResultTime: number = 0;
  private static hasSpokenInSession: boolean = false;
  private static keepMicWarmActive: boolean = false;

  // Neural TTS & 24kHz PCM Stream Playback state
  private static playbackGenerationId: number = 0;
  private static activeTtsAbortController: AbortController | null = null;
  private static activeAudioElement: HTMLAudioElement | null = null;
  private static activeUtterance: SpeechSynthesisUtterance | null = null;
  private static pcmAudioContext: AudioContext | null = null;
  private static nextPcmStartTime: number = 0;
  private static activePcmNodes: Set<AudioBufferSourceNode> = new Set();
  private static pcmEndTimeoutId: any = null;
  private static bargeInRecognition: any = null;
  private static isBargeInActive: boolean = false;
  private static clientTtsCache: Map<string, string> = new Map();
  private static preferredVoiceName: string = 'Aoede';

  static getPlaybackGenerationId(): number {
    return this.playbackGenerationId;
  }

  /**
   * Pre-warm WebAudio 24kHz context and backend Gemini Live WebSocket session
   */
  static warmUpSession(voiceName?: string): void {
    const targetVoice = voiceName || this.getPreferredVoice();
    if (typeof window !== 'undefined') {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtxClass && (!this.pcmAudioContext || this.pcmAudioContext.state === 'closed')) {
        try {
          this.pcmAudioContext = new AudioCtxClass({ sampleRate: 24000 });
        } catch {}
      }
      fetch(getApiUrl('/api/chat/live/prewarm'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voiceName: targetVoice })
      }).catch(() => {});
    }
  }

  static setPreferredVoice(voiceName: string): void {
    if (voiceName && voiceName.trim()) {
      this.preferredVoiceName = voiceName.trim();
      try {
        localStorage.setItem('xena_preferred_voice', this.preferredVoiceName);
      } catch (e) {}
    }
  }

  static getPreferredVoice(): string {
    try {
      const saved = localStorage.getItem('xena_preferred_voice');
      if (saved) return saved;
    } catch (e) {}
    return this.preferredVoiceName || 'Aoede';
  }

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

    this.stopBargeInMonitor();

    this.callbacks = callbacks;
    this.keepMicWarmActive = Boolean(callbacks.keepMicWarm);
    this.accumulatedFinalTranscript = (callbacks.initialTranscript || '').trim();
    this.currentSessionFinal = '';
    this.currentSessionInterim = '';
    this.audioChunks = [];
    this.peakVolume = 0;
    this.isListening = true;
    this.lastSpeechActivityTime = Date.now();
    this.lastFinalResultTime = 0;
    this.hasSpokenInSession = Boolean(this.accumulatedFinalTranscript);

    if (callbacks.turnId !== undefined) {
      VoicePerformanceTracker.startTurn(callbacks.turnId);
    }

    // Load active profile name for contextual proper-name recognition
    if (!this.profileName) {
      try {
        ProfileManager.loadProfile().then(p => {
          if (p?.full_name) {
            this.profileName = p.full_name;
          }
        }).catch(() => {});
      } catch (e) {}
    }

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      console.warn('[VOICE] getUserMedia not available in environment');
      if (callbacks.onError) {
        callbacks.onError('Microphone access is required for voice input.');
      }
      return false;
    }

    try {
      // 1. Reuse warm MediaStream if active, otherwise request microphone permissions
      const hasLiveWarmStream =
        this.mediaStream &&
        this.mediaStream.active &&
        this.mediaStream.getAudioTracks().some(t => t.readyState === 'live' && t.enabled);

      const stream = hasLiveWarmStream
        ? this.mediaStream!
        : await navigator.mediaDevices.getUserMedia({ 
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
              channelCount: 1
            } 
          });

      this.mediaStream = stream;
      VoicePerformanceTracker.markFirstAudioFrame(callbacks.turnId);

      // 2. Setup MediaRecorder to capture continuous raw audio for fallback STT
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

          this.mediaRecorder.onstop = () => {
            this.finishRecordingSession(currentSessionId);
          };

          this.mediaRecorder.start(200);
        } catch (mrErr) {
          console.warn('[VOICE] MediaRecorder initialization warning:', mrErr);
        }
      }

      // 3. Setup or reuse Web Audio API AnalyserNode for Real-Time Audio Level & Fast Endpointing
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtxClass) {
        try {
          if (!this.audioContext || this.audioContext.state === 'closed') {
            this.audioContext = new AudioCtxClass();
          }
          if (this.audioContext.state === 'suspended') {
            this.audioContext.resume().catch(() => {});
          }
          if (!this.analyser) {
            const source = this.audioContext.createMediaStreamSource(stream);
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 64;
            source.connect(this.analyser);
          }

          const dataArray = new Uint8Array(this.analyser.frequencyBinCount);

          const updateVolumeLoop = () => {
            if (!this.isListening || !this.analyser || currentSessionId !== this.activeSessionId) return;
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

            const now = Date.now();
            // Voice Activity Detection (VAD) for hands-free silence auto-stop
            if (level >= 18) {
              this.lastSpeechActivityTime = now;
              if (level >= 22) {
                if (!this.hasSpokenInSession) {
                  VoicePerformanceTracker.markVadDetected(callbacks.turnId);
                }
                this.hasSpokenInSession = true;
              }
            } else if (
              this.callbacks?.autoStopOnSilence &&
              this.hasSpokenInSession &&
              now - this.sessionStartTime > 650
            ) {
              const currentWords = [
                this.accumulatedFinalTranscript,
                this.currentSessionFinal,
                this.currentSessionInterim
              ].filter(Boolean).join(' ').trim();

              const endsIncomplete = /\b(and|or|because|on|at|in|called|named|for|to|with|from|about|the|a|an|my|is|are)\s*$/i.test(currentWords);
              const hasFinalizedClause = Boolean(
                (this.currentSessionFinal || this.accumulatedFinalTranscript) &&
                !this.currentSessionInterim &&
                this.lastFinalResultTime > 0
              );

              const baseTimeout = this.callbacks.silenceTimeoutMs || 900;
              const effectiveTimeout = endsIncomplete
                ? Math.max(baseTimeout + 450, 1350)
                : hasFinalizedClause
                  ? Math.min(baseTimeout, 620)
                  : baseTimeout;

              const quietDuration = now - this.lastSpeechActivityTime;
              const postFinalQuiet = this.lastFinalResultTime > 0 ? now - this.lastFinalResultTime : quietDuration;

              if (quietDuration > effectiveTimeout || (hasFinalizedClause && !endsIncomplete && postFinalQuiet > 560 && quietDuration > 450)) {
                VoicePerformanceTracker.markSpeechEnded(this.lastSpeechActivityTime, callbacks.turnId);
                this.stopRecording();
                return;
              }
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
          if (sessionFinal && !sessionInterim) {
            this.lastFinalResultTime = Date.now();
          }

          const currentDisplay = [
            this.accumulatedFinalTranscript,
            this.currentSessionFinal,
            this.currentSessionInterim
          ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

          if (currentDisplay.length > 0) {
            if (!this.hasSpokenInSession) {
              VoicePerformanceTracker.markVadDetected(callbacks.turnId);
            }
            this.hasSpokenInSession = true;
            this.lastSpeechActivityTime = Date.now();
          }

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
      try {
        this.recognition.onend = null;
        this.recognition.stop();
      } catch (e) {}
    }

    const readyWebSpeech = [
      this.accumulatedFinalTranscript,
      this.currentSessionFinal,
      this.currentSessionInterim
    ].filter(Boolean).join(' ').trim();

    // Fast path: if WebSpeech already produced text, finalize immediately without waiting for MediaRecorder.onstop
    if (readyWebSpeech.length > 0 && this.callbacks?.autoStopOnSilence) {
      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.onstop = null;
        try { this.mediaRecorder.stop(); } catch {}
      }
      this.finishRecordingSession(currentSessionId);
      return;
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

    // Capture recorded mimeType and chunks before cleanupMediaStream nulls out mediaRecorder
    const recordedMimeType = this.mediaRecorder?.mimeType || 'audio/webm';
    const recordedChunks = [...this.audioChunks];

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

      VoicePerformanceTracker.markInputFinalized(this.callbacks?.turnId);

      // Deliver text to composer/voice controller instantly!
      if (this.callbacks?.onEnd && sessionId === this.activeSessionId) {
        this.callbacks.onEnd(normalizedWebSpeech, true);
      }

      // Pause recording resources (keeping MediaStream warm if keepMicWarmActive is true)
      this.cleanupMediaStream(this.keepMicWarmActive);

      // PHASE 2: OPTIONAL NON-BLOCKING BACKGROUND CLOUD REFINEMENT (only when caller subscribes to refinement and not in auto-stop Live Voice loop)
      if (
        recordedChunks.length > 0 &&
        this.callbacks?.onFinalizedRefinement &&
        !this.callbacks?.autoStopOnSilence
      ) {
        this.triggerBackgroundRefinement(sessionId, normalizedWebSpeech, recordedChunks, recordedMimeType);
      }
      return;
    }

    // PHASE 1 FALLBACK: NO WEBSPEECH AVAILABLE -> CLOUD STT REQUIRED AS PRIMARY
    if (recordedChunks.length > 0) {
      await this.performCloudStt(sessionId, speechDetected, recordedChunks, recordedMimeType);
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
  private static async performCloudStt(
    sessionId: number,
    speechDetectedByVolume: boolean,
    chunks?: Blob[],
    recordedMime?: string
  ): Promise<void> {
    const sttStartTime = Date.now();
    logTelemetry('transcription_started', { sessionId });

    let cloudTranscript = '';
    let success = false;

    try {
      const mimeType = recordedMime || this.mediaRecorder?.mimeType || 'audio/webm';
      const audioBlob = new Blob(chunks || this.audioChunks, { type: mimeType });
      logTelemetry('audio_ready', { sessionId, sizeBytes: audioBlob.size, mimeType });

      if (audioBlob.size > 2000) {
        const audioBase64 = await this.blobToBase64(audioBlob);

        const abortController = new AbortController();
        this.activeAbortController = abortController;

        const timeoutId = setTimeout(() => {
          console.warn(`[VOICE] STT request for session ${sessionId} exceeded 15000ms threshold. Aborting.`);
          abortController.abort();
        }, 15000);

        try {
          const res = await fetch(getApiUrl('/api/stt/transcribe'), {
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
      console.warn(`[VOICE] Session ${sessionId} audio conversion warning:`, e);
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
  private static async triggerBackgroundRefinement(
    sessionId: number,
    currentTranscript: string,
    chunks?: Blob[],
    recordedMime?: string
  ): Promise<void> {
    logTelemetry('refinement_started', { sessionId });
    const refStartTime = Date.now();

    try {
      const mimeType = recordedMime || this.mediaRecorder?.mimeType || 'audio/webm';
      const audioBlob = new Blob(chunks || this.audioChunks, { type: mimeType });
      if (audioBlob.size <= 2500) return;

      const audioBase64 = await this.blobToBase64(audioBlob);

      const abortController = new AbortController();
      this.activeAbortController = abortController;
      const timeoutId = setTimeout(() => abortController.abort(), 4000); // 4s timeout for non-blocking refinement

      const res = await fetch(getApiUrl('/api/stt/transcribe'), {
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
  private static cleanupMediaStream(keepWarm: boolean = false): void {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.mediaRecorder) {
      this.mediaRecorder.onstop = null;
      if (this.mediaRecorder.state !== 'inactive') {
        try { this.mediaRecorder.stop(); } catch (e) {}
      }
      this.mediaRecorder = null;
    }
    if (!keepWarm) {
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
    }
    this.isListening = false;
  }

  /**
   * Clean up all MediaStream tracks, AudioContext nodes, timers, and pending requests
   */
  static cleanup(): void {
    this.keepMicWarmActive = false;
    this.stopBargeInMonitor();
    this.cleanupMediaStream(false);
    this.audioChunks = [];
    if (this.recognition) {
      try {
        this.recognition.onresult = null;
        this.recognition.onend = null;
        this.recognition.abort();
      } catch {}
      this.recognition = null;
    }
    if (this.activeAbortController) {
      try { this.activeAbortController.abort(); } catch (e) {}
      this.activeAbortController = null;
    }
  }

  /**
   * Start Voice Barge-In Monitor while Xena is speaking.
   * Detects when the user speaks to interrupt Xena, filters out echo of Xena's own spoken text,
   * and immediately stops TTS playback and transitions to listening with the captured interruption words.
   */
  static startBargeInMonitor(
    onBargeIn: (detectedSpeech: string) => void,
    getCurrentlySpokenText?: () => string
  ): void {
    this.stopBargeInMonitor();
    if (typeof window === 'undefined') return;

    const SpeechRecognitionClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionClass) return;

    try {
      this.isBargeInActive = true;
      const rec = new SpeechRecognitionClass();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = 'en-US';
      this.bargeInRecognition = rec;

      rec.onresult = (event: any) => {
        if (!this.isBargeInActive) return;

        let transcript = '';
        for (let i = event.resultIndex || 0; i < event.results.length; ++i) {
          transcript += ' ' + (event.results[i][0]?.transcript || '');
        }
        const cleaned = transcript.replace(/\s+/g, ' ').trim();
        if (!cleaned || cleaned.length < 2) return;

        const lowerCleaned = cleaned.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
        if (!lowerCleaned) return;

        // Check if this is an explicit barge-in keyword
        const hasExplicitInterruptKeyword = /\b(wait|stop|hold\s+on|pause|cancel|actually|no|change|never\s+mind|excuse\s+me|hey\s+xena|xena|listen)\b/i.test(lowerCleaned);

        // Compare against what Xena is currently saying to ignore acoustic echo bleed
        const xenaSpoken = (getCurrentlySpokenText ? getCurrentlySpokenText() : '')
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, '')
          .trim();

        const words = lowerCleaned.split(/\s+/).filter(Boolean);
        const isEchoOfXena = xenaSpoken.length > 0 && xenaSpoken.includes(lowerCleaned);

        if (hasExplicitInterruptKeyword || (!isEchoOfXena && words.length >= 2)) {
          console.log('[VOICE_BARGE_IN] User voice interruption detected:', cleaned);
          this.stopBargeInMonitor();
          this.stopSpeaking();
          onBargeIn(cleaned);
        }
      };

      rec.onerror = () => {
        // Ignore silent/no-speech errors during barge-in monitoring
      };

      rec.onend = () => {
        if (this.isBargeInActive && this.bargeInRecognition === rec) {
          try {
            rec.start();
          } catch {}
        }
      };

      rec.start();
    } catch {
      this.isBargeInActive = false;
    }
  }

  /**
   * Stop Voice Barge-In Monitor
   */
  static stopBargeInMonitor(): void {
    this.isBargeInActive = false;
    if (this.bargeInRecognition) {
      try {
        this.bargeInRecognition.onresult = null;
        this.bargeInRecognition.onend = null;
        this.bargeInRecognition.abort();
      } catch {}
      this.bargeInRecognition = null;
    }
  }

  /**
   * Initialize a 24kHz gapless PCM playback stream (for Gemini Live & Streaming Neural TTS)
   */
  static startPcmStream(): number {
    this.stopSpeaking();
    const genId = ++this.playbackGenerationId;
    const AudioCtxClass = typeof window !== 'undefined' ? (window.AudioContext || (window as any).webkitAudioContext) : null;
    if (!AudioCtxClass) return genId;

    if (!this.pcmAudioContext || this.pcmAudioContext.state === 'closed') {
      this.pcmAudioContext = new AudioCtxClass({ sampleRate: 24000 });
    }
    if (this.pcmAudioContext.state === 'suspended') {
      this.pcmAudioContext.resume().catch(() => {});
    }
    this.nextPcmStartTime = this.pcmAudioContext.currentTime + 0.015;
    return genId;
  }

  /**
   * Enqueue a raw 16-bit signed little-endian PCM chunk (24kHz mono) for gapless playback
   */
  static enqueuePcmChunk(
    base64Pcm: string,
    sampleRate: number = 24000,
    onFirstChunkStart?: () => void,
    expectedGenerationId?: number
  ): void {
    if (!base64Pcm || typeof window === 'undefined') return;
    if (expectedGenerationId !== undefined && expectedGenerationId !== this.playbackGenerationId) {
      VoicePerformanceTracker.recordUnwantedPostInterruptSpeechBlocked();
      return;
    }
    const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtxClass) return;

    try {
      if (!this.pcmAudioContext || this.pcmAudioContext.state === 'closed') {
        this.pcmAudioContext = new AudioCtxClass({ sampleRate });
        this.nextPcmStartTime = this.pcmAudioContext.currentTime + 0.015;
      }
      const ctx = this.pcmAudioContext;
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      const binary = atob(base64Pcm);
      const byteLength = binary.length - (binary.length % 2);
      if (byteLength <= 0) return;

      const bytes = new Uint8Array(byteLength);
      for (let i = 0; i < byteLength; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      const int16 = new Int16Array(bytes.buffer);
      const float32 = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) {
        float32[i] = int16[i] / 32768.0;
      }

      // Micro-fade first and last 16 samples to eliminate boundary clicks
      const fadeSamples = Math.min(16, Math.floor(float32.length / 4));
      for (let i = 0; i < fadeSamples; i++) {
        const gain = i / fadeSamples;
        float32[i] *= gain;
        float32[float32.length - 1 - i] *= gain;
      }

      const audioBuffer = ctx.createBuffer(1, float32.length, sampleRate);
      audioBuffer.getChannelData(0).set(float32);
      VoicePerformanceTracker.markFirstAudioDecoded();

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);

      const startAt = Math.max(ctx.currentTime + 0.008, this.nextPcmStartTime);
      this.nextPcmStartTime = startAt + audioBuffer.duration;

      if (this.activePcmNodes.size === 0) {
        VoicePerformanceTracker.markFirstAudiblePlayback();
        if (onFirstChunkStart) {
          onFirstChunkStart();
        }
      }

      this.activePcmNodes.add(source);
      source.onended = () => {
        this.activePcmNodes.delete(source);
      };
      source.start(startAt);
    } catch (err) {
      VoicePerformanceTracker.recordPlaybackError();
      console.warn('[PCM_STREAM_PLAYBACK_WARNING]', err);
    }
  }

  /**
   * Wait until all scheduled PCM chunks have finished playing, then invoke callback
   */
  static waitForPcmStreamEnd(onEnd?: () => void, expectedGenerationId?: number): void {
    const genId = expectedGenerationId ?? this.playbackGenerationId;
    if (this.pcmEndTimeoutId) {
      clearTimeout(this.pcmEndTimeoutId);
      this.pcmEndTimeoutId = null;
    }
    if (genId !== this.playbackGenerationId) {
      return;
    }
    if (!this.pcmAudioContext || this.activePcmNodes.size === 0) {
      if (onEnd && genId === this.playbackGenerationId) onEnd();
      return;
    }
    const ctx = this.pcmAudioContext;
    const remainingSec = Math.max(0, this.nextPcmStartTime - ctx.currentTime);
    this.pcmEndTimeoutId = setTimeout(() => {
      this.pcmEndTimeoutId = null;
      if (onEnd && genId === this.playbackGenerationId) {
        onEnd();
      }
    }, Math.ceil(remainingSec * 1000) + 40);
  }

  /**
   * Text To Speech (Gemini 3.8 Neural Voice with Progressive Streaming & Browser Fallback)
   */
  static speak(
    text: string,
    callbacks?: (() => void) | { onStart?: () => void; onEnd?: () => void; onError?: (err: any) => void },
    options?: SpeakOptions
  ): void {
    if (typeof window === 'undefined') {
      if (typeof callbacks === 'function') callbacks();
      else if (callbacks?.onEnd) callbacks.onEnd();
      return;
    }

    const ttsStartTime = Date.now();
    const rawOnEndCb = typeof callbacks === 'function' ? callbacks : callbacks?.onEnd;
    const rawOnStartCb = typeof callbacks !== 'function' ? callbacks?.onStart : undefined;

    this.stopSpeaking();
    const currentGenId = ++this.playbackGenerationId;
    let endCalled = false;

    const safeOnStart = () => {
      if (currentGenId !== this.playbackGenerationId) return;
      VoicePerformanceTracker.markFirstAudiblePlayback();
      if (rawOnStartCb) rawOnStartCb();
    };

    const safeOnEnd = () => {
      if (endCalled || currentGenId !== this.playbackGenerationId) return;
      endCalled = true;
      if (rawOnEndCb) rawOnEndCb();
    };

    const cleanText = formatTextForNaturalSpeech(text);
    if (!cleanText) {
      safeOnEnd();
      return;
    }

    const voiceName = options?.voiceName && options.voiceName !== 'default'
      ? options.voiceName
      : this.getPreferredVoice();
    const playbackRate = options?.rate && options.rate > 0 ? options.rate : 1.0;

    logTelemetry('tts_start', { textLength: cleanText.length, voiceName, engine: 'gemini-3.8-neural-tts' });

    const playWavBase64 = (wavBase64: string, mimeType: string = 'audio/wav') => {
      if (currentGenId !== this.playbackGenerationId) return;
      try {
        const audio = new Audio(`data:${mimeType};base64,${wavBase64}`);
        audio.playbackRate = playbackRate;
        this.activeAudioElement = audio;

        let started = false;
        audio.onplay = () => {
          if (currentGenId !== this.playbackGenerationId) return;
          if (!started) {
            started = true;
            const latencyMs = Date.now() - ttsStartTime;
            logTelemetry('tts_first_audio', { latencyMs, engine: 'gemini-3.8-neural-tts' });
            safeOnStart();
          }
        };

        audio.onended = () => {
          if (this.activeAudioElement === audio) {
            this.activeAudioElement = null;
          }
          if (currentGenId !== this.playbackGenerationId) return;
          logTelemetry('tts_end', { durationMs: Date.now() - ttsStartTime });
          safeOnEnd();
        };

        audio.onerror = () => {
          if (this.activeAudioElement === audio) {
            this.activeAudioElement = null;
          }
          if (currentGenId !== this.playbackGenerationId) return;
          this.speakBrowserFallback(cleanText, playbackRate, voiceName, ttsStartTime, currentGenId, safeOnStart, safeOnEnd);
        };

        audio.play().catch(() => {
          if (currentGenId !== this.playbackGenerationId) return;
          this.speakBrowserFallback(cleanText, playbackRate, voiceName, ttsStartTime, currentGenId, safeOnStart, safeOnEnd);
        });
      } catch (e) {
        if (currentGenId !== this.playbackGenerationId) return;
        this.speakBrowserFallback(cleanText, playbackRate, voiceName, ttsStartTime, currentGenId, safeOnStart, safeOnEnd);
      }
    };

    const cacheKey = `${voiceName}|${cleanText}`;
    const cachedWav = this.clientTtsCache.get(cacheKey);
    if (cachedWav) {
      playWavBase64(cachedWav, 'audio/wav');
      return;
    }

    const abortController = new AbortController();
    this.activeTtsAbortController = abortController;

    // Stream progressive 24kHz PCM chunks first so playback begins on the very first chunk!
    fetch(getApiUrl('/api/tts/stream'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: cleanText,
        voiceName,
        style: options?.style
      }),
      signal: abortController.signal
    })
      .then(async (res) => {
        if (!res.ok || !res.body) throw new Error(`TTS Stream HTTP ${res.status}`);
        if (abortController.signal.aborted || currentGenId !== this.playbackGenerationId) return;

        const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtxClass && (!this.pcmAudioContext || this.pcmAudioContext.state === 'closed')) {
          this.pcmAudioContext = new AudioCtxClass({ sampleRate: 24000 });
        }
        if (this.pcmAudioContext) {
          if (this.pcmAudioContext.state === 'suspended') {
            this.pcmAudioContext.resume().catch(() => {});
          }
          this.nextPcmStartTime = this.pcmAudioContext.currentTime + 0.015;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let chunksPlayed = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (abortController.signal.aborted || currentGenId !== this.playbackGenerationId) return;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const jsonStr = trimmed.slice(5).trim();
            if (!jsonStr) continue;
            try {
              const evt = JSON.parse(jsonStr);
              if (evt.type === 'audio' && evt.pcmBase64) {
                chunksPlayed++;
                this.enqueuePcmChunk(
                  evt.pcmBase64,
                  evt.sampleRate || 24000,
                  chunksPlayed === 1 ? safeOnStart : undefined,
                  currentGenId
                );
              }
            } catch {}
          }
        }

        if (abortController.signal.aborted || currentGenId !== this.playbackGenerationId) return;
        if (chunksPlayed > 0) {
          this.waitForPcmStreamEnd(safeOnEnd, currentGenId);
        } else {
          throw new Error('Zero PCM chunks streamed');
        }
      })
      .catch((err: any) => {
        if (err?.name === 'AbortError' || abortController.signal.aborted || currentGenId !== this.playbackGenerationId) {
          return;
        }
        console.warn('[NEURAL_TTS_FALLBACK] Using enhanced browser voice:', err?.message);
        this.speakBrowserFallback(cleanText, playbackRate, voiceName, ttsStartTime, currentGenId, safeOnStart, safeOnEnd);
      });
  }

  /**
   * Enhanced Browser SpeechSynthesis Fallback (used only if offline or API unreachable)
   */
  private static speakBrowserFallback(
    cleanText: string,
    rate: number,
    voiceName: string | undefined,
    ttsStartTime: number = Date.now(),
    expectedGenId: number = this.playbackGenerationId,
    onStartCb?: () => void,
    onEndCb?: () => void
  ): void {
    if (expectedGenId !== this.playbackGenerationId) return;
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      if (onEndCb) onEndCb();
      return;
    }

    try {
      if (this.activeUtterance) {
        this.activeUtterance.onend = null;
        this.activeUtterance.onerror = null;
        this.activeUtterance.onstart = null;
        this.activeUtterance = null;
      }
      window.speechSynthesis.cancel();

      const lang = detectLanguage(cleanText);
      const utterance = new SpeechSynthesisUtterance(cleanText);
      this.activeUtterance = utterance;
      utterance.rate = rate === 1.0 ? 0.97 : rate;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;
      utterance.lang = lang;

      const bestVoice = getBestHumanVoice(lang, voiceName);
      if (bestVoice) {
        utterance.voice = bestVoice;
      }

      let firstAudioFired = false;
      utterance.onstart = () => {
        if (expectedGenId !== this.playbackGenerationId) return;
        if (!firstAudioFired) {
          firstAudioFired = true;
          logTelemetry('tts_first_audio', { latencyMs: Date.now() - ttsStartTime, engine: 'browser-neural-fallback' });
        }
        if (onStartCb) onStartCb();
      };

      utterance.onend = () => {
        if (this.activeUtterance === utterance) this.activeUtterance = null;
        if (expectedGenId !== this.playbackGenerationId) return;
        if (onEndCb) onEndCb();
      };

      utterance.onerror = () => {
        if (this.activeUtterance === utterance) this.activeUtterance = null;
        if (expectedGenId !== this.playbackGenerationId) return;
        if (onEndCb) onEndCb();
      };

      window.speechSynthesis.speak(utterance);
    } catch (e) {
      if (expectedGenId === this.playbackGenerationId && onEndCb) onEndCb();
    }
  }

  /**
   * Stop Text To Speech & Live Audio Stream immediately (Barge-In / Interrupt)
   * Invalidates active playbackGenerationId and detaches all event handlers BEFORE stopping audio
   * so cancelled speech can NEVER fire onEnd/onError callbacks.
   */
  static stopSpeaking(): void {
    this.playbackGenerationId++;

    if (this.pcmEndTimeoutId) {
      clearTimeout(this.pcmEndTimeoutId);
      this.pcmEndTimeoutId = null;
    }

    if (this.activeTtsAbortController) {
      try { this.activeTtsAbortController.abort(); } catch (e) {}
      this.activeTtsAbortController = null;
    }

    if (this.activeAudioElement) {
      try {
        this.activeAudioElement.onplay = null;
        this.activeAudioElement.onended = null;
        this.activeAudioElement.onerror = null;
        this.activeAudioElement.pause();
        this.activeAudioElement.src = '';
      } catch (e) {}
      this.activeAudioElement = null;
    }

    if (this.activeUtterance) {
      this.activeUtterance.onstart = null;
      this.activeUtterance.onend = null;
      this.activeUtterance.onerror = null;
      this.activeUtterance = null;
    }

    if (this.activePcmNodes.size > 0) {
      this.activePcmNodes.forEach((node) => {
        try { node.onended = null; } catch (e) {}
        try { node.stop(); } catch (e) {}
        try { node.disconnect(); } catch (e) {}
      });
      this.activePcmNodes.clear();
    }

    if (this.pcmAudioContext && this.pcmAudioContext.state !== 'closed') {
      this.nextPcmStartTime = this.pcmAudioContext.currentTime;
    }

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

