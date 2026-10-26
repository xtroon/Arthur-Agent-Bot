import { AntigravityAdapter } from './antigravity.adapter.js';
export * from './adapter.interface.js';
export * from './antigravity.adapter.js';
class AdapterRegistry {
    adapters = new Map();
    constructor() {
        this.register(new AntigravityAdapter());
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
