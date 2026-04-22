const { OllamaClient } = require('./ollamaClient');
const { ChatService } = require('./chatService');
const { EVENTS } = require('../../infra/events');

function createChat({ baseUrl, model, httpJsonClient, systemPrompt = '', eventBus } = {}) {
  const llm = new OllamaClient({ baseUrl, model, httpJsonClient });
  const service = new ChatService({ llmClient: llm, defaultSystemPrompt: systemPrompt });
  return {
    async generateAnswer({ userId, chatId, replyToMessageId, history, systemPrompt: sp } = {}) {
      const { answer, messagesSent } = await service.generateAnswer({ history, systemPrompt: sp });
      if (eventBus) {
        eventBus.emit(EVENTS.RESPONSE_GENERATED, {
          userId,
          chatId,
          replyToMessageId,
          answer,
          messagesSent,
        });
      }
      return { answer, messagesSent };
    },
    async summarize(params) {
      return service.summarize(params);
    },
  };
}

module.exports = { createChat };
