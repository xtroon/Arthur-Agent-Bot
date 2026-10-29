import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createApp } from './app.js';
import { defaultRequestManager } from '../core/request-manager.js';
import { TelegramService } from '../telegram/telegram-service.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Reliably find and load .env by walking up directories
function loadEnv() {
    const searchDirs = [process.cwd(), __dirname];
    let foundEnvPath = null;
    for (const start of searchDirs) {
        let current = path.resolve(start);
        while (true) {
            const candidate = path.join(current, '.env');
            if (fs.existsSync(candidate)) {
                foundEnvPath = candidate;
                break;
            }
            const parent = path.dirname(current);
            if (parent === current)
                break;
            current = parent;
        }
        if (foundEnvPath)
            break;
    }
    if (foundEnvPath) {
        const content = fs.readFileSync(foundEnvPath, 'utf8');
        for (const line of content.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#'))
                continue;
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
const telegramService = new TelegramService(defaultRequestManager);
const app = createApp(defaultRequestManager, telegramService);
const server = app.listen(PORT, HOST, () => {
    console.log(`🛡️  [Arthur Server] Running on http://${HOST}:${PORT}`);
    if (telegramService.isConfigured()) {
        console.log(`📱 [Arthur Server] Telegram Mobile Bot: ACTIVE (Chat ID: ${telegramService.getChatId()})`);
        telegramService.startPolling();
    }
    else {
        console.log(`⚠️  [Arthur Server] Telegram not configured in .env. Running in terminal prompt mode.`);
    }
});
function shutdown() {
    console.log('\n🛡️  [Arthur Server] Shutting down gracefully...');
    telegramService.stopPolling();
    defaultRequestManager.clear();
    server.close(() => {
        process.exit(0);
    });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
