import {readFile} from 'node:fs/promises';
import https from 'node:https';
import path from 'node:path';
import process from 'node:process';

// Control-plane client (/--tests, /--patterns, /--importmap). Global fetch can't
// relax TLS per request, so https: goes through node:https with trust scoped to
// these requests only — never process-wide. Ladder: TAPE6_CERT pinned as CA;
// else the server's cached self-signed cert (tape6 cert-ladder location);
// else relaxed verification.

// hard deadline on every request: a dying listener can accept and never answer
// (the 2026-07-04 chained-run hang)
const TIMEOUT = 3000;

// a TLS request read a plaintext HTTP answer — an h1 server behind an https: URL
export const isProtocolMismatch = error =>
  !!error && (error.code === 'EPROTO' || /wrong version number/i.test(error.message || ''));

export const createControlFetch = (rootFolder = process.cwd()) => {
  let tlsOptions = null;
  const get = (url, options) =>
    new Promise((resolve, reject) => {
      const request = https.get(url, options, response => {
        const chunks = [];
        response.on('data', chunk => chunks.push(chunk));
        response.on('error', error => {
          clearTimeout(timer);
          reject(error);
        });
        response.on('end', () => {
          clearTimeout(timer);
          const body = Buffer.concat(chunks);
          resolve({
            ok: response.statusCode >= 200 && response.statusCode < 300,
            status: response.statusCode,
            json: async () => JSON.parse(body.toString())
          });
        });
      });
      const timer = setTimeout(
        () =>
          request.destroy(
            Object.assign(new Error(`control request timed out after ${TIMEOUT}ms: ${url}`), {
              code: 'ETIMEDOUT'
            })
          ),
        TIMEOUT
      );
      request.on('error', error => {
        clearTimeout(timer);
        reject(error);
      });
    });
  return async url => {
    if (!/^https:/i.test(url)) return fetch(url, {signal: AbortSignal.timeout(TIMEOUT)});
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
      } catch (error) {
        // a relaxed retry after a timeout would just burn a second deadline
        if (error.code === 'ETIMEDOUT') throw error;
        // stale cache or an external server with its own cert — try relaxed
      }
    }
    const options = {rejectUnauthorized: false};
    const response = await get(url, options);
    tlsOptions = options;
    return response;
  };
};
