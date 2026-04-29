const { ChatService } = require('../src/module/chat/chatService');

function makeFakeLLM(impl) {
  return { chat: jest.fn(impl) };
}

describe('ChatService.generateAnswer — нормальные сценарии (AI заmoxкан)', () => {
  test('возвращает ответ от AI и messagesSent с system-prompt', async () => {
    const llm = makeFakeLLM(async () => 'mocked answer');
    const svc = new ChatService({ llmClient: llm, defaultSystemPrompt: 'sys' });
    const res = await svc.generateAnswer({
      history: [{ role: 'user', content: 'привет' }],
    });
    expect(res.answer).toBe('mocked answer');
    expect(res.messagesSent[0]).toEqual({ role: 'system', content: 'sys' });
    expect(res.messagesSent[1]).toEqual({ role: 'user', content: 'привет' });
    expect(llm.chat).toHaveBeenCalledTimes(1);
    expect(llm.chat).toHaveBeenCalledWith(res.messagesSent);
  });

  test('переопределение systemPrompt в вызове', async () => {
    const llm = makeFakeLLM(async () => 'ok');
    const svc = new ChatService({ llmClient: llm, defaultSystemPrompt: 'default' });
    const { messagesSent } = await svc.generateAnswer({
      history: [{ role: 'user', content: 'q' }],
      systemPrompt: 'override',
    });
    expect(messagesSent[0]).toEqual({ role: 'system', content: 'override' });
  });

  test('без systemPrompt и без default — system-сообщения нет', async () => {
    const llm = makeFakeLLM(async () => 'pong');
    const svc = new ChatService({ llmClient: llm, defaultSystemPrompt: '' });
    const { messagesSent } = await svc.generateAnswer({
      history: [{ role: 'user', content: 'ping' }],
    });
    expect(messagesSent.find((m) => m.role === 'system')).toBeUndefined();
  });

  test('история передаётся в порядке: system, затем сообщения', async () => {
    const llm = makeFakeLLM(async () => 'a');
    const svc = new ChatService({ llmClient: llm, defaultSystemPrompt: 'S' });
    const history = [
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'a1' },
      { role: 'user', content: 'q2' },
    ];
    const { messagesSent } = await svc.generateAnswer({ history });
    expect(messagesSent).toEqual([{ role: 'system', content: 'S' }, ...history]);
  });

  test('не зависит от внешнего мира — AI замокан', async () => {
    const llm = makeFakeLLM(async (msgs) => `echo:${msgs.length}`);
    const svc = new ChatService({ llmClient: llm });
    const { answer } = await svc.generateAnswer({
      history: [{ role: 'user', content: 'x' }],
    });
    expect(answer).toBe('echo:1');
  });
});

describe('ChatService.generateAnswer — ошибки и неожиданный ввод', () => {
  test('ошибка LLM прокидывается', async () => {
    const llm = makeFakeLLM(async () => {
      throw new Error('LLM down');
    });
    const svc = new ChatService({ llmClient: llm });
    await expect(svc.generateAnswer({ history: [] })).rejects.toThrow('LLM down');
  });

  test('пустой ответ AI превращается в пустую строку', async () => {
    const llm = makeFakeLLM(async () => null);
    const svc = new ChatService({ llmClient: llm });
    const { answer } = await svc.generateAnswer({ history: [] });
    expect(answer).toBe('');
  });

  test('history undefined обрабатывается без ошибок', async () => {
    const llm = makeFakeLLM(async () => 'ok');
    const svc = new ChatService({ llmClient: llm, defaultSystemPrompt: 'S' });
    const { messagesSent } = await svc.generateAnswer({});
    expect(messagesSent).toEqual([{ role: 'system', content: 'S' }]);
  });

  test('не-массив history воспринимается как отсутствие истории', async () => {
    const llm = makeFakeLLM(async () => 'ok');
    const svc = new ChatService({ llmClient: llm, defaultSystemPrompt: 'S' });
    const { messagesSent } = await svc.generateAnswer({ history: 'oops' });
    expect(messagesSent).toEqual([{ role: 'system', content: 'S' }]);
  });
});

