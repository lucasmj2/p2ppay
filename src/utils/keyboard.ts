/**
 * Telegram Inline Keyboard builders.
 */

export interface InlineButton {
  text: string;
  callback_data: string;
}

export function mainMenuKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "💰 Comprar USDC", callback_data: "menu_buy" },
        { text: "💸 Vender USDC", callback_data: "menu_sell" },
      ],
      [
        { text: "👛 Carteira", callback_data: "menu_wallet" },
        { text: "📊 Saldo", callback_data: "menu_balance" },
      ],
      [
        { text: "💹 Cotação", callback_data: "menu_price" },
        { text: "📋 Pedidos", callback_data: "menu_orders" },
      ],
      [
        { text: "❓ Ajuda", callback_data: "menu_help" },
      ],
    ],
  };
}

export function confirmKeyboard(action: string) {
  return {
    inline_keyboard: [
      [
        { text: "✅ Confirmar", callback_data: `confirm_${action}` },
        { text: "❌ Cancelar", callback_data: "cancel_action" },
      ],
    ],
  };
}

export function backToMenuKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "🔙 Menu Principal", callback_data: "menu_main" }],
    ],
  };
}

export function walletKeyboard(hasWallet: boolean) {
  if (hasWallet) {
    return {
      inline_keyboard: [
        [
          { text: "📊 Ver Saldo", callback_data: "menu_balance" },
          { text: "📋 Ver Endereço", callback_data: "wallet_address" },
        ],
        [
          { text: "🔑 Exportar Chave", callback_data: "wallet_export" },
        ],
        [{ text: "🔙 Menu Principal", callback_data: "menu_main" }],
      ],
    };
  }
  return {
    inline_keyboard: [
      [{ text: "🆕 Criar Carteira", callback_data: "wallet_create" }],
      [{ text: "📥 Importar Chave Privada", callback_data: "wallet_import" }],
      [{ text: "🔙 Menu Principal", callback_data: "menu_main" }],
    ],
  };
}
