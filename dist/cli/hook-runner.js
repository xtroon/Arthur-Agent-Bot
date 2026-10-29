import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ensureDaemonRunning } from './daemon.js';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
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
function parseArgs() {
    const args = process.argv.slice(2);
    let serverUrl = process.env.ARTHUR_SERVER_URL || process.env.MILO_SERVER_URL || 'http://127.0.0.1:4000';
    let agentName = 'antigravity';
    let timeoutSeconds = parseInt(process.env.ARTHUR_TIMEOUT_SEC || '180', 10);
    let fallbackPolicy = process.env.ARTHUR_FALLBACK === 'allow' ? 'allow' : 'deny';
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--server' && args[i + 1]) {
            serverUrl = args[++i];
        }
        else if (args[i] === '--agent' && args[i + 1]) {
            agentName = args[++i];
        }
        else if (args[i] === '--timeout' && args[i + 1]) {
            timeoutSeconds = parseInt(args[++i], 10);
        }
        else if (args[i] === '--fallback' && args[i + 1]) {
            fallbackPolicy = args[++i] === 'allow' ? 'allow' : 'deny';
        }
    }
    return { serverUrl, agentName, timeoutSeconds, fallbackPolicy };
}
async function readStdin() {
    return new Promise((resolve, reject) => {
        let data = '';
        process.stdin.setEncoding('utf-8');
        process.stdin.on('data', (chunk) => {
            data += chunk;
        });
        process.stdin.on('end', () => {
            resolve(data.trim());
        });
        process.stdin.on('error', (err) => {
            reject(err);
        });
    });
}
function sendPostRequest(urlStr, payload, timeoutMs) {
    return new Promise((resolve, reject) => {
        const url = new URL(urlStr);
        const postData = JSON.stringify(payload);
        const req = http.request({
            hostname: url.hostname,
            port: url.port || 80,
            path: `${url.pathname}${url.search}`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData),
            },
            timeout: timeoutMs,
        }, (res) => {
            let body = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => {
                body += chunk;
            });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(body);
                    resolve(parsed);
                }
                catch (e) {
                    reject(new Error(`Failed to parse response JSON: ${body}`));
                }
            });
        });
        req.on('timeout', () => {
            req.destroy(new Error('Request timed out'));
        });
        req.on('error', (err) => {
            reject(err);
        });
        req.write(postData);
        req.end();
    });
}
function formatToolSummary(toolCall) {
    if (!toolCall)
        return 'Unknown tool';
    const name = toolCall.name || 'tool';
    const args = toolCall.args || {};
    if (name === 'run_command') {
        return `Command: ${args.CommandLine || args.command || '(empty)'}`;
    }
    if (name === 'write_file' || name === 'edit_file') {
        return `${name}: ${args.Path || args.path || '(path)'}`;
    }
    return `${name}(${JSON.stringify(args)})`;
}
async function main() {
    const options = parseArgs();
    // Read agent payload from stdin
    let rawInputStr = '';
    try {
        rawInputStr = await readStdin();
    }
    catch (err) {
        console.log(JSON.stringify({ decision: 'deny', reason: `Arthur error reading stdin: ${err.message}` }));
        process.exit(0);
    }
    let inputPayload = {};
    if (rawInputStr) {
        try {
            inputPayload = JSON.parse(rawInputStr);
        }
        catch (err) {
            console.log(JSON.stringify({ decision: 'deny', reason: `Arthur invalid JSON: ${err.message}` }));
            process.exit(0);
        }
    }
    // 1. Ensure background daemon is running automatically!
    const isRunning = await ensureDaemonRunning(options.serverUrl);
    if (!isRunning) {
        // If daemon couldn't be spawned, notify and deny safely
        process.stderr.write(`⚠️  [Arthur] Could not reach or start background server.\n`);
        console.log(JSON.stringify({
            decision: options.fallbackPolicy,
            reason: 'Arthur background approval server is unavailable.',
        }));
        process.exit(0);
    }
    const toolSummary = formatToolSummary(inputPayload.toolCall);
    // Send to Arthur approval server (which evaluates policy & sends Telegram alert if needed)
    const endpoint = `${options.serverUrl}/api/agent/${options.agentName}/pre-tool?timeout=${options.timeoutSeconds}`;
    const networkTimeoutMs = (options.timeoutSeconds + 5) * 1000;
    try {
        const agentDecision = await sendPostRequest(endpoint, inputPayload, networkTimeoutMs);
        if (agentDecision.decision === 'allow') {
            if (agentDecision.reason?.includes('Auto-approved')) {
                process.stderr.write(`⚡ [Arthur] Auto-approved safe action: ${toolSummary}\n`);
            }
            else {
                process.stderr.write(`✅ [Arthur] Approved from Telegram! Continuing execution...\n`);
            }
        }
        else {
            process.stderr.write(`❌ [Arthur] Rejected: ${agentDecision.reason || 'Denied by operator'}\n`);
        }
        console.log(JSON.stringify(agentDecision));
    }
    catch (err) {
        process.stderr.write(`⚠️  [Arthur] Timeout or error: ${err.message}\n`);
        console.log(JSON.stringify({
            decision: options.fallbackPolicy,
            reason: `Arthur error: ${err.message || 'Approval timed out'}`,
        }));
    }
    process.exit(0);
}
main();
