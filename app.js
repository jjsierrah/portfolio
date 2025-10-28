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

async function renderPortfolioSummary() {
  const transactions = await db.transactions.toArray();
  if (transactions.length === 0) {
    document.getElementById('summary-totals').innerHTML = '<p>No hay transacciones. Añade una desde el menú.</p>';
    document.getElementById('summary-by-type').innerHTML = '';
    return;
  }

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

function openModal(title, content) {
  document.getElementById('modalContent').innerHTML = `
    <div class="modal-header">
      <h3>${title}</h3>
      <button class="close-modal">&times;</button>
    </div>
    ${content}
  `;
  document.getElementById('modalOverlay').style.display = 'flex';
  document.querySelector('.close-modal').onclick = () => {
    document.getElementById('modalOverlay').style.display = 'none';
  };
  document.getElementById('modalOverlay').onclick = (e) => {
    if (e.target.id === 'modalOverlay') {
      document.getElementById('modalOverlay').style.display = 'none';
    }
  };
}

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
      <label>Símbolo:</label>
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
      alert('Completa todos los campos.');
      return;
    }

    await db.transactions.add({
      symbol, assetType, quantity, buyPrice, buyDate,
      currentPrice: buyPrice
    });

    document.getElementById('modalOverlay').style.display = 'none';
    renderPortfolioSummary();
  };
}

async function showTransactionsList() {
  const txs = await db.transactions.toArray();
  if (txs.length === 0) {
    openModal('Transacciones', '<p>No hay transacciones.</p>');
    return;
  }

  let html = '<h3>Transacciones</h3>';
  for (const t of txs) {
    const currentPrice = t.currentPrice || t.buyPrice;
    const currentValue = t.quantity * currentPrice;
    const cost = t.quantity * t.buyPrice;
    const gain = currentValue - cost;
    const gainPct = cost > 0 ? ((gain / cost) * 100).toFixed(2) : '0.00';

    html += `
      <div class="asset-item">
        <strong>${t.symbol}</strong> (${t.assetType})<br>
        ${t.quantity} @ ${formatCurrency(t.buyPrice)} (${t.buyDate})<br>
        Actual: ${formatCurrency(currentPrice)} → ${formatCurrency(currentValue)}<br>
        Ganancia: <span style="color:${gain >= 0 ? 'green' : 'red'}">${gain >= 0 ? '+' : ''}${formatCurrency(gain)} (${gainPct}%)</span>
        <div style="margin-top:8px;">
          <button class="edit-btn" data-id="${t.id}">Editar</button>
          <button class="delete-btn" data-id="${t.id}">Eliminar</button>
        </div>
      </div>
    `;
  }
  openModal('Transacciones', html);

  document.getElementById('modalContent').onclick = async (e) => {
    if (e.target.classList.contains('delete-btn')) {
      if (!confirm('¿Eliminar?')) return;
      const id = parseInt(e.target.dataset.id);
      await db.transactions.delete(id);
      showTransactionsList();
    }
    if (e.target.classList.contains('edit-btn')) {
      const id = parseInt(e.target.dataset.id);
      const tx = await db.transactions.get(id);
      if (!tx) return;

      const form = `
        <div class="form-group">
          <label>Tipo:</label>
          <select id="editAssetType">
            <option value="stock" ${tx.assetType === 'stock' ? 'selected' : ''}>Acción</option>
            <option value="etf" ${tx.assetType === 'etf' ? 'selected' : ''}>ETF</option>
            <option value="crypto" ${tx.assetType === 'crypto' ? 'selected' : ''}>Cripto</option>
          </select>
        </div>
        <div class="form-group">
          <label>Símbolo:</label>
          <input type="text" id="editSymbol" value="${tx.symbol}" required />
        </div>
        <div class="form-group">
          <label>Cantidad:</label>
          <input type="number" id="editQuantity" value="${tx.quantity}" required />
        </div>
        <div class="form-group">
          <label>Precio compra (€):</label>
          <input type="number" id="editBuyPrice" value="${tx.buyPrice}" required />
        </div>
        <div class="form-group">
          <label>Precio actual (€):</label>
          <input type="number" id="editCurrentPrice" value="${tx.currentPrice || tx.buyPrice}" required />
        </div>
        <div class="form-group">
          <label>Fecha:</label>
          <input type="date" id="editBuyDate" value="${tx.buyDate}" required />
        </div>
        <button id="btnUpdateTx">Guardar</button>
      `;
      openModal('Editar Transacción', form);

      document.getElementById('btnUpdateTx').onclick = async () => {
        const symbol = document.getElementById('editSymbol').value.trim().toUpperCase();
        const assetType = document.getElementById('editAssetType').value;
        const quantity = parseFloat(document.getElementById('editQuantity').value);
        const buyPrice = parseFloat(document.getElementById('editBuyPrice').value);
        const currentPrice = parseFloat(document.getElementById('editCurrentPrice').value);
        const buyDate = document.getElementById('editBuyDate').value;

        if (!symbol || isNaN(quantity) || isNaN(buyPrice) || isNaN(currentPrice)) {
          alert('Datos inválidos.');
          return;
        }

        await db.transactions.update(id, { symbol, assetType, quantity, buyPrice, currentPrice, buyDate });
        document.getElementById('modalOverlay').style.display = 'none';
        showTransactionsList();
      };
    }
  };
}

async function showAddDividendForm() {
  const symbols = await db.transactions.orderBy('symbol').uniqueKeys();
  if (symbols.length === 0) {
    alert('Añade una transacción primero.');
    return;
  }

  const options = symbols.map(s => `<option value="${s}">${s}</option>`).join('');
  const form = `
    <div class="form-group">
      <label>Símbolo:</label>
      <select id="divSymbol">${options}</select>
    </div>
    <div class="form-group">
      <label>Títulos:</label>
      <input type="number" id="divQuantity" readonly />
    </div>
    <div class="form-group">
      <label>Dividendo por acción (€):</label>
      <input type="number" id="divPerShare" step="any" min="0" placeholder="0.25" />
    </div>
    <div class="form-group">
      <label>Total (€):</label>
      <input type="text" id="divTotal" readonly />
    </div>
    <div class="form-group">
      <label>Fecha:</label>
      <input type="date" id="divDate" value="${today()}" />
    </div>
    <button id="btnSaveDiv">Añadir Dividendo</button>
  `;
  openModal('Añadir Dividendo', form);

  const symbolSelect = document.getElementById('divSymbol');
  const qtyInput = document.getElementById('divQuantity');
  const perShareInput = document.getElementById('divPerShare');
  const totalInput = document.getElementById('divTotal');

  async function updateQty() {
    const sym = symbolSelect.value;
    const txs = await db.transactions.where('symbol').equals(sym).toArray();
    const total = txs.reduce((sum, t) => sum + t.quantity, 0);
    qtyInput.value = total;
    totalInput.value = formatCurrency(total * (parseFloat(perShareInput.value) || 0));
  }

  symbolSelect.onchange = updateQty;
  perShareInput.oninput = () => {
    totalInput.value = formatCurrency((parseFloat(qtyInput.value) || 0) * (parseFloat(perShareInput.value) || 0));
  };
  updateQty();

  document.getElementById('btnSaveDiv').onclick = async () => {
    const sym = symbolSelect.value;
    const qty = parseFloat(qtyInput.value);
    const perShare = parseFloat(perShareInput.value);
    const total = qty * perShare;
    const date = document.getElementById('divDate').value;

    if (isNaN(perShare) || perShare <= 0) {
      alert('Dividendo por acción inválido.');
      return;
    }

    await db.dividends.add({ symbol: sym, amount: total, perShare, date });
    document.getElementById('modalOverlay').style.display = 'none';
    renderPortfolioSummary();
  };
}

async function showDividendsList() {
  const divs = await db.dividends.reverse().toArray();
  if (divs.length === 0) {
    openModal('Dividendos', '<p>No hay dividendos.</p>');
    return;
  }

  let html = '<h3>Dividendos</h3>';
  let total = 0;
  for (const d of divs) {
    total += d.amount;
    html += `
      <div class="asset-item">
        <strong>${d.symbol}</strong>: ${formatCurrency(d.amount)} (${formatCurrency(d.perShare)}/acción) el ${d.date}
        <div style="margin-top:8px;">
          <button class="delete-btn" data-id="${d.id}">Eliminar</button>
        </div>
      </div>
    `;
  }
  html += `<div class="summary-card"><strong>Total:</strong> ${formatCurrency(total)}</div>`;
  openModal('Dividendos', html);

  document.getElementById('modalContent').onclick = async (e) => {
    if (e.target.classList.contains('delete-btn')) {
      if (!confirm('¿Eliminar dividendo?')) return;
      const id = parseInt(e.target.dataset.id);
      await db.dividends.delete(id);
      showDividendsList();
    }
  };
}

async function refreshPrices() {
  const txs = await db.transactions.toArray();
  if (txs.length === 0) {
    alert('No hay transacciones.');
    return;
  }

  let updated = 0;
  for (const t of txs) {
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
  alert(`Actualizados: ${updated}/${txs.length}`);
}

function showImportExport() {
  const content = `
    <h3>Exportar / Importar Datos</h3>
    <p style="margin:10px 0;">
      <button id="btnExport" style="width:auto;">Exportar a JSON</button>
    </p>
    <p style="margin:10px 0;">
      <button id="btnImport" style="width:auto;">Importar desde JSON</button>
    </p>
    <p style="font-size:0.9em; color:#666;">
      ⚠️ Importar reemplazará todos tus datos actuales.
    </p>
  `;
  openModal('Exportar / Importar', content);

  document.getElementById('btnExport').onclick = async () => {
    const transactions = await db.transactions.toArray();
    const dividends = await db.dividends.toArray();
    const data = { transactions, dividends };
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'jj-portfolio-backup.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    closeModal();
  };

  document.getElementById('btnImport').onclick = async () => {
    if (!confirm('⚠️ Esto borrará todos tus datos actuales. ¿Continuar?')) {
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        await db.transactions.clear();
        await db.dividends.clear();
        if (data.transactions) await db.transactions.bulkAdd(data.transactions);
        if (data.dividends) await db.dividends.bulkAdd(data.dividends);
        closeModal();
        renderPortfolioSummary();
        alert('Datos importados correctamente.');
      } catch (err) {
        alert('Error: archivo no válido.');
      }
    };
    input.click();
  };
}

document.addEventListener('DOMContentLoaded', () => {
  renderPortfolioSummary();

  document.getElementById('btnRefreshPrices').addEventListener('click', refreshPrices);

  document.getElementById('mainMenu').addEventListener('change', function () {
    const action = this.value;
    this.selectedIndex = 0;
    switch (action) {
      case 'add-transaction': showAddTransactionForm(); break;
      case 'view-transactions': showTransactionsList(); break;
      case 'add-dividend': showAddDividendForm(); break;
      case 'view-dividends': showDividendsList(); break;
      case 'import-export': showImportExport(); break;
    }
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js');
  }
});
