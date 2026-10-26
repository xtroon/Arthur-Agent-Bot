import { AgentAdapter } from './adapter.interface.js';
export * from './adapter.interface.js';
export * from './antigravity.adapter.js';
declare class AdapterRegistry {
    private adapters;
    constructor();
    register(adapter: AgentAdapter): void;
    get(agentName: string): AgentAdapter | undefined;
    list(): string[];
}
export declare const adapterRegistry: AdapterRegistry;
