/**
 * /ajuda command — Show all available commands.
 */

import type TelegramBot from "node-telegram-bot-api";
import { backToMenuKeyboard } from "../utils/keyboard.js";

export function registerHelpCommand(bot: TelegramBot): void {
  bot.onText(/\/ajuda/, async (msg) => {
    const chatId = msg.chat.id;

    const helpText =
      `📖 <b>Comandos Disponíveis</b>\n\n` +
      `👛 /carteira — Criar ou ver sua carteira\n` +
      `📊 /saldo — Consultar saldo USDC\n` +
      `💹 /preco — Ver cotação USDC/BRL\n` +
      `💰 /comprar &lt;valor&gt; — Comprar USDC\n` +
      `💸 /vender &lt;valor&gt; — Vender USDC\n` +
      `📋 /pedidos — Ver pedidos ativos\n` +
      `❌ /cancelar &lt;id&gt; — Cancelar pedido\n` +
      `❓ /ajuda — Esta mensagem\n\n` +
      `<b>Como funciona:</b>\n` +
      `1️⃣ Crie sua carteira com /carteira\n` +
      `2️⃣ Deposite USDC no endereço da carteira (para vender)\n` +
      `3️⃣ Use /comprar ou /vender para negociar\n` +
      `4️⃣ Acompanhe com /pedidos`;

    await bot.sendMessage(chatId, helpText, {
      parse_mode: "HTML",
      reply_markup: backToMenuKeyboard(),
    });
  });
}
