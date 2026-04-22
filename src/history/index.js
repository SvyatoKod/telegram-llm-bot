const { HistoryRepository } = require('./historyRepository');

function createHistory({ maxMessagesPerUser = 50 } = {}) {
  const repo = new HistoryRepository({ maxMessagesPerUser });
  return {
    get maxMessagesPerUser() {
      return repo.maxMessagesPerUser;
    },
    addMessage(userId, message) {
      return repo.addMessage(userId, message);
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
