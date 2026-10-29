import http from 'http';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function isServerRunning(urlStr: string = 'http://127.0.0.1:4000', timeoutMs: number = 300): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const url = new URL(`${urlStr}/health`);
      const req = http.request(
        {
          hostname: url.hostname,
          port: url.port || 80,
          path: url.pathname,
          method: 'GET',
          timeout: timeoutMs,
        },
        (res) => {
          resolve(res.statusCode === 200);
        }
      );
      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
      req.end();
    } catch {
      resolve(false);
    }
  });
}

export async function ensureDaemonRunning(serverUrl: string = 'http://127.0.0.1:4000'): Promise<boolean> {
  // 1. Check if already alive
  if (await isServerRunning(serverUrl, 300)) {
    return true;
  }

  // 2. Locate compiled server entrypoint (dist/server/index.js)
  const candidatePaths = [
    path.resolve(__dirname, '../server/index.js'),
    path.resolve(__dirname, '../../dist/server/index.js'),
    path.resolve(process.cwd(), 'dist/server/index.js'),
    path.resolve(process.cwd(), '../dist/server/index.js'),
  ];

  const serverScript = candidatePaths.find((p) => fs.existsSync(p));
  if (!serverScript) {
    process.stderr.write(`[Arthur Daemon] Could not find dist/server/index.js to auto-spawn.\n`);
    return false;
  }

  // 3. Spawn detached background process
  try {
    process.stderr.write(`🛡️  [Arthur] Starting background approval daemon...\n`);
    const child = spawn(process.execPath, [serverScript], {
      detached: true,
      stdio: 'ignore',
      cwd: path.dirname(path.dirname(serverScript)),
      env: { ...process.env },
    });

    child.unref();

    // 4. Poll until server is ready (max 3 seconds)
    const start = Date.now();
    while (Date.now() - start < 3500) {
      await new Promise((r) => setTimeout(r, 200));
      if (await isServerRunning(serverUrl, 200)) {
        process.stderr.write(`✅ [Arthur] Background daemon ready!\n`);
        return true;
      }
    }
  } catch (err: any) {
    process.stderr.write(`⚠️  [Arthur Daemon] Failed to auto-spawn server: ${err.message}\n`);
  }

  return false;
}

