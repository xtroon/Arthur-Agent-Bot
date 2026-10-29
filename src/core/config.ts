import fs from 'fs';
import path from 'path';
import os from 'os';

export interface ArthurGlobalConfig {
  pairedSessionId?: string;
  pairingCode?: string;
  chatId?: string;
  relayUrl?: string;
  telegramBotToken?: string;
  autoApproveSafe?: boolean;
}

const CONFIG_DIR = path.resolve(os.homedir(), '.arthur');
const CONFIG_FILE = path.resolve(CONFIG_DIR, 'config.json');

export function loadArthurConfig(): ArthurGlobalConfig {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    // Ignore read errors, return default
  }

  return {
    relayUrl: process.env.ARTHUR_RELAY_URL || 'https://relay.arthur-agent.dev',
    autoApproveSafe: true,
  };
}

export function saveArthurConfig(updates: Partial<ArthurGlobalConfig>): ArthurGlobalConfig {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }

    const current = loadArthurConfig();
    const merged = { ...current, ...updates };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2), 'utf8');
    return merged;
  } catch (err: any) {
    console.error(`[Arthur Config] Failed to save config: ${err.message}`);
    return loadArthurConfig();
  }
}

export function isDevicePaired(): boolean {
  const config = loadArthurConfig();
  return Boolean(config.pairedSessionId || config.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN);
}
