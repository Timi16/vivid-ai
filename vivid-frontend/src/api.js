const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'
export const WS_URL = API.replace(/^http/, 'ws') + '/ws'

let tokens = JSON.parse(localStorage.getItem('vivid_tokens') || 'null')

export function getTokens() {
  return tokens
}

export function setTokens(t) {
  tokens = t
  if (t) localStorage.setItem('vivid_tokens', JSON.stringify(t))
  else localStorage.removeItem('vivid_tokens')
}

async function refreshTokens() {
  if (!tokens?.refresh_token) return false
  const res = await fetch(`${API}/v1/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: tokens.refresh_token }),
  })
  if (!res.ok) return false
  setTokens(await res.json())
  return true
}

async function request(path, opts = {}, retry = true) {
  const headers = { ...(opts.headers || {}) }
  if (tokens) headers.Authorization = `Bearer ${tokens.access_token}`
  let body = opts.body
  if (opts.json !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(opts.json)
  }
  const res = await fetch(`${API}/v1${path}`, { ...opts, headers, body })
  if (res.status === 401 && retry) {
    if (await refreshTokens()) return request(path, opts, false)
    setTokens(null)
    window.location.reload()
  }
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}))
    throw new Error(detail.detail || `Request failed (${res.status})`)
  }
  return res.status === 204 ? null : res.json()
}

export const api = {
  signup: (email, password) => request('/auth/signup', { method: 'POST', json: { email, password } }),
  login: (email, password) => request('/auth/login', { method: 'POST', json: { email, password } }),
  chats: () => request('/chats'),
  createChat: (language) => request('/chats', { method: 'POST', json: { language } }),
  deleteChat: (id) => request(`/chats/${id}`, { method: 'DELETE' }),
  messages: (chatId) => request(`/chats/${chatId}/messages`),
  upload: (file, chatId) => {
    const fd = new FormData()
    fd.append('file', file)
    if (chatId) fd.append('chat_id', chatId)
    return request('/attachments', { method: 'POST', body: fd })
  },
  // A cheap authed call; its 401-refresh path guarantees a fresh access token
  // right before a websocket connect.
  ensureFreshToken: () => request('/chats?limit=1'),
}
