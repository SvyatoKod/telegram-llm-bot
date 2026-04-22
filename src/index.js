/* eslint-disable no-console */
const { loadDotEnvIfPresent } = require('./config/dotenv');
const { loadConfig } = require('./config/config');
const { HttpJsonClient } = require('./infra/httpJsonClient');
const { createUsers } = require('./users');
const { createHistory } = require('./history');
const { createChat } = require('./chat');
const { createBot } = require('./bot');

loadDotEnvIfPresent();

let config;
try {
  config = loadConfig();
} catch (e) {
  console.error(e && e.message ? e.message : e);
  process.exit(1);
}

const httpJson = new HttpJsonClient({ maxSockets: config.runtime.maxConcurrency * 2 });

const users = createUsers();
const history = createHistory({ maxMessagesPerUser: config.runtime.countMessageLimit });
const chat = createChat({
  baseUrl: config.ollama.url,
  model: config.ollama.model,
  httpJsonClient: httpJson,
  systemPrompt: config.ollama.systemPrompt,
});
const bot = createBot({
  apiBase: config.telegram.apiBase,
  httpJsonClient: httpJson,
  pollTimeoutSec: config.telegram.pollTimeoutSec,
  maxConcurrency: config.runtime.maxConcurrency,
  countMessageSummaryLimit: config.runtime.countMessageSummaryLimit,
  systemPrompt: config.ollama.systemPrompt,
  users,
  history,
  chat,
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

bot.start().catch((e) => {
  console.error('Fatal error:', e && e.message ? e.message : e);
  process.exit(1);
});
