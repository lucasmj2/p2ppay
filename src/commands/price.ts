/**
 * /preco command — Show current USDC/BRL price.
 */

import type TelegramBot from "node-telegram-bot-api";
import { backToMenuKeyboard } from "../utils/keyboard.js";
import { formatBrl } from "../utils/formatter.js";
import { fetchPriceConfig, getConfig } from "../sdk-client.js";

export function registerPriceCommand(bot: TelegramBot): void {
  bot.onText(/\/preco/, async (msg) => {
    const chatId = msg.chat.id;
    await showPrice(bot, chatId);
  });
}

export async function showPrice(bot: TelegramBot, chatId: number): Promise<void> {
  const loadingMsg = await bot.sendMessage(chatId, "⏳ Consultando cotação...");

  try {
    const cfg = getConfig();
    const result = await fetchPriceConfig(cfg.defaultCurrency);

    if (result.isOk()) {
      const priceData = result.value;
      const buyPrice = (Number(priceData.buyPrice) / 1_000_000).toFixed(2);
      const sellPrice = (Number(priceData.sellPrice) / 1_000_000).toFixed(2);
      const spread = (Number(priceData.baseSpread) / 10_000).toFixed(2);

      const text =
        `┌──────────────────────────────┐\n` +
        `  💹 <b>COTAÇÕES VIGENTES</b>\n` +
        `└──────────────────────────────┘\n` +
        `Moeda base: <b>${cfg.defaultCurrency} (Real)</b>\n\n` +
        `📥 <b>Taxa de Compra (On-Ramp):</b> <code>R$ ${buyPrice}</code>\n` +
        `📤 <b>Taxa de Venda (Off-Ramp):</b> <code>R$ ${sellPrice}</code>\n` +
        `📊 <b>Spread do Protocolo:</b> <code>${spread}%</code>\n\n` +
        `⚡ <i>Valores atualizados em tempo real diretamente do P2P.me.</i>`;

      await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: loadingMsg.message_id,
        parse_mode: "HTML",
        reply_markup: backToMenuKeyboard(),
      });
    } else {
      await bot.editMessageText(
        `❌ Erro ao buscar cotação: ${result.error.message}`,
        {
          chat_id: chatId,
          message_id: loadingMsg.message_id,
          reply_markup: backToMenuKeyboard(),
        }
      );
    }
  } catch (error) {
    await bot.editMessageText(
      `❌ Erro ao consultar cotação.\n\n<code>${String(error)}</code>`,
      {
        chat_id: chatId,
        message_id: loadingMsg.message_id,
        parse_mode: "HTML",
        reply_markup: backToMenuKeyboard(),
      }
    );
  }
}
