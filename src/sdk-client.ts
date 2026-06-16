/**
 * P2P.me SDK client initialization.
 * Server-side usage without React — uses viem directly.
 */

import { createPublicClient, createWalletClient, http, type PublicClient, type WalletClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia } from "viem/chains";
import { createOrders } from "@p2pdotme/sdk/orders";
import { createPrices } from "@p2pdotme/sdk/prices";
import type { BotConfig } from "./types.js";
import { decryptPrivateKey, getUserWallet } from "./utils/wallet-store.js";

let config: BotConfig;

export function initSdkConfig(cfg: BotConfig): void {
  config = cfg;
}

export function getConfig(): BotConfig {
  if (!config) throw new Error("SDK not initialized. Call initSdkConfig first.");
  return config;
}

export function getChain() {
  const cfg = getConfig();
  return cfg.rpcUrl.includes("sepolia") ? baseSepolia : base;
}

/**
 * Create a public client for reading on-chain data.
 */
export function getPublicClient(): PublicClient {
  const cfg = getConfig();
  return createPublicClient({
    chain: getChain(),
    transport: http(cfg.rpcUrl),
  }) as PublicClient;
}

/**
 * Create a wallet client for a specific user (by chatId).
 * Decrypts the user's stored private key and creates a viem WalletClient.
 */
export function getUserWalletClient(chatId: number): WalletClient | null {
  const cfg = getConfig();
  const userWallet = getUserWallet(chatId);
  if (!userWallet) return null;

  try {
    const privateKey = decryptPrivateKey(userWallet.encryptedPrivateKey, cfg.encryptionKey) as `0x${string}`;
    const account = privateKeyToAccount(privateKey);
    return createWalletClient({
      account,
      chain: getChain(),
      transport: http(cfg.rpcUrl),
    });
  } catch {
    return null;
  }
}

/**
 * Create an OrdersClient for a user's transactions.
 */
export function getOrdersClient() {
  const cfg = getConfig();
  const publicClient = getPublicClient();
  return createOrders({
    publicClient: publicClient as any,
    diamondAddress: cfg.diamondAddress,
    usdcAddress: cfg.usdcAddress,
    subgraphUrl: cfg.subgraphUrl,
  });
}

/**
 * Fetch current price config for a currency.
 */
export async function fetchPriceConfig(currency: string = "BRL") {
  const cfg = getConfig();
  const publicClient = getPublicClient();
  const prices = createPrices({
    publicClient: publicClient as any,
    diamondAddress: cfg.diamondAddress,
  });
  return prices.getPriceConfig({
    currency: currency as any,
  });
}
