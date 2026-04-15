class TelegramClient {
  constructor({ apiBase, httpJsonClient }) {
    this.apiBase = apiBase;
    this.http = httpJsonClient;
  }

  async call(methodName, params, { timeoutMs = 90000 } = {}) {
    const url = `${this.apiBase}/${methodName}`;
    const data = await this.http.requestJson(url, { method: 'POST', body: params, timeoutMs });
    if (!data || data.ok !== true) {
      const desc = data && typeof data.description === 'string' ? data.description : 'Unknown Telegram error';
      throw new Error(`Telegram API error: ${desc}`);
    }
    return data.result;
  }

  getUpdates({ offset, timeoutSec }) {
    return this.call(
      'getUpdates',
      {
        offset,
        timeout: timeoutSec,
        allowed_updates: ['message'],
      },
      { timeoutMs: (timeoutSec + 10) * 1000 },
    );
  }

  sendMessage({ chatId, text, replyToMessageId }) {
    return this.call('sendMessage', {
      chat_id: chatId,
      reply_to_message_id: replyToMessageId,
      text,
      disable_web_page_preview: true,
    });
  }
}

module.exports = { TelegramClient };

