import { RequestManager } from '../core/request-manager.js';
import { TelegramService } from '../telegram/telegram-service.js';
import { PolicyEngine } from '../policy/policy-engine.js';
export declare function createApp(requestManager?: RequestManager, telegramService?: TelegramService, policyEngine?: PolicyEngine): import("express-serve-static-core").Express;
