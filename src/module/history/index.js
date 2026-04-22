const { HistoryRepository } = require('./historyRepository');
const { EVENTS } = require('../../infra/events');

function createHistory({ maxMessagesPerUser = 50, eventBus } = {}) {
  const repo = new HistoryRepository({ maxMessagesPerUser });

  if (eventBus) {
    eventBus.on(EVENTS.MESSAGE_RECEIVED, ({ userId, content } = {}) => {
      repo.addMessage(userId, { role: 'user', content });
    });
    eventBus.on(EVENTS.RESPONSE_GENERATED, ({ userId, answer } = {}) => {
      repo.addMessage(userId, { role: 'assistant', content: answer || '' });
    });
  }

  return {
    get maxMessagesPerUser() {
      return repo.maxMessagesPerUser;
    },
    getLastN(userId, n) {
      return repo.getLastN(userId, n);
    },
    getAll(userId) {
      return repo.getLastN(userId);
    },
    clear(userId) {
      repo.clear(userId);
    },
    replaceAll(userId, messages) {
      repo.replaceAll(userId, messages);
    },
  };
}

module.exports = { createHistory };
