/**
 * /pedidos command — List active orders.
 */

import type TelegramBot from "node-telegram-bot-api";
import { getUserWallet } from "../utils/wallet-store.js";
import { formatUsdc, formatOrderStatus } from "../utils/formatter.js";
import { backToMenuKeyboard } from "../utils/keyboard.js";
import { getOrdersClient } from "../sdk-client.js";

export function registerOrdersCommand(bot: TelegramBot): void {
  bot.onText(/\/pedidos/, async (msg) => {
    const chatId = msg.chat.id;
    await showOrders(bot, chatId);
  });

  bot.onText(/\/pedido\s+(\d+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const orderIdStr = match?.[1];
    if (!orderIdStr) return;
    await showSingleOrder(bot, chatId, BigInt(orderIdStr));
  });
}

export async function showOrders(bot: TelegramBot, chatId: number): Promise<void> {
  const wallet = getUserWallet(chatId);
  if (!wallet) {
    await bot.sendMessage(
      chatId,
      "❌ Crie uma carteira primeiro com /carteira",
      { reply_markup: backToMenuKeyboard() }
    );
    return;
  }

  const loadingMsg = await bot.sendMessage(chatId, "⏳ Buscando pedidos...");

  try {
    const orders = getOrdersClient();
    const result = await orders.getOrders({
      userAddress: wallet.address as `0x${string}`,
    });

    if (result.isOk()) {
      const ordersList = result.value;

      if (!ordersList || (Array.isArray(ordersList) && ordersList.length === 0)) {
        await bot.editMessageText(
          "📋 <b>Seus Pedidos</b>\n\nVocê não tem pedidos ativos no Subgraph (indexador offline).\n\n💡 <i>Você pode consultar o status de um pedido específico diretamente na blockchain usando:</i>\n<code>/pedido [id]</code>\n\nExemplo: <code>/pedido 67</code>",
          {
            chat_id: chatId,
            message_id: loadingMsg.message_id,
            parse_mode: "HTML",
            reply_markup: backToMenuKeyboard(),
          }
        );
        return;
      }

      let text =
        `┌──────────────────────────────┐\n` +
        `  📋 <b>HISTÓRICO DE PEDIDOS</b>\n` +
        `└──────────────────────────────┘\n\n`;

      const items = Array.isArray(ordersList) ? ordersList : [ordersList];
      for (const order of items.slice(0, 10)) {
        const o = order as any;
        text += `🔹 <b>Pedido:</b> <code>#${o.orderId || o.id || "?"}</code>\n`;
        text += `   ├─ <b>Operação:</b> ${o.orderType === 0 ? "💰 Compra (On-Ramp)" : "💸 Venda (Off-Ramp)"}\n`;
        text += `   ├─ <b>Status:</b> ${formatOrderStatus(o.status)}\n`;
        text += `   └─ <b>Montante:</b> <code>${o.amount ? formatUsdc(BigInt(o.amount)) + " USDC" : "N/A"}</code>\n\n`;
      }

      if (items.length > 10) {
        text += `<i>...e mais ${items.length - 10} pedidos no histórico.</i>`;
      }

      await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: loadingMsg.message_id,
        parse_mode: "HTML",
        reply_markup: backToMenuKeyboard(),
      });
    } else {
      await bot.editMessageText(
        `❌ Erro ao buscar pedidos: ${result.error?.message}`,
        {
          chat_id: chatId,
          message_id: loadingMsg.message_id,
          reply_markup: backToMenuKeyboard(),
        }
      );
    }
  } catch (error) {
    await bot.editMessageText(
      `❌ Erro: ${String(error)}`,
      {
        chat_id: chatId,
        message_id: loadingMsg.message_id,
        reply_markup: backToMenuKeyboard(),
      }
    );
  }
}

export async function showSingleOrder(bot: TelegramBot, chatId: number, orderId: bigint): Promise<void> {
  const loadingMsg = await bot.sendMessage(chatId, `⏳ Buscando detalhes do pedido #${orderId} na blockchain...`);

  try {
    const orders = getOrdersClient();
    const result = await orders.getOrder({ orderId });

    if (result.isOk()) {
      const o = result.value;
      const amountFiat = Number(o.fiatAmount) / 1e6;
      let text =
        `┌──────────────────────────────┐\n` +
        `  📦 <b>DETALHES DO PEDIDO #${orderId}</b>\n` +
        `└──────────────────────────────┘\n\n` +
        `🔹 <b>Operação:</b> ${o.type === "buy" ? "💰 Compra (On-Ramp)" : "💸 Venda (Off-Ramp)"}\n` +
        `🔹 <b>Status:</b> ${formatOrderStatus(o.status)}\n` +
        `🔹 <b>Montante:</b> <code>${formatUsdc(o.usdcAmount)} USDC</code>\n` +
        `🔹 <b>Valor em Fiat:</b> <code>R$ ${amountFiat.toFixed(2)}</code>\n` +
        `🔹 <b>Usuário (Carteira):</b> <code>${o.user}</code>\n` +
        `🔹 <b>Merchant:</b> <code>${o.acceptedMerchant || "Aguardando aceitação..."}</code>\n`;

      if (o.status === "accepted" || o.status === "completed" || o.status === "paid") {
        text += `🔹 <b>PIX Destino:</b> <code>${o.encUpi ? "Registrado ✅" : "Pendente ❌"}</code>\n`;
      }

      await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: loadingMsg.message_id,
        parse_mode: "HTML",
        reply_markup: backToMenuKeyboard(),
      });
    } else {
      await bot.editMessageText(
        `❌ Erro ao buscar pedido #${orderId}: ${result.error?.message}`,
        {
          chat_id: chatId,
          message_id: loadingMsg.message_id,
          reply_markup: backToMenuKeyboard(),
        }
      );
    }
  } catch (error) {
    await bot.editMessageText(
      `❌ Erro: ${String(error)}`,
      {
        chat_id: chatId,
        message_id: loadingMsg.message_id,
        reply_markup: backToMenuKeyboard(),
      }
    );
  }
}
