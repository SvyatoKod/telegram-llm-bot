const { UserRepository } = require('../src/module/users/userRepository');
const { createUsers } = require('../src/module/users');
const { createEventBus } = require('../src/infra/eventBus');
const { EVENTS } = require('../src/infra/events');

const silentLogger = { warn() {}, error() {}, log() {} };

describe('UserRepository.identifyFromTelegram — нормальные сценарии', () => {
  test('создаёт нового пользователя при первом вызове', () => {
    const repo = new UserRepository();
    const { user, created } = repo.identifyFromTelegram({
      id: 42,
      username: 'alice',
      first_name: 'Alice',
      last_name: 'Wonder',
    });
    expect(created).toBe(true);
    expect(user.userId).toBe('42');
    expect(user.username).toBe('alice');
    expect(user.firstName).toBe('Alice');
    expect(user.lastName).toBe('Wonder');
    expect(typeof user.createdAt).toBe('string');
  });

  test('возвращает существующего пользователя при повторном вызове', () => {
    const repo = new UserRepository();
    const first = repo.identifyFromTelegram({ id: 1 });
    const second = repo.identifyFromTelegram({ id: 1, username: 'updated' });
    expect(second.created).toBe(false);
    expect(second.user).toBe(first.user);
  });

  test('getById возвращает ранее созданного пользователя', () => {
    const repo = new UserRepository();
    repo.identifyFromTelegram({ id: 7 });
    expect(repo.getById(7)).not.toBeNull();
    expect(repo.getById('7')).not.toBeNull();
  });

  test('username/first_name/last_name по умолчанию null', () => {
    const repo = new UserRepository();
    const { user } = repo.identifyFromTelegram({ id: 99 });
    expect(user.username).toBeNull();
    expect(user.firstName).toBeNull();
    expect(user.lastName).toBeNull();
  });

  test('id может быть строкой или числом — нормализуется к строке', () => {
    const repo = new UserRepository();
    const a = repo.identifyFromTelegram({ id: 5 });
    const b = repo.identifyFromTelegram({ id: '5' });
    expect(b.created).toBe(false);
    expect(b.user.userId).toBe('5');
    expect(a.user).toBe(b.user);
  });
});

describe('UserRepository — ошибки и неожиданный ввод', () => {
  test('null/undefined tgUser → user: null', () => {
    const repo = new UserRepository();
    expect(repo.identifyFromTelegram(null)).toEqual({ user: null, created: false });
    expect(repo.identifyFromTelegram(undefined)).toEqual({ user: null, created: false });
  });

  test('отсутствие id → user: null', () => {
    const repo = new UserRepository();
    expect(repo.identifyFromTelegram({})).toEqual({ user: null, created: false });
    expect(repo.identifyFromTelegram({ id: undefined })).toEqual({ user: null, created: false });
    expect(repo.identifyFromTelegram({ id: null })).toEqual({ user: null, created: false });
  });

  test('non-string username игнорируется (null)', () => {
    const repo = new UserRepository();
    const { user } = repo.identifyFromTelegram({ id: 1, username: 123, first_name: {} });
    expect(user.username).toBeNull();
    expect(user.firstName).toBeNull();
  });

  test('getById для несуществующего → null', () => {
    const repo = new UserRepository();
    expect(repo.getById('missing')).toBeNull();
    expect(repo.getById('')).toBeNull();
    expect(repo.getById(null)).toBeNull();
  });
});

describe('createUsers — события', () => {
  test('эмитит USER_CREATED только при создании нового', () => {
    const bus = createEventBus({ logger: silentLogger });
    const events = [];
    bus.on(EVENTS.USER_CREATED, (u) => events.push(u));

    const users = createUsers({ eventBus: bus });
    users.identifyFromTelegram({ id: 1, username: 'x' });
    users.identifyFromTelegram({ id: 1 });
    users.identifyFromTelegram({ id: 2 });

    expect(events).toHaveLength(2);
    expect(events[0].userId).toBe('1');
    expect(events[1].userId).toBe('2');
  });

  test('createUsers без eventBus не падает', () => {
    const users = createUsers({});
    const u = users.identifyFromTelegram({ id: 10 });
    expect(u.userId).toBe('10');
  });
});
