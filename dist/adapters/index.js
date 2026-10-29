import { AntigravityAdapter } from './antigravity.adapter.js';
import { ClaudeCodeAdapter } from './claude-code.adapter.js';
export * from './adapter.interface.js';
export * from './antigravity.adapter.js';
export * from './claude-code.adapter.js';
class AdapterRegistry {
    adapters = new Map();
    constructor() {
        this.register(new AntigravityAdapter());
        this.register(new ClaudeCodeAdapter());
    }
    register(adapter) {
        this.adapters.set(adapter.agentName, adapter);
    }
    get(agentName) {
        return this.adapters.get(agentName);
    }
    list() {
        return Array.from(this.adapters.keys());
    }
}
export const adapterRegistry = new AdapterRegistry();
