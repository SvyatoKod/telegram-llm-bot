const { sleep } = require('../../utils/time');

class TelegramPoller {
  constructor({ telegramClient, messageHandler, semaphore, pollTimeoutSec, logger = console }) {
    this.telegram = telegramClient;
    this.handler = messageHandler;
    this.sem = semaphore;
    this.pollTimeoutSec = pollTimeoutSec;
    this.log = logger;

    this.offset = 0;
    this.backoffMs = 250;
  }

  async runForever() {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        const updates = await this.telegram.getUpdates({
          offset: this.offset,
          timeoutSec: this.pollTimeoutSec,
        });

        this.backoffMs = 250;

        if (!Array.isArray(updates) || updates.length === 0) continue;

        for (const upd of updates) {
          if (typeof upd.update_id === 'number') this.offset = Math.max(this.offset, upd.update_id + 1);

          const msg = upd && upd.message;
          if (!msg || typeof msg !== 'object') continue;
          if (typeof msg.text !== 'string') continue;

          void this._handleMessageWithConcurrency(msg);
        }
      } catch (e) {
        const m = e && e.message ? e.message : String(e);
        this.log.warn('Polling error:', m);
        await sleep(this.backoffMs);
        this.backoffMs = Math.min(10000, Math.floor(this.backoffMs * 1.7));
      }
    }
  }

  async _handleMessageWithConcurrency(msg) {
    await this.sem.acquire();
    try {
      await this.handler.handle(msg);
    } catch (e) {
      this.log.warn('Handler error:', e && e.message ? e.message : e);
    } finally {
      this.sem.release();
    }
  }
}

module.exports = { TelegramPoller };
