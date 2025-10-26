// --- IndexedDB con Dexie ---
const db = new Dexie('JJPortfolioDB');
db.version(1).stores({
  investments: '++id, symbol, assetType, quantity, buyPrice, buyDate',
  dividends: '++id, symbol, amount, date'
});

// --- Utilidades ---
function today() {
  const d = new Date();
  return d.toISOString().split('T')[0];
}

// --- Yahoo Finance (acciones/ETFs) ---
async function fetchStockPrice(symbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbol}`;
    const res = await fetch(url);
    const data = await res.json();
    const quote = data.quoteResponse?.result?.[0];
    return quote?.regularMarketPrice || null;
  } catch (e) {
    console.warn('Error fetching stock price for', symbol, e);
    return null;
  }
}

// --- CoinGecko (criptomonedas) ---
async function fetchCryptoPrice(symbol) {
  const cryptoMap = {
    'BTC': 'bitcoin',
    'ETH': 'ethereum',
    'SOL': 'solana',
    'ADA': 'cardano',
    // Puedes ampliar este mapa
  };
  const id = cryptoMap[symbol.toUpperCase()];
  if (!id) return null;

  try {
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`);
    const data = await res.json();
    return data[id]?.usd || null;
  } catch (e) {
    console.warn('Error fetching crypto price for', symbol, e);
    return null;
  }
}

// --- Render ---
async function renderPortfolio() {
  const list = document.getElementById('portfolioList');
  const investments = await db.investments.toArray();
  if (investments.length === 0) {
    list.innerHTML = '<p>No hay inversiones registradas.</p>';
    return;
  }

  let html = '';
  for (const inv of investments) {
    const currentPrice = inv.currentPrice || inv.buyPrice;
    const currentValue = inv.quantity * currentPrice;
    const cost = inv.quantity * inv.buyPrice;
    const gain = currentValue - cost;
    const gainPct = ((gain / cost) * 100).toFixed(2);

    html += `
      <div class="portfolio-item">
        <strong>${inv.symbol}</strong> (${inv.assetType})<br>
        Cantidad: ${inv.quantity} | Compra: $${inv.buyPrice}<br>
        Actual: $${currentPrice?.toFixed(2) || '—'} | Valor: $${currentValue.toFixed(2)}<br>
        Ganancia: <span style="color:${gain >= 0 ? 'green' : 'red'}">${gain >= 0 ? '+' : ''}$${gain.toFixed(2)} (${gainPct}%)</span>
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
        <strong>${d.symbol}</strong> – $${d.amount} el ${d.date}
      </div>
    `;
  }
  list.innerHTML = html;
}

// --- Actualizar precios ---
async function refreshPrices() {
  const investments = await db.investments.toArray();
  for (const inv of investments) {
    let price = null;
    if (inv.assetType === 'crypto') {
      price = await fetchCryptoPrice(inv.symbol);
    } else {
      price = await fetchStockPrice(inv.symbol);
    }
    if (price !== null) {
      await db.investments.update(inv.id, { currentPrice: price });
    }
  }
  renderPortfolio();
  alert('Precios actualizados.');
}

// --- Eventos ---
document.getElementById('btnAddInvestment').addEventListener('click', async () => {
  const symbol = document.getElementById('symbol').value.trim().toUpperCase();
  const assetType = document.getElementById('assetType').value;
  const quantity = parseFloat(document.getElementById('quantity').value);
  const buyPrice = parseFloat(document.getElementById('buyPrice').value);
  const buyDate = document.getElementById('buyDate').value;

  if (!symbol || isNaN(quantity) || isNaN(buyPrice)) {
    alert('Por favor, completa todos los campos correctamente.');
    return;
  }

  await db.investments.add({
    symbol,
    assetType,
    quantity,
    buyPrice,
    buyDate,
    createdAt: new Date().toISOString()
  });

  renderPortfolio();
  document.getElementById('symbol').value = '';
  document.getElementById('quantity').value = '';
  document.getElementById('buyPrice').value = '';
  document.getElementById('buyDate').value = today();
});

document.getElementById('btnAddDividend').addEventListener('click', async () => {
  const symbol = document.getElementById('divSymbol').value.trim().toUpperCase();
  const amount = parseFloat(document.getElementById('divAmount').value);
  const date = document.getElementById('divDate').value;

  if (!symbol || isNaN(amount)) {
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

// --- Inicializar ---
document.getElementById('buyDate').value = today();
document.getElementById('divDate').value = today();
renderPortfolio();
renderDividends();

// --- Registrar Service Worker ---
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js');
  });
}
