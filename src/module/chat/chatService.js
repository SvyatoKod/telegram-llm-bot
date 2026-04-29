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
}

module.exports = { ChatService };
