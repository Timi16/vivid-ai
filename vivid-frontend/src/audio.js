// Real-time mic capture: raw 16 kHz mono int16 PCM chunks are streamed over
// the websocket WHILE the user speaks, so the upload is finished the moment
// they stop — no record-then-encode-then-upload stall. The backend wraps the
// PCM in a WAV header for the STT server, and the same chunk stream feeds
// streaming STT unchanged once the pod exposes it.

const TARGET_RATE = 16000

export async function createPcmStreamer(onChunk) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const ctx = new (window.AudioContext || window.webkitAudioContext)()
  const source = ctx.createMediaStreamSource(stream)
  const proc = ctx.createScriptProcessor(4096, 1, 1)
  const ratio = ctx.sampleRate / TARGET_RATE

  proc.onaudioprocess = (e) => {
    const input = e.inputBuffer.getChannelData(0)
    const outLen = Math.floor(input.length / ratio)
    if (!outLen) return
    const out = new Int16Array(outLen)
    for (let i = 0; i < outLen; i++) {
      const s = Math.max(-1, Math.min(1, input[Math.floor(i * ratio)]))
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
    }
    onChunk(out.buffer)
  }

  source.connect(proc)
  proc.connect(ctx.destination) // some browsers only run connected processors

  return {
    stop() {
      try {
        proc.disconnect()
        source.disconnect()
        stream.getTracks().forEach((t) => t.stop())
        ctx.close()
      } catch {
        /* already torn down */
      }
    },
  }
}

// Replies can arrive as several clause-sized clips (the backend streams TTS
// sentence-by-sentence for fast engines) — queue them so they play in order
// instead of on top of each other.
const queue = []
let playing = false

export function playWavBase64(b64) {
  queue.push(b64)
  if (!playing) playNext()
}

function playNext() {
  const b64 = queue.shift()
  if (!b64) {
    playing = false
    return
  }
  playing = true
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }))
  const audio = new Audio(url)
  const done = () => {
    URL.revokeObjectURL(url)
    playNext()
  }
  audio.onended = done
  audio.onerror = done
  audio.play().catch(done)
}
