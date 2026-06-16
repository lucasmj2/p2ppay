/**
 * Central bot configuration and routing.
 */

import TelegramBot from "node-telegram-bot-api";
import { registerStartCommand } from "./commands/start.js";
import { registerWalletCommand, handleWalletCallbacks, showWalletMenu } from "./commands/wallet.js";
import { registerBalanceCommand, showBalance } from "./commands/balance.js";
import { registerPriceCommand, showPrice } from "./commands/price.js";
import { registerBuyCommand, handleBuyCallbacks } from "./commands/buy.js";
import { registerSellCommand, handleSellCallbacks } from "./commands/sell.js";
import { registerOrdersCommand, showOrders } from "./commands/orders.js";
import { registerCancelCommand } from "./commands/cancel.js";
import { registerHelpCommand } from "./commands/help.js";
import { registerPaidCommand } from "./commands/paid.js";
import { registerBillHandlers } from "./commands/bill.js";
import { mainMenuKeyboard, backToMenuKeyboard } from "./utils/keyboard.js";
import { getConfig } from "./sdk-client.js";
import { hasWallet } from "./utils/wallet-store.js";

export function initBot(): TelegramBot {
  const cfg = getConfig();
  
  // Initialize bot in polling mode
  const bot = new TelegramBot(cfg.telegramToken, { polling: true });

  console.log("🤖 Telegram bot initialized in polling mode.");



  // Register commands
  registerStartCommand(bot);
  registerWalletCommand(bot);
  registerBalanceCommand(bot);
  registerPriceCommand(bot);
  registerBuyCommand(bot);
  registerSellCommand(bot);
  registerOrdersCommand(bot);
  registerCancelCommand(bot);
  registerHelpCommand(bot);
  registerPaidCommand(bot);
  registerBillHandlers(bot);

  // Register callback handlers for sub-modules
  handleWalletCallbacks(bot);
  handleBuyCallbacks(bot);
  handleSellCallbacks(bot);

  // Main menu callback handler
  bot.on("callback_query", async (query) => {
    if (!query.message) return;
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const data = query.data;

    try {
      if (data === "menu_buy") {
        await bot.answerCallbackQuery(query.id);
        const walletExists = hasWallet(chatId);
        if (!walletExists) {
          await bot.sendMessage(
            chatId,
            "❌ Você precisa criar uma carteira primeiro para comprar USDC.\nUse o botão abaixo ou digite /carteira.",
            { reply_markup: backToMenuKeyboard() }
          );
        } else {
          await bot.sendMessage(
            chatId,
            "💰 <b>Comprar USDC</b>\n\nDigite <code>/comprar &lt;quantidade&gt;</code> para iniciar.\nExemplo: <code>/comprar 10</code>",
            { parse_mode: "HTML", reply_markup: backToMenuKeyboard() }
          );
        }
      } 
      
      else if (data === "menu_sell") {
        await bot.answerCallbackQuery(query.id);
        const walletExists = hasWallet(chatId);
        if (!walletExists) {
          await bot.sendMessage(
            chatId,
            "❌ Você precisa criar uma carteira primeiro para vender USDC.\nUse o botão abaixo ou digite /carteira.",
            { reply_markup: backToMenuKeyboard() }
          );
        } else {
          await bot.sendMessage(
            chatId,
            "💸 <b>Vender USDC</b>\n\nDigite <code>/vender &lt;quantidade&gt;</code> para iniciar.\nExemplo: <code>/vender 50</code>",
            { parse_mode: "HTML", reply_markup: backToMenuKeyboard() }
          );
        }
      } 
      
      else if (data === "menu_wallet") {
        await bot.answerCallbackQuery(query.id);
        await showWalletMenu(bot, chatId);
      } 
      
      else if (data === "menu_balance") {
        await bot.answerCallbackQuery(query.id);
        await showBalance(bot, chatId);
      } 
      
      else if (data === "menu_price") {
        await bot.answerCallbackQuery(query.id);
        await showPrice(bot, chatId);
      } 
      
      else if (data === "menu_orders") {
        await bot.answerCallbackQuery(query.id);
        await showOrders(bot, chatId);
      } 
      
      else if (data === "menu_help") {
        await bot.answerCallbackQuery(query.id);
        // Emulate /ajuda text
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
      } 
      
      else if (data === "menu_main") {
        await bot.answerCallbackQuery(query.id);
        const name = query.from?.first_name || "Trader";
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
      } 
      
      else if (data === "cancel_action") {
        await bot.answerCallbackQuery(query.id);
        await bot.editMessageText("❌ Ação cancelada.", {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: backToMenuKeyboard(),
        });
      }
    } catch (error) {
      console.error("Error handling callback query:", error);
    }
  });

  // Handle global errors to prevent bot crashes
  bot.on("polling_error", (error) => {
    console.error("Polling error:", error);
  });

  bot.on("error", (error) => {
    console.error("General bot error:", error);
  });

  return bot;
}
