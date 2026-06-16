/**
 * Formatting utilities for the P2P Telegram bot.
 * Handles USDC amounts (6 decimals), BRL currency, and message formatting.
 */

/**
 * Format a USDC amount (bigint with 6 decimals) to human-readable string.
 * Example: 1000000n → "1.00"
 */
export function formatUsdc(amount: bigint): string {
  const whole = amount / 1_000_000n;
  const fraction = amount % 1_000_000n;
  const fractionStr = fraction.toString().padStart(6, "0").slice(0, 2);
  return `${whole}.${fractionStr}`;
}

/**
 * Format BRL currency value.
 * Example: 52000 → "R$ 520,00"
 */
export function formatBrl(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

/**
 * Format a fiat amount from bigint (6 decimals) to human-readable.
 */
export function formatFiat(amount: bigint, currency: string = "BRL"): string {
  const value = Number(amount) / 1_000_000;
  if (currency === "BRL") return formatBrl(value);
  return `${value.toFixed(2)} ${currency}`;
}

/**
 * Shorten an Ethereum address for display.
 * Example: "0x1234...abcd"
 */
export function shortenAddress(address: string): string {
  if (address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Format a transaction hash as a link to BaseScan.
 */
export function txLink(hash: string): string {
  return `<a href="https://basescan.org/tx/${hash}">Ver no BaseScan</a>`;
}

/**
 * Format an address as a link to BaseScan.
 */
export function addressLink(address: string): string {
  return `<a href="https://basescan.org/address/${address}">${shortenAddress(address)}</a>`;
}

/**
 * Escape HTML special characters for Telegram HTML parse mode.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Format order status to Portuguese emoji label.
 */
export function formatOrderStatus(status: string): string {
  const statusMap: Record<string, string> = {
    pending: "⏳ Pendente",
    accepted: "✅ Aceito",
    completed: "🎉 Concluído",
    cancelled: "❌ Cancelado",
    disputed: "⚠️ Em disputa",
  };
  return statusMap[status?.toLowerCase()] || `📋 ${status}`;
}
