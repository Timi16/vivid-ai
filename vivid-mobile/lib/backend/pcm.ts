// Float samples in [-1, 1] at `inputRate` -> int16 at 16 kHz plus the RMS of
// the chunk. The same arithmetic as the web's audio.ts, so the backend hears
// the same signal and the VAD threshold means the same thing on both. Pure,
// so it is unit tested without a microphone.

export const TARGET_RATE = 16000;

export function toPcm16(
  input: Float32Array,
  inputRate: number
): { buffer: ArrayBuffer; rms: number } | null {
  const ratio = inputRate / TARGET_RATE;
  const outLen = Math.floor(input.length / ratio);
  if (!outLen) return null;
  const out = new Int16Array(outLen);
  let sumSq = 0;
  for (let i = 0; i < outLen; i++) {
    const sample = Math.max(-1, Math.min(1, input[Math.floor(i * ratio)]));
    out[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    sumSq += sample * sample;
  }
  return { buffer: out.buffer, rms: Math.sqrt(sumSq / outLen) };
}
