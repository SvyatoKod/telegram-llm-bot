/* eslint-disable no-console */
const { loadDotEnvIfPresent } = require('./config/dotenv');
const { loadConfig } = require('./config/config');
const { HttpJsonClient } = require('./infra/httpJsonClient');
const { TelegramClient } = require('./telegram/telegramClient');
const { TelegramPoller } = require('./telegram/telegramPoller');
const { OllamaClient } = require('./llm/ollamaClient');
const { TextMessageHandler } = require('./handlers/textMessageHandler');
const { Semaphore } = require('./utils/semaphore');
const { DialogHistoryService } = require('./services/dialogHistoryService');

loadDotEnvIfPresent();

let config;
try {
  config = loadConfig();
} catch (e) {
  console.error(e && e.message ? e.message : e);
  process.exit(1);
}

const httpJson = new HttpJsonClient({ maxSockets: config.runtime.maxConcurrency * 2 });
const telegram = new TelegramClient({ apiBase: config.telegram.apiBase, httpJsonClient: httpJson });
const ollama = new OllamaClient({ baseUrl: config.ollama.url, model: config.ollama.model, httpJsonClient: httpJson });
const dialogHistory = new DialogHistoryService({ maxMessagesPerUser: config.runtime.countMessageLimit });
const handler = new TextMessageHandler({
  telegramClient: telegram,
  llmClient: ollama,
  dialogHistory,
  countMessageSummaryLimit: config.runtime.countMessageSummaryLimit,
  systemPrompt: config.ollama.systemPrompt,
  logger: console,
});
const sem = new Semaphore(config.runtime.maxConcurrency);
const poller = new TelegramPoller({
  telegramClient: telegram,
  messageHandler: handler,
  semaphore: sem,
  pollTimeoutSec: config.telegram.pollTimeoutSec,
  logger: console,
});

process.on('unhandledRejection', (e) => console.warn('unhandledRejection:', e && e.message ? e.message : e));
process.on('uncaughtException', (e) => console.warn('uncaughtException:', e && e.message ? e.message : e));

console.log('Bot started. Polling updates...');
console.log(
  JSON.stringify(
    {
      telegram: {
        pollTimeoutSec: config.telegram.pollTimeoutSec,
        botToken: config.telegram.botToken ? '<set>' : '<missing>',
      },
      ollama: {
        url: config.ollama.url,
        model: config.ollama.model,
        systemPromptChars: typeof config.ollama.systemPrompt === 'string' ? config.ollama.systemPrompt.length : 0,
      },
      runtime: {
        maxConcurrency: config.runtime.maxConcurrency,
        countMessageLimit: config.runtime.countMessageLimit,
        countMessageSummaryLimit: config.runtime.countMessageSummaryLimit,
      },
    },
    null,
    2,
  ),
);

poller.runForever().catch((e) => {
  console.error('Fatal error:', e && e.message ? e.message : e);
  process.exit(1);
});

