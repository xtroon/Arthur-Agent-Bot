import { AgentAdapter } from './adapter.interface.js';
import { AntigravityAdapter } from './antigravity.adapter.js';

export * from './adapter.interface.js';
export * from './antigravity.adapter.js';

class AdapterRegistry {
  private adapters = new Map<string, AgentAdapter>();

  constructor() {
    this.register(new AntigravityAdapter());
  }

  register(adapter: AgentAdapter): void {
    this.adapters.set(adapter.agentName, adapter);
  }

  get(agentName: string): AgentAdapter | undefined {
    return this.adapters.get(agentName);
  }

  list(): string[] {
    return Array.from(this.adapters.keys());
  }
}

export const adapterRegistry = new AdapterRegistry();
