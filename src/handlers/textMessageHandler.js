const { appendContextLog, messagesTokenCountApprox } = require('../utils/contextLog');

class TextMessageHandler {
  constructor({
    telegramClient,
    llmClient,
    dialogHistory,
    countMessageSummaryLimit = 6,
    systemPrompt = '',
    logger = console,
  }) {
    this.telegram = telegramClient;
    this.llm = llmClient;
    this.history = dialogHistory;
    this.summaryLimit = countMessageSummaryLimit;
    this.systemPrompt = typeof systemPrompt === 'string' ? systemPrompt.trim() : '';
    this.log = logger;
  }

  buildChatRequestMessages(historyMessages) {
    const out = [];
    if (this.systemPrompt) out.push({ role: 'system', content: this.systemPrompt });
    if (Array.isArray(historyMessages) && historyMessages.length) out.push(...historyMessages);
    return out;
  }

  async compressHistoryIfNeeded(userId) {
    if (!this.history) return;
    const all = this.history.getChatMessages(userId);
    if (!Array.isArray(all) || all.length <= this.summaryLimit) return;

    try {
      await appendContextLog({
        ts: new Date().toISOString(),
        event: 'summary_start',
        userId,
        currentMessageCount: all.length,
        summaryLimit: this.summaryLimit,
      });
    } catch (_e) {
      // ignore
    }

    // Оставляем "хвост" последних сообщений без сжатия (чтобы сохранить ближайший контекст)
    const tailKeep = Math.min(4, Math.max(1, this.summaryLimit - 1));
    const head = all.slice(0, Math.max(0, all.length - tailKeep));
    const tail = all.slice(Math.max(0, all.length - tailKeep));
    if (head.length < 2) return;

    const summaryPrompt = [
      ...(this.systemPrompt ? [{ role: 'system', content: this.systemPrompt }] : []),
      {
        role: 'system',
        content:
          'Сделай краткое резюме диалога на русском в 1-3 предложениях. ' +
          'Сохрани ключевые факты, цели, решения и ограничения. ' +
          'Не добавляй ничего от себя. Формат: одно абзацное резюме без списков.',
      },
      ...head,
      { role: 'user', content: 'Кратко резюмируй диалог выше.' },
    ];

    let summaryText = '';
    try {
      summaryText = await this.llm.chat(summaryPrompt);
    } catch (e) {
      this.log.warn('Failed to summarize history:', e && e.message ? e.message : e);
      return;
    }

    summaryText = typeof summaryText === 'string' ? summaryText.trim() : '';
    if (!summaryText) return;

    // Заменяем "голову" на одно сообщение-резюме как первое сообщение.
    this.history.clear(userId);
    this.history.addMessage(userId, { role: 'assistant', content: `Резюме предыдущего диалога: ${summaryText}` });
    for (const m of tail) this.history.addMessage(userId, m);

    try {
      const after = this.history.getChatMessages(userId);
      await appendContextLog({
        ts: new Date().toISOString(),
        event: 'summary_done',
        userId,
        summaryChars: summaryText.length,
        tailKept: tail.length,
        messageCountAfter: Array.isArray(after) ? after.length : 0,
      });
    } catch (_e) {
      // ignore
    }
  }

  async handle(msg) {
    const chatId = msg.chat && msg.chat.id;
    if (!chatId) return;

    const userId = msg.from && msg.from.id ? String(msg.from.id) : null;
    if (!userId) return;

    const text = typeof msg.text === 'string' ? msg.text : '';
    if (!text) return;

    if (text.trim() === '/clear') {
      if (this.history) this.history.clear(userId);
      try {
        await appendContextLog({ ts: new Date().toISOString(), event: 'clear', userId, chatId });
      } catch (_e) {
        // ignore
      }
      await this.telegram
        .sendMessage({
          chatId,
          replyToMessageId: msg.message_id,
          text: 'История диалога очищена.',
        })
        .catch((err) => this.log.warn('Failed to send Telegram message:', err.message || err));
      return;
    }

    let answer;
    try {
      if (this.history) {
        const res = this.history.addMessage(userId, { role: 'user', content: text });
        if (res && res.truncated) {
          try {
            await appendContextLog({
              ts: new Date().toISOString(),
              event: 'history_trim',
              reason: 'COUNT_MESSAGE_LIMIT',
              userId,
              limit: this.history.maxMessagesPerUser,
              removedCount: res.removedCount,
              messageCountAfter: this.history.getChatMessages(userId).length,
            });
          } catch (_e) {
            // ignore
          }
        }
      }
      await this.compressHistoryIfNeeded(userId);
      const historyMessages = this.history ? this.history.getChatMessages(userId) : [{ role: 'user', content: text }];
      const messages = this.buildChatRequestMessages(historyMessages);

      // Log full context before sending to LLM
      try {
        const approxTokens = messagesTokenCountApprox(messages);
        await appendContextLog({
          ts: new Date().toISOString(),
          event: 'llm_request',
          userId,
          chatId,
          messageCount: Array.isArray(messages) ? messages.length : 0,
          approxTokens,
          messages,
        });
        this.log.log(`LLM context tokens≈${approxTokens}, messages=${messages.length}`);
      } catch (e) {
        this.log.warn('Failed to write context log:', e && e.message ? e.message : e);
      }

      answer = await this.llm.chat(messages);
      if (this.history) {
        const res = this.history.addMessage(userId, { role: 'assistant', content: answer || '' });
        if (res && res.truncated) {
          try {
            await appendContextLog({
              ts: new Date().toISOString(),
              event: 'history_trim',
              reason: 'COUNT_MESSAGE_LIMIT',
              userId,
              limit: this.history.maxMessagesPerUser,
              removedCount: res.removedCount,
              messageCountAfter: this.history.getChatMessages(userId).length,
            });
          } catch (_e) {
            // ignore
          }
        }
      }
    } catch (e) {
      this.log.warn('LLM error:', e && e.message ? e.message : e);
      await this.telegram
        .sendMessage({
          chatId,
          replyToMessageId: msg.message_id,
          text:
            'Извините, сейчас не могу получить ответ от локальной модели (LLM недоступна или вернула ошибку). Попробуйте ещё раз позже.',
        })
        .catch((err) => this.log.warn('Failed to send Telegram error message:', err.message || err));
      return;
    }

    if (!answer) answer = '(пустой ответ от модели)';

    await this.telegram
      .sendMessage({
        chatId,
        replyToMessageId: msg.message_id,
        text: answer,
      })
      .catch((err) => this.log.warn('Failed to send Telegram message:', err.message || err));
  }
}

module.exports = { TextMessageHandler };

