/**
 * Main application entry point.
 * Loads environment variables, configures SDK client, and starts Telegram Bot.
 */

import dotenv from "dotenv";
import { initSdkConfig } from "./sdk-client.js";
import { initBot } from "./bot.js";
import type { BotConfig } from "./types.js";

// Load environment variables from .env
dotenv.config();

const requiredEnv = [
  "TELEGRAM_BOT_TOKEN",
  "DIAMOND_ADDRESS",
  "SUBGRAPH_URL",
  "ENCRYPTION_KEY",
];

const missingEnv = requiredEnv.filter((key) => !process.env[key]);
if (missingEnv.length > 0) {
  console.error(`❌ Critical error: Missing environment variables: ${missingEnv.join(", ")}`);
  console.error("Please configure them in your .env file.");
  process.exit(1);
}

// Parse allowed chat IDs if provided
const rawAllowedChatIds = process.env.ALLOWED_CHAT_IDS || "";
const allowedChatIds = rawAllowedChatIds
  ? rawAllowedChatIds.split(",").map((id) => parseInt(id.trim(), 10)).filter((id) => !isNaN(id))
  : [];

const config: BotConfig = {
  telegramToken: process.env.TELEGRAM_BOT_TOKEN!,
  rpcUrl: process.env.RPC_URL || "https://mainnet.base.org",
  diamondAddress: process.env.DIAMOND_ADDRESS as `0x${string}`,
  usdcAddress: (process.env.USDC_ADDRESS || "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913") as `0x${string}`,
  subgraphUrl: process.env.SUBGRAPH_URL!,
  defaultCurrency: process.env.DEFAULT_CURRENCY || "BRL",
  encryptionKey: process.env.ENCRYPTION_KEY!,
  allowedChatIds,
};

// Initialize P2P.me SDK Config
initSdkConfig(config);

// Boot Bot
try {
  initBot();
  console.log("⚡ P2P.me Telegram Trading Bot has started successfully!");
} catch (error) {
  console.error("❌ Failed to start the bot:", error);
  process.exit(1);
}
