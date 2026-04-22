const { TelegramClient } = require('./telegramClient');
const { TelegramPoller } = require('./telegramPoller');
const { MessageOrchestrator } = require('./messageOrchestrator');
const { Semaphore } = require('../../utils/semaphore');

function createBot({
  apiBase,
  httpJsonClient,
  pollTimeoutSec,
  maxConcurrency,
  countMessageSummaryLimit,
  systemPrompt,
  users,
  history,
  chat,
  eventBus,
  logger = console,
}) {
  const telegramClient = new TelegramClient({ apiBase, httpJsonClient });
  const orchestrator = new MessageOrchestrator({
    telegramClient,
    users,
    history,
    chat,
    eventBus,
    countMessageSummaryLimit,
    systemPrompt,
    logger,
  });
  const semaphore = new Semaphore(maxConcurrency);
  const poller = new TelegramPoller({
    telegramClient,
    messageHandler: orchestrator,
    semaphore,
    pollTimeoutSec,
    logger,
  });

  return {
    async start() {
      return poller.runForever();
    },
  };
}

module.exports = { createBot };
