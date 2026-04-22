const { appendContextLog, messagesTokenCountApprox } = require('../../infra/contextLog');
const { EVENTS } = require('../../infra/events');

class MessageOrchestrator {
  constructor({
    telegramClient,
    users,
    history,
    chat,
    eventBus,
    countMessageSummaryLimit = 6,
    systemPrompt = '',
    logger = console,
  }) {
    this.telegram = telegramClient;
    this.users = users;
    this.history = history;
    this.chat = chat;
    this.bus = eventBus;
    this.summaryLimit = countMessageSummaryLimit;
    this.systemPrompt = typeof systemPrompt === 'string' ? systemPrompt.trim() : '';
    this.log = logger;
  }

  async _compressHistoryIfNeeded(userId) {
    const all = this.history.getAll(userId);
    if (!Array.isArray(all) || all.length <= this.summaryLimit) return;

    await appendContextLog({
      ts: new Date().toISOString(),
      event: 'summary_start',
      userId,
      currentMessageCount: all.length,
      summaryLimit: this.summaryLimit,
    }).catch(() => {});

    const tailKeep = Math.min(4, Math.max(1, this.summaryLimit - 1));
    const head = all.slice(0, Math.max(0, all.length - tailKeep));
    const tail = all.slice(Math.max(0, all.length - tailKeep));
    if (head.length < 2) return;

    let summaryText = '';
    try {
      summaryText = await this.chat.summarize({ history: head, systemPrompt: this.systemPrompt });
    } catch (e) {
      this.log.warn('Failed to summarize history:', e && e.message ? e.message : e);
      return;
    }
    if (!summaryText) return;

    this.history.replaceAll(userId, [
      { role: 'assistant', content: `Резюме предыдущего диалога: ${summaryText}` },
      ...tail,
    ]);

    const after = this.history.getAll(userId);
    await appendContextLog({
      ts: new Date().toISOString(),
      event: 'summary_done',
      userId,
      summaryChars: summaryText.length,
      tailKept: tail.length,
      messageCountAfter: Array.isArray(after) ? after.length : 0,
    }).catch(() => {});
  }

  async handle(msg) {
    const chatId = msg.chat && msg.chat.id;
    if (!chatId) return;

    const user = this.users.identifyFromTelegram(msg.from);
    if (!user) return;
    const userId = user.userId;

    const text = typeof msg.text === 'string' ? msg.text : '';
    if (!text) return;

    if (text.trim() === '/clear') {
      this.history.clear(userId);
      await appendContextLog({ ts: new Date().toISOString(), event: 'clear', userId, chatId }).catch(() => {});
      await this.telegram
        .sendMessage({ chatId, replyToMessageId: msg.message_id, text: 'История диалога очищена.' })
        .catch((err) => this.log.warn('Failed to send Telegram message:', err.message || err));
      return;
    }

    let answer;
    try {
      if (this.bus) {
        this.bus.emit(EVENTS.MESSAGE_RECEIVED, {
          userId,
          chatId,
          messageId: msg.message_id,
          content: text,
        });
      }

      await this._compressHistoryIfNeeded(userId);

      const historyMessages = this.history.getAll(userId);
      const { answer: reply, messagesSent } = await this.chat.generateAnswer({
        userId,
        chatId,
        replyToMessageId: msg.message_id,
        history: historyMessages,
        systemPrompt: this.systemPrompt,
      });
      answer = reply;

      await appendContextLog({
        ts: new Date().toISOString(),
        event: 'llm_request',
        userId,
        chatId,
        messageCount: Array.isArray(messagesSent) ? messagesSent.length : 0,
        approxTokens: messagesTokenCountApprox(messagesSent),
        messages: messagesSent,
      }).catch((e) => this.log.warn('Failed to write context log:', e && e.message ? e.message : e));
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
      .sendMessage({ chatId, replyToMessageId: msg.message_id, text: answer })
      .catch((err) => this.log.warn('Failed to send Telegram message:', err.message || err));
  }
}

module.exports = { MessageOrchestrator };
