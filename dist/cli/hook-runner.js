import http from 'http';
function parseArgs() {
    const args = process.argv.slice(2);
    let serverUrl = process.env.MILO_SERVER_URL || 'http://127.0.0.1:4000';
    let agentName = 'antigravity';
    let timeoutSeconds = parseInt(process.env.MILO_TIMEOUT_SEC || '55', 10);
    let fallbackPolicy = process.env.MILO_FALLBACK === 'allow' ? 'allow' : 'deny';
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
async function main() {
    const options = parseArgs();
    // Read agent payload from stdin
    let rawInputStr = '';
    try {
        rawInputStr = await readStdin();
    }
    catch (err) {
        const fallbackResponse = options.fallbackPolicy === 'allow'
            ? { decision: 'allow' }
            : { decision: 'deny', reason: `Milo Hook error reading stdin: ${err.message}` };
        console.log(JSON.stringify(fallbackResponse));
        process.exit(0);
    }
    let inputPayload = {};
    if (rawInputStr) {
        try {
            inputPayload = JSON.parse(rawInputStr);
        }
        catch (err) {
            const fallbackResponse = options.fallbackPolicy === 'allow'
                ? { decision: 'allow' }
                : { decision: 'deny', reason: `Milo Hook invalid JSON on stdin: ${err.message}` };
            console.log(JSON.stringify(fallbackResponse));
            process.exit(0);
        }
    }
    // Send to Milo approval server
    const endpoint = `${options.serverUrl}/api/agent/${options.agentName}/pre-tool?timeout=${options.timeoutSeconds}`;
    const networkTimeoutMs = (options.timeoutSeconds + 5) * 1000;
    try {
        const agentDecision = await sendPostRequest(endpoint, inputPayload, networkTimeoutMs);
        // Print the supported decision format to stdout for the agent CLI
        console.log(JSON.stringify(agentDecision));
    }
    catch (err) {
        if (options.fallbackPolicy === 'allow') {
            console.log(JSON.stringify({ decision: 'allow' }));
        }
        else {
            console.log(JSON.stringify({
                decision: 'deny',
                reason: `Milo approval error: ${err.message || 'Server unavailable or approval timed out.'}`,
            }));
        }
    }
    process.exit(0);
}
main();
