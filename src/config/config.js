const { clampInt } = require('../utils/number');
const { SUMMARY_CHUNK_SIZE, SUMMARY_CHUNK_OVERLAP } = require('./summaryDefaults');

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}. Put it into .env or environment variables.`);
  return v;
}

function loadConfig() {
  const telegramBotToken = requireEnv('TELEGRAM_BOT_TOKEN');

  const ollamaUrl = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
  const ollamaModel = process.env.OLLAMA_MODEL || 'qwen3:0.6b';
  const systemPrompt =
    (typeof process.env.SYSTEM_PROMPT === 'string' && process.env.SYSTEM_PROMPT.trim()) ||
    'Ты пионер вожатый, который приветствует и говорит с другими пионерами. Ты хочешь помочь другим и, если не знаешь ответ, то говоришь "Я не знаю товарищ".';

  const telegramPollTimeoutSec = clampInt(process.env.TELEGRAM_POLL_TIMEOUT_SEC, 30, 1, 60);
  const maxConcurrency = clampInt(process.env.MAX_CONCURRENCY, 4, 1, 32);
  const countMessageLimit = clampInt(process.env.COUNT_MESSAGE_LIMIT, 10, 1, 500);
  const countMessageSummaryLimit = clampInt(process.env.COUNT_MESSAGE_SUMMARY_LIMIT, 6, 2, 500);
  const summaryChunkSize = clampInt(process.env.SUMMARY_CHUNK_SIZE, SUMMARY_CHUNK_SIZE, 2, 100);
  const summaryChunkOverlap = clampInt(
    process.env.SUMMARY_CHUNK_OVERLAP,
    SUMMARY_CHUNK_OVERLAP,
    0,
    summaryChunkSize - 1,
  );

  return {
    telegram: {
      botToken: telegramBotToken,
      pollTimeoutSec: telegramPollTimeoutSec,
      apiBase: `https://api.telegram.org/bot${telegramBotToken}`,
    },
    ollama: {
      url: ollamaUrl,
      model: ollamaModel,
      systemPrompt,
    },
    runtime: {
      maxConcurrency,
      countMessageLimit,
      countMessageSummaryLimit,
      summaryChunkSize,
      summaryChunkOverlap,
    },
  };
}

module.exports = { loadConfig };

