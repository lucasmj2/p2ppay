/**
 * /carteira command — Create, view, or import wallet.
 */

import type TelegramBot from "node-telegram-bot-api";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { walletKeyboard, backToMenuKeyboard } from "../utils/keyboard.js";
import { getUserWallet, saveUserWallet, hasWallet, encryptPrivateKey, decryptPrivateKey } from "../utils/wallet-store.js";
import { shortenAddress, addressLink } from "../utils/formatter.js";
import { getConfig } from "../sdk-client.js";

// Track users awaiting private key import
const awaitingImport = new Set<number>();

export function registerWalletCommand(bot: TelegramBot): void {
  // /carteira command
  bot.onText(/\/carteira/, async (msg) => {
    const chatId = msg.chat.id;
    await showWalletMenu(bot, chatId);
  });

  // Handle text messages for private key import
  bot.on("message", async (msg) => {
    const chatId = msg.chat.id;
    if (!awaitingImport.has(chatId) || !msg.text) return;
    if (msg.text.startsWith("/")) return; // ignore commands

    awaitingImport.delete(chatId);

    const privateKey = msg.text.trim();

    // Delete the message containing the private key for security
    try {
      await bot.deleteMessage(chatId, msg.message_id);
    } catch {
      // May fail if bot doesn't have delete permission
    }

    if (!privateKey.startsWith("0x") || privateKey.length !== 66) {
      await bot.sendMessage(
        chatId,
        "❌ Chave privada inválida. Deve começar com 0x e ter 66 caracteres.\n\nTente novamente com /carteira",
        { reply_markup: backToMenuKeyboard() }
      );
      return;
    }

    try {
      const account = privateKeyToAccount(privateKey as `0x${string}`);
      const cfg = getConfig();
      const encrypted = encryptPrivateKey(privateKey, cfg.encryptionKey);

      saveUserWallet({
        chatId,
        address: account.address,
        encryptedPrivateKey: encrypted,
        createdAt: new Date().toISOString(),
      });

      await bot.sendMessage(
        chatId,
        `✅ <b>Carteira importada com sucesso!</b>\n\n` +
        `📍 Endereço: <code>${account.address}</code>\n\n` +
        `⚠️ Sua chave privada foi criptografada e armazenada com segurança.`,
        { parse_mode: "HTML", reply_markup: backToMenuKeyboard() }
      );
    } catch {
      await bot.sendMessage(
        chatId,
        "❌ Chave privada inválida. Verifique e tente novamente com /carteira",
        { reply_markup: backToMenuKeyboard() }
      );
    }
  });
}

export async function showWalletMenu(bot: TelegramBot, chatId: number): Promise<void> {
  const wallet = getUserWallet(chatId);

  if (wallet) {
    const text =
      `👛 <b>Sua Carteira</b>\n\n` +
      `📍 Endereço: <code>${wallet.address}</code>\n` +
      `📅 Criada em: ${new Date(wallet.createdAt).toLocaleDateString("pt-BR")}\n\n` +
      `Para receber USDC, envie para o endereço acima na rede <b>Base</b>.`;

    await bot.sendMessage(chatId, text, {
      parse_mode: "HTML",
      reply_markup: walletKeyboard(true),
    });
  } else {
    const text =
      `👛 <b>Carteira</b>\n\n` +
      `Você ainda não tem uma carteira configurada.\n` +
      `Escolha uma opção abaixo:`;

    await bot.sendMessage(chatId, text, {
      parse_mode: "HTML",
      reply_markup: walletKeyboard(false),
    });
  }
}

export function handleWalletCallbacks(bot: TelegramBot): void {
  // Create new wallet
  bot.on("callback_query", async (query) => {
    if (query.data !== "wallet_create" || !query.message) return;
    const chatId = query.message.chat.id;
    await bot.answerCallbackQuery(query.id);

    if (hasWallet(chatId)) {
      await bot.sendMessage(chatId, "⚠️ Você já tem uma carteira!", {
        reply_markup: backToMenuKeyboard(),
      });
      return;
    }

    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);
    const cfg = getConfig();
    const encrypted = encryptPrivateKey(privateKey, cfg.encryptionKey);

    saveUserWallet({
      chatId,
      address: account.address,
      encryptedPrivateKey: encrypted,
      createdAt: new Date().toISOString(),
    });

    const text =
      `✅ <b>Carteira criada com sucesso!</b>\n\n` +
      `📍 Endereço: <code>${account.address}</code>\n\n` +
      `⚠️ <b>IMPORTANTE:</b> Guarde sua chave privada em um local seguro!\n` +
      `Use o botão "Exportar Chave" para ver sua chave privada.\n\n` +
      `Para começar a operar, deposite USDC (rede Base) no endereço acima.`;

    await bot.sendMessage(chatId, text, {
      parse_mode: "HTML",
      reply_markup: walletKeyboard(true),
    });
  });

  // Import wallet
  bot.on("callback_query", async (query) => {
    if (query.data !== "wallet_import" || !query.message) return;
    const chatId = query.message.chat.id;
    await bot.answerCallbackQuery(query.id);

    if (hasWallet(chatId)) {
      await bot.sendMessage(chatId, "⚠️ Você já tem uma carteira!", {
        reply_markup: backToMenuKeyboard(),
      });
      return;
    }

    awaitingImport.add(chatId);
    await bot.sendMessage(
      chatId,
      `📥 <b>Importar Carteira</b>\n\n` +
      `Envie sua chave privada (será deletada da conversa automaticamente).\n\n` +
      `Formato: <code>0x...</code> (66 caracteres)`,
      { parse_mode: "HTML" }
    );
  });

  // Export private key
  bot.on("callback_query", async (query) => {
    if (query.data !== "wallet_export" || !query.message) return;
    const chatId = query.message.chat.id;
    await bot.answerCallbackQuery(query.id);

    const wallet = getUserWallet(chatId);
    if (!wallet) {
      await bot.sendMessage(chatId, "❌ Nenhuma carteira encontrada.");
      return;
    }

    try {
      const cfg = getConfig();
      const privateKey = decryptPrivateKey(wallet.encryptedPrivateKey, cfg.encryptionKey);

      const msg = await bot.sendMessage(
        chatId,
        `🔑 <b>Sua Chave Privada:</b>\n\n` +
        `<tg-spoiler>${privateKey}</tg-spoiler>\n\n` +
        `⚠️ <b>NUNCA compartilhe esta chave!</b>\n` +
        `Esta mensagem será deletada em 30 segundos.`,
        { parse_mode: "HTML" }
      );

      // Auto-delete after 30 seconds
      setTimeout(async () => {
        try {
          await bot.deleteMessage(chatId, msg.message_id);
        } catch {
          // ignore
        }
      }, 30_000);
    } catch {
      await bot.sendMessage(chatId, "❌ Erro ao descriptografar a chave.");
    }
  });

  // Show address
  bot.on("callback_query", async (query) => {
    if (query.data !== "wallet_address" || !query.message) return;
    const chatId = query.message.chat.id;
    await bot.answerCallbackQuery(query.id);

    const wallet = getUserWallet(chatId);
    if (!wallet) {
      await bot.sendMessage(chatId, "❌ Nenhuma carteira encontrada.");
      return;
    }

    await bot.sendMessage(
      chatId,
      `📍 <b>Seu Endereço:</b>\n\n` +
      `<code>${wallet.address}</code>\n\n` +
      `Rede: <b>Base (L2)</b>\n` +
      `Envie USDC para este endereço para depositar.`,
      { parse_mode: "HTML", reply_markup: backToMenuKeyboard() }
    );
  });
}
