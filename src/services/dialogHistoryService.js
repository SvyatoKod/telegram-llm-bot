class DialogHistoryService {
  constructor({ maxMessagesPerUser = 50 } = {}) {
    this.maxMessagesPerUser = maxMessagesPerUser;
    this.byUserId = new Map();
  }

  getMessages(userId) {
    if (!userId) return [];
    const arr = this.byUserId.get(String(userId));
    return Array.isArray(arr) ? arr : [];
  }

  addMessage(userId, { role, content }) {
    if (!userId) return { ok: false, truncated: false, removedCount: 0 };
    if (role !== 'user' && role !== 'assistant') return { ok: false, truncated: false, removedCount: 0 };
    const text = typeof content === 'string' ? content.trim() : '';
    if (!text) return { ok: false, truncated: false, removedCount: 0 };

    const key = String(userId);
    const cur = this.getMessages(key);
    const next = cur.concat([{ role, content: text }]);
    const shouldCap = this.maxMessagesPerUser > 0 && next.length > this.maxMessagesPerUser;
    const removedCount = shouldCap ? next.length - this.maxMessagesPerUser : 0;
    const capped = shouldCap ? next.slice(next.length - this.maxMessagesPerUser) : next;
    this.byUserId.set(key, capped);
    return { ok: true, truncated: shouldCap, removedCount };
  }

  clear(userId) {
    if (!userId) return;
    this.byUserId.delete(String(userId));
  }

  // В формате, который ожидает Ollama /api/chat: [{role, content}, ...]
  getChatMessages(userId) {
    return this.getMessages(userId);
  }
}

module.exports = { DialogHistoryService };

