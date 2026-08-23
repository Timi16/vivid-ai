// Real-time mic capture: raw 16 kHz mono int16 PCM chunks are streamed over
// the websocket WHILE the user speaks. Each chunk's RMS level is reported so
// call mode can run voice-activity detection (auto-send on silence).

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
    let sumSq = 0
    for (let i = 0; i < outLen; i++) {
      const s = Math.max(-1, Math.min(1, input[Math.floor(i * ratio)]))
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
      sumSq += s * s
    }
    onChunk(out.buffer, Math.sqrt(sumSq / outLen))
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

// Sequential playback queue: replies can arrive as several clause-sized clips
// (the backend streams TTS sentence-by-sentence for fast engines). onIdle
// fires when the queue drains — call mode uses it to start listening again.
const queue = []
let playing = false
let current = null
let idleCb = null

export function setPlaybackIdleCallback(cb) {
  idleCb = cb
}

export function isPlaying() {
  return playing
}

export function playWavBase64(b64) {
  queue.push(b64)
  if (!playing) playNext()
}

export function stopPlayback() {
  queue.length = 0
  if (current) {
    try {
      current.pause()
    } catch {
      /* noop */
    }
    current = null
  }
  playing = false
}

function playNext() {
  const b64 = queue.shift()
  if (!b64) {
    playing = false
    current = null
    if (idleCb) idleCb()
    return
  }
  playing = true
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }))
  const audio = new Audio(url)
  current = audio
  const done = () => {
    URL.revokeObjectURL(url)
    playNext()
  }
  audio.onended = done
  audio.onerror = done
  audio.play().catch(done)
}

export function playUrl(url) {
  const audio = new Audio(url)
  audio.play().catch(() => {})
}
