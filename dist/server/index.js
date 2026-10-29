import fs from 'fs';
import path from 'path';
import { createApp } from './app.js';
import { defaultRequestManager } from '../core/request-manager.js';
import { TelegramService } from '../telegram/telegram-service.js';
// Auto-load .env file if present
function loadEnv() {
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
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
        console.log(`⚠️  [Arthur Server] Telegram not configured yet. Run 'npx arthur init' to connect your bot.`);
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
