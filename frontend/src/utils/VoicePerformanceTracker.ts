/**
 * XENA AI — END-TO-END VOICE LATENCY & TURN LIFECYCLE INSTRUMENTATION
 * Tracks real-time timestamps across the entire conversational pipeline without logging raw audio or private content.
 */

export interface VoiceTurnMetrics {
  turnId: number;
  micActivatedAt?: number;
  firstAudioFrameAt?: number;
  vadDetectedAt?: number;
  speechEndedAt?: number;
  inputFinalizedAt?: number;
  requestSentAt?: number;
  firstProviderEventAt?: number;
  firstTranscriptAt?: number;
  firstAudioChunkAt?: number;
  firstAudioDecodedAt?: number;
  firstAudiblePlaybackAt?: number;
  responseCompletedAt?: number;
  interruptedAt?: number;

  // Computed durations (ms)
  micActivationMs?: number;
  vadResponseMs?: number;
  endpointingSilenceMs?: number;
  postSpeechOverheadMs?: number;
  timeToFirstProviderEventMs?: number;
  timeToFirstAudioChunkMs?: number;
  timeToFirstAudibleMs?: number;
  audioStartupDelayMs?: number;
  totalTurnDurationMs?: number;

  // Server-reported breakdown (ms)
  serverIntentMs?: number;
  serverActionMs?: number;
  serverFirstAudioMs?: number;
  serverTotalMs?: number;
  routeType?: string;
}

class VoicePerformanceTrackerService {
  private currentTurn: VoiceTurnMetrics | null = null;
  private history: VoiceTurnMetrics[] = [];
  private duplicateResponseCount: number = 0;
  private unwantedPostInterruptSpeechCount: number = 0;
  private playbackCrashCount: number = 0;

  startTurn(turnId: number): VoiceTurnMetrics {
    const now = performance.now();
    this.currentTurn = {
      turnId,
      micActivatedAt: now
    };
    return this.currentTurn;
  }

  markFirstAudioFrame(turnId?: number): void {
    const t = this.getActiveTurn(turnId);
    if (t && !t.firstAudioFrameAt) {
      t.firstAudioFrameAt = performance.now();
      if (t.micActivatedAt !== undefined) {
        t.micActivationMs = Math.round(t.firstAudioFrameAt - t.micActivatedAt);
      }
    }
  }

  markVadDetected(turnId?: number): void {
    const t = this.getActiveTurn(turnId);
    if (t && !t.vadDetectedAt) {
      t.vadDetectedAt = performance.now();
      const ref = t.firstAudioFrameAt || t.micActivatedAt || t.vadDetectedAt;
      t.vadResponseMs = Math.round(t.vadDetectedAt - ref);
    }
  }

  markSpeechEnded(speechActivityTimestampMs?: number, turnId?: number): void {
    const t = this.getActiveTurn(turnId);
    if (t) {
      const now = performance.now();
      if (speechActivityTimestampMs && speechActivityTimestampMs <= Date.now()) {
        const elapsedSinceSpeech = Math.max(0, Date.now() - speechActivityTimestampMs);
        t.speechEndedAt = now - elapsedSinceSpeech;
      } else {
        t.speechEndedAt = now;
      }
    }
  }

  markInputFinalized(turnId?: number): void {
    const t = this.getActiveTurn(turnId);
    if (t) {
      t.inputFinalizedAt = performance.now();
      if (t.speechEndedAt !== undefined) {
        t.endpointingSilenceMs = Math.max(0, Math.round(t.inputFinalizedAt - t.speechEndedAt));
      } else {
        t.speechEndedAt = t.inputFinalizedAt;
        t.endpointingSilenceMs = 0;
      }
    }
  }

  markRequestSent(turnId: number): void {
    let t = this.getActiveTurn(turnId);
    if (!t || t.turnId !== turnId) {
      t = {
        turnId,
        speechEndedAt: performance.now(),
        inputFinalizedAt: performance.now()
      };
      this.currentTurn = t;
    }
    t.requestSentAt = performance.now();
    const base = t.inputFinalizedAt ?? t.speechEndedAt ?? t.requestSentAt;
    t.postSpeechOverheadMs = Math.max(0, Math.round(t.requestSentAt - base));
  }

  markFirstProviderEvent(turnId: number): void {
    const t = this.getActiveTurn(turnId);
    if (t && !t.firstProviderEventAt) {
      t.firstProviderEventAt = performance.now();
      const base = t.inputFinalizedAt ?? t.requestSentAt ?? t.firstProviderEventAt;
      t.timeToFirstProviderEventMs = Math.max(0, Math.round(t.firstProviderEventAt - base));
    }
  }

  markFirstTranscript(turnId: number): void {
    const t = this.getActiveTurn(turnId);
    if (t && !t.firstTranscriptAt) {
      t.firstTranscriptAt = performance.now();
      if (!t.firstProviderEventAt) {
        this.markFirstProviderEvent(turnId);
      }
    }
  }

  markFirstAudioChunkReceived(turnId: number): void {
    const t = this.getActiveTurn(turnId);
    if (t && !t.firstAudioChunkAt) {
      t.firstAudioChunkAt = performance.now();
      if (!t.firstProviderEventAt) {
        this.markFirstProviderEvent(turnId);
      }
      const base = t.inputFinalizedAt ?? t.requestSentAt ?? t.firstAudioChunkAt;
      t.timeToFirstAudioChunkMs = Math.max(0, Math.round(t.firstAudioChunkAt - base));
    }
  }

  markFirstAudioDecoded(turnId?: number): void {
    const t = this.getActiveTurn(turnId);
    if (t && !t.firstAudioDecodedAt) {
      t.firstAudioDecodedAt = performance.now();
    }
  }

  markFirstAudiblePlayback(turnId?: number): void {
    const t = this.getActiveTurn(turnId);
    if (t && !t.firstAudiblePlaybackAt) {
      t.firstAudiblePlaybackAt = performance.now();
      const base = t.inputFinalizedAt ?? t.requestSentAt ?? t.firstAudiblePlaybackAt;
      t.timeToFirstAudibleMs = Math.max(0, Math.round(t.firstAudiblePlaybackAt - base));
      if (t.firstAudioChunkAt !== undefined) {
        t.audioStartupDelayMs = Math.max(0, Math.round(t.firstAudiblePlaybackAt - t.firstAudioChunkAt));
      }
      console.log(
        `[VOICE_PERF_METRICS] Turn #${t.turnId} | First Audible: ${t.timeToFirstAudibleMs}ms | Post-Speech Overhead: ${t.postSpeechOverheadMs ?? 0}ms | Audio Decode/Startup: ${t.audioStartupDelayMs ?? 0}ms`
      );
    }
  }

  recordServerMetrics(
    turnId: number,
    serverMetrics: {
      intentMs?: number;
      actionMs?: number;
      firstAudioMs?: number;
      totalMs?: number;
      routeType?: string;
    }
  ): void {
    const t = this.getActiveTurn(turnId);
    if (!t) return;
    t.serverIntentMs = serverMetrics.intentMs;
    t.serverActionMs = serverMetrics.actionMs;
    t.serverFirstAudioMs = serverMetrics.firstAudioMs;
    t.serverTotalMs = serverMetrics.totalMs;
    t.routeType = serverMetrics.routeType;
  }

  markTurnCompleted(turnId: number): VoiceTurnMetrics | null {
    const t = this.getActiveTurn(turnId);
    if (!t) return null;
    t.responseCompletedAt = performance.now();
    const base = t.inputFinalizedAt ?? t.requestSentAt ?? t.responseCompletedAt;
    t.totalTurnDurationMs = Math.max(0, Math.round(t.responseCompletedAt - base));
    this.pushHistory({ ...t });
    return t;
  }

  markTurnInterrupted(turnId: number): void {
    const t = this.getActiveTurn(turnId);
    if (t) {
      t.interruptedAt = performance.now();
      this.pushHistory({ ...t });
    }
  }

  recordDuplicatePrevented(): void {
    this.duplicateResponseCount++;
  }

  recordUnwantedPostInterruptSpeechBlocked(): void {
    this.unwantedPostInterruptSpeechCount++;
  }

  recordPlaybackError(): void {
    this.playbackCrashCount++;
  }

  getLatestMetrics(): VoiceTurnMetrics | null {
    return this.currentTurn || (this.history.length > 0 ? this.history[this.history.length - 1] : null);
  }

  getHistory(): VoiceTurnMetrics[] {
    return [...this.history];
  }

  getSummaryStats() {
    const validAudible = this.history
      .map(h => h.timeToFirstAudibleMs)
      .filter((v): v is number => typeof v === 'number' && v > 0)
      .sort((a, b) => a - b);

    const medianFirstAudibleMs =
      validAudible.length > 0
        ? validAudible[Math.floor(validAudible.length / 2)]
        : null;

    return {
      turnsMeasured: this.history.length,
      medianFirstAudibleMs,
      lastFirstAudibleMs: this.currentTurn?.timeToFirstAudibleMs ?? medianFirstAudibleMs,
      duplicateResponses: 0,
      duplicatesBlocked: this.duplicateResponseCount,
      postInterruptSpeechBlocked: this.unwantedPostInterruptSpeechCount,
      playbackCrashes: this.playbackCrashCount
    };
  }

  private getActiveTurn(turnId?: number): VoiceTurnMetrics | null {
    if (!this.currentTurn) return null;
    if (turnId !== undefined && this.currentTurn.turnId !== turnId) return null;
    return this.currentTurn;
  }

  private pushHistory(metrics: VoiceTurnMetrics): void {
    const existingIdx = this.history.findIndex(h => h.turnId === metrics.turnId);
    if (existingIdx >= 0) {
      this.history[existingIdx] = metrics;
    } else {
      this.history.push(metrics);
      if (this.history.length > 30) {
        this.history.shift();
      }
    }
  }
}

export const VoicePerformanceTracker = new VoicePerformanceTrackerService();

if (typeof window !== 'undefined') {
  (window as any).__XENA_VOICE_PERF__ = VoicePerformanceTracker;
}

