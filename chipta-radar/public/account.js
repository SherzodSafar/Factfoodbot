/* Akkaunt va ma'lumotlar Web App — mantiq (vanilla JS, Telegram WebApp). */
(function () {
  'use strict';

  var tg = window.Telegram && window.Telegram.WebApp;
  try {
    if (tg) { tg.ready(); tg.expand(); }
  } catch (e) { /* eski versiya */ }

  var INIT_DATA = (tg && tg.initData) || '';
  var state = { account: null, passengers: [], orders: [], features: {} };

  /* ---------- Telegram mavzusi ---------- */
  try {
    var p = tg && tg.themeParams;
    if (p && p.bg_color) {
      var root = document.documentElement.style;
      root.setProperty('--bg', p.secondary_bg_color || p.bg_color);
      root.setProperty('--card', p.bg_color);
      root.setProperty('--text', p.text_color || '#1a1a1a');
      root.setProperty('--muted', p.hint_color || '#8a8f98');
      root.setProperty('--primary', p.button_color || '#3390ec');
    }
  } catch (e) { /* muhim emas */ }

  /* ---------- API ---------- */
  function api(path, options) {
    options = options || {};
    var headers = { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': INIT_DATA };
    return fetch('/api/client' + path, {
      method: options.method || 'GET',
      headers: headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    }).then(function (res) {
      return res.json().catch(function () { return { ok: false, error: 'Serverdan javob kelmadi' }; })
        .then(function (data) {
          if (!res.ok || data.ok === false) {
            var err = new Error(data.error || 'Xatolik yuz berdi');
            err.code = data.code; err.status = res.status;
            throw err;
          }
          return data;
        });
    });
  }

  /* ---------- UI yordamchilari ---------- */
  var $ = function (id) { return document.getElementById(id); };
  var toastTimer;
  function toast(message, isError) {
    var el = $('toast');
    el.textContent = message;
    el.className = 'toast show' + (isError ? ' err' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.className = 'toast'; }, 3200);
    try { if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred(isError ? 'error' : 'success'); } catch (e) {}
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
  function busy(btn, on, label) {
    if (!btn) return;
    btn.disabled = on;
    if (on) { btn.dataset.label = btn.textContent; btn.textContent = label || 'Kuting…'; }
    else if (btn.dataset.label) { btn.textContent = btn.dataset.label; }
  }

  /* ---------- Tablar ---------- */
  var tabs = document.querySelectorAll('.tab');
  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      tabs.forEach(function (t) { t.classList.remove('active'); });
      tab.classList.add('active');
      ['account', 'passenger', 'orders'].forEach(function (name) {
        $('tab-' + name).classList.toggle('hidden', name !== tab.dataset.tab);
      });
      if (tab.dataset.tab === 'orders') loadOrders();
    });
  });

  /* ---------- Holat satri ---------- */
  function renderStatus() {
    var acc = state.account || {};
    var dot = $('statusDot'), text = $('statusText');
    if (acc.connected) {
      dot.className = 'dot on';
      text.textContent = 'Akkaunt ulangan · yo\'lovchi: ' + state.passengers.length;
    } else {
      dot.className = 'dot';
      text.textContent = 'Akkaunt hali ulanmagan · yo\'lovchi: ' + state.passengers.length;
    }
    var connected = $('connectedCard'), form = $('connectForm');
    if (acc.connected) {
      connected.style.display = '';
      form.style.display = 'none';
      $('connectedLogin').textContent = acc.loginMasked || '';
    } else {
      connected.style.display = 'none';
      form.style.display = '';
      if (acc.status === 'EXPIRED') toast('Akkaunt muddati tugagan. Qaytadan ulang.', true);
    }
  }

  /* ---------- Akkaunt ulash ---------- */
  $('connectBtn').addEventListener('click', function () {
    var login = $('login').value.trim();
    var password = $('password').value;
    var consent = $('accountConsent').checked;
    if (!login) return toast('Telefon yoki emailni kiriting', true);
    if (!password) return toast('Parolni kiriting', true);
    if (!consent) return toast('Roziligingizni belgilang', true);
    busy($('connectBtn'), true, 'Ulanmoqda…');
    api('/account/connect', { method: 'POST', body: { login: login, password: password, consent: consent } })
      .then(function (data) {
        state.account = data.account;
        $('password').value = '';
        renderStatus();
        toast('Akkaunt ulandi ✅');
      })
      .catch(function (err) { toast(err.message, true); })
      .finally(function () { busy($('connectBtn'), false); });
  });

  $('disconnectBtn').addEventListener('click', function () {
    confirmBox('Akkauntni uzasizmi? Kirish tokeni o\'chiriladi.', function (ok) {
      if (!ok) return;
      busy($('disconnectBtn'), true, 'Uzilmoqda…');
      api('/account/disconnect', { method: 'POST', body: {} })
        .then(function (data) { state.account = data.account; renderStatus(); toast('Akkaunt uzildi'); })
        .catch(function (err) { toast(err.message, true); })
        .finally(function () { busy($('disconnectBtn'), false); });
    });
  });

  function confirmBox(message, cb) {
    try { if (tg && tg.showConfirm && INIT_DATA) { tg.showConfirm(message, cb); return; } } catch (e) {}
    cb(window.confirm(message));
  }

  /* ---------- Yo'lovchilar ---------- */
  function renderPassengers() {
    var box = $('passengerList');
    if (!state.passengers.length) { box.innerHTML = '<p class="empty">Hali yo\'lovchi qo\'shilmagan.</p>'; return; }
    box.innerHTML = state.passengers.map(function (p) {
      var cat = p.categoryLabel ? '<span class="badge ' + (p.category === 'child' ? 'child' : '') + '">' + esc(p.categoryLabel) + '</span>' : '';
      var title = p.label ? esc(p.label) + ' · ' + esc(p.name) : esc(p.name);
      return '<div class="list-item"><div><div>' + title + ' ' + cat + '</div>' +
        '<div class="meta">' + esc(p.doc) + (p.locked ? ' · 🔒' : '') + '</div></div>' +
        '<button class="icon-btn" data-del="' + p.id + '" title="O\'chirish">🗑</button></div>';
    }).join('');
    box.querySelectorAll('[data-del]').forEach(function (btn) {
      btn.addEventListener('click', function () { deletePassenger(btn.getAttribute('data-del')); });
    });
  }

  $('addPassengerBtn').addEventListener('click', function () {
    var body = {
      label: $('p_label').value.trim(),
      firstName: $('p_first').value.trim(),
      lastName: $('p_last').value.trim(),
      docNumber: $('p_doc').value.trim(),
      birthDate: $('p_birth').value,
      gender: $('p_gender').value,
      region: $('p_region') ? $('p_region').value : '',
      consent: $('passengerConsent').checked,
    };
    if (!body.firstName || !body.lastName) return toast('Ism va familiyani kiriting', true);
    if (!body.docNumber) return toast('Pasport/ID raqamini kiriting', true);
    if (!body.birthDate) return toast('Tug\'ilgan sanani tanlang', true);
    if (!body.consent) return toast('Shifrlab saqlashga roziligingizni belgilang', true);
    busy($('addPassengerBtn'), true, 'Saqlanmoqda…');
    api('/passengers', { method: 'POST', body: body })
      .then(function (data) {
        state.passengers = data.passengers;
        ['p_label', 'p_first', 'p_last', 'p_doc', 'p_birth'].forEach(function (id) { $(id).value = ''; });
        $('passengerConsent').checked = false;
        renderPassengers(); renderStatus();
        toast('Yo\'lovchi shifrlab saqlandi 🔒');
      })
      .catch(function (err) { toast(err.message, true); })
      .finally(function () { busy($('addPassengerBtn'), false); });
  });

  function deletePassenger(id) {
    confirmBox('Yo\'lovchini o\'chirasizmi?', function (ok) {
      if (!ok) return;
      api('/passengers/' + id, { method: 'DELETE' })
        .then(function (data) { state.passengers = data.passengers; renderPassengers(); renderStatus(); toast('O\'chirildi'); })
        .catch(function (err) { toast(err.message, true); });
    });
  }

  /* ---------- Buyurtmalar va to'lov ---------- */
  function loadOrders() {
    var empty = $('ordersEmpty');
    if (!state.account || !state.account.connected) {
      $('ordersList').innerHTML = '<p class="empty">⚠️ Akkaunt ulanmagan</p>';
      fillOrderSelect([]);
      return;
    }
    $('ordersList').innerHTML = '<p class="empty">Yuklanmoqda…</p>';
    api('/orders')
      .then(function (data) {
        state.orders = data.orders || [];
        renderOrders();
      })
      .catch(function (err) {
        $('ordersList').innerHTML = '<p class="empty">' + esc(err.message) + '</p>';
      });
  }

  function money(n) { return n ? String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' so\'m' : ''; }

  function renderOrders() {
    var box = $('ordersList');
    if (!state.orders.length) { box.innerHTML = '<p class="empty">Faol buyurtma yo\'q.</p>'; fillOrderSelect([]); return; }
    box.innerHTML = state.orders.map(function (o) {
      var paid = !o.payable;
      var badge = '<span class="badge ' + (paid ? 'ok' : 'wait') + '">' + (paid ? 'to\'langan' : 'to\'lov kutilmoqda') + '</span>';
      var route = [o.from, o.to].filter(Boolean).join(' → ');
      return '<div class="list-item"><div><div>№ ' + esc(o.orderId) + ' ' + badge + '</div>' +
        '<div class="meta">' + esc(o.trainNumber || '') + (route ? ' · ' + esc(route) : '') + (o.date ? ' · ' + esc(o.date) : '') + (o.amount ? ' · ' + money(o.amount) : '') + '</div></div></div>';
    }).join('');
    fillOrderSelect(state.orders.filter(function (o) { return o.payable; }));
  }

  function fillOrderSelect(orders) {
    var sel = $('payOrder');
    var opts = ['<option value="">—</option>'].concat(orders.map(function (o) {
      return '<option value="' + esc(o.orderId) + '">№ ' + esc(o.orderId) + (o.amount ? ' · ' + money(o.amount) : '') + '</option>';
    }));
    sel.innerHTML = opts.join('');
  }

  function pay(provider, btn) {
    var orderId = $('payOrder').value;
    var phone = $('payPhone').value.trim();
    var consent = $('payConsent').checked;
    if (!orderId) return toast('Buyurtma raqamini tanlang', true);
    if (!consent) return toast('To\'lov so\'roviga roziligingizni belgilang', true);
    busy(btn, true, 'Yuborilmoqda…');
    api('/orders/pay', { method: 'POST', body: { orderId: orderId, provider: provider, phone: phone, consent: consent } })
      .then(function () { toast(provider === 'payme' ? 'Payme ilovangizga so\'rov yuborildi' : 'Click ilovangizga so\'rov yuborildi'); })
      .catch(function (err) { toast(err.message, true); })
      .finally(function () { busy(btn, false); });
  }
  $('paymeBtn').addEventListener('click', function () { pay('payme', this); });
  $('clickBtn').addEventListener('click', function () { pay('click', this); });

  /* ---------- Yoqilganlikka qarab ko'rsatish ---------- */
  function applyFeatures() {
    var f = state.features || {};
    $('payCard').style.display = f.paymentEnabled ? '' : 'none';
    if (!f.accountEnabled) {
      $('connectForm').innerHTML = '<div class="muted-box">Akkaunt ulash xizmati vaqtincha o\'chirilgan.</div>';
    }
    if (!f.passengersEnabled) {
      $('addPassengerBtn').disabled = true;
    }
  }

  /* ---------- Boshlanishi ---------- */
  function init() {
    Promise.all([
      api('/account').catch(function () { return { account: { connected: false, features: {} } }; }),
      api('/passengers').catch(function () { return { passengers: [] }; }),
    ]).then(function (res) {
      state.account = res[0].account || { connected: false };
      state.features = (res[0].account && res[0].account.features) || {};
      state.passengers = res[1].passengers || [];
      renderStatus();
      renderPassengers();
      applyFeatures();
    }).catch(function (err) {
      toast(err.message || 'Yuklab bo\'lmadi', true);
    });
  }

  init();
})();
