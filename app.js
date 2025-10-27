// --- IndexedDB con Dexie ---
const db = new Dexie('JJPortfolioDB');
db.version(2).stores({
  transactions: '++id, symbol, assetType, quantity, buyPrice, buyDate, currentPrice',
  dividends: '++id, symbol, amount, date'
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

// --- APIs públicas (sin clave) ---
async function fetchStockPrice(symbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const quote = data.quoteResponse?.result?.[0];
    return quote?.regularMarketPrice || null;
  } catch (e) {
    return null;
  }
}

async function fetchCryptoPrice(symbol) {
  const cryptoMap = {
    'BTC': 'bitcoin', 'ETH': 'ethereum', 'SOL': 'solana', 'ADA': 'cardano',
    'DOT': 'polkadot', 'LINK': 'chainlink', 'XRP': 'ripple', 'MATIC': 'polygon'
  };
  const id = cryptoMap[symbol.toUpperCase()];
  if (!id) return null;

  try {
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=eur`);
    if (!res.ok) return null;
    const data = await res.json();
    return data[id]?.eur || null;
  } catch (e) {
    return null;
  }
}

// --- Render ---
async function renderTransactions() {
  const list = document.getElementById('transactionsList');
  const transactions = await db.transactions.toArray();
  if (transactions.length === 0) {
    list.innerHTML = '<p>No hay transacciones registradas.</p>';
    return;
  }

  let html = '';
  for (const t of transactions) {
    const currentPrice = t.currentPrice || t.buyPrice;
    const currentValue = t.quantity * currentPrice;
    const cost = t.quantity * t.buyPrice;
    const gain = currentValue - cost;
    const gainPct = cost > 0 ? ((gain / cost) * 100).toFixed(2) : '0.00';

    // ¿El precio actual es el mismo que el de compra? → probablemente no se actualizó
    const needsManualUpdate = !t.currentPrice || t.currentPrice === t.buyPrice;

    html += `
      <div class="transaction-item">
        <div>
          <strong>${t.symbol}</strong> (${t.assetType})<br>
          Cantidad: ${t.quantity} | Compra: ${formatCurrency(t.buyPrice)}<br>
          Actual: ${formatCurrency(currentPrice)} | Valor: ${formatCurrency(currentValue)}<br>
          Ganancia: <span style="color:${gain >= 0 ? 'green' : 'red'}">
            ${gain >= 0 ? '+' : ''}${formatCurrency(gain)} (${gainPct}%)
          </span>
        </div>
        <div class="actions">
          ${needsManualUpdate ? `<button class="manual-update-btn" data-id="${t.id}">Actualizar manualmente</button>` : ''}
          <button class="edit-btn" data-id="${t.id}">Editar</button>
          <button class="delete-btn" data-id="${t.id}">Eliminar</button>
        </div>
      </div>
    `;
  }
  list.innerHTML = html;
}

async function renderDividends() {
  const list = document.getElementById('dividendsList');
  const divs = await db.dividends.reverse().toArray();
  if (divs.length === 0) {
    list.innerHTML = '<p>No hay dividendos registrados.</p>';
    return;
  }

  let html = '';
  for (const d of divs) {
    html += `
      <div class="dividend-item">
        <div>
          <strong>${d.symbol}</strong> – ${formatCurrency(d.amount)} el ${d.date}
        </div>
        <div class="actions">
          <button class="delete-btn dividend-delete" data-id="${d.id}">Eliminar</button>
        </div>
      </div>
    `;
  }
  list.innerHTML = html;
}

// --- Actualizar precios (automático) ---
async function refreshPrices() {
  const transactions = await db.transactions.toArray();
  if (transactions.length === 0) {
    alert('No hay transacciones para actualizar.');
    return;
  }

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
  await renderTransactions();
  alert(`Precios actualizados: ${updated}/${transactions.length} activos.\n\n💡 Para acciones europeas (BBVA, SAN...), usa el ticker completo (ej. BBVA.MC) al crear la transacción.`);
}

// --- Actualización manual ---
async function manualUpdatePrice(id) {
  const tx = await db.transactions.get(id);
  if (!tx) return;

  const newPriceStr = prompt(`Introduce el precio actual de ${tx.symbol} (€):`, tx.currentPrice || tx.buyPrice);
  if (newPriceStr === null) return; // cancelado

  const newPrice = parseFloat(newPriceStr.replace(',', '.'));
  if (isNaN(newPrice) || newPrice <= 0) {
    alert('Por favor, introduce un número válido mayor que 0.');
    return;
  }

  await db.transactions.update(id, { currentPrice: newPrice });
  renderTransactions();
}

// --- Edición completa ---
async function editTransaction(id) {
  const tx = await db.transactions.get(id);
  if (!tx) return;

  const newSymbol = prompt('Símbolo:', tx.symbol);
  if (newSymbol === null) return;

  const newQuantity = prompt('Cantidad:', tx.quantity);
  if (newQuantity === null) return;

  const newBuyPrice = prompt('Precio de compra (€):', tx.buyPrice);
  if (newBuyPrice === null) return;

  const newCurrentPrice = prompt('Precio actual (€):', tx.currentPrice || tx.buyPrice);
  if (newCurrentPrice === null) return;

  const newDate = prompt('Fecha de compra (AAAA-MM-DD):', tx.buyDate);
  if (newDate === null) return;

  if (isNaN(newQuantity) || isNaN(newBuyPrice) || isNaN(newCurrentPrice)) {
    alert('Valores numéricos inválidos.');
    return;
  }

  await db.transactions.update(id, {
    symbol: newSymbol.trim().toUpperCase(),
    quantity: parseFloat(newQuantity),
    buyPrice: parseFloat(newBuyPrice),
    currentPrice: parseFloat(newCurrentPrice),
    buyDate: newDate
  });

  renderTransactions();
}

// --- Añadir transacción ---
document.getElementById('btnAddTransaction').addEventListener('click', async () => {
  const symbol = document.getElementById('symbol').value.trim().toUpperCase();
  const assetType = document.getElementById('assetType').value;
  const quantity = parseFloat(document.getElementById('quantity').value);
  const buyPrice = parseFloat(document.getElementById('buyPrice').value);
  const buyDate = document.getElementById('buyDate').value;

  if (!symbol || isNaN(quantity) || isNaN(buyPrice) || !buyDate) {
    alert('Completa todos los campos.');
    return;
  }

  await db.transactions.add({
    symbol, assetType, quantity, buyPrice, buyDate,
    currentPrice: buyPrice,
    createdAt: new Date().toISOString()
  });

  renderTransactions();
  document.getElementById('symbol').value = '';
  document.getElementById('quantity').value = '';
  document.getElementById('buyPrice').value = '';
  document.getElementById('buyDate').value = today();
});

// --- Dividendos ---
document.getElementById('btnAddDividend').addEventListener('click', async () => {
  const symbol = document.getElementById('divSymbol').value.trim().toUpperCase();
  const amount = parseFloat(document.getElementById('divAmount').value);
  const date = document.getElementById('divDate').value;

  if (!symbol || isNaN(amount) || !date) {
    alert('Completa todos los campos.');
    return;
  }

  await db.dividends.add({ symbol, amount, date });
  renderDividends();

  document.getElementById('divSymbol').value = '';
  document.getElementById('divAmount').value = '';
  document.getElementById('divDate').value = today();
});

document.getElementById('btnRefreshPrices').addEventListener('click', refreshPrices);

// --- Eventos delegados ---
document.addEventListener('click', async (e) => {
  const id = parseInt(e.target.dataset.id);

  if (e.target.classList.contains('delete-btn')) {
    if (e.target.classList.contains('dividend-delete')) {
      await db.dividends.delete(id);
      renderDividends();
    } else {
      await db.transactions.delete(id);
      renderTransactions();
    }
  }

  if (e.target.classList.contains('edit-btn')) {
    editTransaction(id);
  }

  if (e.target.classList.contains('manual-update-btn')) {
    manualUpdatePrice(id);
  }
});

// --- Inicializar ---
document.getElementById('buyDate').value = today();
document.getElementById('divDate').value = today();
renderTransactions();
renderDividends();

// --- Service Worker ---
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js');
  });
}
