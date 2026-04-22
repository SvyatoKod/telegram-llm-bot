const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const LOG_DIR = path.resolve(process.cwd(), 'logs');

function logFilePathForDate(d = new Date()) {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return path.join(LOG_DIR, `llm-context-${yyyy}-${mm}-${dd}.log`);
}

async function appendContextLog(entry) {
  if (!fs.existsSync(LOG_DIR)) {
    await fsp.mkdir(LOG_DIR, { recursive: true });
  }
  const line = JSON.stringify(entry) + '\n';
  await fsp.appendFile(logFilePathForDate(), line, 'utf8');
}

function messagesTokenCountApprox(messages) {
  if (!Array.isArray(messages)) return 0;
  let chars = 0;
  for (const m of messages) {
    if (m && typeof m.content === 'string') chars += m.content.length;
  }
  return Math.ceil(chars / 4);
}

module.exports = { appendContextLog, messagesTokenCountApprox };
