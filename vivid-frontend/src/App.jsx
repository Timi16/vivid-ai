import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { api, getTokens, setTokens, WS_URL } from './api'
import {
  createPcmStreamer, isPlaying, playUrl, playWavBase64,
  setPlaybackIdleCallback, stopPlayback,
} from './audio'

const LANGUAGES = [
  { code: 'auto', label: 'Auto detect (voice)' },
  { code: 'en', label: 'English' },
  { code: 'en_ng', label: 'Nigerian English' },
  { code: 'pcm', label: 'Pidgin' },
  { code: 'yo', label: 'Yorùbá' },
  { code: 'ig', label: 'Igbo' },
]

function Login({ onAuthed }) {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = mode === 'login' ? await api.login(email, password) : await api.signup(email, password)
      setTokens(res)
      onAuthed(res.user)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <h1>Vivid AI</h1>
        <p className="muted">{mode === 'login' ? 'Welcome back' : 'Create your account'}</p>
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input
          type="password"
          placeholder="Password (min 8 characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
          required
        />
        {error && <div className="error">{error}</div>}
        <button disabled={busy}>{busy ? '…' : mode === 'login' ? 'Log in' : 'Sign up'}</button>
        <a onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
          {mode === 'login' ? 'No account? Sign up' : 'Have an account? Log in'}
        </a>
      </form>
    </div>
  )
}

export default function App() {
  const [user, setUser] = useState(() => getTokens()?.user || null)
  const [chats, setChats] = useState([])
  const [activeChat, setActiveChat] = useState(null)
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [stream, setStream] = useState(null) // { chatId, text }
  const [activity, setActivity] = useState([]) // live tool/step trail for the turn
  const [error, setError] = useState(null)
  const [sys, setSys] = useState(null) // system status panel data (null = closed)
  const [connOpen, setConnOpen] = useState(false)
  const [connectors, setConnectors] = useState([])
  const [connForm, setConnForm] = useState({ token: '', username: '' })
  const [connBusy, setConnBusy] = useState(false)
  const [busy, setBusy] = useState(false)
  const [newLang, setNewLang] = useState('en')
  const [recording, setRecording] = useState(false)
  const [pendingImage, setPendingImage] = useState(null) // one image per message
  const [callOpen, setCallOpen] = useState(false)
  const [callState, setCallState] = useState('idle') // listening | thinking | speaking
  const [callLine, setCallLine] = useState('')

  const fileInputRef = useRef(null)
  const streamerRef = useRef(null)
  const voiceModeRef = useRef(null) // 'push' (composer mic) | 'call' (call modal)
  const turnAudioRef = useRef([]) // wav chunks collected for push-mode turns
  const callOpenRef = useRef(false)
  const vadRef = useRef(null)
  const wsRef = useRef(null)
  const activeChatRef = useRef(null)
  const scrollRef = useRef(null)
  activeChatRef.current = activeChat

  const loadChats = () => api.chats().then(setChats).catch((e) => setError(e.message))

  useEffect(() => {
    if (user) loadChats()
  }, [user])

  useEffect(() => {
    if (!activeChat) return
    setMessages([])
    setPendingImage(null)
    api.messages(activeChat.id).then(setMessages).catch((e) => setError(e.message))
  }, [activeChat?.id])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages, stream, activity])

  const handleEvent = (ev) => {
    const current = activeChatRef.current
    if (ev.type === 'token') {
      if (current && ev.chat_id === current.id) {
        setStream((s) => ({ chatId: ev.chat_id, text: (s?.chatId === ev.chat_id ? s.text : '') + ev.text }))
      }
    } else if (ev.type === 'tool_status') {
      setActivity((a) => [...a, ev.text])
    } else if (ev.type === 'transcript') {
      if (current && ev.chat_id === current.id && ev.final) {
        setMessages((m) => [...m, { id: `local-${Date.now()}`, role: 'user', content: ev.text }])
      }
      if (voiceModeRef.current === 'call') {
        setCallLine(ev.text)
        setCallState('thinking')
      }
    } else if (ev.type === 'audio_chunk') {
      if (!ev.data) return
      if (voiceModeRef.current === 'call') {
        setCallState('speaking')
        playWavBase64(ev.data) // hands-free: the reply speaks itself
      } else {
        turnAudioRef.current.push(ev.data) // composer mic: play on demand
      }
    } else if (ev.type === 'done') {
      setStream(null)
      setActivity([])
      setBusy(false)
      const audio = turnAudioRef.current
      turnAudioRef.current = []
      // done.text is the final reply — for yo/ig it is the translation, so it
      // replaces the streamed English rather than appending to it.
      if (ev.message_id && ev.text && current && ev.chat_id === current.id) {
        setMessages((m) => [...m, {
          id: ev.message_id, role: 'assistant', content: ev.text,
          used_tools: ev.used_tools,
          audio: audio.length ? audio : undefined,
        }])
      }
      if (voiceModeRef.current === 'call' && callOpenRef.current) {
        // resume listening once the spoken reply finishes — or immediately if
        // this turn produced no audio (e.g. a TTS hiccup)
        const resume = () => {
          setPlaybackIdleCallback(null)
          if (callOpenRef.current) startListening()
        }
        if (isPlaying()) setPlaybackIdleCallback(resume)
        else resume()
      } else {
        voiceModeRef.current = null
      }
      loadChats() // titles are generated in the background
    } else if (ev.type === 'error') {
      setStream(null)
      setActivity([])
      setBusy(false)
      turnAudioRef.current = []
      setError(ev.message || ev.code)
      if (voiceModeRef.current === 'call' && callOpenRef.current) {
        startListening() // an error should not end the call
      } else {
        voiceModeRef.current = null
      }
    }
  }

  const ensureWs = async () => {
    const existing = wsRef.current
    if (existing && existing.readyState === WebSocket.OPEN) return existing
    await api.ensureFreshToken()
    return new Promise((resolve, reject) => {
      const sock = new WebSocket(`${WS_URL}?token=${getTokens().access_token}`)
      sock.onopen = () => resolve(sock)
      sock.onerror = () => reject(new Error('Could not reach the Vivid backend'))
      sock.onmessage = (e) => handleEvent(JSON.parse(e.data))
      sock.onclose = () => {
        if (wsRef.current === sock) wsRef.current = null
      }
      wsRef.current = sock
    })
  }

  const send = async () => {
    const text = draft.trim()
    if (!text || !activeChat) return
    // Sending while a reply is generating supersedes it: the backend cancels
    // the old turn (keeping its partial text) and answers this message.
    const image = pendingImage
    setPendingImage(null)
    setDraft('')
    setError(null)
    setStream(null)
    setActivity([])
    setBusy(true)
    setMessages((m) => [...m, { id: `local-${Date.now()}`, role: 'user', content: text, image: image?.url }])
    try {
      const ws = await ensureWs()
      ws.send(JSON.stringify({
        type: 'message',
        chat_id: activeChat.id,
        text,
        attachment_ids: image ? [image.id] : [],
      }))
    } catch (e) {
      setBusy(false)
      setError(e.message)
    }
  }

  const pickImage = () => fileInputRef.current?.click()

  const onImageSelected = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !activeChat) return
    if (!file.type.startsWith('image/')) {
      setError('Only image files can be attached')
      return
    }
    setError(null)
    try {
      // One image per message: a new pick replaces the previous one.
      const att = await api.upload(file, activeChat.id)
      setPendingImage(att)
    } catch (err) {
      setError(err.message)
    }
  }

  const toggleRecord = async () => {
    if (recording) {
      // Audio already streamed while speaking — stopping just closes the turn.
      streamerRef.current?.stop()
      streamerRef.current = null
      setRecording(false)
      setBusy(true)
      setActivity(['Transcribing…'])
      try {
        wsRef.current?.send(JSON.stringify({ type: 'audio_end', chat_id: activeChat.id }))
      } catch {
        setBusy(false)
        setActivity([])
        setError('Connection lost — try again')
      }
      return
    }
    if (!activeChat) return
    setError(null)
    voiceModeRef.current = 'push' // reply arrives as text; audio is play-on-demand
    turnAudioRef.current = []
    try {
      const ws = await ensureWs()
      ws.send(JSON.stringify({
        type: 'audio_start',
        chat_id: activeChat.id,
        language: activeChat.language,
        mime: 'audio/pcm;rate=16000',
      }))
      streamerRef.current = await createPcmStreamer((buf) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(buf)
      })
      setRecording(true)
    } catch (e) {
      setError(e.message === 'Permission denied' ? 'Microphone access was denied' : e.message)
    }
  }

  // ---- call mode: hands-free conversation loop -----------------------------
  const VAD_THRESHOLD = 0.015 // RMS above this counts as speech
  const VAD_SILENCE_MS = 1300 // this much silence after speech ends the turn

  const startListening = async () => {
    if (!callOpenRef.current || !activeChatRef.current) return
    voiceModeRef.current = 'call'
    setCallState('listening')
    vadRef.current = { voiced: false, last: 0 }
    try {
      const ws = await ensureWs()
      ws.send(JSON.stringify({
        type: 'audio_start',
        chat_id: activeChatRef.current.id,
        language: activeChatRef.current.language,
        mime: 'audio/pcm;rate=16000',
      }))
      streamerRef.current = await createPcmStreamer((buf, rms) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(buf)
        const v = vadRef.current
        if (!v) return
        const now = Date.now()
        if (rms > VAD_THRESHOLD) {
          v.voiced = true
          v.last = now
        } else if (v.voiced && now - v.last > VAD_SILENCE_MS) {
          vadRef.current = null
          finishListening()
        }
      })
    } catch (e) {
      setError(e.message === 'Permission denied' ? 'Microphone access was denied' : e.message)
      endCall()
    }
  }

  const finishListening = () => {
    streamerRef.current?.stop()
    streamerRef.current = null
    setCallState('thinking')
    setBusy(true)
    try {
      wsRef.current?.send(JSON.stringify({ type: 'audio_end', chat_id: activeChatRef.current?.id }))
    } catch {
      if (callOpenRef.current) startListening()
    }
  }

  const startCall = async () => {
    if (!activeChat) return
    setError(null)
    setCallLine('')
    setCallOpen(true)
    callOpenRef.current = true
    await startListening()
  }

  const endCall = () => {
    callOpenRef.current = false
    setCallOpen(false)
    setCallState('idle')
    setPlaybackIdleCallback(null)
    stopPlayback()
    streamerRef.current?.stop()
    streamerRef.current = null
    voiceModeRef.current = null
    if (busy && activeChatRef.current) {
      try {
        wsRef.current?.send(JSON.stringify({ type: 'cancel', chat_id: activeChatRef.current.id }))
      } catch {
        /* noop */
      }
    }
  }

  const cancel = () => {
    const ws = wsRef.current
    if (ws?.readyState === WebSocket.OPEN && activeChat) {
      ws.send(JSON.stringify({ type: 'cancel', chat_id: activeChat.id }))
    }
  }

  const newChat = async () => {
    try {
      const chat = await api.createChat(newLang)
      setChats((c) => [chat, ...c])
      setActiveChat(chat)
    } catch (e) {
      setError(e.message)
    }
  }

  const removeChat = async (e, chat) => {
    e.stopPropagation()
    try {
      await api.deleteChat(chat.id)
      setChats((c) => c.filter((x) => x.id !== chat.id))
      if (activeChat?.id === chat.id) setActiveChat(null)
    } catch (err) {
      setError(err.message)
    }
  }

  const toggleConnectors = async () => {
    if (connOpen) {
      setConnOpen(false)
      return
    }
    try {
      setConnectors(await api.connectors())
      setConnOpen(true)
    } catch (e) {
      setError(e.message)
    }
  }

  const addGithub = async () => {
    if (!connForm.token && !connForm.username) return
    setConnBusy(true)
    setError(null)
    try {
      await api.addConnector({
        provider: 'github',
        token: connForm.token,
        username: connForm.username || null,
      })
      setConnForm({ token: '', username: '' })
      setConnectors(await api.connectors())
    } catch (e) {
      setError(e.message)
    } finally {
      setConnBusy(false)
    }
  }

  const removeConnector = async (id) => {
    try {
      await api.deleteConnector(id)
      setConnectors((c) => c.filter((x) => x.id !== id))
    } catch (e) {
      setError(e.message)
    }
  }

  const toggleSystem = async () => {
    if (sys) {
      setSys(null)
      return
    }
    try {
      const [models, health] = await Promise.all([api.modelsHealth(), api.health()])
      setSys({ models, tools: health.tools || [] })
    } catch (e) {
      setError(e.message)
    }
  }

  const logout = () => {
    wsRef.current?.close()
    setTokens(null)
    setUser(null)
    setChats([])
    setActiveChat(null)
  }

  if (!user) return <Login onAuthed={setUser} />

  return (
    <div className="app">
      <aside>
        <div className="side-head">
          <h2>Vivid</h2>
          <button className="ghost" onClick={logout} title={user.email}>
            Log out
          </button>
        </div>
        <div className="new-chat">
          <select value={newLang} onChange={(e) => setNewLang(e.target.value)}>
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
          <button onClick={newChat}>+ New chat</button>
        </div>
        <div className="chat-list">
          {chats.map((c) => (
            <div key={c.id} className={`chat-item ${activeChat?.id === c.id ? 'active' : ''}`} onClick={() => setActiveChat(c)}>
              <span className="chat-title">{c.title || 'New chat'}</span>
              <span className="chat-lang">{c.language}</span>
              <button className="delete" onClick={(e) => removeChat(e, c)} title="Delete chat">
                ×
              </button>
            </div>
          ))}
          {chats.length === 0 && <p className="muted pad">No chats yet.</p>}
        </div>
        <div className="side-foot">
          <button className="ghost" onClick={toggleConnectors}>
            {connOpen ? 'Hide connectors' : 'Connectors'}
          </button>
          {connOpen && (
            <div className="sys-panel">
              {connectors.map((c) => (
                <div key={c.id} className="sys-row">
                  <span className="dot ok" />
                  {c.name}
                  <span className="sys-detail">{c.mode}</span>
                  <button className="conn-del" onClick={() => removeConnector(c.id)} title="Disconnect">
                    ×
                  </button>
                </div>
              ))}
              {connectors.length === 0 && <div className="sys-row muted">None connected yet</div>}
              <div className="conn-form">
                <span className="conn-label">Add GitHub</span>
                <input
                  type="password"
                  placeholder="Personal access token (private repos)"
                  value={connForm.token}
                  onChange={(e) => setConnForm({ ...connForm, token: e.target.value })}
                />
                <input
                  placeholder="…or just a username (public only)"
                  value={connForm.username}
                  onChange={(e) => setConnForm({ ...connForm, username: e.target.value })}
                />
                <button onClick={addGithub} disabled={connBusy || (!connForm.token && !connForm.username)}>
                  {connBusy ? 'Verifying…' : 'Connect'}
                </button>
              </div>
            </div>
          )}
          <button className="ghost" onClick={toggleSystem}>
            {sys ? 'Hide status' : 'System status'}
          </button>
          {sys && (
            <div className="sys-panel">
              {Object.entries(sys.models).map(([name, s]) => (
                <div key={name} className="sys-row">
                  <span className={`dot ${s.ok ? 'ok' : 'down'}`} />
                  {name}
                  <span className="sys-detail">{s.ok ? 'up' : String(s.status)}</span>
                </div>
              ))}
              <div className="sys-tools">
                {sys.tools.map((t) => (
                  <span key={t} className="tool-chip">{t}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </aside>

      <main>
        {activeChat ? (
          <>
            <header className="chat-head">
              <span className="chat-head-title">{activeChat.title || 'New chat'}</span>
              <span className="chat-lang">{activeChat.language}</span>
              <button className="call-btn" onClick={startCall} title="Start a voice conversation">
                📞
              </button>
            </header>
            <div className="messages" ref={scrollRef}>
              {messages.map((m) => {
                const img = m.image || m.attachments?.find((a) => a.kind === 'image')?.url
                const audioUrl = m.role === 'assistant'
                  ? m.attachments?.find((a) => a.kind === 'audio')?.url : null
                const hasAudio = (m.audio && m.audio.length) || audioUrl
                return (
                  <div key={m.id} className={`bubble ${m.role}`}>
                    {img && <img className="bubble-img" src={img} alt="attachment" />}
                    {m.role === 'assistant' ? (
                      <div className="md">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                      </div>
                    ) : (
                      m.content
                    )}
                    <div className="bubble-meta">
                      {hasAudio && (
                        <button
                          className="audio-btn"
                          title="Play spoken reply"
                          onClick={() => {
                            stopPlayback()
                            if (m.audio?.length) m.audio.forEach(playWavBase64)
                            else if (audioUrl) playUrl(audioUrl)
                          }}
                        >
                          🔊
                        </button>
                      )}
                      {m.used_tools && <span className="tool-badge">⚙ used tools</span>}
                    </div>
                  </div>
                )
              })}
              {activity.length > 0 && (
                <div className="activity">
                  {activity.map((a, i) => (
                    <div key={i} className="activity-step">
                      {i === activity.length - 1 && busy && !stream ? (
                        <span className="spinner" />
                      ) : (
                        <span className="check">✓</span>
                      )}
                      {a}
                    </div>
                  ))}
                </div>
              )}
              {stream?.chatId === activeChat.id && (
                <div className="bubble assistant streaming">
                  <div className="md">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{stream.text}</ReactMarkdown>
                  </div>
                </div>
              )}
              {busy && !stream && activity.length === 0 && <div className="status">Thinking…</div>}
              {messages.length === 0 && !busy && <p className="muted pad">Say something to start the conversation.</p>}
            </div>
            {error && (
              <div className="error bar" onClick={() => setError(null)}>
                {error}
              </div>
            )}
            {pendingImage && (
              <div className="attach-chip">
                <img src={pendingImage.url} alt="" />
                <span>{pendingImage.filename}</span>
                <button onClick={() => setPendingImage(null)} title="Remove image">×</button>
              </div>
            )}
            <div className="composer">
              <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={onImageSelected} />
              <button className="mic" onClick={pickImage} title="Attach an image (one per message)">🖼</button>
              <textarea
                value={draft}
                placeholder={`Message Vivid (${activeChat.language})…`}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    send()
                  }
                }}
                rows={1}
              />
              <button
                className={`mic ${recording ? 'recording' : ''}`}
                onClick={toggleRecord}
                title={recording ? 'Stop recording and send' : 'Record a voice message'}
              >
                {recording ? '■' : '🎤'}
              </button>
              {busy && !draft.trim() ? (
                <button onClick={cancel}>Stop</button>
              ) : (
                <button onClick={send} disabled={!draft.trim()}>Send</button>
              )}
            </div>
          </>
        ) : (
          <div className="empty">
            <h2>Vivid AI</h2>
            <p className="muted">Pick a chat or start a new one.</p>
            {error && <div className="error">{error}</div>}
          </div>
        )}
      </main>

      {callOpen && (
        <div className="call-overlay">
          <div className="call-card">
            <div className={`call-avatar ${callState}`}>V</div>
            <h3>Vivid AI</h3>
            <p className="call-state">
              {callState === 'listening' && 'Listening…'}
              {callState === 'thinking' && 'Thinking…'}
              {callState === 'speaking' && 'Speaking…'}
              {callState === 'idle' && 'Connecting…'}
            </p>
            {callLine && <p className="call-line">“{callLine}”</p>}
            <div className="call-actions">
              {callState === 'listening' && (
                <button className="call-send" onClick={finishListening} title="Send now">
                  ➤
                </button>
              )}
              <button className="call-end" onClick={endCall} title="End the conversation">
                ✕ End
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
