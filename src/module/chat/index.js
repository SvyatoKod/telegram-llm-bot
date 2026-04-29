const { OllamaClient } = require('./ollamaClient');
const { ChatService } = require('./chatService');
const { HistorySummarizer } = require('./historySummarizer');
const { EVENTS } = require('../../infra/events');

function createChat({
  baseUrl,
  model,
  httpJsonClient,
  systemPrompt = '',
  eventBus,
  summaryChunkSize = 4,
  summaryChunkOverlap = 1,
  logger = console,
} = {}) {
  const llm = new OllamaClient({ baseUrl, model, httpJsonClient });
  const service = new ChatService({ llmClient: llm, defaultSystemPrompt: systemPrompt });
  const summarizer = new HistorySummarizer({
    llmClient: llm,
    chunkSize: summaryChunkSize,
    chunkOverlap: summaryChunkOverlap,
    defaultSystemPrompt: systemPrompt,
    logger,
  });

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
      return summarizer.summarize(params);
    },
  };
}

module.exports = { createChat };
