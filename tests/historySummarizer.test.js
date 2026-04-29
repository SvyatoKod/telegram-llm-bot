const { HistorySummarizer } = require('../src/module/chat/historySummarizer');
const {
  SUMMARY_CHUNK_SIZE,
  SUMMARY_CHUNK_OVERLAP,
} = require('../src/config/summaryDefaults');

const silentLogger = { warn() {}, error() {}, log() {} };

function makeFakeLLM(impl) {
  return { chat: jest.fn(impl) };
}

function makeHistory(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `m${i}`,
    });
  }
  return out;
}

// step выводится из дефолтов — тесты не зависят от конкретных значений
const DEFAULT_STEP = SUMMARY_CHUNK_SIZE - SUMMARY_CHUNK_OVERLAP;

describe('Sanity — дефолтные константы используются', () => {
  test('SUMMARY_CHUNK_SIZE и SUMMARY_CHUNK_OVERLAP — числа, overlap < size', () => {
    expect(Number.isInteger(SUMMARY_CHUNK_SIZE)).toBe(true);
    expect(Number.isInteger(SUMMARY_CHUNK_OVERLAP)).toBe(true);
    expect(SUMMARY_CHUNK_SIZE).toBeGreaterThanOrEqual(2);
    expect(SUMMARY_CHUNK_OVERLAP).toBeGreaterThanOrEqual(0);
    expect(SUMMARY_CHUNK_OVERLAP).toBeLessThan(SUMMARY_CHUNK_SIZE);
  });
});

describe('HistorySummarizer.chunk — чанкирование с overlap (дельтой)', () => {
  test('история короче chunkSize → один чанк, равный истории', () => {
    const llm = makeFakeLLM(async () => 'x');
    const s = new HistorySummarizer({
      llmClient: llm,
      chunkSize: SUMMARY_CHUNK_SIZE,
      chunkOverlap: SUMMARY_CHUNK_OVERLAP,
      logger: silentLogger,
    });
    const h = makeHistory(SUMMARY_CHUNK_SIZE - 1);
    expect(s.chunk(h)).toEqual([h]);
  });

  test('дефолтные chunkSize/overlap → корректный шаг и пересечение соседних чанков', () => {
    const llm = makeFakeLLM(async () => 'x');
    const s = new HistorySummarizer({
      llmClient: llm,
      chunkSize: SUMMARY_CHUNK_SIZE,
      chunkOverlap: SUMMARY_CHUNK_OVERLAP,
      logger: silentLogger,
    });
    // длина = size + step → ровно два полных чанка, делящие SUMMARY_CHUNK_OVERLAP сообщений
    const h = makeHistory(SUMMARY_CHUNK_SIZE + DEFAULT_STEP);
    const chunks = s.chunk(h);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(SUMMARY_CHUNK_SIZE);
    expect(chunks[1]).toHaveLength(SUMMARY_CHUNK_SIZE);
    // overlap последних N сообщений первого чанка совпадает с первыми N второго
    const tailOfFirst = chunks[0].slice(chunks[0].length - SUMMARY_CHUNK_OVERLAP);
    const headOfSecond = chunks[1].slice(0, SUMMARY_CHUNK_OVERLAP);
    expect(tailOfFirst).toEqual(headOfSecond);
  });

  test('дефолтные параметры, длинная история → последний чанк короче и сохраняет overlap', () => {
    const llm = makeFakeLLM(async () => 'x');
    const s = new HistorySummarizer({
      llmClient: llm,
      chunkSize: SUMMARY_CHUNK_SIZE,
      chunkOverlap: SUMMARY_CHUNK_OVERLAP,
      logger: silentLogger,
    });
    const total = SUMMARY_CHUNK_SIZE + DEFAULT_STEP + 1; // вызывает третий «хвостовой» чанк
    const h = makeHistory(total);
    const chunks = s.chunk(h);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    // объединение чанков покрывает всю историю
    const seen = new Set();
    for (const c of chunks) for (const m of c) seen.add(m.content);
    expect(seen.size).toBe(total);
    // соседние чанки делят ровно SUMMARY_CHUNK_OVERLAP элементов
    for (let i = 1; i < chunks.length; i++) {
      const prev = chunks[i - 1];
      const cur = chunks[i];
      const overlap = prev.slice(prev.length - SUMMARY_CHUNK_OVERLAP);
      expect(cur.slice(0, SUMMARY_CHUNK_OVERLAP)).toEqual(overlap);
    }
  });

  test('overlap=2 (явный) → шаг 2, соседние чанки делят 2 сообщения', () => {
    const llm = makeFakeLLM(async () => 'x');
    const s = new HistorySummarizer({ llmClient: llm, chunkSize: 4, chunkOverlap: 2, logger: silentLogger });
    const h = makeHistory(8);
    const chunks = s.chunk(h);
    expect(chunks.map((c) => c.map((m) => m.content))).toEqual([
      ['m0', 'm1', 'm2', 'm3'],
      ['m2', 'm3', 'm4', 'm5'],
      ['m4', 'm5', 'm6', 'm7'],
    ]);
  });

  test('overlap=0 (явный) → чанки без пересечения', () => {
    const llm = makeFakeLLM(async () => 'x');
    const s = new HistorySummarizer({ llmClient: llm, chunkSize: 3, chunkOverlap: 0, logger: silentLogger });
    const h = makeHistory(7);
    const chunks = s.chunk(h);
    expect(chunks.map((c) => c.map((m) => m.content))).toEqual([
      ['m0', 'm1', 'm2'],
      ['m3', 'm4', 'm5'],
      ['m6'],
    ]);
  });

  test('overlap >= chunkSize клампится до chunkSize-1 (явный edge-case)', () => {
    const llm = makeFakeLLM(async () => 'x');
    const s = new HistorySummarizer({ llmClient: llm, chunkSize: 3, chunkOverlap: 99, logger: silentLogger });
    expect(s.chunkOverlap).toBe(2);
    expect(s.chunk(makeHistory(5)).length).toBeGreaterThan(1);
  });

  test('пустая или невалидная история → []', () => {
    const llm = makeFakeLLM(async () => 'x');
    const s = new HistorySummarizer({
      llmClient: llm,
      chunkSize: SUMMARY_CHUNK_SIZE,
      chunkOverlap: SUMMARY_CHUNK_OVERLAP,
      logger: silentLogger,
    });
    expect(s.chunk([])).toEqual([]);
    expect(s.chunk(null)).toEqual([]);
    expect(s.chunk(undefined)).toEqual([]);
  });
});

describe('HistorySummarizer — конструктор использует SUMMARY_CHUNK_* как defaults', () => {
  test('без переданных chunkSize/overlap инстанс берёт значения из summaryDefaults', () => {
    const llm = makeFakeLLM(async () => 'x');
    const s = new HistorySummarizer({ llmClient: llm, logger: silentLogger });
    expect(s.chunkSize).toBe(SUMMARY_CHUNK_SIZE);
    expect(s.chunkOverlap).toBe(SUMMARY_CHUNK_OVERLAP);
  });
});

describe('HistorySummarizer.summarize — нормальные сценарии (LLM замокан)', () => {
  test('пустая история → пустая строка, без вызовов LLM', async () => {
    const llm = makeFakeLLM(async () => 'should not be called');
    const s = new HistorySummarizer({
      llmClient: llm,
      chunkSize: SUMMARY_CHUNK_SIZE,
      chunkOverlap: SUMMARY_CHUNK_OVERLAP,
      logger: silentLogger,
    });
    expect(await s.summarize({ history: [] })).toBe('');
    expect(llm.chat).not.toHaveBeenCalled();
  });

  test('один чанк → ровно один LLM-вызов и возврат его ответа без merge', async () => {
    const llm = makeFakeLLM(async () => '  Резюме фрагмента.  ');
    const s = new HistorySummarizer({
      llmClient: llm,
      chunkSize: SUMMARY_CHUNK_SIZE,
      chunkOverlap: SUMMARY_CHUNK_OVERLAP,
      logger: silentLogger,
    });
    const out = await s.summarize({ history: makeHistory(SUMMARY_CHUNK_SIZE - 1) });
    expect(out).toBe('Резюме фрагмента.');
    expect(llm.chat).toHaveBeenCalledTimes(1);
  });

  test('несколько чанков → 1 LLM-вызов на чанк + 1 merge-вызов', async () => {
    let callIdx = 0;
    const llm = makeFakeLLM(async () => {
      callIdx += 1;
      if (callIdx <= 2) return `partial-${callIdx}`;
      return 'merged-summary';
    });
    const s = new HistorySummarizer({ llmClient: llm, chunkSize: 3, chunkOverlap: SUMMARY_CHUNK_OVERLAP, logger: silentLogger });
    // history длиной 5 c overlap=1 → step=2 → чанки [m0..m2], [m2..m4] → 2 partials + 1 merge
    const out = await s.summarize({ history: makeHistory(5) });
    expect(llm.chat).toHaveBeenCalledTimes(3);
    expect(out).toBe('merged-summary');

    const mergeCallArgs = llm.chat.mock.calls[2][0];
    const userMsg = mergeCallArgs.find((m) => m.role === 'user');
    expect(userMsg.content).toContain('partial-1');
    expect(userMsg.content).toContain('partial-2');
    expect(userMsg.content).toContain('Фрагмент 1');
    expect(userMsg.content).toContain('Фрагмент 2');
  });

  test('каждому LLM-вызову передаётся фрагмент истории, а не вся целиком', async () => {
    const llm = makeFakeLLM(async () => 'p');
    const s = new HistorySummarizer({ llmClient: llm, chunkSize: 3, chunkOverlap: SUMMARY_CHUNK_OVERLAP, logger: silentLogger });
    await s.summarize({ history: makeHistory(5) });
    const firstCallMessages = llm.chat.mock.calls[0][0];
    const historyOnly = firstCallMessages.filter((m) => m.role === 'user' || m.role === 'assistant');
    // первый чанк — m0..m2 + финальная user-инструкция «Кратко резюмируй...»
    expect(historyOnly.map((m) => m.content)).toContain('m0');
    expect(historyOnly.map((m) => m.content)).toContain('m1');
    expect(historyOnly.map((m) => m.content)).toContain('m2');
    expect(historyOnly.map((m) => m.content)).not.toContain('m4');
  });

  test('systemPrompt из аргумента переопределяет default', async () => {
    const llm = makeFakeLLM(async () => 'ok');
    const s = new HistorySummarizer({
      llmClient: llm,
      chunkSize: SUMMARY_CHUNK_SIZE,
      chunkOverlap: SUMMARY_CHUNK_OVERLAP,
      defaultSystemPrompt: 'default',
      logger: silentLogger,
    });
    await s.summarize({ history: makeHistory(2), systemPrompt: 'override' });
    const firstCall = llm.chat.mock.calls[0][0];
    expect(firstCall[0]).toEqual({ role: 'system', content: 'override' });
  });

  test('default systemPrompt используется, если в вызове не передан', async () => {
    const llm = makeFakeLLM(async () => 'ok');
    const s = new HistorySummarizer({
      llmClient: llm,
      chunkSize: SUMMARY_CHUNK_SIZE,
      chunkOverlap: SUMMARY_CHUNK_OVERLAP,
      defaultSystemPrompt: 'default-sys',
      logger: silentLogger,
    });
    await s.summarize({ history: makeHistory(2) });
    const firstCall = llm.chat.mock.calls[0][0];
    expect(firstCall[0]).toEqual({ role: 'system', content: 'default-sys' });
  });
});

describe('HistorySummarizer.summarize — ошибки и неожиданный ввод', () => {
  test('конструктор падает, если не передан валидный llmClient', () => {
    expect(() => new HistorySummarizer({})).toThrow();
    expect(() => new HistorySummarizer({ llmClient: {} })).toThrow();
    expect(() => new HistorySummarizer({ llmClient: { chat: 'no' } })).toThrow();
  });

  test('history undefined/non-array → пустая строка без вызовов LLM', async () => {
    const llm = makeFakeLLM(async () => 'x');
    const s = new HistorySummarizer({ llmClient: llm, logger: silentLogger });
    expect(await s.summarize({})).toBe('');
    expect(await s.summarize({ history: 'oops' })).toBe('');
    expect(await s.summarize()).toBe('');
    expect(llm.chat).not.toHaveBeenCalled();
  });

  test('ошибка LLM на одном чанке — другие частичные резюме всё равно собираются', async () => {
    let i = 0;
    const llm = makeFakeLLM(async () => {
      i += 1;
      if (i === 1) throw new Error('LLM hiccup');
      if (i === 2) return 'partial-2';
      return 'merged';
    });
    const s = new HistorySummarizer({ llmClient: llm, chunkSize: 3, chunkOverlap: SUMMARY_CHUNK_OVERLAP, logger: silentLogger });
    const out = await s.summarize({ history: makeHistory(5) });
    // 2 чанка, первый упал → останется 1 partial → merge не нужен → out = 'partial-2'
    expect(out).toBe('partial-2');
    expect(llm.chat).toHaveBeenCalledTimes(2);
  });

  test('все чанки упали → пустая строка', async () => {
    const llm = makeFakeLLM(async () => {
      throw new Error('always fail');
    });
    const s = new HistorySummarizer({ llmClient: llm, chunkSize: 3, chunkOverlap: SUMMARY_CHUNK_OVERLAP, logger: silentLogger });
    const out = await s.summarize({ history: makeHistory(5) });
    expect(out).toBe('');
  });

  test('non-string ответ LLM на чанке → не учитывается', async () => {
    let i = 0;
    const llm = makeFakeLLM(async () => {
      i += 1;
      if (i === 1) return 42; // не строка → проигнорируется
      if (i === 2) return 'partial-2';
      return 'merged';
    });
    const s = new HistorySummarizer({ llmClient: llm, chunkSize: 3, chunkOverlap: SUMMARY_CHUNK_OVERLAP, logger: silentLogger });
    const out = await s.summarize({ history: makeHistory(5) });
    expect(out).toBe('partial-2');
  });

  test('history c единственным сообщением — один чанк, один вызов', async () => {
    const llm = makeFakeLLM(async () => 'one');
    const s = new HistorySummarizer({
      llmClient: llm,
      chunkSize: SUMMARY_CHUNK_SIZE,
      chunkOverlap: SUMMARY_CHUNK_OVERLAP,
      logger: silentLogger,
    });
    const out = await s.summarize({ history: [{ role: 'user', content: 'hi' }] });
    expect(out).toBe('one');
    expect(llm.chat).toHaveBeenCalledTimes(1);
  });
});
