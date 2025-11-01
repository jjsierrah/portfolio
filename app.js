// --- IndexedDB con reinicio seguro ---
const db = new Dexie('JJPortfolioDB');
db.version(4).stores({
  transactions: '++id, symbol, name, assetType, quantity, buyPrice, commission, type, buyDate',
  dividends: '++id, symbol, amount, perShare, date',
  prices: 'symbol'
});

function today() {
  const d = new Date();
  return d.toISOString().split('T')[0];
}
function isDateValidAndNotFuture(dateString) {
  if (!dateString) return false;
  const inputDate = new Date(dateString);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0); // Hoy a las 00:00:00
  return inputDate <= todayStart;
}
function formatDate(dateString) {
  if (!dateString) return '';
  const d = new Date(dateString);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
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

function showToast(message) {
  const existing = document.getElementById('toast-notification');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'toast-notification';
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: #4CAF50;
    color: white;
    padding: 14px 22px;
    border-radius: 10px;
    font-weight: bold;
    font-size: 1.05rem;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    z-index: 10000;
    max-width: 90%;
    text-align: center;
  `;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.5s';
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 500);
  }, 3000);
}

function showConfirm(message, onConfirm) {
  const mainOverlay = document.getElementById('modalOverlay');
  if (mainOverlay) mainOverlay.style.display = 'none';

  const overlay = document.createElement('div');
  overlay.id = 'confirmOverlay';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-content" style="max-width: 350px;">
      <div class="modal-body" style="text-align: center; padding: 24px;">
        <p>${message}</p>
        <div class="modal-actions" style="margin-top: 20px; justify-content: center;">
          <button id="confirmNo" class="btn-delete" style="width: auto; padding: 10px 16px;">No</button>
          <button id="confirmYes" class="btn-primary" style="width: auto; padding: 10px 16px; margin-left: 8px;">Sí</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.style.display = 'flex';

  const btnYes = document.getElementById('confirmYes');
  const btnNo = document.getElementById('confirmNo');

  const cleanup = () => {
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
  };

  btnYes.onclick = () => {
    cleanup();
    onConfirm();
  };
  btnNo.onclick = cleanup;
  overlay.onclick = (e) => {
    if (e.target === overlay) cleanup();
  };
}

async function fetchStockPrice(symbol) {
  const symbolMap = {
    'BBVA': 'BBVA.MC', 'SAN': 'SAN.MC', 'IBE': 'IBE.MC', 'TEF': 'TEF.MC',
    'REP': 'REP.MC', 'ITX': 'ITX.MC', 'AMS': 'AMS.MC', 'ELE': 'ELE.MC',
    'FER': 'FER.MC', 'CABK': 'CABK.MC', 'MAP': 'MAP.MC',
    'OR': 'OR.PA', 'MC': 'MC.PA', 'BNP': 'BNP.PA', 'AI': 'AI.PA',
    'DG': 'DG.PA', 'RI': 'RI.PA', 'FP': 'FP.PA',
    'SAP': 'SAP.DE', 'DTE': 'DTE.DE', 'ALV': 'ALV.DE', 'BMW': 'BMW.DE',
    'DAI': 'DAI.DE', 'SIE': 'SIE.DE',
    'ENI': 'ENI.MI', 'ISP': 'ISP.MI', 'UCG': 'UCG.MI', 'STM': 'STM.MI',
    'ASML': 'ASML.AS', 'RDSA': 'RDSA.AS',
    'NESN': 'NESN.SW', 'ROG': 'ROG.SW'
  };

  const trySymbol = async (sym) => {
    try {
      const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(sym)}`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = await res.json();
      const quote = data.quoteResponse?.result?.[0];
      return quote?.regularMarketPrice || null;
    } catch {
      return null;
    }
  };

  let price = await trySymbol(symbol);
  if (price !== null) return price;

  const mapped = symbolMap[symbol.toUpperCase()];
  if (mapped) {
    price = await trySymbol(mapped);
    if (price !== null) return price;
  }

  return null;
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

async function getCurrentPrice(symbol) {
  const saved = await db.prices.get(symbol);
  return saved ? saved.price : null;
}

async function saveCurrentPrice(symbol, price) {
  await db.prices.put({ symbol, price });
}

async function renderPortfolioSummary() {
  const summaryTotals = document.getElementById('summary-totals');
  const summaryByType = document.getElementById('summary-by-type');
  
  if (!summaryTotals || !summaryByType) {
    return;
  }

  try {
    const transactions = await db.transactions.toArray();
    
    if (transactions.length === 0) {
      summaryTotals.innerHTML = '<p>No hay transacciones. Añade una desde el menú.</p>';
      summaryByType.innerHTML = '';
      document.querySelectorAll('.dividends-summary, .filters-container').forEach(el => el.remove());
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
      } else if (t.type === 'sell') {
        assets[key].totalQuantity -= t.quantity;
        const proceeds = t.quantity * t.buyPrice - (t.commission || 0);
        totalInvested -= proceeds;
      }
    }

    let totalGain = 0;
    for (const symbol in assets) {
      const a = assets[symbol];
      if (a.totalQuantity < 0) a.totalQuantity = 0;
      const currentPrice = currentPrices[symbol] || 0;
      a.currentValue = a.totalQuantity * currentPrice;
      totalCurrentValue += a.currentValue;
      a.gain = a.currentValue - a.totalInvested;
      totalGain += a.gain;
    }

    const totalGainPct = totalInvested > 0 ? totalGain / totalInvested : 0;

    // --- GRÁFICO DE COMPOSICIÓN (en el panel superior) ---
    const groups = { stock: [], etf: [], crypto: [] };
    Object.values(assets).forEach(asset => {
      if (asset.totalQuantity > 0) {
        groups[asset.assetType].push(asset);
      }
    });

    let allocationHtml = '';
    const total = totalCurrentValue;
    if (total > 0) {
      const groupShares = {
        stock: groups.stock.reduce((sum, a) => sum + a.currentValue, 0),
        etf: groups.etf.reduce((sum, a) => sum + a.currentValue, 0),
        crypto: groups.crypto.reduce((sum, a) => sum + a.currentValue, 0)
      };
      const colors = { stock: '#4CAF50', etf: '#2196F3', crypto: '#FF9800' };
      const typeNames = { stock: 'Acciones', etf: 'ETFs', crypto: 'Cripto' };
      
      allocationHtml = '<div class="portfolio-allocation">';
      for (const [type, value] of Object.entries(groupShares)) {
        if (value > 0) {
          const pct = value / total; // <-- Evita división por cero
          const pctFormatted = formatPercent(pct);
          allocationHtml += `
            <div class="allocation-item">
              <div class="allocation-bar">
                <div class="allocation-fill" style="width:${pct * 100}%; background-color:${colors[type]}"></div>
              </div>
              <small>${typeNames[type]}: ${pctFormatted}</small>
            </div>
          `;
        }
      }
      allocationHtml += '</div>';
    }

    const totalsHtml = `
      <div class="summary-card">
        <div><strong>Total invertido:</strong> ${formatCurrency(totalInvested)}</div>
        <div><strong>Valor actual:</strong> ${formatCurrency(totalCurrentValue)}</div>
        <div><strong>Ganancia:</strong> 
          <span style="color:${totalGain >= 0 ? 'green' : 'red'}">
            ${totalGain >= 0 ? '+' : ''}${formatCurrency(totalGain)} (${formatPercent(totalGainPct)})
          </span>
        </div>
        ${allocationHtml}
      </div>
    `;
    summaryTotals.innerHTML = totalsHtml;

    // --- RESUMEN DE DIVIDENDOS (solo neto con etiqueta) ---
    const dividends = await db.dividends.toArray();
    document.querySelectorAll('.dividends-summary').forEach(el => el.remove());

    if (dividends.length > 0) {
      const divSummary = {};
      let totalBruto = 0;
      for (const d of dividends) {
        if (!divSummary[d.symbol]) divSummary[d.symbol] = 0;
        divSummary[d.symbol] += d.amount;
        totalBruto += d.amount;
      }
      const totalNeto = totalBruto * (1 - 0.19); // 19% retención

      let divHtml = `<div class="summary-card"><div class="group-title">Dividendos recibidos</div>`;
      for (const [symbol, amount] of Object.entries(divSummary)) {
        const neto = amount * (1 - 0.19);
        divHtml += `<div><strong>${symbol}:</strong> ${formatCurrency(amount)} | ${formatCurrency(neto)} (Neto)</div>`;
      }
      divHtml += `<div style="margin-top:8px; font-weight:bold;">Total: ${formatCurrency(totalBruto)} | ${formatCurrency(totalNeto)} (Neto)</div>`;

      // --- Totales por año ---
      const divByYear = {};
      for (const d of dividends) {
        const year = new Date(d.date).getFullYear();
        if (!divByYear[year]) divByYear[year] = 0;
        divByYear[year] += d.amount;
      }

      if (Object.keys(divByYear).length > 1) {
        divHtml += `<div class="dividends-by-year">`;
        const sortedYears = Object.keys(divByYear).sort((a, b) => b - a);
        for (const year of sortedYears) {
          const bruto = divByYear[year];
          const neto = bruto * (1 - 0.19);
          divHtml += `<div class="dividends-year-title">${year}: ${formatCurrency(bruto)} | ${formatCurrency(neto)} (Neto)</div>`;
        }
        divHtml += `</div>`;
      }

      divHtml += `</div>`;

      const divSummaryEl = document.createElement('div');
      divSummaryEl.className = 'dividends-summary';
      divSummaryEl.innerHTML = divHtml;
      summaryByType.parentNode.insertBefore(divSummaryEl, summaryByType);
    }

    // --- FILTROS POR TIPO (evitar duplicados) ---
    document.querySelectorAll('.filters-container').forEach(el => el.remove());
    const filtersHtml = `
      <div class="filters-container">
        <button class="filter-btn active" data-filter="all">Todo</button>
        <button class="filter-btn stock" data-filter="stock">Acciones</button>
        <button class="filter-btn etf" data-filter="etf">ETFs</button>
        <button class="filter-btn crypto" data-filter="crypto">Cripto</button>
      </div>
    `;
    const filtersEl = document.createElement('div');
    filtersEl.innerHTML = filtersHtml;
    filtersEl.className = 'filters-container';
    summaryByType.parentNode.insertBefore(filtersEl, summaryByType);

    // --- TARJETAS POR TIPO ---
    let groupsHtml = '';
    for (const [type, list] of Object.entries(groups)) {
      if (list.length === 0) continue;
      const typeName = { stock: 'Acciones', etf: 'ETFs', crypto: 'Criptomonedas' }[type];
      groupsHtml += `<div class="group-title">${typeName}</div>`;
      for (const a of list) {
        const gainPct = a.totalInvested > 0 ? a.gain / a.totalInvested : 0;
        const gainIcon = a.gain >= 0 ? '📈' : '📉';
        const gainColor = a.gain >= 0 ? 'green' : 'red';
        const typeClass = type;
        groupsHtml += `
          <div class="asset-item ${typeClass}" data-type="${type}">
            <strong>${a.symbol}</strong> ${a.name ? `(${a.name})` : ''}<br>
            Cantidad: ${a.totalQuantity} | 
            Invertido: ${formatCurrency(a.totalInvested)} | 
            Actual: ${formatCurrency(a.currentValue)} | 
            Ganancia: <span style="color:${gainColor}; font-weight:bold;">
              ${gainIcon} ${a.gain >= 0 ? '+' : ''}${formatCurrency(a.gain)} (${formatPercent(gainPct)})
            </span>
          </div>
        `;
      }
    }
    summaryByType.innerHTML = groupsHtml;

    // --- LÓGICA DE FILTROS ---
    const filterButtons = document.querySelectorAll('.filter-btn');
    filterButtons.forEach(btn => {
      btn.onclick = () => {
        const filter = btn.dataset.filter;
        filterButtons.forEach(b => b.classList.toggle('active', b === btn));
        document.querySelectorAll('.asset-item').forEach(item => {
          item.style.display = (filter === 'all' || item.dataset.type === filter) ? 'block' : 'none';
        });
        document.querySelectorAll('.group-title:not(.dividends-summary .group-title)').forEach(title => {
          let sibling = title.nextElementSibling;
          let hasVisible = false;
          while (sibling && !sibling.classList.contains('group-title')) {
            if (sibling.classList.contains('asset-item') && sibling.style.display !== 'none') {
              hasVisible = true;
              break;
            }
            sibling = sibling.nextElementSibling;
          }
          title.style.display = hasVisible ? 'block' : 'none';
        });
      };
    });
  } catch (err) {
    console.error('Error en renderPortfolioSummary:', err);
    summaryTotals.innerHTML = '<p style="color:red">Error al cargar el portfolio. Ver consola.</p>';
    summaryByType.innerHTML = '';
    document.querySelectorAll('.dividends-summary, .filters-container').forEach(el => el.remove());
  }
}

function openModal(title, content) {
  let overlay = document.getElementById('modalOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'modalOverlay';
    overlay.className = 'modal-overlay';
    document.body.appendChild(overlay);
  }

  overlay.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h3>${title}</h3>
        <button class="close-modal">&times;</button>
      </div>
      <div class="modal-body">
        ${content}
      </div>
    </div>
  `;

  overlay.style.display = 'flex';

  const closeModal = () => {
    overlay.style.display = 'none';
  };

  document.querySelector('.close-modal').onclick = closeModal;
  overlay.onclick = (e) => {
    if (e.target === overlay) closeModal();
  };
}

function showAddTransactionForm() {
  const form = `
    <div class="form-group">
      <label>Tipo de operación:</label>
      <select id="txType">
        <option value="buy">Compra</option>
        <option value="sell">Venta</option>
      </select>
    </div>
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
      <label>Nombre (opcional):</label>
      <input type="text" id="name" placeholder="Apple Inc." />
    </div>
    <div class="form-group">
      <label>Cantidad:</label>
      <input type="number" id="quantity" step="any" min="0" required />
    </div>
    <div class="form-group">
      <label>Precio (€):</label>
      <input type="number" id="price" step="any" min="0" required />
    </div>
    <div class="form-group">
      <label>Comisión (€):</label>
      <input type="number" id="commission" step="any" min="0" value="0" />
    </div>
    <div class="form-group">
      <label>Fecha:</label>
      <input type="date" id="buyDate" value="${today()}" required />
    </div>
    <button id="btnSaveTransaction" class="btn-primary">Añadir Transacción</button>
  `;
  openModal('Añadir Transacción', form);

  document.getElementById('btnSaveTransaction').onclick = async () => {
    const symbol = document.getElementById('symbol').value.trim().toUpperCase();
    const name = document.getElementById('name').value.trim();
    const assetType = document.getElementById('assetType').value;
    const quantity = parseFloat(document.getElementById('quantity').value);
    const price = parseFloat(document.getElementById('price').value);
    const commission = parseFloat(document.getElementById('commission').value) || 0;
    const type = document.getElementById('txType').value;
    const buyDate = document.getElementById('buyDate').value;

    if (!symbol || isNaN(quantity) || isNaN(price)) {
      showToast('Completa todos los campos obligatorios.');
      return;
    }

    if (!isDateValidAndNotFuture(buyDate)) {
      showToast('La fecha no puede ser futura.');
      return;
    }

    await db.transactions.add({
      symbol,
      name,
      assetType,
      quantity,
      buyPrice: price,
      commission,
      type,
      buyDate,
      createdAt: new Date().toISOString()
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
    const typeLabel = t.type === 'buy' ? 'Compra' : 'Venta';
    const typeColor = t.type === 'buy' ? '#4CAF50' : '#f44336';
    const totalAmount = t.quantity * t.buyPrice;
    html += `
      <div class="asset-item">
        <strong>${t.symbol}</strong> ${t.name ? `(${t.name})` : ''}<br>
        <span style="color:${typeColor}; font-weight:bold;">${typeLabel}</span> | 
        ${t.quantity} @ ${formatCurrency(t.buyPrice)} = ${formatCurrency(totalAmount)}<br>
        Comisión: ${formatCurrency(t.commission)} | Fecha: ${formatDate(t.buyDate)}
        <div class="modal-actions">
          <button class="btn-edit" data-id="${t.id}">Editar</button>
          <button class="btn-delete" data-id="${t.id}">Eliminar</button>
        </div>
      </div>
    `;
  }
  openModal('Transacciones', html);

  const modalBody = document.querySelector('#modalOverlay .modal-body');
  modalBody.onclick = (e) => {
    if (e.target.classList.contains('btn-delete')) {
      const id = parseInt(e.target.dataset.id);
      showConfirm('¿Eliminar esta transacción?', async () => {
        await db.transactions.delete(id);
        showTransactionsList();
      });
    }
        if (e.target.classList.contains('btn-edit')) {
      const id = parseInt(e.target.dataset.id);
      db.transactions.get(id).then((tx) => {
        if (!tx) return;

        const form = `
          <div class="form-group">
            <label>Tipo:</label>
            <select id="editTxType">
              <option value="buy" ${tx.type === 'buy' ? 'selected' : ''}>Compra</option>
              <option value="sell" ${tx.type === 'sell' ? 'selected' : ''}>Venta</option>
            </select>
          </div>
          <div class="form-group">
            <label>Tipo activo:</label>
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
            <label>Nombre:</label>
            <input type="text" id="editName" value="${tx.name || ''}" />
          </div>
          <div class="form-group">
            <label>Cantidad:</label>
            <input type="number" id="editQuantity" value="${tx.quantity}" required />
          </div>
          <div class="form-group">
            <label>Precio (€):</label>
            <input type="number" id="editPrice" value="${tx.buyPrice}" required />
          </div>
          <div class="form-group">
            <label>Comisión (€):</label>
            <input type="number" id="editCommission" value="${tx.commission || 0}" />
          </div>
          <div class="form-group">
            <label>Fecha:</label>
            <input type="date" id="editBuyDate" value="${tx.buyDate}" required />
          </div>
          <button id="btnUpdateTx" class="btn-primary">Guardar</button>
        `;
        openModal('Editar Transacción', form);

        document.getElementById('btnUpdateTx').onclick = async () => {
          const symbol = document.getElementById('editSymbol').value.trim().toUpperCase();
          const name = document.getElementById('editName').value.trim();
          const assetType = document.getElementById('editAssetType').value;
          const quantity = parseFloat(document.getElementById('editQuantity').value);
          const price = parseFloat(document.getElementById('editPrice').value);
          const commission = parseFloat(document.getElementById('editCommission').value) || 0;
          const type = document.getElementById('editTxType').value;
          const buyDate = document.getElementById('editBuyDate').value;

          if (!symbol || isNaN(quantity) || isNaN(price)) {
            showToast('Datos inválidos.');
            return;
          }

          await db.transactions.update(id, {
            symbol, name, assetType, quantity, buyPrice: price, commission, type, buyDate
          });
          document.getElementById('modalOverlay').style.display = 'none';
          showTransactionsList();
        };
      });
    }
  };
}

async function showAddDividendForm() {
  const symbols = await db.transactions.orderBy('symbol').uniqueKeys();
  if (symbols.length === 0) {
    showToast('Añade una transacción primero.');
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
      <input type="number" id="divPerShare" step="any" min="0" />
    </div>
    <div class="form-group">
      <label>Total (€):</label>
      <input type="text" id="divTotal" readonly />
    </div>
    <div class="form-group">
      <label>Fecha:</label>
      <input type="date" id="divDate" value="${today()}" />
    </div>
    <button id="btnSaveDiv" class="btn-primary">Añadir Dividendo</button>
  `;
  openModal('Añadir Dividendo', form);

  const symbolSelect = document.getElementById('divSymbol');
  const qtyInput = document.getElementById('divQuantity');
  const perShareInput = document.getElementById('divPerShare');
  const totalInput = document.getElementById('divTotal');

  async function updateQty() {
    const sym = symbolSelect.value;
    const txs = await db.transactions.where('symbol').equals(sym).toArray();
    const totalQty = txs.reduce((sum, t) => {
      let qty = 0;
      if (t.type === 'buy') qty += t.quantity;
      if (t.type === 'sell') qty -= t.quantity;
      return sum + qty;
    }, 0);
    qtyInput.value = Math.max(0, totalQty);
    totalInput.value = formatCurrency(totalQty * (parseFloat(perShareInput.value) || 0));
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
      showToast('Dividendo por acción inválido.');
      return;
    }

    if (!isDateValidAndNotFuture(date)) {
      showToast('La fecha no puede ser futura.');
      return;
    }

    await db.dividends.add({ symbol: sym, amount: total, perShare, date });
    document.getElementById('modalOverlay').style.display = 'none';
    showToast(`✅ Dividendo añadido: ${sym} – ${formatCurrency(total)}`);
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
        <strong>${d.symbol}</strong>: ${formatCurrency(d.amount)} (${formatCurrency(d.perShare)}/acción) el ${formatDate(d.date)}
        <div class="modal-actions">
          <button class="btn-edit" data-id="${d.id}">Editar</button>
          <button class="btn-delete" data-id="${d.id}">Eliminar</button>
        </div>
      </div>
    `;
  }
  html += `<div class="summary-card"><strong>Total:</strong> ${formatCurrency(total)}</div>`;
  openModal('Dividendos', html);

  const modalBody = document.querySelector('#modalOverlay .modal-body');
  modalBody.onclick = async (e) => {
    if (e.target.classList.contains('btn-delete')) {
      const id = parseInt(e.target.dataset.id);
      showConfirm('¿Eliminar este dividendo?', async () => {
        await db.dividends.delete(id);
        showDividendsList();
      });
    }
    if (e.target.classList.contains('btn-edit')) {
      const id = parseInt(e.target.dataset.id);
      const div = await db.dividends.get(id);
      if (!div) return;

      // Obtener símbolos de forma segura
      let symbols = [];
      try {
        const txs = await db.transactions.toArray();
        symbols = [...new Set(txs.map(t => t.symbol))];
      } catch (err) {
        console.warn('No se pudieron cargar los símbolos para edición de dividendo');
        symbols = [div.symbol];
      }

      const options = symbols.map(s => `<option value="${s}" ${s === div.symbol ? 'selected' : ''}>${s}</option>`).join('');

      const form = `
        <div class="form-group">
          <label>Símbolo:</label>
          <select id="editDivSymbol">${options}</select>
        </div>
        <div class="form-group">
          <label>Dividendo por acción (€):</label>
          <input type="number" id="editDivPerShare" value="${div.perShare}" step="any" min="0" />
        </div>
        <div class="form-group">
          <label>Total (€):</label>
          <input type="text" id="editDivTotal" readonly />
        </div>
        <div class="form-group">
          <label>Fecha:</label>
          <input type="date" id="editDivDate" value="${div.date}" />
        </div>
        <button id="btnUpdateDiv" class="btn-primary">Guardar</button>
      `;
      openModal('Editar Dividendo', form);

      const perShareInput = document.getElementById('editDivPerShare');
      const totalInput = document.getElementById('editDivTotal');
      const symbolSelect = document.getElementById('editDivSymbol');

      async function updateTotal() {
        const sym = symbolSelect.value;
        let totalQty = 0;
        try {
          const txs = await db.transactions.where('symbol').equals(sym).toArray();
          totalQty = txs.reduce((sum, t) => {
            let qty = 0;
            if (t.type === 'buy') qty += t.quantity;
            if (t.type === 'sell') qty -= t.quantity;
            return sum + qty;
          }, 0);
        } catch (err) {
          console.warn('Error al calcular cantidad para dividendo');
        }
        const perShare = parseFloat(perShareInput.value) || 0;
        totalInput.value = formatCurrency(totalQty * perShare);
      }

      symbolSelect.onchange = updateTotal;
      perShareInput.oninput = updateTotal;
      updateTotal();

      document.getElementById('btnUpdateDiv').onclick = async () => {
        const symbol = symbolSelect.value;
        const perShare = parseFloat(perShareInput.value);
        const date = document.getElementById('editDivDate').value;

        if (isNaN(perShare) || perShare <= 0) {
          showToast('Dividendo por acción inválido.');
          return;
        }

        // Recalcular cantidad y total de forma segura
        let totalQty = 0;
        try {
          const txs = await db.transactions.where('symbol').equals(symbol).toArray();
          totalQty = txs.reduce((sum, t) => {
            let qty = 0;
            if (t.type === 'buy') qty += t.quantity;
            if (t.type === 'sell') qty -= t.quantity;
            return sum + qty;
          }, 0);
        } catch (err) {
          console.error('Error al recalcular cantidad para dividendo:', err);
          showToast('Error al guardar. Ver consola.');
          return;
        }

        const newAmount = totalQty * perShare;

        await db.dividends.update(id, {
          symbol,
          perShare,
          amount: newAmount,
          date
        });

        document.getElementById('modalOverlay').style.display = 'none';
        showDividendsList();
      };
    }
  };
}

async function refreshPrices() {
  const transactions = await db.transactions.toArray();
  if (transactions.length === 0) {
    showToast('No hay transacciones.');
    return;
  }

  const symbols = [...new Set(transactions.map(t => t.symbol))];
  let updated = 0;

  for (const symbol of symbols) {
    let price = null;
    const tx = transactions.find(t => t.symbol === symbol);
    if (tx && tx.assetType === 'crypto') {
      price = await fetchCryptoPrice(symbol);
    } else {
      price = await fetchStockPrice(symbol);
    }
    if (price !== null) {
      await saveCurrentPrice(symbol, price);
      updated++;
    }
  }

  await renderPortfolioSummary();
  showToast(`Precios actualizados: ${updated}/${symbols.length}`);
}

function showManualPriceUpdate() {
  db.transactions.toArray().then(async (txs) => {
    if (txs.length === 0) {
      showToast('No hay transacciones.');
      return;
    }

    const symbols = [...new Set(txs.map(t => t.symbol))];
    let options = '';
    for (const sym of symbols) {
      const current = await getCurrentPrice(sym);
      const display = current !== null ? formatCurrency(current) : '—';
      options += `<option value="${sym}">${sym} (actual: ${display})</option>`;
    }

    const form = `
      <div class="form-group">
        <label>Símbolo:</label>
        <select id="manualSymbol">${options}</select>
      </div>
      <div class="form-group">
        <label>Precio actual (€):</label>
        <input type="number" id="manualPrice" step="any" min="0" />
      </div>
      <button id="btnSetManualPrice" class="btn-primary">Establecer Precio</button>
    `;
    openModal('Actualizar Precio Manualmente', form);

    document.getElementById('btnSetManualPrice').onclick = async () => {
      const symbol = document.getElementById('manualSymbol').value;
      const priceStr = document.getElementById('manualPrice').value;
      const price = parseFloat(priceStr);

      if (isNaN(price) || price <= 0) {
        showToast('Introduce un precio válido.');
        return;
      }

      await saveCurrentPrice(symbol, price);
      document.getElementById('modalOverlay').style.display = 'none';
      await renderPortfolioSummary();
      showToast(`✅ Precio actualizado: ${symbol} = ${formatCurrency(price)}`);
    };
  }).catch(err => {
    console.error('Error en showManualPriceUpdate:', err);
    showToast('Error al cargar símbolos.');
  });
}

function showImportExport() {
  const content = `
    <h3>Exportar / Importar Datos</h3>
    <p class="modal-section">
      <button id="btnExport" class="btn-primary">Exportar a JSON</button>
    </p>
    <p class="modal-section">
      <button id="btnImport" class="btn-primary">Importar desde JSON</button>
    </p>
    <p class="modal-note">
      ⚠️ Importar reemplazará todos tus datos actuales.
    </p>
  `;
  openModal('Exportar / Importar', content);

  document.getElementById('btnExport').onclick = async () => {
    const transactions = await db.transactions.toArray();
    const dividends = await db.dividends.toArray();
    const prices = await db.prices.toArray();
    const data = { transactions, dividends, prices };
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'jj-portfolio-backup.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    document.getElementById('modalOverlay').style.display = 'none';
  };

  document.getElementById('btnImport').onclick = async () => {
    showConfirm('⚠️ Esto borrará todos tus datos actuales. ¿Continuar?', async () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      
      input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        let text, data;
        try {
          text = await file.text();
          data = JSON.parse(text);
          if (!data || typeof data !== 'object') {
            throw new Error('Estructura inválida');
          }
          
          await db.transaction('rw', db.transactions, db.dividends, db.prices, async () => {
            await db.transactions.clear();
            await db.dividends.clear();
            await db.prices.clear();
            if (Array.isArray(data.transactions)) {
              await db.transactions.bulkAdd(data.transactions);
            }
            if (Array.isArray(data.dividends)) {
              await db.dividends.bulkAdd(data.dividends);
            }
            if (Array.isArray(data.prices)) {
              await db.prices.bulkAdd(data.prices);
            }
          });
          
          document.getElementById('modalOverlay').style.display = 'none';
          renderPortfolioSummary();
          showToast('✅ Datos importados correctamente.');
          
        } catch (err) {
          console.error('Error en importación:', err);
          showToast('❌ Error: archivo no válido o corrupto.');
        } finally {
          if (input.parentNode) {
            input.parentNode.removeChild(input);
          }
        }
      };
      
      document.body.appendChild(input);
      input.click();
    });
  };
}

document.addEventListener('DOMContentLoaded', () => {
  db.open().catch(err => {
    console.error('Error al abrir IndexedDB:', err);
    const el = document.getElementById('summary-totals');
    if (el) el.innerHTML = '<p style="color:red">Error de base de datos. Recarga la página.</p>';
  }).then(() => {
    renderPortfolioSummary();
  });

  const menu = document.getElementById('mainMenu');
  if (menu) {
    menu.addEventListener('change', function () {
      const v = this.value;
      this.selectedIndex = 0;
      if (v === 'add-transaction') showAddTransactionForm();
      else if (v === 'view-transactions') showTransactionsList();
      else if (v === 'add-dividend') showAddDividendForm();
      else if (v === 'view-dividends') showDividendsList();
      else if (v === 'refresh-prices') refreshPrices();
      else if (v === 'manual-price') showManualPriceUpdate();
      else if (v === 'import-export') showImportExport();
    });
  }
});
