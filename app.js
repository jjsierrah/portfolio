// --- IndexedDB ---
const db = new Dexie('JJPortfolioDB');
db.version(2).stores({
  transactions: '++id, symbol, assetType, quantity, buyPrice, buyDate, currentPrice',
  dividends: '++id, symbol, amount, perShare, date'
});

function today() {
  const d = new Date();
  return d.toISOString().split('T')[0];
}

function formatCurrency(value) {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function formatPercent(value) {
  return new Intl.NumberFormat('es-ES', {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

// --- APIs ---
async function fetchStockPrice(symbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const quote = data.quoteResponse?.result?.[0];
    return quote?.regularMarketPrice || null;
  } catch {
    return null;
  }
}

async function fetchCryptoPrice(symbol) {
  const cryptoMap = {
    'BTC': 'bitcoin', 'ETH': 'ethereum', 'SOL': 'solana', 'ADA': 'cardano',
    'DOT': 'polkadot', 'LINK': 'chainlink', 'XRP': 'ripple', 'MATIC': 'polygon',
    'DOGE': 'dogecoin', 'SHIB': 'shiba-inu', 'AVAX': 'avalanche-2'
  };
  const id = cryptoMap[symbol.toUpperCase()];
  if (!id) return null;

  try {
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=eur`);
    if (!res.ok) return null;
    const data = await res.json();
    return data[id]?.eur || null;
  } catch {
    return null;
  }
}

// --- Render principal ---
async function renderPortfolioSummary() {
  const transactions = await db.transactions.toArray();
  if (transactions.length === 0) {
    document.getElementById('summary-totals').innerHTML = '<p>No hay transacciones. Añade una desde el menú.</p>';
    document.getElementById('summary-by-type').innerHTML = '';
    return;
  }

  // Agrupar por símbolo y tipo
  const assets = {};
  let totalCost = 0;
  let totalValue = 0;

  for (const t of transactions) {
    const key = t.symbol;
    if (!assets[key]) {
      assets[key] = {
        symbol: t.symbol,
        assetType: t.assetType,
        totalQuantity: 0,
        totalCost: 0,
        currentValue: 0
      };
    }
    assets[key].totalQuantity += t.quantity;
    const cost = t.quantity * t.buyPrice;
    assets[key].totalCost += cost;
    const currentPrice = t.currentPrice || t.buyPrice;
    assets[key].currentValue += t.quantity * currentPrice;
    totalCost += cost;
    totalValue += t.quantity * currentPrice;
  }

  const totalGain = totalValue - totalCost;
  const totalGainPct = totalCost > 0 ? totalGain / totalCost : 0;

  // Totales
  const totalsHtml = `
    <div class="summary-card">
      <div><strong>Total invertido:</strong> ${formatCurrency(totalCost)}</div>
      <div><strong>Valor actual:</strong> ${formatCurrency(totalValue)}</div>
      <div><strong>Ganancia:</strong> 
        <span style="color:${totalGain >= 0 ? 'green' : 'red'}">
          ${totalGain >= 0 ? '+' : ''}${formatCurrency(totalGain)} (${formatPercent(totalGainPct)})
        </span>
      </div>
    </div>
  `;
  document.getElementById('summary-totals').innerHTML = totalsHtml;

  // Por tipo
  const groups = { stock: [], etf: [], crypto: [] };
  Object.values(assets).forEach(asset => {
    groups[asset.assetType].push(asset);
  });

  let groupsHtml = '';
  for (const [type, list] of Object.entries(groups)) {
    if (list.length === 0) continue;
    const typeName = { stock: 'Acciones', etf: 'ETFs', crypto: 'Criptomonedas' }[type];
    groupsHtml += `<div class="group-title">${typeName}</div>`;
    for (const a of list) {
      const gain = a.currentValue - a.totalCost;
      const gainPct = a.totalCost > 0 ? gain / a.totalCost : 0;
      groupsHtml += `
        <div class="asset-item">
          <strong>${a.symbol}</strong>: ${a.totalQuantity} unidades | 
          Invertido: ${formatCurrency(a.totalCost)} | 
          Actual: ${formatCurrency(a.currentValue)} | 
          Ganancia: <span style="color:${gain >= 0 ? 'green' : 'red'}">
            ${gain >= 0 ? '+' : ''}${formatCurrency(gain)} (${formatPercent(gainPct)})
          </span>
        </div>
      `;
    }
  }
  document.getElementById('summary-by-type').innerHTML = groupsHtml;
}

// --- Modales ---
function openModal(title, content) {
  document.getElementById('modalContent').innerHTML = `
    <div class="modal-header">
      <h3>${title}</h3>
      <button class="close-modal">&times;</button>
    </div>
    ${content}
  `;
  document.getElementById('modalOverlay').style.display = 'flex';

  document.querySelector('.close-modal').onclick = closeModal;
  document.getElementById('modalOverlay').onclick = (e) => {
    if (e.target === document.getElementById('modalOverlay')) closeModal();
  };
}

function closeModal() {
  document.getElementById('modalOverlay').style.display = 'none';
}

// --- Formulario: Añadir Transacción ---
function showAddTransactionForm() {
  const form = `
    <div class="form-group">
      <label>Tipo de activo:</label>
      <select id="assetType">
        <option value="stock">Acción</option>
        <option value="etf">ETF</option>
        <option value="crypto">Criptomoneda</option>
      </select>
    </div>
    <div class="form-group">
      <label>Símbolo (ej: AAPL, BTC):</label>
      <input type="text" id="symbol" placeholder="AAPL, BTC..." required />
    </div>
    <div class="form-group">
      <label>Cantidad:</label>
      <input type="number" id="quantity" step="any" min="0" required />
    </div>
    <div class="form-group">
      <label>Precio de compra (€):</label>
      <input type="number" id="buyPrice" step="any" min="0" required />
    </div>
    <div class="form-group">
      <label>Fecha de compra:</label>
      <input type="date" id="buyDate" value="${today()}" required />
    </div>
    <button id="btnSaveTransaction">Añadir Transacción</button>
  `;
  openModal('Añadir Transacción', form);

  document.getElementById('btnSaveTransaction').onclick = async () => {
    const symbol = document.getElementById('symbol').value.trim().toUpperCase();
    const assetType = document.getElementById('assetType').value;
    const quantity = parseFloat(document.getElementById('quantity').value);
    const buyPrice = parseFloat(document.getElementById('buyPrice').value);
    const buyDate = document.getElementById('buyDate').value;

    if (!symbol || isNaN(quantity) || isNaN(buyPrice)) {
      alert('Completa todos los campos correctamente.');
      return;
    }

    await db.transactions.add({
      symbol, assetType, quantity, buyPrice, buyDate,
      currentPrice: buyPrice,
      createdAt: new Date().toISOString()
    });

    closeModal();
    renderPortfolioSummary();
  };
}

// --- Ver Transacciones ---
async function showTransactionsList() {
  const transactions = await db.transactions.toArray();
  if (transactions.length === 0) {
    openModal('Transacciones', '<p>No hay transacciones.</p>');
    return;
  }

  let html = '<h3>Todas las transacciones</h3>';
  for (const t of transactions) {
    const currentPrice = t.currentPrice || t.buyPrice;
    const currentValue = t.quantity * currentPrice;
    const cost = t.quantity * t.buyPrice;
    const gain = currentValue - cost;
    const gainPct = cost > 0 ? ((gain / cost) * 100).toFixed(2) : '0.00';

    html += `
      <div class="asset-item">
        <strong>${t.symbol}</strong> (${t.assetType})<br>
        ${t.quantity} @ ${formatCurrency(t.buyPrice)} (compra: ${t.buyDate})<br>
        Actual: ${formatCurrency(currentPrice)} → Valor: ${formatCurrency(currentValue)}<br>
        Ganancia: <span style="color:${gain >= 0 ? 'green' : 'red'}">
          ${gain >= 0 ? '+' : ''}${formatCurrency(gain)} (${gainPct}%)
        </span>
      </div>
    `;
  }
  openModal('Transacciones', html);
}

// --- Añadir Dividendo ---
async function showAddDividendForm() {
  const symbols = await db.transactions.orderBy('symbol').uniqueKeys();
  if (symbols.length === 0) {
    alert('Primero debes añadir al menos una transacción.');
    return;
  }

  const options = symbols.map(s => `<option value="${s}">${s}</option>`).join('');
  const form = `
    <div class="form-group">
      <label>Símbolo:</label>
      <select id="divSymbol">
        ${options}
      </select>
    </div>
    <div class="form-group">
      <label>Cantidad de títulos:</label>
      <input type="number" id="divQuantity" readonly />
    </div>
    <div class="form-group">
      <label>Dividendo por acción (€):</label>
      <input type="number" id="divPerShare" step="any" min="0" placeholder="0.25" />
    </div>
    <div class="form-group">
      <label>Importe total (€):</label>
      <input type="text" id="divTotal" readonly />
    </div>
    <div class="form-group">
      <label>Fecha:</label>
      <input type="date" id="divDate" value="${today()}" />
    </div>
    <button id="btnSaveDividend">Añadir Dividendo</button>
  `;
  openModal('Añadir Dividendo', form);

  const symbolSelect = document.getElementById('divSymbol');
  const quantityInput = document.getElementById('divQuantity');
  const perShareInput = document.getElementById('divPerShare');
  const totalInput = document.getElementById('divTotal');

  async function updateQuantity() {
    const symbol = symbolSelect.value;
    const txs = await db.transactions.where('symbol').equals(symbol).toArray();
    const totalQty = txs.reduce((sum, t) => sum + t.quantity, 0);
    quantityInput.value = totalQty;
    updateTotal();
  }

  function updateTotal() {
    const qty = parseFloat(quantityInput.value) || 0;
    const perShare = parseFloat(perShareInput.value) || 0;
    totalInput.value = formatCurrency(qty * perShare);
  }

  symbolSelect.onchange = updateQuantity;
  perShareInput.oninput = updateTotal;
  await updateQuantity(); // inicial

  document.getElementById('btnSaveDividend').onclick = async () => {
    const symbol = symbolSelect.value;
    const quantity = parseFloat(quantityInput.value);
    const perShare = parseFloat(perShareInput.value);
    const total = quantity * perShare;
    const date = document.getElementById('divDate').value;

    if (isNaN(perShare) || perShare <= 0) {
      alert('Introduce un dividendo por acción válido.');
      return;
    }

    await db.dividends.add({ symbol, amount: total, perShare, date });
    closeModal();
  };
}

// --- Ver Dividendos ---
async function showDividendsList() {
  const divs = await db.dividends.reverse().toArray();
  if (divs.length === 0) {
    openModal('Dividendos', '<p>No hay dividendos registrados.</p>');
    return;
  }

  let html = '<h3>Dividendos recibidos</h3>';
  let totalDiv = 0;
  for (const d of divs) {
    totalDiv += d.amount;
    html += `
      <div class="asset-item">
        <strong>${d.symbol}</strong>: ${formatCurrency(d.amount)} 
        (${formatCurrency(d.perShare)} por acción) el ${d.date}
      </div>
    `;
  }
  html += `<div class="summary-card"><strong>Total dividendos:</strong> ${formatCurrency(totalDiv)}</div>`;
  openModal('Dividendos', html);
}

// --- Actualizar precios (accesible desde menú en el futuro o botón en resumen) ---
async function refreshPrices() {
  const transactions = await db.transactions.toArray();
  let updated = 0;
  for (const t of transactions) {
    let price = null;
    if (t.assetType === 'crypto') {
      price = await fetchCryptoPrice(t.symbol);
    } else {
      price = await fetchStockPrice(t.symbol);
    }
    if (price !== null) {
      await db.transactions.update(t.id, { currentPrice: price });
      updated++;
    }
  }
  renderPortfolioSummary();
  alert(`Precios actualizados: ${updated}/${transactions.length}`);
}

// --- Menú principal ---
document.getElementById('mainMenu').onchange = function () {
  const action = this.value;
  this.selectedIndex = 0; // reset

  switch (action) {
    case 'add-transaction': showAddTransactionForm(); break;
    case 'view-transactions': showTransactionsList(); break;
    case 'add-dividend': showAddDividendForm(); break;
    case 'view-dividends': showDividendsList(); break;
  }
};

// --- Inicializar ---
renderPortfolioSummary();

// Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js');
  });
}
