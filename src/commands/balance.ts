/**
 * /saldo command — Check USDC balance.
 */

import type TelegramBot from "node-telegram-bot-api";
import { getUserWallet } from "../utils/wallet-store.js";
import { formatUsdc, addressLink } from "../utils/formatter.js";
import { backToMenuKeyboard } from "../utils/keyboard.js";
import { getPublicClient, getConfig } from "../sdk-client.js";
import { parseAbi, formatUnits } from "viem";

const ERC20_ABI = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
]);

export function registerBalanceCommand(bot: TelegramBot): void {
  bot.onText(/\/saldo/, async (msg) => {
    const chatId = msg.chat.id;
    await showBalance(bot, chatId);
  });
}

export async function showBalance(bot: TelegramBot, chatId: number): Promise<void> {
  const wallet = getUserWallet(chatId);
  if (!wallet) {
    await bot.sendMessage(
      chatId,
      "❌ Você ainda não tem uma carteira. Use /carteira para criar uma.",
      { reply_markup: backToMenuKeyboard() }
    );
    return;
  }

  const loadingMsg = await bot.sendMessage(chatId, "⏳ Consultando saldo...");

  try {
    const publicClient = getPublicClient();
    const cfg = getConfig();
    const address = wallet.address as `0x${string}`;

    // Fetch USDC balance
    const balance = await publicClient.readContract({
      address: cfg.usdcAddress,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [address],
    }) as bigint;

    // Fetch ETH balance (for gas)
    const ethBalance = await publicClient.getBalance({ address });

    // Fetch allowance for Diamond contract
    const allowance = await publicClient.readContract({
      address: cfg.usdcAddress,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [address, cfg.diamondAddress],
    }) as bigint;

    const text =
      `┌──────────────────────────────┐\n` +
      `  📊 <b>DASHBOARD DE ATIVOS</b>\n` +
      `└──────────────────────────────┘\n` +
      `📍 <b>Carteira Base:</b> <code>${wallet.address}</code>\n\n` +
      `💵 <b>Saldo USDC:</b> <code>${Number(formatUnits(balance, 6)).toFixed(2)} USDC</code>\n` +
      `⛽ <b>Taxa Gás (ETH):</b> <code>${Number(formatUnits(ethBalance, 18)).toFixed(6)} ETH</code>\n` +
      `🔓 <b>Aprovado P2P.me:</b> <code>${Number(formatUnits(allowance, 6)).toFixed(2)} USDC</code>\n\n` +
      `💡 <i>Envie USDC para o endereço acima na rede Base L2 para realizar operações de venda.</i>`;

    await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: loadingMsg.message_id,
      parse_mode: "HTML",
      reply_markup: backToMenuKeyboard(),
    });
  } catch (error) {
    await bot.editMessageText(
      `❌ Erro ao consultar saldo. Verifique a conexão RPC.\n\n<code>${String(error)}</code>`,
      {
        chat_id: chatId,
        message_id: loadingMsg.message_id,
        parse_mode: "HTML",
        reply_markup: backToMenuKeyboard(),
      }
    );
  }
}
