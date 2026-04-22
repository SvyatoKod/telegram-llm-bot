const { OllamaClient } = require('./ollamaClient');
const { ChatService } = require('./chatService');

function createChat({ baseUrl, model, httpJsonClient, systemPrompt = '' }) {
  const llm = new OllamaClient({ baseUrl, model, httpJsonClient });
  const service = new ChatService({ llmClient: llm, defaultSystemPrompt: systemPrompt });
  return {
    async generateAnswer(params) {
      return service.generateAnswer(params);
    },
    async summarize(params) {
      return service.summarize(params);
    },
  };
}

module.exports = { createChat };
