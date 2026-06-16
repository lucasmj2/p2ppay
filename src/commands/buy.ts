/**
 * /comprar command — Buy USDC (fiat → USDC on-ramp).
 */

import type TelegramBot from "node-telegram-bot-api";
import { parseUnits } from "viem";
import { getUserWallet, decryptPrivateKey } from "../utils/wallet-store.js";
import { formatUsdc, txLink } from "../utils/formatter.js";
import { confirmKeyboard, backToMenuKeyboard } from "../utils/keyboard.js";
import { getOrdersClient, getUserWalletClient, getConfig } from "../sdk-client.js";
import { parseContractError, getContractErrorMessage, decryptPaymentAddress } from "@p2pdotme/sdk/orders";
import type { SessionState } from "../types.js";
import { generatePixPayload, getPixQrCodeUrl } from "../utils/pix.js";

// Session storage for pending buy operations
const buySessions = new Map<number, SessionState>();

export function registerBuyCommand(bot: TelegramBot): void {
  bot.onText(/\/comprar(?:\s+(\d+(?:\.\d+)?))?/, async (msg, match) => {
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
        `💰 <b>Comprar USDC</b>\n\n` +
        `Uso: <code>/comprar [quantidade_usdc]</code>\n\n` +
        `Exemplo: <code>/comprar 10</code> — compra 10 USDC\n` +
        `Exemplo: <code>/comprar 100</code> — compra 100 USDC`,
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
    // Estimate fiat (placeholder — real rate from P2P.me)
    const estimatedFiat = parseUnits(String(amount * 5.20), 6); // ~R$5.20 per USDC

    buySessions.set(chatId, {
      action: "buying",
      amount: usdcAmount,
      fiatAmount: estimatedFiat,
    });

    const text =
      `┌──────────────────────────────┐\n` +
      `  💰 <b>CONFIRMAR COMPRA</b>\n` +
      `└──────────────────────────────┘\n` +
      `📦 <b>Quantidade:</b> <code>${amount} USDC</code>\n` +
      `💵 <b>Valor Estimado:</b> <code>R$ ${(amount * 5.20).toFixed(2)}</code>\n` +
      `📍 <b>Destino (Base):</b> <code>${wallet.address}</code>\n\n` +
      `⚠️ <i>O valor exato em BRL e os dados PIX para transferência serão gerados pelo merchant do P2P.me assim que aceitar a sua ordem.</i>\n\n` +
      `Deseja prosseguir e publicar a ordem?`;

    await bot.sendMessage(chatId, text, {
      parse_mode: "HTML",
      reply_markup: confirmKeyboard("buy"),
    });
  });
}

export function handleBuyCallbacks(bot: TelegramBot): void {
  bot.on("callback_query", async (query) => {
    if (query.data !== "confirm_buy" || !query.message) return;
    const chatId = query.message.chat.id;
    await bot.answerCallbackQuery(query.id);

    const session = buySessions.get(chatId);
    if (!session || !session.amount) {
      await bot.sendMessage(chatId, "❌ Sessão expirada. Use /comprar novamente.");
      return;
    }

    const wallet = getUserWallet(chatId);
    if (!wallet) {
      await bot.sendMessage(chatId, "❌ Carteira não encontrada.");
      return;
    }

    const statusMsg = await bot.sendMessage(chatId, "⏳ Enviando transação de compra...");

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

      const result = await orders.placeOrder.execute({
        walletClient: walletClient as any,
        waitForReceipt: true,
        orderType: 0, // BUY
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

        // Guardamos o estado inicial como aguardando aceitação do merchant
        buySessions.set(chatId, {
          action: "awaiting_merchant",
          amount: session.amount,
          fiatAmount: session.fiatAmount,
          orderId,
        });

        const text =
          `✅ <b>Ordem de compra criada!</b>\n\n` +
          `🆔 Ordem: <b>#${orderId}</b>\n` +
          `📦 Quantidade: <b>${formatUsdc(session.amount)} USDC</b>\n` +
          `🔗 ${txLink(hash)}\n\n` +
          `⏳ <b>Aguardando um merchant aceitar sua ordem...</b>\n` +
          `O bot gerará os dados e QR Code do Pix assim que ela for aceita!\n` +
          `Use /pedidos para acompanhar.`;

        await bot.editMessageText(text, {
          chat_id: chatId,
          message_id: statusMsg.message_id,
          parse_mode: "HTML",
          reply_markup: backToMenuKeyboard(),
        });

        // Polling para escutar aceitação da ordem
        const checkInterval = setInterval(async () => {
          try {
            const currentSession = buySessions.get(chatId);
            if (!currentSession || currentSession.orderId !== orderId) {
              clearInterval(checkInterval);
              return;
            }

            const ordersClient = getOrdersClient();
            const orderIdBigInt = BigInt(orderId);
            const orderResult = await ordersClient.getOrder({ orderId: orderIdBigInt });

            if (orderResult.isErr()) {
              console.error("Polling error fetching buy order:", orderResult.error?.message);
              return;
            }

            const order = orderResult.value;

            // Se a ordem foi aceita e temos a chave do merchant criptografada
            if (
              order.status === "accepted" ||
              order.status === "paid" ||
              order.status === "completed" ||
              (order.encMerchantUpi && order.encMerchantUpi.length > 0)
            ) {
              clearInterval(checkInterval);

              await bot.sendMessage(
                chatId,
                `⚡ Um merchant aceitou sua ordem de compra <b>#${orderId}</b>!\n` +
                `Descriptografando dados de pagamento Pix...`,
                { parse_mode: "HTML" }
              );

              const userWallet = getUserWallet(chatId);
              if (!userWallet) {
                await bot.sendMessage(chatId, "❌ Erro: Carteira do usuário não encontrada.");
                buySessions.delete(chatId);
                return;
              }

              try {
                const privateKey = decryptPrivateKey(userWallet.encryptedPrivateKey, cfg.encryptionKey);
                const decryptResult = await decryptPaymentAddress({
                  encrypted: order.encMerchantUpi,
                  recipientIdentity: {
                    address: userWallet.address as `0x${string}`,
                    publicKey: "",
                    privateKey: privateKey as `0x${string}`
                  }
                });

                if (decryptResult.isErr()) {
                  throw new Error(decryptResult.error.message);
                }

                const merchantPixKey = decryptResult.value;

                const amountFiatNum = Number(order.fiatAmount) / 1e6;
                const pixPayload = generatePixPayload({
                  key: merchantPixKey,
                  amount: amountFiatNum,
                  txId: `P2PME${orderId}`
                });

                const qrCodeUrl = getPixQrCodeUrl(pixPayload);

                await bot.sendPhoto(chatId, qrCodeUrl, {
                  caption:
                    `📱 <b>PIX GERADO PARA COMPRA #${orderId}</b>\n\n` +
                    `📦 <b>Valor:</b> <code>R$ ${amountFiatNum.toFixed(2)}</code>\n` +
                    `🔑 <b>Chave Pix Merchant:</b> <code>${merchantPixKey}</code>\n\n` +
                    `👇 <b>Copia e Cola:</b>\n<code>${pixPayload}</code>\n\n` +
                    `⚠️ <i>Realize o pagamento no seu banco e em seguida confirme enviando:</i>\n` +
                    `<code>/pago ${orderId}</code>`,
                  parse_mode: "HTML"
                });

                buySessions.set(chatId, {
                  ...currentSession,
                  action: "awaiting_payment",
                  pixKey: merchantPixKey,
                  pixPayload
                });

              } catch (decryptErr) {
                console.error("Error decrypting merchant PIX key:", decryptErr);
                await bot.sendMessage(
                  chatId,
                  `❌ <b>Erro ao descriptografar a chave Pix do merchant:</b>\n` +
                  `Não foi possível ler os dados de pagamento automaticamente.\n\n` +
                  `Consulte o status com <code>/pedido ${orderId}</code>.`,
                  { parse_mode: "HTML", reply_markup: backToMenuKeyboard() }
                );
                buySessions.delete(chatId);
              }
            } else if (order.status === "cancelled") {
              clearInterval(checkInterval);
              buySessions.delete(chatId);
              await bot.sendMessage(
                chatId,
                `❌ A sua ordem de compra <b>#${orderId}</b> foi cancelada.`,
                { parse_mode: "HTML", reply_markup: backToMenuKeyboard() }
              );
            }
          } catch (err) {
            console.error("Unexpected error in buy order polling:", err);
          }
        }, 10000);

        buySessions.set(chatId, {
          action: "awaiting_merchant",
          amount: session.amount,
          fiatAmount: session.fiatAmount,
          orderId,
          intervalId: checkInterval
        });

      } else {
        console.error("Buy command failed:", result.error);
        
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
          `❌ <b>Erro na compra:</b>\n\n<code>${errorMsg}</code>`,
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
