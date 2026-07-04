import {readFile} from 'node:fs/promises';
import https from 'node:https';
import path from 'node:path';
import process from 'node:process';

// Control-plane client (/--tests, /--patterns, /--importmap). Global fetch can't
// relax TLS per request, so https: goes through node:https with trust scoped to
// these requests only — never process-wide. Ladder: TAPE6_CERT pinned as CA;
// else the server's cached self-signed cert (tape6 cert-ladder location);
// else relaxed verification.
export const createControlFetch = (rootFolder = process.cwd()) => {
  let tlsOptions = null;
  const get = (url, options) =>
    new Promise((resolve, reject) => {
      https
        .get(url, options, response => {
          const chunks = [];
          response.on('data', chunk => chunks.push(chunk));
          response.on('error', reject);
          response.on('end', () => {
            const body = Buffer.concat(chunks);
            resolve({
              ok: response.statusCode >= 200 && response.statusCode < 300,
              status: response.statusCode,
              json: async () => JSON.parse(body.toString())
            });
          });
        })
        .on('error', reject);
    });
  return async url => {
    if (!/^https:/i.test(url)) return fetch(url);
    if (tlsOptions) return get(url, tlsOptions);
    const certPath = process.env.TAPE6_CERT;
    if (certPath) {
      // explicit pin: failures stay loud, no fallback
      const options = {ca: await readFile(path.resolve(rootFolder, certPath))};
      const response = await get(url, options);
      tlsOptions = options;
      return response;
    }
    const cached = await readFile(
      path.join(rootFolder, 'node_modules', '.cache', 'tape6', 'cert.pem')
    ).catch(() => null);
    if (cached) {
      try {
        const options = {ca: cached};
        const response = await get(url, options);
        tlsOptions = options;
        return response;
      } catch {
        // stale cache or an external server with its own cert — try relaxed
      }
    }
    const options = {rejectUnauthorized: false};
    const response = await get(url, options);
    tlsOptions = options;
    return response;
  };
};
