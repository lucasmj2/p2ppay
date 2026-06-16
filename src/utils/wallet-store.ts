/**
 * Simple JSON-based wallet store with AES encryption for private keys.
 * Each Telegram user (chatId) maps to one wallet.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import type { UserWallet, WalletStore } from "../types.js";

const DATA_DIR = "./data";
const WALLETS_FILE = `${DATA_DIR}/wallets.json`;
const ALGORITHM = "aes-256-gcm";

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadStore(): WalletStore {
  ensureDataDir();
  if (!existsSync(WALLETS_FILE)) {
    return { wallets: [] };
  }
  const raw = readFileSync(WALLETS_FILE, "utf-8");
  return JSON.parse(raw) as WalletStore;
}

function saveStore(store: WalletStore): void {
  ensureDataDir();
  writeFileSync(WALLETS_FILE, JSON.stringify(store, null, 2), "utf-8");
}

/**
 * Encrypt a private key string using AES-256-GCM.
 */
export function encryptPrivateKey(privateKey: string, encryptionKey: string): string {
  const key = scryptSync(encryptionKey, "p2p-bot-salt", 32);
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(privateKey, "utf-8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

/**
 * Decrypt a private key string.
 */
export function decryptPrivateKey(encryptedData: string, encryptionKey: string): string {
  const [ivHex, authTagHex, encrypted] = encryptedData.split(":");
  const key = scryptSync(encryptionKey, "p2p-bot-salt", 32);
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, "hex", "utf-8");
  decrypted += decipher.final("utf-8");
  return decrypted;
}

/**
 * Get a user's wallet by Telegram chatId.
 */
export function getUserWallet(chatId: number): UserWallet | undefined {
  const store = loadStore();
  return store.wallets.find((w) => w.chatId === chatId);
}

/**
 * Save a new wallet for a user.
 */
export function saveUserWallet(wallet: UserWallet): void {
  const store = loadStore();
  const existingIndex = store.wallets.findIndex((w) => w.chatId === wallet.chatId);
  if (existingIndex >= 0) {
    store.wallets[existingIndex] = wallet;
  } else {
    store.wallets.push(wallet);
  }
  saveStore(store);
}

/**
 * Check if a user has a wallet.
 */
export function hasWallet(chatId: number): boolean {
  return getUserWallet(chatId) !== undefined;
}
