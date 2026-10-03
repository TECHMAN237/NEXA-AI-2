# XENA_VOICE_ARCHITECTURE.md

**Version:** 1.0  
**Role:** End-to-End Real-Time Voice Architecture, Gemini Live Integration, Audio Pipeline & Fallback Specification  
**Companion Documents:** `XENA_VOICE_IDENTITY.md`, `XENA_SYSTEM_PROMPT.md`

---

## 1. System Architecture Overview

Xena AI features a hybrid real-time voice pipeline engineered for ultra-low latency, natural speech delivery, and seamless integration with Xena's database state (Organizer, Reminders, Events, Study Tracker, Vault Memory).

```text
XENA AI VOICE ARCHITECTURE
│
├── Frontend Client Layer (React 19 + TypeScript)
│   ├── SpeechService.ts (Audio Capture, VAD, Web Audio API Scheduler, SpeechSynth Fallback)
│   ├── LiveVoiceModal.tsx (Live Orb Interface, Audio Spectrum, Real-Time Transcripts)
│   └── LanguageView.tsx (Voice Persona Selection & Live 24kHz HD Previews)
│
├── Network Protocol & Streaming API Layer
│   ├── POST /api/chat/live/stream (Server-Sent Events for Real-Time 24kHz PCM Audio & Transcripts)
│   ├── POST /api/tts/speak (Gemini 3.8 Neural TTS Unary Audio Route)
│   └── POST /api/tts/stream (Streaming 24kHz PCM Audio Route)
│
├── AI Orchestrator & Backend Layer (Node.js + Express + @google/genai SDK)
│   ├── backend/server/gemini.ts (streamGeminiLiveTurn, streamSpeechWithGemini, chatWithXenaLive)
│   ├── ServerActionEngine.ts (Intent Routing, Tool Execution, Grounded Confirmation Generation)
│   └── PersonalContextEngine.ts (Grounded Voice Assembly)
│
└── Engine Core (Google Gemini API)
    ├── Primary: gemini-3.8-live (Native Gemini Live Bidirectional Session API)
    └── TTS Core: gemini-3.8-flash-lite-tts / gemini-3.8-flash-tts (24kHz Neural Audio Synthesis)
```

---

## 2. Gemini Live Real-Time Integration (`gemini-3.8-live`)

- **Native Audio Streaming**: Uses `ai.live.connect` with `model: 'gemini-3.8-live'`, `responseModalities: [Modality.AUDIO]`, and `outputAudioTranscription: {}`.
- **Grounded Action Execution**: Before connecting to `gemini-3.8-live`, `ServerActionEngine` executes authorized database actions (Creating Reminders, Events, Study Tracker updates, Memory Vault additions) and supplies grounded action summaries directly into the system prompt or stream payload.
- **Latency**: First audio chunk delivered in under 1.1s on standard network connections.

---

## 3. Gemini 3.8 Neural TTS & Gapless Web Audio API Streaming Player

- **24kHz 16-Bit Mono PCM Streaming**: `/api/chat/live/stream` streams raw 24kHz PCM chunks encoded in Base64 via SSE (`data: {"type": "audio", "pcmBase64": "..."}`).
- **Client Playback Engine**: `SpeechService.enqueuePcmChunk` decodes Base64 PCM to `Float32Array` buffers and schedules them on an `AudioContext` using `AudioBufferSourceNode.start(startAt)` with sample-accurate gapless timing, preventing clicks, pops, or stutters.
- **Client Cache**: `SpeechService` maintains an in-memory blob cache (up to 40 items) for instant replay of synthesized neural audio.

---

## 4. Voice Activity Detection (VAD) & Instant Barge-In (Interruption)

- **Silence Detection**: `SpeechService.startRecording` analyzes microphone RMS level every 60ms. When audio falls below the silence threshold for 1450ms, recording automatically stops and sends user speech to the server.
- **Instant Barge-In**: Tapping the floating Avatar Orb or starting to speak immediately invokes `AbortController.abort()`, stops active audio playback, purges scheduled Web Audio nodes, and starts a fresh microphone listening pass.

---

## 5. Intelligent Multi-Tier Fallback Strategy

```text
PRIMARY: Gemini Live (gemini-3.8-live SSE Stream)
  │ (If network stream error or connection timeout)
  ▼
SECONDARY: Unary Chat (chatWithXenaLive) + Gemini 3.8 Neural TTS (gemini-3.8-flash-lite-tts)
  │ (If Gemini API quota exhausted / 429)
  ▼
TERTIARY: Browser SpeechSynthesis with Premium Neural Voice Matching (getBestHumanVoice)
  │ (If offline or device unsupported)
  ▼
FALLBACK: Smooth UI Error Banner & Instant Text Continuation
```

---

## 6. Security, Credentials & Environment Setup

- **Backend API Key Storage**: All Gemini API requests originate from server-side handlers in `backend/server.ts` / `backend/server/gemini.ts` using `process.env.GEMINI_API_KEY`. No secrets or permanent API keys are exposed in frontend client code.
- **Environment Variables**:
  ```env
  GEMINI_API_KEY=your_gemini_api_key_here
  PORT=3000
  NODE_ENV=development
  ```
