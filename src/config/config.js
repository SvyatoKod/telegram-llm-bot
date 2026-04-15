const { clampInt } = require('../utils/number');

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name}. Put it into .env or environment variables.`);
  return v;
}

function loadConfig() {
  const telegramBotToken = requireEnv('TELEGRAM_BOT_TOKEN');

  const ollamaUrl = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
  const ollamaModel = process.env.OLLAMA_MODEL || 'qwen3:0.6b`';

  const telegramPollTimeoutSec = clampInt(process.env.TELEGRAM_POLL_TIMEOUT_SEC, 30, 1, 60);
  const maxConcurrency = clampInt(process.env.MAX_CONCURRENCY, 4, 1, 32);

  return {
    telegram: {
      botToken: telegramBotToken,
      pollTimeoutSec: telegramPollTimeoutSec,
      apiBase: `https://api.telegram.org/bot${telegramBotToken}`,
    },
    ollama: {
      url: ollamaUrl,
      model: ollamaModel,
    },
    runtime: {
      maxConcurrency,
    },
  };
}

module.exports = { loadConfig };

