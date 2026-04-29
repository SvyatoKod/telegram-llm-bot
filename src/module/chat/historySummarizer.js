const {
  SUMMARY_CHUNK_SIZE,
  SUMMARY_CHUNK_OVERLAP,
} = require('../../config/summaryDefaults');

/**
 * HistorySummarizer — формирует резюме длинной истории чанкированием с перекрытием.
 *
 * Идея: история режется на чанки фиксированного размера; каждый соседний чанк
 * включает overlap (delta) сообщений с предыдущим — благодаря этому соседние
 * фрагменты несут связующий контекст, и LLM не теряет нить разговора на стыках.
 * Шаги:
 *   1) chunk(history) → перекрывающиеся подмассивы
 *   2) для каждого чанка → частичное резюме (LLM)
 *   3) если чанков > 1 → объединяющий проход (LLM) → единый абзац
 */
class HistorySummarizer {
  constructor({
    llmClient,
    chunkSize = SUMMARY_CHUNK_SIZE,
    chunkOverlap = SUMMARY_CHUNK_OVERLAP,
    defaultSystemPrompt = '',
    logger = console,
  } = {}) {
    if (!llmClient || typeof llmClient.chat !== 'function') {
      throw new Error('HistorySummarizer requires llmClient with chat()');
    }
    this.llm = llmClient;
    this.chunkSize = Math.max(2, Number.isFinite(chunkSize) ? chunkSize : SUMMARY_CHUNK_SIZE);
    const ovRaw = Number.isFinite(chunkOverlap) ? chunkOverlap : SUMMARY_CHUNK_OVERLAP;
    this.chunkOverlap = Math.max(0, Math.min(this.chunkSize - 1, ovRaw));
    this.defaultSystemPrompt =
      typeof defaultSystemPrompt === 'string' ? defaultSystemPrompt.trim() : '';
    this.log = logger;
  }

  chunk(messages) {
    if (!Array.isArray(messages) || messages.length === 0) return [];
    if (messages.length <= this.chunkSize) return [messages.slice()];

    const step = Math.max(1, this.chunkSize - this.chunkOverlap);
    const chunks = [];
    for (let i = 0; i < messages.length; i += step) {
      const slice = messages.slice(i, i + this.chunkSize);
      if (slice.length === 0) break;
      chunks.push(slice);
      if (i + this.chunkSize >= messages.length) break;
    }
    return chunks;
  }

  _resolveSystemPrompt(systemPrompt) {
    return typeof systemPrompt === 'string' ? systemPrompt.trim() : this.defaultSystemPrompt;
  }

  async _summarizeChunk(chunk, { systemPrompt, index, total }) {
    const sp = this._resolveSystemPrompt(systemPrompt);
    const messages = [
      ...(sp ? [{ role: 'system', content: sp }] : []),
      {
        role: 'system',
        content:
          `Это фрагмент ${index + 1} из ${total} длинного диалога. ` +
          'Сделай краткое резюме фрагмента на русском в 1-2 предложениях. ' +
          'Сохрани ключевые факты, цели, решения и ограничения. ' +
          'Не добавляй ничего от себя. Формат: одно предложение или короткий абзац без списков.',
      },
      ...chunk,
      { role: 'user', content: 'Кратко резюмируй фрагмент диалога выше.' },
    ];
    const out = await this.llm.chat(messages);
    return typeof out === 'string' ? out.trim() : '';
  }

  async _mergeSummaries(partials, { systemPrompt }) {
    if (partials.length === 0) return '';
    if (partials.length === 1) return partials[0];

    const sp = this._resolveSystemPrompt(systemPrompt);
    const numbered = partials.map((s, i) => `Фрагмент ${i + 1}: ${s}`).join('\n');
    const messages = [
      ...(sp ? [{ role: 'system', content: sp }] : []),
      {
        role: 'system',
        content:
          'Объедини несколько частичных резюме фрагментов диалога в единое связное резюме на русском в 2-4 предложениях. ' +
          'Соседние фрагменты могут пересекаться по смыслу — не дублируй факты. ' +
          'Сохрани ключевые факты, цели, решения и ограничения. ' +
          'Не добавляй ничего от себя. Формат: один абзац без списков.',
      },
      {
        role: 'user',
        content: `Резюме фрагментов (по порядку):\n${numbered}\n\nСделай единое резюме.`,
      },
    ];
    const out = await this.llm.chat(messages);
    return typeof out === 'string' ? out.trim() : '';
  }

  async summarize({ history, systemPrompt } = {}) {
    if (!Array.isArray(history) || history.length === 0) return '';

    const chunks = this.chunk(history);
    if (chunks.length === 0) return '';

    const partials = [];
    for (let i = 0; i < chunks.length; i++) {
      let partial = '';
      try {
        partial = await this._summarizeChunk(chunks[i], {
          systemPrompt,
          index: i,
          total: chunks.length,
        });
      } catch (e) {
        this.log.warn(
          `HistorySummarizer: chunk ${i + 1}/${chunks.length} failed:`,
          e && e.message ? e.message : e,
        );
      }
      if (partial) partials.push(partial);
    }

    return this._mergeSummaries(partials, { systemPrompt });
  }
}

module.exports = { HistorySummarizer };
