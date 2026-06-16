/**
 * bill.ts — Command and handlers for paying utility bills (electricity, water, etc.) via QR Code or Pix.
 */

import type TelegramBot from "node-telegram-bot-api";
import { parseQR } from "@p2pdotme/sdk/qr-parsers";
import { getUserWallet, decryptPrivateKey } from "../utils/wallet-store.js";
import { formatUsdc, txLink, formatFiat } from "../utils/formatter.js";
import { backToMenuKeyboard, confirmKeyboard } from "../utils/keyboard.js";
import { getOrdersClient, getUserWalletClient, getConfig, fetchPriceConfig } from "../sdk-client.js";
import { parseContractError, getContractErrorMessage, decryptPaymentAddress } from "@p2pdotme/sdk/orders";

interface BillSession {
  pixKey: string;
  fiatAmount: bigint;
  usdcAmount: bigint;
  action: "confirming_bill" | "awaiting_merchant" | "completed";
  orderId?: string;
  intervalId?: any;
}

const billSessions = new Map<number, BillSession>();

export function registerBillHandlers(bot: TelegramBot): void {
  // Command helper `/pagar`
  bot.onText(/\/pagar/, async (msg) => {
    const chatId = msg.chat.id;
    const text =
      `🧾 <b>Pagamento de Contas via Pix (P2P.me)</b>\n\n` +
      `Você pode pagar contas de energia (luz), água ou qualquer boleto Pix diretamente do bot usando seu saldo em USDC!\n\n` +
      `📥 <b>Como usar:</b>\n` +
      `1️⃣ **Envie a foto do QR Code** Pix da conta (print ou foto).\n` +
      `2️⃣ **Ou cole o código Pix Copia e Cola** diretamente no chat.\n\n` +
      `💡 <i>O bot lerá o valor, cotação e pedirá sua confirmação antes de enviar a transação para a blockchain.</i>`;

    await bot.sendMessage(chatId, text, {
      parse_mode: "HTML",
      reply_markup: backToMenuKeyboard(),
    });
  });

  // Listener for photos (QR Code)
  bot.on("photo", async (msg) => {
    const chatId = msg.chat.id;
    if (!msg.photo || msg.photo.length === 0) return;

    const wallet = getUserWallet(chatId);
    if (!wallet) {
      await bot.sendMessage(chatId, "❌ Você precisa criar uma carteira primeiro com /carteira");
      return;
    }

    const loadingMsg = await bot.sendMessage(chatId, "⏳ Recebendo imagem e lendo QR Code Pix...");

    try {
      const photo = msg.photo[msg.photo.length - 1]; // largest photo
      const file = await bot.getFile(photo.file_id);
      const cfg = getConfig();
      
      const fileUrl = `https://api.telegram.org/file/bot${cfg.telegramToken}/${file.file_path}`;
      const fileResponse = await fetch(fileUrl);
      if (!fileResponse.ok) {
        throw new Error(`Failed to download image from Telegram: ${fileResponse.statusText}`);
      }
      const arrayBuffer = await fileResponse.arrayBuffer();

      const formData = new FormData();
      const blob = new Blob([arrayBuffer]);
      formData.append("file", blob, "image.jpg");

      console.log(`Sending image (${blob.size} bytes) to QR code decoder API...`);
      const qrResponse = await fetch("https://api.qrserver.com/v1/read-qr-code/", {
        method: "POST",
        body: formData,
      });

      if (!qrResponse.ok) {
        throw new Error(`QR API returned status ${qrResponse.status}`);
      }

      const data = await qrResponse.json();
      console.log("QR Code API response:", JSON.stringify(data));
      
      const qrText = data?.[0]?.symbol?.[0]?.data;
      const qrError = data?.[0]?.symbol?.[0]?.error;
      
      if (qrError) {
        console.log("QR Code reader error detail:", qrError);
      }

      if (!qrText) {
        await bot.editMessageText(
          "❌ Não foi possível ler nenhum QR Code na imagem.\n" +
          "Certifique-se de que o QR Code está nítido e tente novamente, ou cole o Pix Copia e Cola como texto.",
          { chat_id: chatId, message_id: loadingMsg.message_id }
        );
        return;
      }

      await bot.deleteMessage(chatId, loadingMsg.message_id);
      await processPixString(bot, chatId, qrText);

    } catch (error) {
      console.error("Error processing QR image:", error);
      await bot.editMessageText(
        `❌ Erro ao decodificar QR Code.\n\n<code>${String(error)}</code>`,
        { chat_id: chatId, message_id: loadingMsg.message_id, parse_mode: "HTML" }
      );
    }
  });

  // Listener for text messages (Pix Copy & Paste)
  bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    if (!msg.text || msg.text.startsWith("/")) return;

    // Check if it looks like a Pix payload (starts with 000201)
    if (msg.text.trim().startsWith("000201")) {
      const wallet = getUserWallet(chatId);
      if (!wallet) {
        await bot.sendMessage(chatId, "❌ Você precisa criar uma carteira primeiro com /carteira");
        return;
      }

      await processPixString(bot, chatId, msg.text.trim());
    }
  });

  // Register callback query for bill confirmation
  bot.on("callback_query", async (query) => {
    if (query.data !== "confirm_bill" || !query.message) return;
    const chatId = query.message.chat.id;
    await bot.answerCallbackQuery(query.id);

    const session = billSessions.get(chatId);
    if (!session || session.action !== "confirming_bill") {
      await bot.sendMessage(chatId, "❌ Sessão expirada ou pagamento cancelado. Envie a conta novamente.");
      return;
    }

    const wallet = getUserWallet(chatId);
    if (!wallet) {
      await bot.sendMessage(chatId, "❌ Carteira não encontrada.");
      return;
    }

    const statusMsg = await bot.sendMessage(chatId, "⏳ Aprovando USDC para pagamento da conta...");

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

      // Step 1: Approve USDC
      await bot.editMessageText("⏳ [1/2] Aprovando USDC...", {
        chat_id: chatId,
        message_id: statusMsg.message_id,
      });

      const approveResult = await orders.approveUsdc.execute({
        walletClient: walletClient as any,
        amount: session.usdcAmount,
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

      // Step 2: Create sell order (Off-ramp)
      await bot.editMessageText("⏳ [2/2] Criando ordem de pagamento na blockchain...", {
        chat_id: chatId,
        message_id: statusMsg.message_id,
      });

      const result = await orders.placeOrder.execute({
        walletClient: walletClient as any,
        waitForReceipt: true,
        orderType: 1, // SELL (Off-ramp)
        currency: cfg.defaultCurrency as any,
        user: wallet.address as `0x${string}`,
        recipientAddr: wallet.address as `0x${string}`,
        amount: session.usdcAmount,
        fiatAmount: session.fiatAmount,
        fiatAmountLimit: 0n,
      });

      if (result.isOk()) {
        const { hash, meta } = result.value;
        const orderId = meta?.orderId ? String(meta.orderId) : "";

        // Update session
        billSessions.set(chatId, {
          ...session,
          action: "awaiting_merchant",
          orderId
        });

        const text =
          `┌──────────────────────────────┐\n` +
          `  ✅ <b>ORDEM DE PAGAMENTO CRIADA</b>\n` +
          `└──────────────────────────────┘\n` +
          `🆔 <b>Ordem ID:</b> <code>#${orderId}</code>\n` +
          `📦 <b>Valor da Conta:</b> <code>${formatFiat(session.fiatAmount)}</code>\n` +
          `🪙 <b>Custo USDC:</b> <code>${formatUsdc(session.usdcAmount)} USDC</code>\n` +
          `🔗 <b>Recibo Blockchain:</b> ${txLink(hash)}\n\n` +
          `⏳ <b>Aguardando um merchant aceitar...</b>\n` +
          `O bot enviará a chave Pix do boleto/luz automaticamente quando for aceito!`;

        await bot.editMessageText(text, {
          chat_id: chatId,
          message_id: statusMsg.message_id,
          parse_mode: "HTML",
          reply_markup: backToMenuKeyboard(),
        });

        // Polling to watch when a merchant accepts the order, then send the Pix key
        const checkInterval = setInterval(async () => {
          try {
            const currentSession = billSessions.get(chatId);
            if (!currentSession || currentSession.orderId !== orderId) {
              clearInterval(checkInterval);
              return;
            }

            const ordersClient = getOrdersClient();
            const orderIdBigInt = BigInt(orderId);
            const orderResult = await ordersClient.getOrder({ orderId: orderIdBigInt });

            if (orderResult.isErr()) {
              console.error("Polling error fetching bill order:", orderResult.error?.message);
              return;
            }

            const order = orderResult.value;

            if (order.status === "accepted" || (order.pubkey && order.pubkey.length > 0)) {
              clearInterval(checkInterval);

              await bot.sendMessage(
                chatId,
                `⚡ Um merchant aceitou o pagamento da sua conta <b>#${orderId}</b>!\n` +
                `Registrando dados Pix da conta na blockchain...`,
                { parse_mode: "HTML" }
              );

              // Decrypt user private key to send bill Pix key to merchant
              const userWallet = getUserWallet(chatId);
              if (!userWallet) return;

              const privateKey = decryptPrivateKey(userWallet.encryptedPrivateKey, cfg.encryptionKey);
              
              // Register the bill Pix key encrypted with merchant public key
              const setUpiResult = await ordersClient.setSellOrderUpi.execute({
                walletClient: walletClient as any,
                orderId: orderIdBigInt,
                paymentAddress: session.pixKey,
                merchantPublicKey: order.pubkey,
                updatedAmount: order.usdcAmount,
              });

              if (setUpiResult.isOk()) {
                billSessions.set(chatId, {
                  ...currentSession,
                  action: "completed"
                });
                await bot.sendMessage(
                  chatId,
                  `✅ <b>Dados de pagamento registrados na blockchain!</b>\n\n` +
                  `O merchant recebeu o Pix da sua conta de luz/energia com segurança e efetuará o pagamento.\n` +
                  `Acompanhe a conclusão com /pedidos.`,
                  { parse_mode: "HTML", reply_markup: backToMenuKeyboard() }
                );
              } else {
                console.error("Error setting bill Pix key:", setUpiResult.error);
                await bot.sendMessage(
                  chatId,
                  `❌ Erro ao enviar a chave Pix para o merchant na blockchain. Tente consultar '/pedido ${orderId}'.`,
                  { reply_markup: backToMenuKeyboard() }
                );
              }
            } else if (order.status === "cancelled") {
              clearInterval(checkInterval);
              billSessions.delete(chatId);
              await bot.sendMessage(
                chatId,
                `❌ O pagamento da ordem <b>#${orderId}</b> foi cancelado.`,
                { parse_mode: "HTML", reply_markup: backToMenuKeyboard() }
              );
            }
          } catch (err) {
            console.error("Error in bill polling:", err);
          }
        }, 10000);

        billSessions.set(chatId, {
          ...session,
          action: "awaiting_merchant",
          orderId,
          intervalId: checkInterval
        });

      } else {
        console.error("Place order failed for bill:", result.error);
        const contractErrorCode = parseContractError(result.error?.cause || result.error);
        const decodedMessage = getContractErrorMessage(contractErrorCode);
        let errorMsg = result.error?.message || "Erro desconhecido";
        if (contractErrorCode) {
          errorMsg += `\n\nCódigo: <code>${contractErrorCode}</code>\nDetalhe: <b>${decodedMessage}</b>`;
        }

        await bot.editMessageText(
          `❌ <b>Erro na ordem de pagamento:</b>\n\n<code>${errorMsg}</code>`,
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

/**
 * Common logic to parse Pix string (either from text or photo) and prompt confirmation.
 */
async function processPixString(bot: TelegramBot, chatId: number, pixString: string): Promise<void> {
  console.log(`[processPixString] Starting processing for chatId ${chatId}, string length: ${pixString.length}`);
  const loadingMsg = await bot.sendMessage(chatId, "⏳ Buscando cotação e analisando dados do Pix...");
  console.log(`[processPixString] Sent loading message. ID: ${loadingMsg.message_id}`);

  try {
    const cfg = getConfig();
    console.log("[processPixString] Fetching price config...");
    const priceResult = await fetchPriceConfig(cfg.defaultCurrency);
    console.log("[processPixString] fetchPriceConfig returned:", priceResult.isOk() ? "OK" : "ERR");
    if (priceResult.isErr()) {
      console.log("[processPixString] fetchPriceConfig error:", priceResult.error);
      await bot.editMessageText("❌ Erro ao buscar cotação de venda do protocolo.", {
        chat_id: chatId,
        message_id: loadingMsg.message_id,
      });
      return;
    }

    const sellPrice = Number(priceResult.value.sellPrice) / 1_000_000;
    console.log("[processPixString] sellPrice:", sellPrice);
    
    // Call SDK parseQR
    console.log("[processPixString] Parsing QR via SDK...");
    const parseResult = await parseQR({
      qrData: pixString,
      currency: "BRL" as any,
      sellPrice
    });
    console.log("[processPixString] parseQR returned:", parseResult.isOk() ? "OK" : "ERR");

    if (parseResult.isErr()) {
      console.log("[processPixString] parseQR error:", parseResult.error);
      await bot.editMessageText(
        `❌ <b>Erro ao interpretar QR Code Pix:</b>\n\n<code>${parseResult.error.message}</code>`,
        {
          chat_id: chatId,
          message_id: loadingMsg.message_id,
          parse_mode: "HTML",
          reply_markup: backToMenuKeyboard(),
        }
      );
      return;
    }

    const parsed = parseResult.value;
    console.log("[processPixString] parsed value:", JSON.stringify(parsed));

    if (!parsed.amount) {
      await bot.editMessageText(
        `❌ <b>Pix sem valor predefinido!</b>\n\n` +
        `Este Pix não possui um valor embutido (Pix estático). Por segurança, só aceitamos pagamento de contas com valor definido no QR Code (Pix dinâmico).`,
        {
          chat_id: chatId,
          message_id: loadingMsg.message_id,
          parse_mode: "HTML",
          reply_markup: backToMenuKeyboard(),
        }
      );
      return;
    }

    const fiatVal = parsed.amount.fiat;
    const usdcVal = parsed.amount.usdc;

    // Convert values to BigInt (6 decimals)
    const fiatAmountBigInt = BigInt(Math.round(fiatVal * 1e6));
    const usdcAmountBigInt = BigInt(Math.round(usdcVal * 1e6));

    // Save to session
    billSessions.set(chatId, {
      pixKey: parsed.paymentAddress,
      fiatAmount: fiatAmountBigInt,
      usdcAmount: usdcAmountBigInt,
      action: "confirming_bill",
    });

    const text =
      `┌──────────────────────────────┐\n` +
      `  🧾 <b>CONFIRMAR PAGAMENTO DE CONTA</b>\n` +
      `└──────────────────────────────┘\n` +
      `📦 <b>Tipo de Conta:</b> Pix Dinâmico\n` +
      `💵 <b>Valor da Conta:</b> <code>R$ ${fiatVal.toFixed(2)}</code>\n` +
      `🪙 <b>Custo Estimado:</b> <code>${usdcVal.toFixed(2)} USDC</code>\n` +
      `💹 <b>Cotação Usada:</b> <code>R$ ${sellPrice.toFixed(2)}</code>\n` +
      `🔑 <b>Chave Pix (Favorecido):</b> <code>${parsed.paymentAddress}</code>\n\n` +
      `Deseja autorizar e realizar o pagamento?`;

    await bot.deleteMessage(chatId, loadingMsg.message_id);
    await bot.sendMessage(chatId, text, {
      parse_mode: "HTML",
      reply_markup: confirmKeyboard("bill"),
    });

  } catch (error) {
    console.error("Error inside processPixString:", error);
    await bot.editMessageText(
      `❌ <b>Erro inesperado no processamento:</b>\n\n<code>${String(error)}</code>`,
      {
        chat_id: chatId,
        message_id: loadingMsg.message_id,
        parse_mode: "HTML",
        reply_markup: backToMenuKeyboard(),
      }
    );
  }
}
