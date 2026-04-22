class HistoryRepository {
  constructor({ maxMessagesPerUser = 50 } = {}) {
    this.maxMessagesPerUser = maxMessagesPerUser;
    this.byUserId = new Map();
  }

  _get(userId) {
    const arr = this.byUserId.get(String(userId));
    return Array.isArray(arr) ? arr : [];
  }

  addMessage(userId, { role, content }) {
    if (!userId) return { ok: false, truncated: false, removedCount: 0 };
    if (role !== 'user' && role !== 'assistant') return { ok: false, truncated: false, removedCount: 0 };
    const text = typeof content === 'string' ? content.trim() : '';
    if (!text) return { ok: false, truncated: false, removedCount: 0 };

    const key = String(userId);
    const next = this._get(key).concat([{ role, content: text }]);
    const shouldCap = this.maxMessagesPerUser > 0 && next.length > this.maxMessagesPerUser;
    const removedCount = shouldCap ? next.length - this.maxMessagesPerUser : 0;
    const capped = shouldCap ? next.slice(next.length - this.maxMessagesPerUser) : next;
    this.byUserId.set(key, capped);
    return { ok: true, truncated: shouldCap, removedCount };
  }

  getLastN(userId, n) {
    if (!userId) return [];
    const all = this._get(userId);
    if (typeof n !== 'number' || n <= 0 || n >= all.length) return all.slice();
    return all.slice(all.length - n);
  }

  clear(userId) {
    if (!userId) return;
    this.byUserId.delete(String(userId));
  }

  replaceAll(userId, messages) {
    if (!userId) return;
    const key = String(userId);
    if (!Array.isArray(messages) || messages.length === 0) {
      this.byUserId.delete(key);
      return;
    }
    const normalized = [];
    for (const m of messages) {
      if (!m) continue;
      const role = m.role === 'user' || m.role === 'assistant' ? m.role : null;
      const text = typeof m.content === 'string' ? m.content.trim() : '';
      if (!role || !text) continue;
      normalized.push({ role, content: text });
    }
    const capped =
      this.maxMessagesPerUser > 0 && normalized.length > this.maxMessagesPerUser
        ? normalized.slice(normalized.length - this.maxMessagesPerUser)
        : normalized;
    this.byUserId.set(key, capped);
  }
}

module.exports = { HistoryRepository };
