const { EventEmitter } = require('node:events');

function createEventBus({ logger = console } = {}) {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(50);

  emitter.on('error', (err) => {
    logger.warn('EventBus listener error:', err && err.message ? err.message : err);
  });

  return {
    on(event, listener) {
      emitter.on(event, (payload) => {
        try {
          const ret = listener(payload);
          if (ret && typeof ret.catch === 'function') {
            ret.catch((e) => logger.warn(`EventBus async listener error [${event}]:`, e && e.message ? e.message : e));
          }
        } catch (e) {
          logger.warn(`EventBus listener error [${event}]:`, e && e.message ? e.message : e);
        }
      });
    },
    emit(event, payload) {
      return emitter.emit(event, payload);
    },
  };
}

module.exports = { createEventBus };
