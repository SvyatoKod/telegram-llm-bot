const http = require('node:http');
const https = require('node:https');
const { URL } = require('node:url');

class HttpJsonClient {
  constructor({ maxSockets = 8 } = {}) {
    this.httpAgent = new http.Agent({ keepAlive: true, maxSockets });
    this.httpsAgent = new https.Agent({ keepAlive: true, maxSockets });
  }

  requestJson(urlString, { method = 'POST', body, timeoutMs = 120000 } = {}) {
    const url = new URL(urlString);
    const isHttps = url.protocol === 'https:';
    const transport = isHttps ? https : http;
    const agent = isHttps ? this.httpsAgent : this.httpAgent;

    const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body), 'utf8');

    return new Promise((resolve, reject) => {
      const req = transport.request(
        {
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port || (isHttps ? 443 : 80),
          path: `${url.pathname}${url.search}`,
          method,
          agent,
          headers: {
            'Content-Type': 'application/json',
            ...(payload ? { 'Content-Length': String(payload.length) } : {}),
          },
        },
        (res) => {
          const chunks = [];
          res.on('data', (d) => chunks.push(d));
          res.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf8');
            if (res.statusCode && res.statusCode >= 400) {
              return reject(new Error(`HTTP ${res.statusCode}: ${raw.slice(0, 500)}`));
            }
            try {
              resolve(raw ? JSON.parse(raw) : {});
            } catch (_e) {
              reject(new Error(`Invalid JSON response: ${raw.slice(0, 500)}`));
            }
          });
        },
      );

      req.setTimeout(timeoutMs, () => {
        req.destroy(new Error(`Request timeout after ${timeoutMs}ms`));
      });
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  }
}

module.exports = { HttpJsonClient };

