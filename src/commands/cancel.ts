/**
 * /cancelar command — Cancel an existing order.
 */

import type TelegramBot from "node-telegram-bot-api";
import { getUserWallet } from "../utils/wallet-store.js";
import { txLink } from "../utils/formatter.js";
import { backToMenuKeyboard } from "../utils/keyboard.js";
import { getOrdersClient, getUserWalletClient } from "../sdk-client.js";

export function registerCancelCommand(bot: TelegramBot): void {
  bot.onText(/\/cancelar(?:\s+(\S+))?/, async (msg, match) => {
    const chatId = msg.chat.id;

    const wallet = getUserWallet(chatId);
    if (!wallet) {
      await bot.sendMessage(
        chatId,
        "❌ Crie uma carteira primeiro com /carteira",
        { reply_markup: backToMenuKeyboard() }
      );
      return;
    }

    const orderId = match?.[1];
    if (!orderId) {
      await bot.sendMessage(
        chatId,
        `❌ <b>Cancelar Pedido</b>\n\n` +
        `Uso: <code>/cancelar [id_do_pedido]</code>\n\n` +
        `Exemplo: <code>/cancelar 123</code>\n\n` +
        `Use /pedidos para ver seus pedidos e IDs.`,
        { parse_mode: "HTML", reply_markup: backToMenuKeyboard() }
      );
      return;
    }

    const statusMsg = await bot.sendMessage(chatId, `⏳ Cancelando pedido #${orderId}...`);

    try {
      const walletClient = getUserWalletClient(chatId);
      if (!walletClient) {
        await bot.editMessageText("❌ Erro ao acessar carteira.", {
          chat_id: chatId,
          message_id: statusMsg.message_id,
        });
        return;
      }

      const orders = getOrdersClient();
      const result = await orders.cancelOrder.execute({
        walletClient: walletClient as any,
        orderId: BigInt(orderId),
        waitForReceipt: true,
      });

      if (result.isOk()) {
        const { hash } = result.value;
        await bot.editMessageText(
          `✅ <b>Pedido #${orderId} cancelado!</b>\n\n🔗 ${txLink(hash)}`,
          {
            chat_id: chatId,
            message_id: statusMsg.message_id,
            parse_mode: "HTML",
            reply_markup: backToMenuKeyboard(),
          }
        );
      } else {
        await bot.editMessageText(
          `❌ Erro ao cancelar: ${result.error?.message}`,
          {
            chat_id: chatId,
            message_id: statusMsg.message_id,
            reply_markup: backToMenuKeyboard(),
          }
        );
      }
    } catch (error) {
      await bot.editMessageText(
        `❌ Erro: ${String(error)}`,
        {
          chat_id: chatId,
          message_id: statusMsg.message_id,
          reply_markup: backToMenuKeyboard(),
        }
      );
    }
  });
}
