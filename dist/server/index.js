import { createApp } from './app.js';
import { defaultRequestManager } from '../core/request-manager.js';
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
