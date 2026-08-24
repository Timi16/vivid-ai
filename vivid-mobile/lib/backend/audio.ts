// Real-time mic capture and sequential reply playback, ported from the web's
// lib/backend/audio.ts. Mic audio streams as 16 kHz mono int16 PCM chunks
// WHILE the user speaks; each chunk's RMS level feeds call-mode voice
// activity detection. Replies arrive as several clause-sized WAV clips (the
// backend streams TTS sentence by sentence), so playback runs through a queue.
//
// The mic side is a hook rather than a plain function: the native recorder
// delivers samples through a React hook, so the streamer has to live in the
// component tree. The playback side is module state, exactly as on the web.

import { useCallback, useRef } from "react";
import { useAudioRecorder } from "@siteed/audio-studio";
import {
  createAudioPlayer,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  type AudioPlayer,
} from "expo-audio";
import { File, Paths } from "expo-file-system";

import { TARGET_RATE, toPcm16 } from "@/lib/backend/pcm";

export type PcmChunkHandler = (buffer: ArrayBuffer, rms: number) => void;

export interface PcmStreamer {
  // Resolves once samples are flowing. Throws if the microphone is denied.
  start: (onChunk: PcmChunkHandler) => Promise<void>;
  stop: () => void;
}

// Voice needs the session in play-and-record mode with the speaker, not the
// earpiece, carrying the reply.
export async function prepareVoiceSession() {
  await setAudioModeAsync({
    playsInSilentMode: true,
    allowsRecording: true,
    shouldRouteThroughEarpiece: false,
    interruptionMode: "doNotMix",
  });
}

export function usePcmStreamer(): PcmStreamer {
  const recorder = useAudioRecorder();
  const handlerRef = useRef<PcmChunkHandler | null>(null);
  const rateRef = useRef(TARGET_RATE);
  const activeRef = useRef(false);

  const stop = useCallback(() => {
    handlerRef.current = null;
    if (!activeRef.current) return;
    activeRef.current = false;
    recorder.stopRecording().catch(() => {
      // already stopped by the OS (interruption); nothing to release
    });
  }, [recorder]);

  const start = useCallback(
    async (onChunk: PcmChunkHandler) => {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) throw new Error("Microphone access is turned off for Vivid.");
      await prepareVoiceSession();
      handlerRef.current = onChunk;
      const started = await recorder.startRecording({
        sampleRate: TARGET_RATE,
        channels: 1,
        encoding: "pcm_16bit",
        // Small chunks keep the VAD responsive; the backend buffers anyway.
        interval: 100,
        bufferDurationSeconds: 0.1,
        keepAwake: true,
        keepFullAnalysis: false,
        // Streaming only: no file on disk, the bytes go straight to the socket.
        output: { primary: { enabled: false } },
        streamFormat: "float32",
        onAudioStream: async (event) => {
          const handler = handlerRef.current;
          if (!handler || event.streamFormat !== "float32") return;
          const pcm = toPcm16(event.data, rateRef.current);
          if (pcm) handler(pcm.buffer, pcm.rms);
        },
      });
      rateRef.current = started.sampleRate || TARGET_RATE;
      activeRef.current = true;
    },
    [recorder]
  );

  return { start, stop };
}

// ---------------------------------------------------------------------------
// Playback queue
// ---------------------------------------------------------------------------

const queue: string[] = [];
let playing = false;
let current: AudioPlayer | null = null;
let currentFile: File | null = null;
let idleCallback: (() => void) | null = null;
let clipCounter = 0;

export function setPlaybackIdleCallback(callback: (() => void) | null) {
  idleCallback = callback;
}

export function isPlaying() {
  return playing;
}

export function playWavBase64(b64: string) {
  queue.push(b64);
  if (!playing) playNext();
}

function releaseCurrent() {
  if (current) {
    try {
      current.remove();
    } catch {
      // already released
    }
    current = null;
  }
  if (currentFile) {
    try {
      currentFile.delete();
    } catch {
      // already gone
    }
    currentFile = null;
  }
}

export function stopPlayback() {
  queue.length = 0;
  releaseCurrent();
  playing = false;
}

function playNext() {
  const b64 = queue.shift();
  if (!b64) {
    playing = false;
    releaseCurrent();
    idleCallback?.();
    return;
  }
  playing = true;
  // The player wants a URI, so each clip is written to the cache and removed
  // once it has played.
  const file = new File(Paths.cache, `vivid-reply-${Date.now()}-${clipCounter++}.wav`);
  try {
    file.write(b64, { encoding: "base64" });
  } catch {
    playNext();
    return;
  }
  const player = createAudioPlayer({ uri: file.uri });
  current = player;
  currentFile = file;
  let finished = false;
  const done = () => {
    if (finished) return;
    finished = true;
    releaseCurrent();
    playNext();
  };
  player.addListener("playbackStatusUpdate", (status) => {
    if (status.didJustFinish) done();
  });
  try {
    player.play();
  } catch {
    done();
  }
}

// One-off playback of a stored clip (a synthesized reply). Not queued: it
// replaces whatever is playing.
export function playUrl(url: string) {
  stopPlayback();
  playing = true;
  const player = createAudioPlayer({ uri: url });
  current = player;
  player.addListener("playbackStatusUpdate", (status) => {
    if (status.didJustFinish) {
      playing = false;
      releaseCurrent();
    }
  });
  try {
    player.play();
  } catch {
    playing = false;
    releaseCurrent();
  }
}
