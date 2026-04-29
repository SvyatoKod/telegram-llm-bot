jest.mock('../src/infra/contextLog', () => ({
  appendContextLog: jest.fn(async () => {}),
  messagesTokenCountApprox: jest.fn(() => 0),
}));

const { MessageOrchestrator } = require('../src/module/orchestrator/messageOrchestrator');
const { createHistory } = require('../src/module/history');
const { createUsers } = require('../src/module/users');
const { createEventBus } = require('../src/infra/eventBus');

const silentLogger = { warn() {}, error() {}, log() {} };

function makeTelegramMock() {
  return { sendMessage: jest.fn(async () => ({ ok: true })) };
}

function makeChatMock({ answer = 'mocked answer', summary = 'mocked summary', failGenerate = false } = {}) {
  const generateAnswer = jest.fn(async ({ history, userId, chatId, replyToMessageId }) => {
    if (failGenerate) throw new Error('LLM failure');
    const messagesSent = [{ role: 'system', content: 'sys' }, ...(history || [])];
    return { answer, messagesSent, userId, chatId, replyToMessageId };
  });
  const summarize = jest.fn(async () => summary);
  return { generateAnswer, summarize };
}

function makeMessage({ text = 'hi', userId = 100, chatId = 200, messageId = 1 } = {}) {
  return {
    message_id: messageId,
    chat: { id: chatId },
    from: { id: userId, username: 'tester', first_name: 'T' },
    text,
  };
}

function makeOrchestrator(overrides = {}) {
  const bus = createEventBus({ logger: silentLogger });
  const users = createUsers({ eventBus: bus });
  const history = createHistory({ maxMessagesPerUser: 50, eventBus: bus });
  const telegramClient = overrides.telegramClient || makeTelegramMock();
  const chat = overrides.chat || makeChatMock();

  // Wire up the bus so that orchestrator emit MESSAGE_RECEIVED stores user message,
  // and chat.generateAnswer mock emits RESPONSE_GENERATED itself.
  // The real createChat does that — here we emulate it inside the chat mock wrapper:
  const wrappedChat = {
    generateAnswer: async (args) => {
      const result = await chat.generateAnswer(args);
      bus.emit('ResponseGenerated', { userId: args.userId, answer: result.answer });
      return result;
    },
    summarize: chat.summarize,
  };

  const orchestrator = new MessageOrchestrator({
    telegramClient,
    users,
    history,
    chat: wrappedChat,
    eventBus: bus,
    countMessageSummaryLimit: overrides.countMessageSummaryLimit ?? 6,
    systemPrompt: overrides.systemPrompt ?? 'sys',
    logger: silentLogger,
  });

  return { orchestrator, telegramClient, chat, history, users, bus };
}

describe('MessageOrchestrator — нормальные сценарии', () => {
  test('обрабатывает обычное сообщение: вызывает chat и шлёт ответ', async () => {
    const { orchestrator, telegramClient, chat } = makeOrchestrator({
      chat: makeChatMock({ answer: 'привет!' }),
    });
    const msg = makeMessage({ text: 'hello' });

    await orchestrator.handle(msg);

    expect(chat.generateAnswer).toHaveBeenCalledTimes(1);
    expect(telegramClient.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ chatId: 200, replyToMessageId: 1, text: 'привет!' }),
    );
  });

  test('пользовательское сообщение и ответ ассистента сохраняются в историю (in-memory)', async () => {
    const { orchestrator, history } = makeOrchestrator({
      chat: makeChatMock({ answer: 'ответ' }),
    });
    await orchestrator.handle(makeMessage({ text: 'q1', userId: 7 }));
    expect(history.getAll('7')).toEqual([
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: 'ответ' },
    ]);
  });

  test('обрабатывает /clear — стирает историю и шлёт подтверждение', async () => {
    const { orchestrator, telegramClient, history } = makeOrchestrator();
    await orchestrator.handle(makeMessage({ text: 'first', userId: 9 }));
    expect(history.getAll('9').length).toBeGreaterThan(0);

    await orchestrator.handle(makeMessage({ text: '/clear', userId: 9, messageId: 2 }));
    expect(history.getAll('9')).toEqual([]);
    expect(telegramClient.sendMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ text: 'История диалога очищена.' }),
    );
  });

  test('передаёт history в chat.generateAnswer', async () => {
    const { orchestrator, chat } = makeOrchestrator();
    await orchestrator.handle(makeMessage({ text: 'q1' }));
    await orchestrator.handle(makeMessage({ text: 'q2', messageId: 2 }));
    const lastCall = chat.generateAnswer.mock.calls[1][0];
    expect(Array.isArray(lastCall.history)).toBe(true);
    expect(lastCall.history.find((m) => m.content === 'q1')).toBeDefined();
    expect(lastCall.history.find((m) => m.content === 'q2')).toBeDefined();
  });

  test('диалоги разных пользователей не пересекаются', async () => {
    const { orchestrator, history } = makeOrchestrator({
      chat: makeChatMock({ answer: 'ans' }),
    });
    await orchestrator.handle(makeMessage({ userId: 1, text: 'u1-msg' }));
    await orchestrator.handle(makeMessage({ userId: 2, text: 'u2-msg' }));
    const u1 = history.getAll('1').map((m) => m.content);
    const u2 = history.getAll('2').map((m) => m.content);
    expect(u1).toEqual(['u1-msg', 'ans']);
    expect(u2).toEqual(['u2-msg', 'ans']);
  });

  test('саммари вызывается, когда история превышает лимит', async () => {
    const { orchestrator, chat, history } = makeOrchestrator({
      countMessageSummaryLimit: 4,
      chat: makeChatMock({ answer: 'ok', summary: 'итого: всё хорошо' }),
    });
    // Pre-fill history beyond limit (user has 5 stored messages already).
    history.replaceAll('100', [
      { role: 'user', content: 'h1' },
      { role: 'assistant', content: 'h2' },
      { role: 'user', content: 'h3' },
      { role: 'assistant', content: 'h4' },
      { role: 'user', content: 'h5' },
    ]);
    await orchestrator.handle(makeMessage({ text: 'new question' }));
    expect(chat.summarize).toHaveBeenCalledTimes(1);
    const after = history.getAll('100');
    // After compress, first message is summary
    expect(after[0]).toEqual({
      role: 'assistant',
      content: 'Резюме предыдущего диалога: итого: всё хорошо',
    });
  });

  test('пустой ответ AI заменяется на placeholder при отправке', async () => {
    const { orchestrator, telegramClient } = makeOrchestrator({
      chat: makeChatMock({ answer: '' }),
    });
    await orchestrator.handle(makeMessage({ text: 'hello' }));
    expect(telegramClient.sendMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ text: '(пустой ответ от модели)' }),
    );
  });
});

describe('MessageOrchestrator — ошибки', () => {
  test('ошибка LLM → шлёт сообщение об ошибке пользователю', async () => {
    const { orchestrator, telegramClient, chat } = makeOrchestrator({
      chat: makeChatMock({ failGenerate: true }),
    });
    await orchestrator.handle(makeMessage({ text: 'hello' }));
    expect(chat.generateAnswer).toHaveBeenCalledTimes(1);
    const sent = telegramClient.sendMessage.mock.calls.at(-1)[0];
    expect(sent.text).toMatch(/не могу получить ответ/i);
  });

  test('ошибка sendMessage не валит handle (логируется)', async () => {
    const telegramClient = {
      sendMessage: jest.fn(async () => {
        throw new Error('telegram down');
      }),
    };
    const { orchestrator } = makeOrchestrator({
      telegramClient,
      chat: makeChatMock({ answer: 'ответ' }),
    });
    await expect(orchestrator.handle(makeMessage({ text: 'q' }))).resolves.toBeUndefined();
    expect(telegramClient.sendMessage).toHaveBeenCalled();
  });

  test('ошибка summarize не ломает обработку — история остаётся, ответ шлётся', async () => {
    const chat = makeChatMock({ answer: 'normal' });
    chat.summarize = jest.fn(async () => {
      throw new Error('summary failed');
    });
    const { orchestrator, telegramClient, history } = makeOrchestrator({
      countMessageSummaryLimit: 4,
      chat,
    });
    history.replaceAll('100', [
      { role: 'user', content: 'h1' },
      { role: 'assistant', content: 'h2' },
      { role: 'user', content: 'h3' },
      { role: 'assistant', content: 'h4' },
      { role: 'user', content: 'h5' },
    ]);
    await orchestrator.handle(makeMessage({ text: 'next' }));
    expect(telegramClient.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'normal' }),
    );
  });
});

describe('MessageOrchestrator — неожиданный ввод', () => {
  test('сообщение без chat.id игнорируется', async () => {
    const { orchestrator, telegramClient, chat } = makeOrchestrator();
    await orchestrator.handle({ from: { id: 1 }, text: 'hi' });
    expect(chat.generateAnswer).not.toHaveBeenCalled();
    expect(telegramClient.sendMessage).not.toHaveBeenCalled();
  });

  test('сообщение без from игнорируется', async () => {
    const { orchestrator, chat } = makeOrchestrator();
    await orchestrator.handle({ chat: { id: 1 }, text: 'hi' });
    expect(chat.generateAnswer).not.toHaveBeenCalled();
  });

  test('сообщение без text игнорируется', async () => {
    const { orchestrator, chat } = makeOrchestrator();
    await orchestrator.handle({ chat: { id: 1 }, from: { id: 1 } });
    expect(chat.generateAnswer).not.toHaveBeenCalled();
  });

  test('сообщение с числом вместо text игнорируется', async () => {
    const { orchestrator, chat } = makeOrchestrator();
    await orchestrator.handle({ chat: { id: 1 }, from: { id: 1 }, text: 12345 });
    expect(chat.generateAnswer).not.toHaveBeenCalled();
  });

  test('от пользователя без id (нельзя идентифицировать) — игнор', async () => {
    const { orchestrator, chat } = makeOrchestrator();
    await orchestrator.handle({ chat: { id: 1 }, from: {}, text: 'hi' });
    expect(chat.generateAnswer).not.toHaveBeenCalled();
  });
});

describe('AI изоляция через mock — пример из требований', () => {
  function getAIResponse(input, aiClient) {
    return aiClient.generate(input);
  }

  test('mock возвращает фиксированный ответ', () => {
    const fakeAI = { generate: () => 'mocked response' };
    expect(getAIResponse('hi', fakeAI)).toBe('mocked response');
  });
});
