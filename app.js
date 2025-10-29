const db = new Dexie('JJPortfolioDB');
db.version(4).stores({
  transactions: '++id, symbol, name, assetType, quantity, buyPrice, commission, type, buyDate',
  dividends: '++id, symbol, amount, perShare, date',
  prices: 'symbol'
});

function today() {
  return new Date().toISOString().split('T')[0];
}

function formatCurrency(value) {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2
  }).format(value);
}

async function getCurrentPrice(symbol) {
  const saved = await db.prices.get(symbol);
  return saved ? saved.price : null;
}

async function saveCurrentPrice(symbol, price) {
  await db.prices.put({ symbol, price });
}

async function renderPortfolioSummary() {
  try {
    const transactions = await db.transactions.toArray();
    if (transactions.length === 0) {
      document.getElementById('summary-totals').innerHTML = '<p>No hay transacciones. Añade una desde el menú.</p>';
      document.getElementById('summary-by-type').innerHTML = '';
      return;
    }

    const symbols = [...new Set(transactions.map(t => t.symbol))];
    const assets = {};
    let totalInvested = 0;
    let totalCurrentValue = 0;

    const currentPrices = {};
    for (const sym of symbols) {
      currentPrices[sym] = await getCurrentPrice(sym);
      if (currentPrices[sym] === null) {
        const txs = transactions.filter(t => t.symbol === sym);
        currentPrices[sym] = txs[txs.length - 1]?.buyPrice || 0;
      }
    }

    for (const t of transactions) {
      const key = t.symbol;
      if (!assets[key]) {
        assets[key] = {
          symbol: t.symbol,
          name: t.name,
          assetType: t.assetType,
          totalQuantity: 0,
          totalInvested: 0
        };
      }

      if (t.type === 'buy') {
        assets[key].totalQuantity += t.quantity;
        const cost = t.quantity * t.buyPrice + (t.commission || 0);
        assets[key].totalInvested += cost;
        totalInvested += cost;
      }
    }

    for (const symbol in assets) {
      const a = assets[symbol];
      const currentPrice = currentPrices[symbol] || 0;
      a.currentValue = a.totalQuantity * currentPrice;
      totalCurrentValue += a.currentValue;
    }

    const totalGain = totalCurrentValue - totalInvested;
    const totalGainPct = totalInvested > 0 ? totalGain / totalInvested : 0;

    document.getElementById('summary-totals').innerHTML = `
      <div style="background:#f9f9f9; padding:12px; border-radius:6px; margin-bottom:12px;">
        <div><strong>Total invertido:</strong> ${formatCurrency(totalInvested)}</div>
        <div><strong>Valor actual:</strong> ${formatCurrency(totalCurrentValue)}</div>
        <div><strong>Ganancia:</strong> 
          <span style="color:${totalGain >= 0 ? 'green' : 'red'}">
            ${totalGain >= 0 ? '+' : ''}${formatCurrency(totalGain)} (${(totalGainPct * 100).toFixed(2)}%)
          </span>
        </div>
      </div>
    `;

    const groups = { stock: [], etf: [], crypto: [] };
    Object.values(assets).forEach(asset => {
      if (asset.totalQuantity > 0) {
        groups[asset.assetType].push(asset);
      }
    });

    let groupsHtml = '';
    for (const [type, list] of Object.entries(groups)) {
      if (list.length === 0) continue;
      const typeName = { stock: 'Acciones', etf: 'ETFs', crypto: 'Criptomonedas' }[type];
      groupsHtml += `<div style="font-weight:bold; margin:12px 0 8px; color:#1a73e8;">${typeName}</div>`;
      for (const a of list) {
        const currentPrice = currentPrices[a.symbol] || 0;
        const gain = a.currentValue - a.totalInvested;
        const gainPct = a.totalInvested > 0 ? gain / a.totalInvested : 0;
        groupsHtml += `
          <div style="padding:8px 0; border-bottom:1px solid #eee; font-size:0.95rem;">
            <strong>${a.symbol}</strong> ${a.name ? `(${a.name})` : ''}<br>
            Cantidad: ${a.totalQuantity} | 
            Invertido: ${formatCurrency(a.totalInvested)} | 
            Actual: ${formatCurrency(a.currentValue)} | 
            Ganancia: <span style="color:${gain >= 0 ? 'green' : 'red'}">
              ${gain >= 0 ? '+' : ''}${formatCurrency(gain)} (${(gainPct * 100).toFixed(2)}%)
            </span>
          </div>
        `;
      }
    }
    document.getElementById('summary-by-type').innerHTML = groupsHtml;
  } catch (err) {
    console.error('Error en renderPortfolioSummary:', err);
    document.getElementById('summary-totals').innerHTML = '<p>Error al cargar el resumen.</p>';
  }
}

function openModal(title, content) {
  document.getElementById('modalContent').innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
      <h3 style="margin:0; color:#1a73e8;">${title}</h3>
      <button class="close-modal" style="background:none; border:none; font-size:1.5rem;">&times;</button>
    </div>
    ${content}
  `;
  document.getElementById('modalOverlay').style.display = 'flex';
  document.querySelector('.close-modal').onclick = () => {
    document.getElementById('modalOverlay').style.display = 'none';
  };
}

function showAddTransactionForm() {
  const form = `
    <div style="margin-bottom:14px;">
      <label style="display:block; margin-bottom:4px; font-weight:bold;">Símbolo:</label>
      <input type="text" id="symbol" placeholder="AAPL" style="width:100%; padding:10px; border:1px solid #ccc; border-radius:6px;" />
    </div>
    <button id="btnSave" style="width:100%; padding:10px; background:#1a73e8; color:white; border:none; border-radius:6px; font-weight:bold;">Añadir</button>
  `;
  openModal('Añadir Transacción', form);
  document.getElementById('btnSave').onclick = async () => {
    const symbol = document.getElementById('symbol').value.trim().toUpperCase();
    if (!symbol) return;
    await db.transactions.add({
      symbol,
      assetType: 'stock',
      quantity: 1,
      buyPrice: 100,
      commission: 0,
      type: 'buy',
      buyDate: today()
    });
    document.getElementById('modalOverlay').style.display = 'none';
    renderPortfolioSummary();
  };
}

function refreshPrices() {
  alert('Función de actualizar precios activada');
  renderPortfolioSummary();
}

function showManualPriceUpdate() {
  openModal('Actualizar Precio Manual', `
    <div style="margin-bottom:14px;">
      <label style="display:block; margin-bottom:4px; font-weight:bold;">Símbolo:</label>
      <input type="text" id="sym" value="AAPL" style="width:100%; padding:10px; border:1px solid #ccc; border-radius:6px;" />
    </div>
    <div style="margin-bottom:14px;">
      <label style="display:block; margin-bottom:4px; font-weight:bold;">Precio (€):</label>
      <input type="number" id="price" value="150" style="width:100%; padding:10px; border:1px solid #ccc; border-radius:6px;" />
    </div>
    <button id="btnSet" style="width:100%; padding:10px; background:#1a73e8; color:white; border:none; border-radius:6px; font-weight:bold;">Establecer</button>
  `);
  document.getElementById('btnSet').onclick = async () => {
    const symbol = document.getElementById('sym').value.trim().toUpperCase();
    const price = parseFloat(document.getElementById('price').value);
    if (symbol && !isNaN(price)) {
      await saveCurrentPrice(symbol, price);
      document.getElementById('modalOverlay').style.display = 'none';
      renderPortfolioSummary();
    }
  };
}

// Inicialización segura
document.addEventListener('DOMContentLoaded', () => {
  renderPortfolioSummary();
  
  document.getElementById('mainMenu').addEventListener('change', function() {
    const action = this.value;
    this.selectedIndex = 0;
    
    if (action === 'add-transaction') showAddTransactionForm();
    else if (action === 'refresh-prices') refreshPrices();
    else if (action === 'manual-price') showManualPriceUpdate();
  });
});
