(function(){
  "use strict";

  // ---------- Supabase setup ----------
  var CFG = window.SUPABASE_CONFIG || {};
  var configured = !!(CFG.url && CFG.anonKey && CFG.url.indexOf('YOUR-PROJECT') === -1 && CFG.anonKey.indexOf('YOUR-ANON') === -1);
  var supabase = null;
  if (configured && window.supabase && window.supabase.createClient) {
    try { supabase = window.supabase.createClient(CFG.url, CFG.anonKey); }
    catch (e) { console.error('Could not create Supabase client', e); supabase = null; }
  }
  var TRIP_ID = 'main';

  var COUPLES = [
    { id:'andik-mirta', name:'Andik & Mirta', short:'A + M' },
    { id:'aljufrey-siti', name:'Aljufrey & Siti', short:'A + S' }
  ];
  var CATEGORIES = [
    { id:'flight', label:'Flights', icon:'icon-plane' },
    { id:'hotel', label:'Hotels', icon:'icon-bed' },
    { id:'activity', label:'Activities', icon:'icon-ticket' },
    { id:'transport', label:'Transport', icon:'icon-car' },
    { id:'food', label:'Food', icon:'icon-bowl' }
  ];

  var DEFAULT_META = { name:'Chengdu', subtitle:'8–15 April 2027', route:'SIN → CTU', rate:5.26 };

  var data = { meta: Object.assign({}, DEFAULT_META), entries: [], settlements: [] };
  var state = { filter:'all', viewer:null, writable:true, saving:false, loaded:!supabase, loadError:false };

  try { state.viewer = localStorage.getItem('chengdu-ledger-viewer') || null; } catch(e) {}

  function coupleName(id){ var c = COUPLES.filter(function(x){return x.id===id;})[0]; return c ? c.name : id; }
  function coupleShort(id){ var c = COUPLES.filter(function(x){return x.id===id;})[0]; return c ? c.short : id; }
  function catInfo(id){ return CATEGORIES.filter(function(x){return x.id===id;})[0] || CATEGORIES[0]; }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function fmt(n){ return (Math.round(n*100)/100).toLocaleString('en-SG', {minimumFractionDigits:2, maximumFractionDigits:2}); }
  function toSGD(amount, currency){ return currency === 'CNY' ? amount / data.meta.rate : amount; }
  function toCNY(amount, currency){ return currency === 'SGD' ? amount * data.meta.rate : amount; }

  // ---------- render: masthead ----------
  function renderMasthead(){
    var totals = computeTotals();
    var el = document.getElementById('masthead');
    var settleHtml;
    if (Math.abs(totals.byCouple['andik-mirta'].balance) < 0.5) {
      settleHtml = '<div class="settle-line even">Settled up</div>';
    } else {
      var amBal = totals.byCouple['andik-mirta'].balance;
      var ower = amBal < 0 ? 'Andik & Mirta' : 'Aljufrey & Siti';
      var amt = Math.abs(amBal);
      settleHtml = '<div class="settle-line owe">' + esc(ower) + ' owe <span class="num">S$' + fmt(amt) + '</span></div>';
    }
    el.innerHTML =
      '<div class="stub stub-left">' +
        '<div class="eyebrow">Trip ledger</div>' +
        '<h1 class="trip-name">' + esc(data.meta.name) + ' <em>getaway</em></h1>' +
        '<div class="route"><svg><use href="#icon-plane"/></svg>' + esc(data.meta.route) + ' &middot; ' + esc(data.meta.subtitle) + '</div>' +
      '</div>' +
      '<div class="perf"></div>' +
      '<div class="stub stub-right">' +
        '<div class="eyebrow">Total logged</div>' +
        '<div class="headline-total num">S$' + fmt(totals.totalSGD) + '</div>' +
        '<div class="headline-sub num">&yen;' + fmt(totals.totalCNY) + ' &middot; ' + data.entries.length + ' ' + (data.entries.length===1?'entry':'entries') + '</div>' +
        settleHtml +
      '</div>';
  }

  // ---------- render: summary cards ----------
  function renderSummary(){
    var totals = computeTotals();
    var el = document.getElementById('summaryRow');
    el.innerHTML = COUPLES.map(function(c){
      var t = totals.byCouple[c.id];
      var isYou = state.viewer === c.id;
      var netClass = t.balance >= 0 ? 'pos' : 'neg';
      var netLabel = Math.abs(t.balance) < 0.5 ? 'Settled' : (t.balance >= 0 ? 'Owed back' : 'Owes group');
      return '<div class="balance-card' + (isYou ? ' is-you' : '') + '">' +
        '<div class="balance-head"><div class="balance-name">' + esc(c.name) + '</div>' + (isYou ? '<div class="you-tag">You</div>' : '') + '</div>' +
        '<div class="balance-rows">' +
          '<div class="r"><span>Paid</span><span class="num">S$' + fmt(t.paid) + '</span></div>' +
          '<div class="r"><span>Their trip spend</span><span class="num">S$' + fmt(t.share) + '</span></div>' +
        '</div>' +
        '<div class="balance-net ' + netClass + '"><span>' + netLabel + '</span><span class="num">S$' + fmt(Math.abs(t.balance)) + '</span></div>' +
      '</div>';
    }).join('');
  }

  // ---------- render: converter ----------
  function renderConverter(fromField){
    var rateEl = document.getElementById('rateInput');
    if (document.activeElement !== rateEl) rateEl.value = data.meta.rate;
    var sgdEl = document.getElementById('convSGD');
    var cnyEl = document.getElementById('convCNY');
    if (fromField === 'sgd') {
      var v = parseFloat(sgdEl.value);
      if (!isNaN(v)) cnyEl.value = (v * data.meta.rate).toFixed(2);
    } else if (fromField === 'cny') {
      var v2 = parseFloat(cnyEl.value);
      if (!isNaN(v2)) sgdEl.value = (v2 / data.meta.rate).toFixed(2);
    }
  }

  // ---------- render: tabs ----------
  function renderTabs(){
    var counts = { all: data.entries.length };
    CATEGORIES.forEach(function(c){ counts[c.id] = data.entries.filter(function(e){ return e.category === c.id; }).length; });
    var el = document.getElementById('tabs');
    var tabsHtml = '<button type="button" class="tab' + (state.filter==='all'?' active':'') + '" data-filter="all">All <span class="count">' + counts.all + '</span></button>';
    tabsHtml += CATEGORIES.map(function(c){
      return '<button type="button" class="tab' + (state.filter===c.id?' active':'') + '" data-filter="' + c.id + '"><svg><use href="#' + c.icon + '"/></svg>' + c.label + ' <span class="count">' + counts[c.id] + '</span></button>';
    }).join('');
    el.innerHTML = tabsHtml;
  }

  // ---------- render: entries ----------
  function renderEntries(){
    var el = document.getElementById('entries');
    var list = data.entries.filter(function(e){ return state.filter === 'all' || e.category === state.filter; });
    if (list.length === 0) {
      var msg = state.filter === 'all' ? 'Log your first flight, hotel or hotpot bill above.' : 'Nothing logged in this category yet.';
      el.innerHTML = '<div class="empty-state"><svg><use href="#icon-tray"/></svg><strong>No entries yet</strong><span>' + msg + '</span></div>';
      return;
    }
    list = list.slice().sort(function(a,b){ return (b.createdAt||'').localeCompare(a.createdAt||''); });
    el.innerHTML = list.map(function(e){
      var ci = catInfo(e.category);
      var sym = e.currency === 'SGD' ? 'S$' : '¥';
      var otherSym = e.currency === 'SGD' ? '¥' : 'S$';
      var otherVal = e.currency === 'SGD' ? toCNY(e.amount, e.currency) : toSGD(e.amount, e.currency);
      var splitLabel;
      if (e.splitMode === 'custom' && e.customShares) {
        splitLabel = COUPLES.map(function(c){ return coupleShort(c.id) + ' ' + sym + fmt(e.customShares[c.id] || 0); }).join(' · ');
      } else if (e.splitAmong && e.splitAmong.length === 1) {
        splitLabel = coupleShort(e.splitAmong[0]) + ' only';
      } else {
        splitLabel = 'Split ' + (e.splitAmong||[]).map(coupleShort).join(' / ');
      }
      return '<div class="entry-row" data-id="' + esc(e.id) + '">' +
        '<div class="entry-icon"><svg><use href="#' + ci.icon + '"/></svg></div>' +
        '<div class="entry-main">' +
          '<div class="entry-desc">' + esc(e.description) + '</div>' +
          '<div class="entry-meta">' +
            '<span>' + esc(coupleShort(e.paidBy)) + ' paid</span>' +
            (e.date ? '<span>' + esc(e.date) + '</span>' : '') +
            (e.reference ? '<span>' + esc(e.reference) + '</span>' : '') +
            '<span class="status-pill ' + e.status + '">' + (e.status === 'confirmed' ? 'Confirmed' : 'Estimate') + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="entry-amount num">' + sym + fmt(e.amount) + '<span class="sub">' + otherSym + fmt(otherVal) + '</span></div>' +
        '<div class="entry-split">' + esc(splitLabel) + '</div>' +
        '<button class="entry-del" data-del="' + esc(e.id) + '" title="Remove entry" aria-label="Remove entry"><svg><use href="#icon-x"/></svg></button>' +
      '</div>';
    }).join('');
  }

  // ---------- render: breakdown ----------
  function renderBreakdown(){
    var totals = computeTotals();
    var el = document.getElementById('breakdownRows');
    if (totals.totalSGD <= 0) {
      el.innerHTML = '<div style="font-size:13px;color:var(--muted)">Nothing to break down yet &mdash; it fills in as you log entries.</div>';
      return;
    }
    var max = Math.max.apply(null, CATEGORIES.map(function(c){ return totals.byCategory[c.id] || 0; }));
    el.innerHTML = '<div style="display:flex;flex-direction:column;gap:10px">' + CATEGORIES.map(function(c){
      var v = totals.byCategory[c.id] || 0;
      var pct = max > 0 ? Math.max(v > 0 ? 2 : 0, (v / max) * 100) : 0;
      return '<div class="bd-row">' +
        '<div class="bd-icon"><svg><use href="#' + c.icon + '"/></svg></div>' +
        '<div class="bd-label">' + c.label + '</div>' +
        '<div class="bd-track"><div class="bd-fill" style="width:' + pct + '%"></div></div>' +
        '<div class="bd-amount num">S$' + fmt(v) + '</div>' +
      '</div>';
    }).join('') + '</div>';
  }

  function computeTotals(){
    var byCategory = {}, byCouple = {};
    COUPLES.forEach(function(c){ byCouple[c.id] = { paid:0, share:0, balance:0 }; });
    var totalSGD = 0;
    data.entries.forEach(function(e){
      var sgd = toSGD(e.amount, e.currency);
      totalSGD += sgd;
      byCategory[e.category] = (byCategory[e.category] || 0) + sgd;
      if (byCouple[e.paidBy]) byCouple[e.paidBy].paid += sgd;
      if (e.splitMode === 'custom' && e.customShares) {
        COUPLES.forEach(function(c){
          var shareSgd = toSGD(e.customShares[c.id] || 0, e.currency);
          byCouple[c.id].share += shareSgd;
        });
      } else {
        var split = (e.splitAmong && e.splitAmong.length) ? e.splitAmong : COUPLES.map(function(c){return c.id;});
        var shareEach = sgd / split.length;
        split.forEach(function(cid){ if (byCouple[cid]) byCouple[cid].share += shareEach; });
      }
    });
    COUPLES.forEach(function(c){ byCouple[c.id].balance = byCouple[c.id].paid - byCouple[c.id].share; });
    (data.settlements || []).forEach(function(s){
      var sgd = toSGD(s.amount, s.currency);
      if (byCouple[s.from]) byCouple[s.from].balance += sgd;
      if (byCouple[s.to]) byCouple[s.to].balance -= sgd;
    });
    return { totalSGD: totalSGD, totalCNY: totalSGD * data.meta.rate, byCategory: byCategory, byCouple: byCouple };
  }

  function renderAll(){
    renderMasthead();
    renderWhoamiBar();
    renderSpendSplit();
    renderSummary();
    renderSettleCard();
    renderConverter();
    renderTabs();
    renderEntries();
    renderBreakdown();
    syncSettingsFields();
    renderSyncBanner();
  }

  function renderSyncBanner(){
    var el = document.getElementById('syncBanner');
    var submitBtn = document.querySelector('#entryForm button[type="submit"]');
    el.className = 'sync-banner';
    if (!configured) {
      el.classList.add('show', 'readonly');
      el.innerHTML = 'Not connected to Supabase yet &mdash; entries stay only in this browser tab and won\'t be shared. See README.md to connect it (~10 min).';
    } else if (state.loadError) {
      el.classList.add('show', 'readonly');
      el.textContent = 'Could not reach Supabase — check your connection, or double-check the values in config.js.';
    } else if (!state.loaded) {
      el.classList.add('show');
      el.textContent = 'Loading the ledger…';
    } else if (state.saving) {
      el.classList.add('show');
      el.textContent = 'Saving for everyone…';
    }
    if (submitBtn) submitBtn.disabled = state.saving || !state.writable;
  }

  function syncSettingsFields(){
    var nameEl = document.getElementById('setName'), subEl = document.getElementById('setSub'),
        routeEl = document.getElementById('setRoute');
    if (document.activeElement !== nameEl) nameEl.value = data.meta.name;
    if (document.activeElement !== subEl) subEl.value = data.meta.subtitle;
    if (document.activeElement !== routeEl) routeEl.value = data.meta.route;
  }

  // ---------- render: logging-as bar ----------
  function renderWhoamiBar(){
    var el = document.getElementById('whoamiBar');
    el.innerHTML = '<div class="whoami-label">Logging as</div><div class="whoami-pills">' +
      COUPLES.map(function(c){
        return '<button type="button" class="whoami-pill' + (state.viewer === c.id ? ' active' : '') + '" data-who="' + c.id + '">' + esc(c.name) + '</button>';
      }).join('') + '</div>';
  }

  // ---------- render: trip spend split ----------
  function renderSpendSplit(){
    var totals = computeTotals();
    var el = document.getElementById('spendSplit');
    if (totals.totalSGD <= 0) {
      el.innerHTML = '<div class="spend-split-title">Trip spend split</div><div style="font-size:13px;color:var(--muted)">Nothing spent yet &mdash; this fills in as you log entries.</div>';
      return;
    }
    var a = totals.byCouple['andik-mirta'].share;
    var b = totals.byCouple['aljufrey-siti'].share;
    var pctA = totals.totalSGD > 0 ? (a / totals.totalSGD * 100) : 50;
    var pctB = 100 - pctA;
    el.innerHTML =
      '<div class="spend-split-title">Trip spend split &middot; <span class="num">S$' + fmt(totals.totalSGD) + '</span> total</div>' +
      '<div class="spend-split-bar"><div class="spend-split-seg a" style="width:' + pctA + '%"></div><div class="spend-split-seg b" style="width:' + pctB + '%"></div></div>' +
      '<div class="spend-split-legend">' +
        '<div class="item"><span class="dot a"></span>Andik &amp; Mirta &middot; <span class="num">S$' + fmt(a) + '</span> (' + Math.round(pctA) + '%)</div>' +
        '<div class="item"><span class="dot b"></span>Aljufrey &amp; Siti &middot; <span class="num">S$' + fmt(b) + '</span> (' + Math.round(pctB) + '%)</div>' +
      '</div>';
  }

  // ---------- render: settle up ----------
  function renderSettleCard(){
    var totals = computeTotals();
    var el = document.getElementById('settleCard');
    var amBal = totals.byCouple['andik-mirta'].balance;
    var settled = Math.abs(amBal) < 0.5;
    var ower = amBal < 0 ? 'andik-mirta' : 'aljufrey-siti';
    var owed = amBal < 0 ? 'aljufrey-siti' : 'andik-mirta';
    var owedAmount = Math.abs(amBal);

    var statusHtml = settled
      ? '<div class="settle-status-row"><div class="settle-status-text">You\'re settled up &mdash; nobody owes anybody right now.</div></div>'
      : '<div class="settle-status-row">' +
          '<div class="settle-status-text">' + esc(coupleName(ower)) + ' owe ' + esc(coupleName(owed)) + ' <span class="num">S$' + fmt(owedAmount) + '</span></div>' +
          '<button type="button" class="btn" id="settleToggleBtn">Record a settlement</button>' +
        '</div>' +
        '<form class="settle-form" id="settleForm" hidden>' +
          '<div class="field"><label for="settleFrom">Paid by</label><select id="settleFrom">' +
            COUPLES.map(function(c){ return '<option value="' + c.id + '"' + (c.id === ower ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('') +
          '</select></div>' +
          '<div class="field"><label for="settleTo">Paid to</label><select id="settleTo">' +
            COUPLES.map(function(c){ return '<option value="' + c.id + '"' + (c.id === owed ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('') +
          '</select></div>' +
          '<div class="field"><label for="settleAmount">Amount</label><input type="number" id="settleAmount" step="0.01" min="0" value="' + fmt(owedAmount).replace(/,/g,'') + '"></div>' +
          '<div class="field"><label for="settleCurrency">Currency</label><select id="settleCurrency"><option value="SGD">SGD</option><option value="CNY">CNY</option></select></div>' +
          '<div class="field wide"><label for="settleNote">Note (optional)</label><input type="text" id="settleNote" placeholder="e.g. PayNow transfer" maxlength="60"></div>' +
          '<div class="field"><label for="settleDate">Date</label><input type="date" id="settleDate"></div>' +
          '<div class="actions-row">' +
            '<button type="button" class="btn" id="settleCancelBtn">Cancel</button>' +
            '<button type="submit" class="btn btn-primary">Log settlement</button>' +
          '</div>' +
        '</form>';

    var historyHtml = '';
    if (data.settlements && data.settlements.length) {
      var rows = data.settlements.slice().sort(function(x,y){ return (y.createdAt||'').localeCompare(x.createdAt||''); }).map(function(s){
        var sym = s.currency === 'SGD' ? 'S$' : '¥';
        return '<div class="settle-row"><span>' + esc(coupleName(s.from)) + ' &rarr; ' + esc(coupleName(s.to)) + (s.date ? ' &middot; ' + esc(s.date) : '') + (s.note ? ' &middot; ' + esc(s.note) : '') + '</span><span style="display:flex;align-items:center;gap:8px"><span class="num">' + sym + fmt(s.amount) + '</span><button class="settle-del" data-settledel="' + esc(s.id) + '" title="Remove" aria-label="Remove settlement"><svg><use href="#icon-x"/></svg></button></span></div>';
      }).join('');
      historyHtml = '<div class="settle-history">' + rows + '</div>';
    }

    el.innerHTML = '<div class="card-title">Settle up</div>' + statusHtml + historyHtml;
  }

  // ---------- static selects ----------
  (function initSelects(){
    var fc = document.getElementById('fCategory');
    fc.innerHTML = CATEGORIES.map(function(c){ return '<option value="' + c.id + '">' + c.label + '</option>'; }).join('');
    var fp = document.getElementById('fPaidBy');
    if (state.viewer) fp.value = state.viewer;
  })();

  // ---------- data layer (Supabase) ----------
  // Every couple's browser talks directly to the same Supabase project.
  // Writes go straight to Postgres; a realtime subscription tells every
  // open tab (including the one that made the change) to reload the
  // tables, so everyone converges on the same data automatically.

  function rowToEntry(row){
    return {
      id: row.id,
      category: row.category,
      description: row.description,
      amount: Number(row.amount),
      currency: row.currency,
      paidBy: row.paid_by,
      date: row.date || '',
      reference: row.reference || '',
      splitMode: row.split_mode || 'even',
      splitAmong: row.split_among || [],
      customShares: row.custom_shares || null,
      status: row.status || 'confirmed',
      createdAt: row.created_at
    };
  }
  function entryToRow(e){
    return {
      id: e.id,
      category: e.category,
      description: e.description,
      amount: e.amount,
      currency: e.currency,
      paid_by: e.paidBy,
      date: e.date || '',
      reference: e.reference || '',
      split_mode: e.splitMode || 'even',
      split_among: e.splitAmong || [],
      custom_shares: e.customShares || null,
      status: e.status || 'confirmed',
      created_at: e.createdAt
    };
  }
  function rowToSettlement(row){
    return {
      id: row.id,
      from: row.from_couple,
      to: row.to_couple,
      amount: Number(row.amount),
      currency: row.currency,
      date: row.date || '',
      note: row.note || '',
      createdAt: row.created_at
    };
  }
  function settlementToRow(s){
    return {
      id: s.id,
      from_couple: s.from,
      to_couple: s.to,
      amount: s.amount,
      currency: s.currency,
      date: s.date || '',
      note: s.note || '',
      created_at: s.createdAt
    };
  }

  async function loadAll(){
    if (!supabase) { state.loaded = true; renderAll(); return; }
    try {
      var metaRes = await supabase.from('trip_meta').select('*').eq('id', TRIP_ID).maybeSingle();
      if (metaRes.error) throw metaRes.error;
      if (metaRes.data) {
        data.meta = {
          name: metaRes.data.name, subtitle: metaRes.data.subtitle,
          route: metaRes.data.route, rate: Number(metaRes.data.rate)
        };
      } else {
        var seed = Object.assign({ id: TRIP_ID }, DEFAULT_META);
        var insertRes = await supabase.from('trip_meta').insert(seed);
        if (insertRes.error) throw insertRes.error;
        data.meta = Object.assign({}, DEFAULT_META);
      }

      var entriesRes = await supabase.from('entries').select('*').order('created_at', { ascending: false });
      if (entriesRes.error) throw entriesRes.error;
      data.entries = (entriesRes.data || []).map(rowToEntry);

      var settleRes = await supabase.from('settlements').select('*').order('created_at', { ascending: false });
      if (settleRes.error) throw settleRes.error;
      data.settlements = (settleRes.data || []).map(rowToSettlement);

      state.loaded = true;
      state.loadError = false;
    } catch (e) {
      console.error('Supabase load failed', e);
      state.loadError = true;
    }
    renderAll();
  }

  function subscribeRealtime(){
    if (!supabase) return;
    supabase
      .channel('chengdu-ledger-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'entries' }, function(){ loadAll(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settlements' }, function(){ loadAll(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_meta' }, function(){ loadAll(); })
      .subscribe();
  }

  async function saveMeta(patch){
    data.meta = Object.assign({}, data.meta, patch);
    renderAll();
    if (!supabase) return;
    state.saving = true; renderAll();
    try {
      var row = Object.assign({ id: TRIP_ID }, data.meta);
      var res = await supabase.from('trip_meta').upsert(row);
      if (res.error) throw res.error;
    } catch (e) {
      console.error('save meta failed', e);
      alert('Could not save that change. Please try again.');
    }
    state.saving = false; renderAll();
  }

  async function addEntryToStore(entry){
    entry.id = 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    entry.createdAt = new Date().toISOString();
    data.entries.unshift(entry);
    renderAll();
    if (!supabase) return;
    state.saving = true; renderAll();
    try {
      var res = await supabase.from('entries').insert(entryToRow(entry));
      if (res.error) throw res.error;
    } catch (e) {
      console.error('add entry failed', e);
      data.entries = data.entries.filter(function(x){ return x.id !== entry.id; });
      alert('Could not save that entry. Please try again.');
    }
    state.saving = false; renderAll();
  }

  async function deleteEntry(id){
    var prev = data.entries;
    data.entries = data.entries.filter(function(e){ return e.id !== id; });
    renderAll();
    if (!supabase) return;
    try {
      var res = await supabase.from('entries').delete().eq('id', id);
      if (res.error) throw res.error;
    } catch (e) {
      console.error('delete entry failed', e);
      data.entries = prev;
      renderAll();
      alert('Could not delete that entry. Please try again.');
    }
  }

  async function addSettlement(settlement){
    settlement.id = 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    data.settlements.push(settlement);
    renderAll();
    if (!supabase) return;
    state.saving = true; renderAll();
    try {
      var res = await supabase.from('settlements').insert(settlementToRow(settlement));
      if (res.error) throw res.error;
    } catch (e) {
      console.error('add settlement failed', e);
      data.settlements = data.settlements.filter(function(x){ return x.id !== settlement.id; });
      alert('Could not save that settlement. Please try again.');
    }
    state.saving = false; renderAll();
  }

  async function deleteSettlement(id){
    var prev = data.settlements;
    data.settlements = data.settlements.filter(function(s){ return s.id !== id; });
    renderAll();
    if (!supabase) return;
    try {
      var res = await supabase.from('settlements').delete().eq('id', id);
      if (res.error) throw res.error;
    } catch (e) {
      console.error('delete settlement failed', e);
      data.settlements = prev;
      renderAll();
      alert('Could not delete that settlement. Please try again.');
    }
  }

  // ---------- events ----------
  document.getElementById('gearBtn').addEventListener('click', function(){
    document.getElementById('settingsPanel').classList.toggle('open');
  });
  document.getElementById('settingsCancel').addEventListener('click', function(){
    document.getElementById('settingsPanel').classList.remove('open');
    syncSettingsFields();
  });
  document.getElementById('settingsSave').addEventListener('click', function(){
    var name = document.getElementById('setName').value.trim() || data.meta.name;
    var sub = document.getElementById('setSub').value.trim() || data.meta.subtitle;
    var route = document.getElementById('setRoute').value.trim() || data.meta.route;
    saveMeta({ name: name, subtitle: sub, route: route });
    document.getElementById('settingsPanel').classList.remove('open');
  });

  document.getElementById('tabs').addEventListener('click', function(ev){
    var btn = ev.target.closest('.tab');
    if (!btn) return;
    state.filter = btn.getAttribute('data-filter');
    renderTabs();
    renderEntries();
  });

  document.getElementById('whoamiBar').addEventListener('click', function(ev){
    var btn = ev.target.closest('.whoami-pill');
    if (!btn) return;
    var who = btn.getAttribute('data-who');
    state.viewer = (state.viewer === who) ? null : who;
    try {
      if (state.viewer) localStorage.setItem('chengdu-ledger-viewer', state.viewer);
      else localStorage.removeItem('chengdu-ledger-viewer');
    } catch(e) {}
    var fp = document.getElementById('fPaidBy');
    if (state.viewer) fp.value = state.viewer;
    renderWhoamiBar();
    renderSummary();
  });

  document.getElementById('settleCard').addEventListener('click', function(ev){
    var toggleBtn = ev.target.closest('#settleToggleBtn');
    var cancelBtn = ev.target.closest('#settleCancelBtn');
    var delBtn = ev.target.closest('[data-settledel]');
    if (toggleBtn) {
      document.getElementById('settleForm').hidden = false;
      var dateEl = document.getElementById('settleDate');
      if (dateEl && !dateEl.value) dateEl.value = new Date().toISOString().slice(0, 10);
      return;
    }
    if (cancelBtn) {
      document.getElementById('settleForm').hidden = true;
      return;
    }
    if (delBtn) {
      deleteSettlement(delBtn.getAttribute('data-settledel'));
      return;
    }
  });

  document.getElementById('settleCard').addEventListener('submit', function(ev){
    var form = ev.target.closest('#settleForm');
    if (!form) return;
    ev.preventDefault();
    var amount = parseFloat(document.getElementById('settleAmount').value);
    if (isNaN(amount) || amount <= 0) return;
    var settlement = {
      from: document.getElementById('settleFrom').value,
      to: document.getElementById('settleTo').value,
      amount: amount,
      currency: document.getElementById('settleCurrency').value,
      date: document.getElementById('settleDate').value || '',
      note: document.getElementById('settleNote').value.trim(),
      createdAt: new Date().toISOString()
    };
    if (settlement.from === settlement.to) { alert('Paid by and paid to need to be different couples.'); return; }
    addSettlement(settlement);
  });

  document.getElementById('convSGD').addEventListener('input', function(){ renderConverter('sgd'); });
  document.getElementById('convCNY').addEventListener('input', function(){ renderConverter('cny'); });
  document.getElementById('rateInput').addEventListener('change', function(ev){
    var v = parseFloat(ev.target.value);
    if (!isNaN(v) && v > 0) saveMeta({ rate: v });
  });

  var currentStatus = 'confirmed';
  document.querySelectorAll('.status-toggle .chip-toggle').forEach(function(btn){
    btn.addEventListener('click', function(){
      document.querySelectorAll('.status-toggle .chip-toggle').forEach(function(b){ b.classList.remove('active'); });
      btn.classList.add('active');
      currentStatus = btn.getAttribute('data-status');
    });
  });

  // ---------- split mode (even vs custom amounts) ----------
  var currentSplitMode = 'even';

  function fmtInput(n){ return (Math.round(n * 100) / 100).toFixed(2); }

  function updateRemainder(){
    if (currentSplitMode !== 'custom') return;
    var amount = parseFloat(document.getElementById('fAmount').value) || 0;
    var amAM = parseFloat(document.getElementById('customAM').value) || 0;
    var amAS = parseFloat(document.getElementById('customAS').value) || 0;
    var remainder = Math.round((amount - amAM - amAS) * 100) / 100;
    var el = document.getElementById('customRemainder');
    var sym = document.getElementById('fCurrency').value === 'SGD' ? 'S$' : '¥';
    if (Math.abs(remainder) < 0.01) {
      el.textContent = 'Balanced against the ' + sym + fmtInput(amount) + ' total.';
      el.className = 'custom-remainder balanced';
    } else if (remainder > 0) {
      el.textContent = sym + fmtInput(remainder) + ' left to assign.';
      el.className = 'custom-remainder off';
    } else {
      el.textContent = sym + fmtInput(Math.abs(remainder)) + ' over the total — reduce one side.';
      el.className = 'custom-remainder off';
    }
  }

  document.querySelectorAll('#splitModeToggle .chip-toggle').forEach(function(btn){
    btn.addEventListener('click', function(){
      document.querySelectorAll('#splitModeToggle .chip-toggle').forEach(function(b){ b.classList.remove('active'); });
      btn.classList.add('active');
      currentSplitMode = btn.getAttribute('data-splitmode');
      document.getElementById('splitEvenControls').hidden = currentSplitMode !== 'even';
      document.getElementById('splitCustomControls').hidden = currentSplitMode !== 'custom';
      if (currentSplitMode === 'custom') {
        var amount = parseFloat(document.getElementById('fAmount').value) || 0;
        var amAM = document.getElementById('customAM'), amAS = document.getElementById('customAS');
        if (!amAM.value && !amAS.value && amount > 0) {
          amAM.value = fmtInput(amount / 2);
          amAS.value = fmtInput(amount / 2);
        }
        updateRemainder();
      }
    });
  });
  document.getElementById('fAmount').addEventListener('input', updateRemainder);
  document.getElementById('customAM').addEventListener('input', updateRemainder);
  document.getElementById('customAS').addEventListener('input', updateRemainder);

  document.getElementById('entries').addEventListener('click', function(ev){
    var btn = ev.target.closest('[data-del]');
    if (!btn) return;
    deleteEntry(btn.getAttribute('data-del'));
  });

  document.getElementById('entryForm').addEventListener('submit', function(ev){
    ev.preventDefault();
    var amount = parseFloat(document.getElementById('fAmount').value);
    if (isNaN(amount) || amount <= 0) return;

    var entry = {
      category: document.getElementById('fCategory').value,
      description: document.getElementById('fDesc').value.trim(),
      amount: amount,
      currency: document.getElementById('fCurrency').value,
      paidBy: document.getElementById('fPaidBy').value,
      date: document.getElementById('fDate').value || '',
      reference: document.getElementById('fRef').value.trim(),
      splitMode: currentSplitMode,
      status: currentStatus
    };

    if (currentSplitMode === 'custom') {
      var amAM = parseFloat(document.getElementById('customAM').value) || 0;
      var amAS = parseFloat(document.getElementById('customAS').value) || 0;
      if (Math.abs(amount - amAM - amAS) >= 0.01) {
        alert('The custom amounts need to add up to the total (' + (entry.currency === 'SGD' ? 'S$' : '¥') + fmtInput(amount) + ').');
        return;
      }
      entry.customShares = { 'andik-mirta': amAM, 'aljufrey-siti': amAS };
      entry.splitAmong = COUPLES.filter(function(c){ return entry.customShares[c.id] > 0; }).map(function(c){ return c.id; });
    } else {
      var split = [];
      if (document.getElementById('splitAM').checked) split.push('andik-mirta');
      if (document.getElementById('splitAS').checked) split.push('aljufrey-siti');
      if (split.length === 0) { alert('Pick at least one couple to split this with.'); return; }
      entry.splitAmong = split;
    }

    if (!entry.description) return;
    addEntryToStore(entry);
    ev.target.reset();
    document.getElementById('splitAM').checked = true;
    document.getElementById('splitAS').checked = true;
    document.getElementById('customAM').value = '';
    document.getElementById('customAS').value = '';
    document.getElementById('customRemainder').textContent = '';
    currentSplitMode = 'even';
    document.getElementById('splitEvenControls').hidden = false;
    document.getElementById('splitCustomControls').hidden = true;
    document.querySelectorAll('#splitModeToggle .chip-toggle').forEach(function(b){ b.classList.remove('active'); });
    document.querySelector('#splitModeToggle .chip-toggle[data-splitmode="even"]').classList.add('active');
    if (state.viewer) document.getElementById('fPaidBy').value = state.viewer;
    document.querySelectorAll('.status-toggle .chip-toggle').forEach(function(b){ b.classList.remove('active'); });
    document.querySelector('.status-toggle .chip-toggle[data-status="confirmed"]').classList.add('active');
    currentStatus = 'confirmed';
  });

  // ---------- boot ----------
  renderAll();
  loadAll().then(subscribeRealtime);
})();
