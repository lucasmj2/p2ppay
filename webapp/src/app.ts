/**
 * app.ts - Core Mini App Logic, State, and Event Handlers
 */

import { generatePixPayload, getPixQrCodeUrl } from "./utils/pix.ts";

interface Order {
  id: string;
  type: "buy" | "sell";
  status: "pending" | "accepted" | "completed" | "cancelled";
  amountUsdc: number;
  amountFiat: number;
  date: string;
}

// Global Application State
const state = {
  userWallet: "0x3D...C9a4",
  walletBalance: 250.75, // Starting USDC balance
  buyRate: 5.20,
  sellRate: 5.18,
  orders: [] as Order[],
  pixTimerInterval: null as number | null,
  activeTab: "dashboard"
};

// Initialize Telegram WebApp SDK references
const tg = (window as any).Telegram?.WebApp;

export function initApp(): void {
  // 1. Notify Telegram that the app is ready and expand it
  if (tg) {
    tg.ready();
    tg.expand();
    // Configure Telegram MainButton
    tg.headerColor = "#0a0a0f";
    tg.backgroundColor = "#0a0a0f";
  }

  // 2. Setup user profile metadata from Telegram
  setupUserProfile();

  // 3. Register DOM Event Listeners
  setupNavigation();
  setupCalculators();
  setupSellSlider();
  setupPixValidation();
  setupActions();

  // 4. Load initial orders
  renderOrders();

  // 5. Hide Preloader with a slight delay for smooth transition
  setTimeout(() => {
    const preloader = document.getElementById("app-preloader");
    if (preloader) {
      preloader.classList.add("fade-out");
      document.body.classList.remove("loading");
    }
  }, 1000);
}

/**
 * Configure user details based on Telegram WebApp user context
 */
function setupUserProfile(): void {
  const avatarEl = document.getElementById("user-avatar");
  const nameEl = document.getElementById("user-name");
  const addressEl = document.getElementById("wallet-address");
  const sellBalanceEl = document.getElementById("sell-balance-avail");
  const balanceUsdcEl = document.getElementById("balance-usdc");
  const balanceFiatEl = document.getElementById("balance-fiat");

  // Update balances in DOM
  if (balanceUsdcEl) balanceUsdcEl.innerText = state.walletBalance.toFixed(2);
  if (balanceFiatEl) {
    const fiatValue = state.walletBalance * state.sellRate;
    balanceFiatEl.innerText = formatBrl(fiatValue);
  }
  if (sellBalanceEl) sellBalanceEl.innerText = state.walletBalance.toFixed(2);

  // Set wallet address
  if (addressEl) addressEl.innerText = state.userWallet;

  if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
    const user = tg.initDataUnsafe.user;
    const firstName = user.first_name || "Trader";
    const lastName = user.last_name || "";
    const username = user.username ? `@${user.username}` : `${firstName} ${lastName}`;
    
    if (nameEl) nameEl.innerText = username;
    if (avatarEl) {
      avatarEl.innerText = firstName.charAt(0).toUpperCase();
    }
  } else {
    // Fallback Mock data for testing in regular browsers
    if (nameEl) nameEl.innerText = "Developer Trader";
    if (avatarEl) avatarEl.innerText = "D";
  }
}

/**
 * Handle Single Page App Tab navigation
 */
function setupNavigation(): void {
  const navItems = document.querySelectorAll(".nav-item");
  const panels = document.querySelectorAll(".tab-panel");

  navItems.forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetTab = btn.getAttribute("data-tab");
      if (!targetTab) return;

      // Haptic feedback
      triggerHaptic("light");

      // Set active nav item
      navItems.forEach(item => item.classList.remove("active"));
      btn.classList.add("active");

      // Set active panel
      panels.forEach((panel) => {
        panel.classList.remove("active");
        if (panel.id === `tab-${targetTab}`) {
          panel.classList.add("active");
        }
      });

      state.activeTab = targetTab;
      
      // Additional actions per tab
      if (targetTab === "sell") {
        setupUserProfile(); // refresh balance
      }
    });
  });

  // Action links on dashboard buttons
  const actionTriggers = document.querySelectorAll(".action-trigger");
  actionTriggers.forEach((trigger) => {
    trigger.addEventListener("click", () => {
      const target = trigger.getAttribute("data-target");
      const targetNavBtn = document.querySelector(`.nav-item[data-tab="${target}"]`) as HTMLButtonElement;
      if (targetNavBtn) {
        targetNavBtn.click();
      }
    });
  });
}

/**
 * Real-time buy and sell calculators synchronization
 */
function setupCalculators(): void {
  // BUY Calculator
  const buyFiat = document.getElementById("buy-input-fiat") as HTMLInputElement;
  const buyUsdc = document.getElementById("buy-input-usdc") as HTMLInputElement;

  if (buyFiat && buyUsdc) {
    buyFiat.addEventListener("input", () => {
      const fiatVal = parseFloat(buyFiat.value);
      if (!isNaN(fiatVal) && fiatVal > 0) {
        buyUsdc.value = (fiatVal / state.buyRate).toFixed(2);
      } else {
        buyUsdc.value = "";
      }
    });

    buyUsdc.addEventListener("input", () => {
      const usdcVal = parseFloat(buyUsdc.value);
      if (!isNaN(usdcVal) && usdcVal > 0) {
        buyFiat.value = (usdcVal * state.buyRate).toFixed(2);
      } else {
        buyFiat.value = "";
      }
    });
  }

  // SELL Calculator
  const sellUsdc = document.getElementById("sell-input-usdc") as HTMLInputElement;
  const sellEstimate = document.getElementById("sell-estimate-fiat");
  const sellSlider = document.getElementById("sell-slider") as HTMLInputElement;

  if (sellUsdc) {
    sellUsdc.addEventListener("input", () => {
      const usdcVal = parseFloat(sellUsdc.value);
      validateSellForm();

      if (!isNaN(usdcVal) && usdcVal > 0) {
        if (sellEstimate) {
          sellEstimate.innerText = formatBrl(usdcVal * state.sellRate);
        }
        // Update slider position
        if (sellSlider) {
          const percentage = Math.min(100, (usdcVal / state.walletBalance) * 100);
          sellSlider.value = percentage.toString();
        }
      } else {
        if (sellEstimate) sellEstimate.innerText = "R$ 0,00";
        if (sellSlider) sellSlider.value = "0";
      }
    });
  }
}

/**
 * Handle Range Slider interaction for the Sell Flow
 */
function setupSellSlider(): void {
  const sellSlider = document.getElementById("sell-slider") as HTMLInputElement;
  const sellUsdc = document.getElementById("sell-input-usdc") as HTMLInputElement;
  const sellEstimate = document.getElementById("sell-estimate-fiat");

  if (sellSlider && sellUsdc) {
    sellSlider.addEventListener("input", () => {
      const pct = parseFloat(sellSlider.value);
      const calculatedUsdc = (pct / 100) * state.walletBalance;

      sellUsdc.value = calculatedUsdc > 0 ? calculatedUsdc.toFixed(2) : "";
      
      if (sellEstimate) {
        sellEstimate.innerText = formatBrl(calculatedUsdc * state.sellRate);
      }

      validateSellForm();
    });
  }
}

/**
 * Real-time PIX key validation
 */
function setupPixValidation(): void {
  const pixInput = document.getElementById("sell-pix-key") as HTMLInputElement;
  const validationMsg = document.getElementById("pix-validation-msg");

  if (pixInput) {
    pixInput.addEventListener("input", () => {
      const value = pixInput.value.trim();
      validateSellForm();

      if (!validationMsg) return;

      if (value.length === 0) {
        validationMsg.innerText = "";
        validationMsg.className = "validation-label";
        return;
      }

      // Very simple validation rules
      const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
      const isCpf = /^\d{11}$|^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(value);
      const isPhone = /^\+?\d{9,15}$/.test(value);
      const isRandom = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(value);

      if (isEmail || isCpf || isPhone || isRandom) {
        validationMsg.innerText = "✓ Chave PIX válida";
        validationMsg.className = "validation-label highlight-green";
      } else {
        validationMsg.innerText = "Formato de chave PIX inválido (CPF, E-mail, Celular ou Chave Aleatória)";
        validationMsg.className = "validation-label highlight-red";
      }
    });
  }
}

/**
 * Validate form inputs to enable/disable sell button
 */
function validateSellForm(): void {
  const sellUsdcInput = document.getElementById("sell-input-usdc") as HTMLInputElement;
  const pixInput = document.getElementById("sell-pix-key") as HTMLInputElement;
  const executeBtn = document.getElementById("btn-execute-sell") as HTMLButtonElement;

  if (!sellUsdcInput || !pixInput || !executeBtn) return;

  const amount = parseFloat(sellUsdcInput.value);
  const pixValue = pixInput.value.trim();

  const isAmountValid = !isNaN(amount) && amount > 0 && amount <= state.walletBalance;
  const isPixValid = pixValue.length > 3;

  executeBtn.disabled = !(isAmountValid && isPixValid);
}

/**
 * Register Click Listeners for Action buttons
 */
function setupActions(): void {
  // Copy Wallet Address button
  const copyAddressBtn = document.getElementById("btn-copy-address");
  if (copyAddressBtn) {
    copyAddressBtn.addEventListener("click", () => {
      copyToClipboard(state.userWallet, copyAddressBtn);
    });
  }

  // Copy PIX Copia e Cola key
  const copyPixBtn = document.getElementById("btn-copy-pix");
  const pixKeyInput = document.getElementById("pix-copy-paste-key") as HTMLInputElement;
  if (copyPixBtn && pixKeyInput) {
    copyPixBtn.addEventListener("click", () => {
      copyToClipboard(pixKeyInput.value, copyPixBtn);
    });
  }

  // Proceed Buy flow (Inputs -> PIX simulation)
  const nextBuyBtn = document.getElementById("btn-next-buy");
  const buyStepInput = document.getElementById("buy-step-input");
  const buyStepPix = document.getElementById("buy-step-pix");

  if (nextBuyBtn && buyStepInput && buyStepPix) {
    nextBuyBtn.addEventListener("click", () => {
      const buyFiat = document.getElementById("buy-input-fiat") as HTMLInputElement;
      const amount = parseFloat(buyFiat.value);

      if (isNaN(amount) || amount < 10) {
        triggerHaptic("error");
        alert("O valor mínimo para compra é R$ 10,00.");
        return;
      }

      triggerHaptic("success");

      // Gerar Pix real dinamicamente com base no valor digitado
      const pixPayload = generatePixPayload({
        key: "pix-mock-merchant@p2p.me",
        amount,
        name: "P2P ME MERCHANT",
        city: "SAO PAULO",
        txId: `P2PMETEST${Math.floor(1000 + Math.random() * 9000)}`
      });

      const qrCodeUrl = getPixQrCodeUrl(pixPayload);

      // Exibir QR Code e atualizar chave Copia e Cola
      const qrImage = document.getElementById("pix-qr-image") as HTMLImageElement;
      const qrPlaceholder = document.getElementById("pix-qr-svg-placeholder");
      const pixCopyPasteInput = document.getElementById("pix-copy-paste-key") as HTMLInputElement;

      if (qrImage) {
        qrImage.src = qrCodeUrl;
        qrImage.style.display = "block";
      }
      if (qrPlaceholder) {
        qrPlaceholder.style.display = "none";
      }
      if (pixCopyPasteInput) {
        pixCopyPasteInput.value = pixPayload;
      }

      buyStepInput.classList.remove("active");
      buyStepPix.classList.add("active");
      startPixTimer();

      // Trigger a simulated blockchain confirmation after 12 seconds
      simulateBuySuccess(amount);
    });
  }

  // Cancel Buy order flow
  const cancelBuyBtn = document.getElementById("btn-cancel-buy");
  if (cancelBuyBtn && buyStepInput && buyStepPix) {
    cancelBuyBtn.addEventListener("click", () => {
      triggerHaptic("warning");
      stopPixTimer();

      // Reset QR Code display
      const qrImage = document.getElementById("pix-qr-image") as HTMLImageElement;
      const qrPlaceholder = document.getElementById("pix-qr-svg-placeholder");
      if (qrImage) qrImage.style.display = "none";
      if (qrPlaceholder) qrPlaceholder.style.display = "block";

      buyStepPix.classList.remove("active");
      buyStepInput.classList.add("active");
    });
  }

  // Execute Sell flow
  const executeSellBtn = document.getElementById("btn-execute-sell");
  if (executeSellBtn) {
    executeSellBtn.addEventListener("click", () => {
      const sellUsdcInput = document.getElementById("sell-input-usdc") as HTMLInputElement;
      const usdcVal = parseFloat(sellUsdcInput.value);

      if (isNaN(usdcVal) || usdcVal > state.walletBalance) {
        triggerHaptic("error");
        return;
      }

      triggerHaptic("success");
      
      // Update balance
      state.walletBalance -= usdcVal;
      
      // Create new Order
      const newOrder: Order = {
        id: Math.floor(1000 + Math.random() * 9000).toString(),
        type: "sell",
        status: "pending",
        amountUsdc: usdcVal,
        amountFiat: usdcVal * state.sellRate,
        date: new Date().toLocaleDateString("pt-BR")
      };

      state.orders.unshift(newOrder);
      renderOrders();

      // Clear input fields
      sellUsdcInput.value = "";
      const pixInput = document.getElementById("sell-pix-key") as HTMLInputElement;
      if (pixInput) pixInput.value = "";
      validateSellForm();

      alert(`Ordem de venda #${newOrder.id} enviada para a blockchain com sucesso! Acompanhe o PIX.`);
      
      // Go to orders tab
      const ordersTabBtn = document.querySelector('.nav-item[data-tab="orders"]') as HTMLButtonElement;
      if (ordersTabBtn) ordersTabBtn.click();

      // Simulate completion in 20 seconds
      setTimeout(() => {
        newOrder.status = "completed";
        // mock return funds if testnet, here we just show complete
        renderOrders();
      }, 20_000);
    });
  }
}

/**
 * Helper to copy values to clipboard with Telegram Haptic feedback
 */
function copyToClipboard(text: string, element: HTMLElement): void {
  navigator.clipboard.writeText(text).then(() => {
    triggerHaptic("success");
    const originalContent = element.innerHTML;
    element.innerText = "Copiado!";
    setTimeout(() => {
      element.innerHTML = originalContent;
    }, 2000);
  }).catch(() => {
    triggerHaptic("error");
  });
}

/**
 * Start 15-minute PIX countdown timer
 */
function startPixTimer(): void {
  stopPixTimer();
  const timerEl = document.getElementById("pix-countdown");
  let timeLeft = 15 * 60; // 15 minutes

  state.pixTimerInterval = setInterval(() => {
    if (timeLeft <= 0) {
      stopPixTimer();
      alert("Tempo limite para PIX expirado.");
      const cancelBuyBtn = document.getElementById("btn-cancel-buy");
      if (cancelBuyBtn) cancelBuyBtn.click();
      return;
    }

    timeLeft--;
    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    
    if (timerEl) {
      timerEl.innerText = `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
    }
  }, 1000) as any;
}

function stopPixTimer(): void {
  if (state.pixTimerInterval) {
    clearInterval(state.pixTimerInterval);
    state.pixTimerInterval = null;
  }
}

/**
 * Simulate Buy Success on Merchant release
 */
function simulateBuySuccess(fiatAmount: number): void {
  const usdcAmount = fiatAmount / state.buyRate;

  setTimeout(() => {
    if (state.activeTab !== "buy") return; // user cancelled or navigated away

    stopPixTimer();
    triggerHaptic("success");

    // Add balance
    state.walletBalance += usdcAmount;
    setupUserProfile();

    // Create Order
    const newOrder: Order = {
      id: Math.floor(1000 + Math.random() * 9000).toString(),
      type: "buy",
      status: "completed",
      amountUsdc: usdcAmount,
      amountFiat: fiatAmount,
      date: new Date().toLocaleDateString("pt-BR")
    };
    state.orders.unshift(newOrder);
    renderOrders();

    // Go back to input screen
    const buyStepInput = document.getElementById("buy-step-input");
    const buyStepPix = document.getElementById("buy-step-pix");
    if (buyStepInput && buyStepPix) {
      buyStepPix.classList.remove("active");
      buyStepInput.classList.add("active");
    }

    // Reset fields
    const buyFiat = document.getElementById("buy-input-fiat") as HTMLInputElement;
    const buyUsdc = document.getElementById("buy-input-usdc") as HTMLInputElement;
    if (buyFiat) buyFiat.value = "";
    if (buyUsdc) buyUsdc.value = "";

    alert(`Pagamento PIX recebido e confirmado! ${usdcAmount.toFixed(2)} USDC depositados em sua carteira.`);

    // Switch to dashboard
    const dashTabBtn = document.querySelector('.nav-item[data-tab="dashboard"]') as HTMLButtonElement;
    if (dashTabBtn) dashTabBtn.click();
  }, 12_000);
}

/**
 * Populate Orders List in DOM
 */
function renderOrders(): void {
  const container = document.getElementById("orders-list-container");
  if (!container) return;

  if (state.orders.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📋</div>
        <h3>Nenhum pedido ativo</h3>
        <p>Suas operações de compra e venda aparecerão aqui.</p>
      </div>
    `;
    return;
  }

  let html = "";
  state.orders.forEach((order) => {
    const statusLabel = {
      pending: "Aguardando PIX",
      accepted: "Aceito",
      completed: "Concluído",
      cancelled: "Cancelado"
    }[order.status];

    html += `
      <div class="order-item">
        <div class="order-item-header">
          <span class="order-type-tag ${order.type}">
            ${order.type === "buy" ? "💰 Compra" : "💸 Venda"}
          </span>
          <span class="order-status-tag ${order.status}">${statusLabel}</span>
        </div>
        <div class="order-item-body">
          <span class="amount-usdc">${order.amountUsdc.toFixed(2)} USDC</span>
          <span class="amount-fiat">${formatBrl(order.amountFiat)}</span>
        </div>
        <div class="order-item-footer">
          <span>ID: #${order.id}</span>
          <span>${order.date}</span>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

/**
 * Trigger Haptic Feedback on Telegram mobile devices
 */
function triggerHaptic(style: "light" | "medium" | "heavy" | "success" | "warning" | "error"): void {
  if (!tg) return;

  try {
    const feedback = tg.HapticFeedback;
    if (!feedback) return;

    if (style === "success" || style === "warning" || style === "error") {
      feedback.notificationOccurred(style);
    } else {
      feedback.impactOccurred(style);
    }
  } catch (e) {
    console.warn("Haptic feedback error:", e);
  }
}

/**
 * Format BRL helper
 */
function formatBrl(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}
