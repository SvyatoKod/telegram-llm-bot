const { createHistory } = require('../src/module/history');
const { createEventBus } = require('../src/infra/eventBus');
const { EVENTS } = require('../src/infra/events');

const silentLogger = { warn() {}, error() {}, log() {} };

describe('createHistory — интеграция с шиной событий (in-memory)', () => {
  test('сохраняет user-сообщение по событию MESSAGE_RECEIVED', () => {
    const bus = createEventBus({ logger: silentLogger });
    const history = createHistory({ maxMessagesPerUser: 10, eventBus: bus });
    bus.emit(EVENTS.MESSAGE_RECEIVED, { userId: 'u1', content: 'привет' });
    expect(history.getAll('u1')).toEqual([{ role: 'user', content: 'привет' }]);
  });

  test('сохраняет assistant-сообщение по событию RESPONSE_GENERATED', () => {
    const bus = createEventBus({ logger: silentLogger });
    const history = createHistory({ maxMessagesPerUser: 10, eventBus: bus });
    bus.emit(EVENTS.MESSAGE_RECEIVED, { userId: 'u1', content: 'q' });
    bus.emit(EVENTS.RESPONSE_GENERATED, { userId: 'u1', answer: 'a' });
    expect(history.getAll('u1')).toEqual([
      { role: 'user', content: 'q' },
      { role: 'assistant', content: 'a' },
    ]);
  });

  test('clear удаляет историю', () => {
    const bus = createEventBus({ logger: silentLogger });
    const history = createHistory({ maxMessagesPerUser: 10, eventBus: bus });
    bus.emit(EVENTS.MESSAGE_RECEIVED, { userId: 'u1', content: 'q' });
    history.clear('u1');
    expect(history.getAll('u1')).toEqual([]);
  });

  test('replaceAll заменяет содержимое истории', () => {
    const bus = createEventBus({ logger: silentLogger });
    const history = createHistory({ maxMessagesPerUser: 10, eventBus: bus });
    bus.emit(EVENTS.MESSAGE_RECEIVED, { userId: 'u1', content: 'old' });
    history.replaceAll('u1', [{ role: 'assistant', content: 'summary' }]);
    expect(history.getAll('u1')).toEqual([{ role: 'assistant', content: 'summary' }]);
  });

  test('пустой ответ assistant не попадает в историю (нет валидного content)', () => {
    const bus = createEventBus({ logger: silentLogger });
    const history = createHistory({ maxMessagesPerUser: 10, eventBus: bus });
    bus.emit(EVENTS.RESPONSE_GENERATED, { userId: 'u1', answer: '' });
    bus.emit(EVENTS.RESPONSE_GENERATED, { userId: 'u1' });
    expect(history.getAll('u1')).toEqual([]);
  });

  test('лимит messages обеспечивается через event-bus', () => {
    const bus = createEventBus({ logger: silentLogger });
    const history = createHistory({ maxMessagesPerUser: 2, eventBus: bus });
    bus.emit(EVENTS.MESSAGE_RECEIVED, { userId: 'u1', content: 'm1' });
    bus.emit(EVENTS.MESSAGE_RECEIVED, { userId: 'u1', content: 'm2' });
    bus.emit(EVENTS.MESSAGE_RECEIVED, { userId: 'u1', content: 'm3' });
    const all = history.getAll('u1');
    expect(all).toHaveLength(2);
    expect(all[all.length - 1]).toEqual({ role: 'user', content: 'm3' });
  });
});
