import type { PublicClient, WalletClient, Account, Chain, Transport } from "viem";

export interface UserWallet {
  chatId: number;
  address: string;
  encryptedPrivateKey: string;
  createdAt: string;
}

export interface WalletStore {
  wallets: UserWallet[];
}

export interface BotConfig {
  telegramToken: string;
  rpcUrl: string;
  diamondAddress: `0x${string}`;
  usdcAddress: `0x${string}`;
  subgraphUrl: string;
  defaultCurrency: string;
  encryptionKey: string;
  allowedChatIds: number[];
}

export interface SessionState {
  action?: "buying" | "selling" | "awaiting_pix" | "confirming" | "awaiting_merchant" | "awaiting_payment";
  amount?: bigint;
  fiatAmount?: bigint;
  orderId?: string;
  pixKey?: string;
  pixPayload?: string;
  intervalId?: any;
}

export const ORDER_TYPE = {
  BUY: 0,
  SELL: 1,
  PAY: 2,
} as const;
