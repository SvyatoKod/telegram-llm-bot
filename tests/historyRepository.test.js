const { HistoryRepository } = require('../src/module/history/historyRepository');

describe('HistoryRepository — нормальные сценарии', () => {
  test('добавляет сообщение пользователя и возвращает его в истории', () => {
    const repo = new HistoryRepository({ maxMessagesPerUser: 10 });
    const res = repo.addMessage('u1', { role: 'user', content: 'привет' });
    expect(res).toEqual({ ok: true, truncated: false, removedCount: 0 });
    expect(repo.getLastN('u1')).toEqual([{ role: 'user', content: 'привет' }]);
  });

  test('хранит истории разных пользователей независимо', () => {
    const repo = new HistoryRepository({ maxMessagesPerUser: 10 });
    repo.addMessage('u1', { role: 'user', content: 'hi from u1' });
    repo.addMessage('u2', { role: 'user', content: 'hi from u2' });
    expect(repo.getLastN('u1')).toEqual([{ role: 'user', content: 'hi from u1' }]);
    expect(repo.getLastN('u2')).toEqual([{ role: 'user', content: 'hi from u2' }]);
  });

  test('getLastN возвращает только последние N', () => {
    const repo = new HistoryRepository({ maxMessagesPerUser: 100 });
    for (let i = 0; i < 5; i++) {
      repo.addMessage('u1', { role: 'user', content: `m${i}` });
    }
    expect(repo.getLastN('u1', 2)).toEqual([
      { role: 'user', content: 'm3' },
      { role: 'user', content: 'm4' },
    ]);
  });

  test('clear очищает историю конкретного пользователя', () => {
    const repo = new HistoryRepository({ maxMessagesPerUser: 10 });
    repo.addMessage('u1', { role: 'user', content: 'hello' });
    repo.clear('u1');
    expect(repo.getLastN('u1')).toEqual([]);
  });

  test('replaceAll нормализует и сохраняет валидные сообщения', () => {
    const repo = new HistoryRepository({ maxMessagesPerUser: 10 });
    repo.replaceAll('u1', [
      { role: 'assistant', content: 'резюме' },
      { role: 'user', content: 'q' },
      { role: 'assistant', content: 'a' },
    ]);
    expect(repo.getLastN('u1')).toEqual([
      { role: 'assistant', content: 'резюме' },
      { role: 'user', content: 'q' },
      { role: 'assistant', content: 'a' },
    ]);
  });

  test('лимит messages применяется и обрезаются старые', () => {
    const repo = new HistoryRepository({ maxMessagesPerUser: 3 });
    repo.addMessage('u1', { role: 'user', content: 'm1' });
    repo.addMessage('u1', { role: 'user', content: 'm2' });
    repo.addMessage('u1', { role: 'user', content: 'm3' });
    const res = repo.addMessage('u1', { role: 'user', content: 'm4' });
    expect(res).toEqual({ ok: true, truncated: true, removedCount: 1 });
    expect(repo.getLastN('u1')).toEqual([
      { role: 'user', content: 'm2' },
      { role: 'user', content: 'm3' },
      { role: 'user', content: 'm4' },
    ]);
  });
});

describe('HistoryRepository — ошибки и неожиданный ввод', () => {
  test('возвращает ok=false для пустого userId', () => {
    const repo = new HistoryRepository({ maxMessagesPerUser: 10 });
    const res = repo.addMessage('', { role: 'user', content: 'hi' });
    expect(res).toEqual({ ok: false, truncated: false, removedCount: 0 });
  });

  test('отвергает невалидную роль', () => {
    const repo = new HistoryRepository({ maxMessagesPerUser: 10 });
    const res = repo.addMessage('u1', { role: 'system', content: 'bad' });
    expect(res.ok).toBe(false);
    expect(repo.getLastN('u1')).toEqual([]);
  });

  test('отвергает пустой/непустой-но-пробельный content', () => {
    const repo = new HistoryRepository({ maxMessagesPerUser: 10 });
    expect(repo.addMessage('u1', { role: 'user', content: '' }).ok).toBe(false);
    expect(repo.addMessage('u1', { role: 'user', content: '   ' }).ok).toBe(false);
    expect(repo.addMessage('u1', { role: 'user', content: null }).ok).toBe(false);
  });

  test('игнорирует non-string content типы', () => {
    const repo = new HistoryRepository({ maxMessagesPerUser: 10 });
    expect(repo.addMessage('u1', { role: 'user', content: 123 }).ok).toBe(false);
    expect(repo.addMessage('u1', { role: 'user', content: { a: 1 } }).ok).toBe(false);
    expect(repo.getLastN('u1')).toEqual([]);
  });

  test('replaceAll с пустым массивом удаляет историю', () => {
    const repo = new HistoryRepository({ maxMessagesPerUser: 10 });
    repo.addMessage('u1', { role: 'user', content: 'hi' });
    repo.replaceAll('u1', []);
    expect(repo.getLastN('u1')).toEqual([]);
  });

  test('replaceAll отбрасывает невалидные элементы', () => {
    const repo = new HistoryRepository({ maxMessagesPerUser: 10 });
    repo.replaceAll('u1', [
      null,
      undefined,
      { role: 'system', content: 'skip' },
      { role: 'user', content: '' },
      { role: 'assistant', content: 'keep' },
    ]);
    expect(repo.getLastN('u1')).toEqual([{ role: 'assistant', content: 'keep' }]);
  });

  test('clear на несуществующего пользователя не падает', () => {
    const repo = new HistoryRepository({ maxMessagesPerUser: 10 });
    expect(() => repo.clear('nonexistent')).not.toThrow();
    expect(() => repo.clear('')).not.toThrow();
  });

  test('getLastN с n <= 0 возвращает всю историю (slice копию)', () => {
    const repo = new HistoryRepository({ maxMessagesPerUser: 10 });
    repo.addMessage('u1', { role: 'user', content: 'a' });
    repo.addMessage('u1', { role: 'user', content: 'b' });
    expect(repo.getLastN('u1', 0)).toHaveLength(2);
    expect(repo.getLastN('u1', -5)).toHaveLength(2);
  });
});
