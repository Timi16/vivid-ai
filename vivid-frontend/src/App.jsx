import { useEffect, useRef, useState } from 'react'
import { api, getTokens, setTokens, WS_URL } from './api'
import { createPcmStreamer, playWavBase64 } from './audio'

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
  const [status, setStatus] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [newLang, setNewLang] = useState('en')
  const [recording, setRecording] = useState(false)
  const [pendingImage, setPendingImage] = useState(null) // one image per message

  const fileInputRef = useRef(null)
  const streamerRef = useRef(null)
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
  }, [messages, stream])

  const handleEvent = (ev) => {
    const current = activeChatRef.current
    if (ev.type === 'token') {
      if (current && ev.chat_id === current.id) {
        setStream((s) => ({ chatId: ev.chat_id, text: (s?.chatId === ev.chat_id ? s.text : '') + ev.text }))
      }
    } else if (ev.type === 'tool_status') {
      setStatus(ev.text)
    } else if (ev.type === 'transcript') {
      if (current && ev.chat_id === current.id && ev.final) {
        setMessages((m) => [...m, { id: `local-${Date.now()}`, role: 'user', content: ev.text }])
      }
    } else if (ev.type === 'audio_chunk') {
      if (ev.data) playWavBase64(ev.data)
    } else if (ev.type === 'done') {
      setStream(null)
      setStatus(null)
      setBusy(false)
      // done.text is the final reply — for yo/ig it is the translation, so it
      // replaces the streamed English rather than appending to it.
      if (ev.message_id && ev.text && current && ev.chat_id === current.id) {
        setMessages((m) => [...m, { id: ev.message_id, role: 'assistant', content: ev.text }])
      }
      loadChats() // titles are generated in the background
    } else if (ev.type === 'error') {
      setStream(null)
      setStatus(null)
      setBusy(false)
      setError(ev.message || ev.code)
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
    setStatus(null)
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
      setStatus('Transcribing…')
      try {
        wsRef.current?.send(JSON.stringify({ type: 'audio_end', chat_id: activeChat.id }))
      } catch {
        setBusy(false)
        setStatus(null)
        setError('Connection lost — try again')
      }
      return
    }
    if (!activeChat) return
    setError(null)
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
      </aside>

      <main>
        {activeChat ? (
          <>
            <div className="messages" ref={scrollRef}>
              {messages.map((m) => {
                const img = m.image || m.attachments?.find((a) => a.kind === 'image')?.url
                return (
                  <div key={m.id} className={`bubble ${m.role}`}>
                    {img && <img className="bubble-img" src={img} alt="attachment" />}
                    {m.content}
                  </div>
                )
              })}
              {stream?.chatId === activeChat.id && <div className="bubble assistant streaming">{stream.text}</div>}
              {status && <div className="status">{status}</div>}
              {busy && !stream && !status && <div className="status">Thinking…</div>}
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
    </div>
  )
}
