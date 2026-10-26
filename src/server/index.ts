import fs from 'fs';
import path from 'path';
import { createApp } from './app.js';
import { defaultRequestManager } from '../core/request-manager.js';

// Auto-load .env file if present
function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}
loadEnv();

const PORT = parseInt(process.env.PORT || '4000', 10);
const HOST = process.env.HOST || '127.0.0.1';

const app = createApp(defaultRequestManager);

const server = app.listen(PORT, HOST, () => {
  console.log(`[Milo Server] Running on http://${HOST}:${PORT}`);
  console.log(`[Milo Server] Dashboard: http://${HOST}:${PORT}/`);
  console.log(`[Milo Server] API: http://${HOST}:${PORT}/api/requests`);
});

process.on('SIGINT', () => {
  console.log('\n[Milo Server] Shutting down gracefully...');
  server.close(() => {
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  server.close(() => {
    process.exit(0);
  });
});
