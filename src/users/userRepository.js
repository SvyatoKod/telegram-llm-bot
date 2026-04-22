class UserRepository {
  constructor() {
    this.byId = new Map();
  }

  identifyFromTelegram(tgUser) {
    if (!tgUser || tgUser.id === undefined || tgUser.id === null) return null;
    const userId = String(tgUser.id);
    const existing = this.byId.get(userId);
    if (existing) return existing;

    const user = {
      userId,
      telegramId: userId,
      username: typeof tgUser.username === 'string' ? tgUser.username : null,
      firstName: typeof tgUser.first_name === 'string' ? tgUser.first_name : null,
      lastName: typeof tgUser.last_name === 'string' ? tgUser.last_name : null,
      createdAt: new Date().toISOString(),
    };
    this.byId.set(userId, user);
    return user;
  }

  getById(userId) {
    if (!userId) return null;
    return this.byId.get(String(userId)) || null;
  }
}

module.exports = { UserRepository };
