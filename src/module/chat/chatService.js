class ChatService {
  constructor({ llmClient, defaultSystemPrompt = '' }) {
    this.llm = llmClient;
    this.defaultSystemPrompt = typeof defaultSystemPrompt === 'string' ? defaultSystemPrompt.trim() : '';
  }

  _buildMessages({ history, systemPrompt }) {
    const sp = typeof systemPrompt === 'string' ? systemPrompt.trim() : this.defaultSystemPrompt;
    const out = [];
    if (sp) out.push({ role: 'system', content: sp });
    if (Array.isArray(history) && history.length) out.push(...history);
    return out;
  }

  async generateAnswer({ history, systemPrompt } = {}) {
    const messages = this._buildMessages({ history, systemPrompt });
    const answer = await this.llm.chat(messages);
    return { answer: answer || '', messagesSent: messages };
  }

  async summarize({ history, systemPrompt } = {}) {
    if (!Array.isArray(history) || history.length === 0) return '';
    const sp = typeof systemPrompt === 'string' ? systemPrompt.trim() : this.defaultSystemPrompt;
    const messages = [
      ...(sp ? [{ role: 'system', content: sp }] : []),
      {
        role: 'system',
        content:
          'Сделай краткое резюме диалога на русском в 1-3 предложениях. ' +
          'Сохрани ключевые факты, цели, решения и ограничения. ' +
          'Не добавляй ничего от себя. Формат: одно абзацное резюме без списков.',
      },
      ...history,
      { role: 'user', content: 'Кратко резюмируй диалог выше.' },
    ];
    const summary = await this.llm.chat(messages);
    return typeof summary === 'string' ? summary.trim() : '';
  }
}

module.exports = { ChatService };
