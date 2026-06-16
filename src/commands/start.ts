/**
 * /start command — Welcome message and main menu.
 */

import type TelegramBot from "node-telegram-bot-api";
import { mainMenuKeyboard } from "../utils/keyboard.js";
import { hasWallet } from "../utils/wallet-store.js";

export function registerStartCommand(bot: TelegramBot): void {
  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const name = msg.from?.first_name || "Trader";
    const walletExists = hasWallet(chatId);

    const welcome = walletExists
      ? `┌──────────────────────────────┐\n` +
        `  ⚡ <b>P2P.ME — TRADING PORTAL</b>\n` +
        `└──────────────────────────────┘\n` +
        `Olá, <b>${name}</b>!\n\n` +
        `Bem-vindo de volta ao portal de transações P2P.me na rede Base L2.\n\n` +
        `Sua carteira está pronta. Escolha uma operação no menu interativo:`
      : `┌──────────────────────────────┐\n` +
        `  ⚡ <b>P2P.ME — TRADING PORTAL</b>\n` +
        `└──────────────────────────────┘\n` +
        `Olá, <b>${name}</b>!\n\n` +
        `Aqui você pode negociar USDC usando BRL via PIX (sem custódia, taxas baixas, rede Base L2).\n\n` +
        `👛 <b>Para começar:</b> clique no botão <b>"Carteira"</b> abaixo para criar ou importar sua conta de testes.`;

    await bot.sendMessage(chatId, welcome, {
      parse_mode: "HTML",
      reply_markup: mainMenuKeyboard(),
    });
  });
}
