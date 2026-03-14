import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { randomUUID } from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.CHAT_DATA_DIR || path.join(__dirname, '../data');
const SESSIONS_FILE = path.join(DATA_DIR, 'chat-sessions.json');

class ChatSessionStore {
  constructor() {
    if (!existsSync(DATA_DIR)) {
      mkdirSync(DATA_DIR, { recursive: true });
    }
    this.sessions = this._load();
  }

  _load() {
    try {
      if (existsSync(SESSIONS_FILE)) {
        return JSON.parse(readFileSync(SESSIONS_FILE, 'utf-8'));
      }
    } catch (err) {
      console.error('[ChatSessionStore] Failed to load:', err.message);
    }
    return {};
  }

  _save() {
    try {
      writeFileSync(SESSIONS_FILE, JSON.stringify(this.sessions, null, 2));
    } catch (err) {
      console.error('[ChatSessionStore] Failed to save:', err.message);
    }
  }

  create({ serverIp, model, sessionName, allowedTools, systemPrompt }) {
    const id = randomUUID();
    const session = {
      id,
      sessionName: sessionName || `Session ${Object.keys(this.sessions).length + 1}`,
      serverIp,
      model: model || 'sonnet',
      allowedTools: allowedTools || ['Read', 'Edit', 'Bash', 'Write'],
      systemPrompt: systemPrompt || null,
      status: 'starting',
      claudeSessionId: null,
      pid: null,
      createdAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      messageCount: 0,
      messages: []
    };
    this.sessions[id] = session;
    this._save();
    return session;
  }

  get(id) {
    return this.sessions[id] || null;
  }

  list() {
    return Object.values(this.sessions)
      .filter(s => s.status !== 'archived')
      .sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));
  }

  update(id, updates) {
    if (!this.sessions[id]) return null;
    Object.assign(this.sessions[id], updates);
    this._save();
    return this.sessions[id];
  }

  addMessage(id, role, content, toolUse = null) {
    if (!this.sessions[id]) return;
    this.sessions[id].messages.push({
      role,
      content,
      toolUse,
      timestamp: new Date().toISOString()
    });
    this.sessions[id].messageCount = this.sessions[id].messages.length;
    this.sessions[id].lastActivity = new Date().toISOString();
    this._save();
  }

  getMessages(id) {
    return this.sessions[id]?.messages || [];
  }

  archive(id) {
    return this.update(id, { status: 'archived' });
  }

  delete(id) {
    delete this.sessions[id];
    this._save();
  }
}

let instance = null;
export function getChatSessionStore() {
  if (!instance) instance = new ChatSessionStore();
  return instance;
}
export { ChatSessionStore };
