const { URL } = require('node:url');
const { sleep } = require('../utils/time');

class OllamaClient {
  constructor({ baseUrl, model, httpJsonClient }) {
    this.baseUrl = baseUrl;
    this.model = model;
    this.http = httpJsonClient;
  }

  async generateOnce(promptText, { timeoutMs = 120000 } = {}) {
    const url = new URL(this.baseUrl);
    url.pathname = '/api/generate';
    url.search = '';

    const data = await this.http.requestJson(url.toString(), {
      method: 'POST',
      timeoutMs,
      body: {
        model: this.model,
        prompt: promptText,
        stream: false,
      },
    });

    const out = data && typeof data.response === 'string' ? data.response : '';
    return out.trim();
  }

  async chatOnce(messages, { timeoutMs = 120000 } = {}) {
    const url = new URL(this.baseUrl);
    url.pathname = '/api/chat';
    url.search = '';

    const data = await this.http.requestJson(url.toString(), {
      method: 'POST',
      timeoutMs,
      body: {
        model: this.model,
        messages,
        stream: false,
      },
    });

    const out =
      data && data.message && typeof data.message.content === 'string'
        ? data.message.content
        : data && typeof data.response === 'string'
          ? data.response
          : '';
    return out.trim();
  }

  async chat(messages) {
    try {
      return await this.chatOnce(messages, { timeoutMs: 120000 });
    } catch (_e1) {
      await sleep(400);
      return await this.chatOnce(messages, { timeoutMs: 120000 });
    }
  }

  async generate(promptText) {
    try {
      return await this.generateOnce(promptText, { timeoutMs: 120000 });
    } catch (_e1) {
      await sleep(400);
      return await this.generateOnce(promptText, { timeoutMs: 120000 });
    }
  }
}

module.exports = { OllamaClient };

