"use client";

// Real-time mic capture and sequential reply playback, ported from the proven
// integration. Mic audio streams as 16 kHz mono int16 PCM chunks WHILE the
// user speaks; each chunk's RMS level feeds call-mode voice-activity
// detection. Replies can arrive as several clause-sized clips (the backend
// streams TTS sentence-by-sentence), so playback runs through a queue.

const TARGET_RATE = 16000;

export interface PcmStreamer {
  stop: () => void;
}

export async function createPcmStreamer(
  onChunk: (buffer: ArrayBuffer, rms: number) => void
): Promise<PcmStreamer> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(stream);
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  const ratio = ctx.sampleRate / TARGET_RATE;

  proc.onaudioprocess = (event) => {
    const input = event.inputBuffer.getChannelData(0);
    const outLen = Math.floor(input.length / ratio);
    if (!outLen) return;
    const out = new Int16Array(outLen);
    let sumSq = 0;
    for (let i = 0; i < outLen; i++) {
      const sample = Math.max(-1, Math.min(1, input[Math.floor(i * ratio)]));
      out[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      sumSq += sample * sample;
    }
    onChunk(out.buffer, Math.sqrt(sumSq / outLen));
  };

  source.connect(proc);
  proc.connect(ctx.destination); // some browsers only run connected processors

  return {
    stop() {
      try {
        proc.disconnect();
        source.disconnect();
        stream.getTracks().forEach((track) => track.stop());
        void ctx.close();
      } catch {
        // already torn down
      }
    },
  };
}

const queue: string[] = [];
let playing = false;
let current: HTMLAudioElement | null = null;
let idleCallback: (() => void) | null = null;

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

export function stopPlayback() {
  queue.length = 0;
  if (current) {
    try {
      current.pause();
    } catch {
      // noop
    }
    current = null;
  }
  playing = false;
}

function playNext() {
  const b64 = queue.shift();
  if (!b64) {
    playing = false;
    current = null;
    idleCallback?.();
    return;
  }
  playing = true;
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
  const audio = new Audio(url);
  current = audio;
  const done = () => {
    URL.revokeObjectURL(url);
    playNext();
  };
  audio.onended = done;
  audio.onerror = done;
  audio.play().catch(done);
}

export function playUrl(url: string) {
  void new Audio(url).play().catch(() => {});
}
