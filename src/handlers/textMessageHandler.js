class TextMessageHandler {
  constructor({ telegramClient, llmClient, logger = console }) {
    this.telegram = telegramClient;
    this.llm = llmClient;
    this.log = logger;
  }

  async handle(msg) {
    const chatId = msg.chat && msg.chat.id;
    if (!chatId) return;

    const text = typeof msg.text === 'string' ? msg.text : '';
    if (!text) return;

    let answer;
    try {
      answer = await this.llm.generate(text);
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

