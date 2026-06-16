/**
 * /pago command — Confirm Pix payment on-chain (buyer confirm).
 */

import type TelegramBot from "node-telegram-bot-api";
import { getUserWallet } from "../utils/wallet-store.js";
import { txLink } from "../utils/formatter.js";
import { backToMenuKeyboard } from "../utils/keyboard.js";
import { getOrdersClient, getUserWalletClient, getConfig } from "../sdk-client.js";
import { parseContractError, getContractErrorMessage } from "@p2pdotme/sdk/orders";

export function registerPaidCommand(bot: TelegramBot): void {
  bot.onText(/\/pago(?:\s+(\d+))?/, async (msg, match) => {
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

    const orderIdStr = match?.[1];
    if (!orderIdStr) {
      await bot.sendMessage(
        chatId,
        `❌ <b>Confirmar Pagamento Pix</b>\n\n` +
        `Uso: <code>/pago [id_do_pedido]</code>\n\n` +
        `Exemplo: <code>/pago 123</code>\n\n` +
        `Use /pedidos para ver seus pedidos ativos.`,
        { parse_mode: "HTML", reply_markup: backToMenuKeyboard() }
      );
      return;
    }

    const orderId = BigInt(orderIdStr);
    const statusMsg = await bot.sendMessage(
      chatId,
      `⏳ Enviando confirmação de pagamento para o pedido #${orderIdStr} na blockchain...`
    );

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
      const cfg = getConfig();

      const result = await orders.paidBuyOrder.execute({
        walletClient: walletClient as any,
        orderId,
      });

      if (result.isOk()) {
        const { hash } = result.value;
        await bot.editMessageText(
          `✅ <b>Pagamento confirmado na blockchain para a ordem #${orderIdStr}!</b>\n\n` +
          `O merchant foi notificado e irá liberar seus USDC em breve.\n\n` +
          `🔗 ${txLink(hash)}`,
          {
            chat_id: chatId,
            message_id: statusMsg.message_id,
            parse_mode: "HTML",
            reply_markup: backToMenuKeyboard(),
          }
        );
      } else {
        console.error("Paid command failed:", result.error);
        const contractErrorCode = parseContractError(result.error?.cause || result.error);
        const decodedMessage = getContractErrorMessage(contractErrorCode);

        let errorMsg = result.error?.message || "Erro desconhecido";
        if (contractErrorCode) {
          errorMsg += `\n\nCódigo: <code>${contractErrorCode}</code>\nDetalhe: <b>${decodedMessage}</b>`;
        } else if (result.error?.cause && typeof result.error.cause === "object") {
          const cause = result.error.cause as any;
          if (cause.message) {
            errorMsg += `\n\nDetalhe: ${cause.message.split("\n")[0]}`;
          } else {
            errorMsg += `\n\nDetalhe: ${JSON.stringify(cause)}`;
          }
        }

        await bot.editMessageText(
          `❌ <b>Erro ao confirmar pagamento:</b>\n\n<code>${errorMsg}</code>`,
          {
            chat_id: chatId,
            message_id: statusMsg.message_id,
            parse_mode: "HTML",
            reply_markup: backToMenuKeyboard(),
          }
        );
      }
    } catch (error) {
      await bot.editMessageText(
        `❌ <b>Erro inesperado:</b>\n\n<code>${String(error)}</code>`,
        {
          chat_id: chatId,
          message_id: statusMsg.message_id,
          parse_mode: "HTML",
          reply_markup: backToMenuKeyboard(),
        }
      );
    }
  });
}
