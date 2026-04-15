class Semaphore {
  constructor(max) {
    this.max = max;
    this.inFlight = 0;
    this.queue = [];
  }

  async acquire() {
    if (this.inFlight < this.max) {
      this.inFlight += 1;
      return;
    }
    await new Promise((resolve) => this.queue.push(resolve));
    this.inFlight += 1;
  }

  release() {
    this.inFlight = Math.max(0, this.inFlight - 1);
    const next = this.queue.shift();
    if (next) next();
  }
}

module.exports = { Semaphore };

