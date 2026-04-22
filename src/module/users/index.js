const { UserRepository } = require('./userRepository');
const { EVENTS } = require('../../infra/events');

function createUsers({ eventBus } = {}) {
  const repo = new UserRepository();
  return {
    identifyFromTelegram(tgUser) {
      const { user, created } = repo.identifyFromTelegram(tgUser);
      if (created && eventBus) eventBus.emit(EVENTS.USER_CREATED, { ...user });
      return user;
    },
    getById(userId) {
      return repo.getById(userId);
    },
  };
}

module.exports = { createUsers };
