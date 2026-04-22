const { UserRepository } = require('./userRepository');

function createUsers() {
  const repo = new UserRepository();
  return {
    identifyFromTelegram(tgUser) {
      return repo.identifyFromTelegram(tgUser);
    },
    getById(userId) {
      return repo.getById(userId);
    },
  };
}

module.exports = { createUsers };
