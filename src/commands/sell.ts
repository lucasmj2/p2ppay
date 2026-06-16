/**
 * /vender command — Sell USDC (USDC → fiat off-ramp).
 */

import type TelegramBot from "node-telegram-bot-api";
import { parseUnits } from "viem";
import { getUserWallet } from "../utils/wallet-store.js";
import { formatUsdc, txLink } from "../utils/formatter.js";
import { confirmKeyboard, backToMenuKeyboard } from "../utils/keyboard.js";
import { getOrdersClient, getUserWalletClient, getConfig } from "../sdk-client.js";
import { parseContractError, getContractErrorMessage } from "@p2pdotme/sdk/orders";
import type { SessionState } from "../types.js";

const sellSessions = new Map<number, SessionState>();
const awaitingPix = new Set<number>();

export function registerSellCommand(bot: TelegramBot): void {
  bot.onText(/\/vender(?:\s+(\d+(?:\.\d+)?))?/, async (msg, match) => {
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

    const amountStr = match?.[1];
    if (!amountStr) {
      await bot.sendMessage(
        chatId,
        `💸 <b>Vender USDC</b>\n\n` +
        `Uso: <code>/vender [quantidade_usdc]</code>\n\n` +
        `Exemplo: <code>/vender 10</code> — vende 10 USDC\n` +
        `Exemplo: <code>/vender 50</code> — vende 50 USDC\n\n` +
        `⚠️ Certifique-se de ter USDC suficiente na carteira.`,
        { parse_mode: "HTML", reply_markup: backToMenuKeyboard() }
      );
      return;
    }

    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount <= 0) {
      await bot.sendMessage(chatId, "❌ Valor inválido. Use um número positivo.");
      return;
    }

    const usdcAmount = parseUnits(amountStr, 6);
    const estimatedFiat = parseUnits(String(amount * 5.20), 6);

    sellSessions.set(chatId, {
      action: "selling",
      amount: usdcAmount,
      fiatAmount: estimatedFiat,
    });

    const text =
      `┌──────────────────────────────┐\n` +
      `  💸 <b>CONFIRMAR VENDA</b>\n` +
      `└──────────────────────────────┘\n` +
      `📦 <b>Quantidade:</b> <code>${amount} USDC</code>\n` +
      `💵 <b>Valor Estimado:</b> <code>R$ ${(amount * 5.20).toFixed(2)}</code>\n` +
      `📍 <b>Origem (Base):</b> <code>${wallet.address}</code>\n\n` +
      `⚠️ <i>Será necessária uma aprovação prévia de gasto de USDC antes de criar a ordem de venda na blockchain.</i>\n\n` +
      `Deseja prosseguir com a aprovação e venda?`;

    await bot.sendMessage(chatId, text, {
      parse_mode: "HTML",
      reply_markup: confirmKeyboard("sell"),
    });
  });

  // Handle PIX key input
  bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    if (!awaitingPix.has(chatId) || !msg.text) return;
    if (msg.text.startsWith("/")) return;

    awaitingPix.delete(chatId);
    const pixKey = msg.text.trim();
    const session = sellSessions.get(chatId);

    if (!session?.orderId) {
      await bot.sendMessage(chatId, "❌ Sessão expirada.");
      return;
    }

    await bot.sendMessage(
      chatId,
      `⏳ <b>Chave PIX registrada temporariamente!</b>\n\n` +
      `Aguardando um merchant aceitar a sua ordem de venda <b>#${session.orderId}</b> na blockchain.\n` +
      `Assim que for aceita, o bot enviará a chave PIX criptografada automaticamente!`,
      { parse_mode: "HTML" }
    );

    // Save PIX key to session
    session.pixKey = pixKey;
    sellSessions.set(chatId, session);

    // Poll every 10 seconds to check if a merchant has accepted
    const checkInterval = setInterval(async () => {
      try {
        const currentSession = sellSessions.get(chatId);
        if (!currentSession || currentSession.orderId !== session.orderId) {
          clearInterval(checkInterval);
          return;
        }

        const orders = getOrdersClient();
        const orderIdBigInt = BigInt(session.orderId!);
        const orderResult = await orders.getOrder({ orderId: orderIdBigInt });
        
        if (orderResult.isErr()) {
          console.error("Polling error fetching order:", orderResult.error?.message);
          return;
        }

        const order = orderResult.value;
        
        // If order status is accepted and merchant public key exists
        if (order.status === "accepted" || (order.pubkey && order.pubkey.length > 0)) {
          clearInterval(checkInterval);
          
          await bot.sendMessage(
            chatId,
            `⚡ Um merchant aceitou sua ordem <b>#${session.orderId}</b>!\n` +
            `Registrando chave PIX criptografada na blockchain...`,
            { parse_mode: "HTML" }
          );

          const walletClient = getUserWalletClient(chatId);
          if (!walletClient) {
            await bot.sendMessage(chatId, "❌ Erro ao acessar sua carteira para enviar a chave PIX.");
            sellSessions.delete(chatId);
            return;
          }

          const result = await orders.setSellOrderUpi.execute({
            walletClient: walletClient as any,
            orderId: orderIdBigInt,
            paymentAddress: pixKey,
            merchantPublicKey: order.pubkey,
            updatedAmount: order.usdcAmount,
          });

          if (result.isOk()) {
            sellSessions.delete(chatId);
            await bot.sendMessage(
              chatId,
              `✅ <b>Chave PIX registrada com sucesso na blockchain!</b>\n\n` +
              `O merchant recebeu o destino com segurança e está processando o pagamento.\n` +
              `Acompanhe o status com /pedidos.`,
              { parse_mode: "HTML", reply_markup: backToMenuKeyboard() }
            );
          } else {
            console.error("Error calling setSellOrderUpi:", result.error);
            
            const contractErrorCode = parseContractError(result.error?.cause || result.error);
            const decodedMessage = getContractErrorMessage(contractErrorCode);
            let errorMsg = result.error?.message || "Erro desconhecido";
            if (contractErrorCode) {
              errorMsg += `\n\nCódigo: <code>${contractErrorCode}</code>\nDetalhe: <b>${decodedMessage}</b>`;
            }
            
            await bot.sendMessage(
              chatId,
              `❌ <b>Erro ao enviar sua chave PIX:</b>\n\n<code>${errorMsg}</code>\n\nPor favor, tente digitar sua chave novamente.`,
              { parse_mode: "HTML", reply_markup: backToMenuKeyboard() }
            );
            
            // Put user back in the PIX input queue
            awaitingPix.add(chatId);
          }
        } else if (order.status === "cancelled" || order.status === "completed") {
          clearInterval(checkInterval);
          sellSessions.delete(chatId);
          await bot.sendMessage(
            chatId,
            `⚠️ A ordem <b>#${session.orderId}</b> foi ${order.status === "completed" ? "concluída" : "cancelada"} antes de ser aceita por um merchant.`,
            { parse_mode: "HTML", reply_markup: backToMenuKeyboard() }
          );
        }
      } catch (err) {
        console.error("Unexpected error in PIX polling:", err);
      }
    }, 10000); // 10 seconds

    session.intervalId = checkInterval;
    sellSessions.set(chatId, session);
  });
}

export function handleSellCallbacks(bot: TelegramBot): void {
  bot.on("callback_query", async (query) => {
    if (query.data !== "confirm_sell" || !query.message) return;
    const chatId = query.message.chat.id;
    await bot.answerCallbackQuery(query.id);

    const session = sellSessions.get(chatId);
    if (!session || !session.amount) {
      await bot.sendMessage(chatId, "❌ Sessão expirada. Use /vender novamente.");
      return;
    }

    const wallet = getUserWallet(chatId);
    if (!wallet) {
      await bot.sendMessage(chatId, "❌ Carteira não encontrada.");
      return;
    }

    const statusMsg = await bot.sendMessage(chatId, "⏳ Aprovando USDC para o contrato P2P.me...");

    try {
      const walletClient = getUserWalletClient(chatId);
      if (!walletClient) {
        await bot.editMessageText("❌ Erro ao acessar sua carteira.", {
          chat_id: chatId,
          message_id: statusMsg.message_id,
        });
        return;
      }

      const orders = getOrdersClient();
      const cfg = getConfig();

      // Step 1: Approve USDC
      await bot.editMessageText("⏳ [1/2] Aprovando USDC...", {
        chat_id: chatId,
        message_id: statusMsg.message_id,
      });

      const approveResult = await orders.approveUsdc.execute({
        walletClient: walletClient as any,
        amount: session.amount,
      });

      if (approveResult.isErr()) {
        await bot.editMessageText(
          `❌ Erro ao aprovar USDC: ${approveResult.error?.message}`,
          {
            chat_id: chatId,
            message_id: statusMsg.message_id,
            reply_markup: backToMenuKeyboard(),
          }
        );
        return;
      }

      // Step 2: Place sell order
      await bot.editMessageText("⏳ [2/2] Criando ordem de venda...", {
        chat_id: chatId,
        message_id: statusMsg.message_id,
      });

      const result = await orders.placeOrder.execute({
        walletClient: walletClient as any,
        waitForReceipt: true,
        orderType: 1, // SELL
        currency: cfg.defaultCurrency as any,
        user: wallet.address as `0x${string}`,
        recipientAddr: wallet.address as `0x${string}`,
        amount: session.amount,
        fiatAmount: session.fiatAmount || 0n,
        fiatAmountLimit: 0n,
      });

      if (result.isOk()) {
        const { hash, meta } = result.value;
        const orderId = meta?.orderId ? String(meta.orderId) : "";

        sellSessions.set(chatId, { ...session, orderId, action: "awaiting_pix" });
        awaitingPix.add(chatId);

        const text =
          `┌──────────────────────────────┐\n` +
          `  ✅ <b>ORDEM DE VENDA CRIADA</b>\n` +
          `└──────────────────────────────┘\n` +
          `🆔 <b>Ordem ID:</b> <code>#${orderId}</code>\n` +
          `📦 <b>Valor da Venda:</b> <code>${formatUsdc(session.amount)} USDC</code>\n` +
          `🔗 <b>Recibo Blockchain:</b> ${txLink(hash)}\n\n` +
          `📱 <b>Por favor, digite sua CHAVE PIX</b> agora no chat para receber os fundos de contrapartida:\n` +
          `<i>(Aceitamos CPF, e-mail, telefone ou chave aleatória)</i>`;

        await bot.editMessageText(text, {
          chat_id: chatId,
          message_id: statusMsg.message_id,
          parse_mode: "HTML",
        });
      } else {
        console.error("Sell command failed:", result.error);
        
        const contractErrorCode = parseContractError(result.error?.cause || result.error);
        const decodedMessage = getContractErrorMessage(contractErrorCode);
        console.error("Decoded contract error code:", contractErrorCode);
        console.error("Decoded contract error message:", decodedMessage);

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
          `❌ <b>Erro na venda:</b>\n\n<code>${errorMsg}</code>`,
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
