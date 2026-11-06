/* BSB tahlil — asosiy dastur */
(function () {
  "use strict";

  /* ===== Shablonlar (keyin ChSB qo'shiladi) ===== */
  var TEMPLATES = {
    BSB: { label: "BSB", max: [10, 10, 10, 10, 10] }
  };

  /* ===== Saqlash ===== */
  var KEY = "bsbTahlil.v1", SKEY = "bsbTahlil.settings";
  var DEFAULT_TITLE = "Gurlan tumani 10-maktab 1-chorak 1-BSB bo'yicha tahlil (2026-2027)";
  var store = load();
  function readLS(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function load() {
    var d = readLS(KEY) || {}, st = readLS(SKEY);
    d.settings = Object.assign({ title: DEFAULT_TITLE, rahbar: "", oqituvchi: "", key: "" }, d.settings || {}, st || {});
    d.classes = d.classes || []; d.deleted = d.deleted || [];
    return d;
  }
  function writeSettings() { try { localStorage.setItem(SKEY, JSON.stringify(store.settings)); return true; } catch (e) { return false; } }
  // boshqa oynada ochilgan dastur ma'lumotni ustidan yozib yubormasligi uchun: saqlashdan oldin birlashtiramiz
  function writeClasses() {
    var disk = readLS(KEY) || {}, del = {}, byId = {};
    (disk.deleted || []).concat(store.deleted).forEach(function (id) { del[id] = 1; });
    (disk.classes || []).forEach(function (c) { byId[c.id] = c; });
    store.classes.forEach(function (c) { if (!byId[c.id] || (byId[c.id].updated || 0) <= (c.updated || 0)) byId[c.id] = c; });
    var merged = Object.keys(byId).map(function (k) { return byId[k]; }).filter(function (c) { return !del[c.id]; });
    merged.forEach(function (c) { var i = store.classes.findIndex(function (x) { return x.id === c.id; }); if (i < 0) store.classes.push(c); else if (store.classes[i] !== c && store.classes[i] !== cur) store.classes[i] = c; });
    store.classes = store.classes.filter(function (c) { return !del[c.id]; });
    store.deleted = Object.keys(del);
    localStorage.setItem(KEY, JSON.stringify({ classes: merged, deleted: store.deleted }));
  }
  window.addEventListener("storage", function (e) {
    if (e.key === SKEY) { var st = readLS(SKEY); if (st) store.settings = Object.assign(store.settings, st); }
  });
  var saveTimer = null;
  function save() {
    $("#saveState").textContent = "Saqlanmoqda…";
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { writeClasses(); $("#saveState").textContent = "✓ Saqlandi"; }
      catch (e) { $("#saveState").textContent = "⚠️ Saqlab bo'lmadi"; }
    }, 300);
  }
  function saveNow() { try { writeClasses(); } catch (e) {} }

  /* ===== Yordamchilar ===== */
  function $(s) { return document.querySelector(s); }
  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === "text") e.textContent = attrs[k];
      else if (k === "html") e.innerHTML = attrs[k];
      else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] != null && attrs[k] !== false) e.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c != null) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function pct(v, d) { return v == null ? "" : (v * 100).toFixed(d == null ? 1 : d) + "%"; }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  /* ===== Kirill -> lotin ===== */
  var CYR = { "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "ё": "yo", "ж": "j", "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m",
    "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u", "ф": "f", "х": "x", "ц": "s", "ч": "ch", "ш": "sh", "щ": "sh", "ъ": "'",
    "ы": "i", "ь": "", "э": "e", "ю": "yu", "я": "ya", "ў": "o'", "қ": "q", "ғ": "g'", "ҳ": "h", "і": "i" };
  var VOW = "аеёиоуўэюяaeiou";
  function translit(s) {
    if (!/[Ѐ-ӿ]/.test(s)) return s;
    var out = "";
    for (var i = 0; i < s.length; i++) {
      var ch = s[i], lo = ch.toLowerCase(), up = ch !== lo, r;
      if (lo === "е") {
        var prev = i ? s[i - 1].toLowerCase() : "";
        r = (!prev || !/[Ѐ-ӿa-z']/.test(prev) || VOW.indexOf(prev) >= 0 || prev === "ъ" || prev === "ь") ? "ye" : "e";
      } else if (CYR.hasOwnProperty(lo)) r = CYR[lo];
      else { out += ch; continue; }
      if (up && r) {
        var next = s[i + 1] || "", allCaps = next && next !== next.toLowerCase();
        r = allCaps ? r.toUpperCase() : r.charAt(0).toUpperCase() + r.slice(1);
      }
      out += r;
    }
    return out;
  }
  function parseNames(text) {
    return text.split(/\r?\n/).map(function (l) {
      l = l.replace(/^\s*\d+\s*[.)\-:]*\s*/, "").replace(/\t+/g, " ").replace(/\s+/g, " ").trim();
      return translit(l);
    }).filter(function (l) { return l && /[A-Za-zЀ-ӿ]/.test(l); });
  }

  /* ===== Ism moslashtirish ===== */
  function norm(s) { return translit(String(s || "")).toLowerCase().replace(/[ʻʼ'`’‘´]/g, "").replace(/[^a-z\s.]/g, "").trim(); }
  function lev(a, b) {
    var m = a.length, n = b.length, d = [], i, j;
    for (i = 0; i <= m; i++) { d[i] = [i]; }
    for (j = 0; j <= n; j++) d[0][j] = j;
    for (i = 1; i <= m; i++) for (j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[m][n];
  }
  function candidates(raw, roster) {
    var r = norm(raw); if (!r) return [];
    var m = r.match(/^([a-z]{1,3})\s*\.\s*([a-z]+)/), ini = "", first;
    if (m) { ini = m[1]; first = m[2]; } else { var p = r.split(/[\s.]+/).filter(Boolean); first = p[p.length - 1]; ini = p.length > 1 ? p[0] : ""; }
    if (!first) return [];
    var out = [];
    roster.forEach(function (name, i) {
      var parts = norm(name).split(/\s+/), sur = parts[0] || "", fn = parts[1] || "";
      var okFirst = fn === first || (first.length >= 4 && lev(fn, first) <= 1) || (first.length >= 5 && fn.indexOf(first) === 0);
      var okIni = !ini || sur.indexOf(ini) === 0 || sur.charAt(0) === ini.charAt(0);
      if (okFirst && okIni) out.push(i);
    });
    return out;
  }

  /* ===== Holat ===== */
  var cur = null;          // joriy sinf
  var reviewData = [];     // Gemini natijalari
  var serverKey = false;

  function tmpl(c) { return TEMPLATES[c.template] || TEMPLATES.BSB; }
  function maxes(c) { return tmpl(c).max; }
  function autoTitle(c) {
    return syncTitle(store.settings.title || DEFAULT_TITLE, c);
  }
  function syncTitle(t, c) {
    return String(t).replace(/\d+\s*-\s*chorak/i, (c.chorak || 1) + "-chorak").replace(/\d+\s*-\s*BSB/, (c.bsbNo || 1) + "-" + tmpl(c).label);
  }
  function newClass() {
    var s = store.settings, k = TEMPLATES.BSB.max.length;
    var c = { id: uid(), template: "BSB", sinf: "", fan: "", chorak: "1", bsbNo: 1,
      criteria: Array.from({ length: k }, function (_, i) { return (i + 1) + "-mezon"; }),
      students: [], xulosa: "",
      signs: [{ label: "Metodbirlashma rahbari:", name: s.rahbar || "" }, { label: "O'qituvchi:", name: s.oqituvchi || "" }],
      updated: Date.now() };
    c.title = autoTitle(c);
    store.classes.unshift(c); saveNow();
    return c;
  }
  function touch() { if (cur) cur.updated = Date.now(); save(); }

  /* ===== Ko'rinishlar ===== */
  function show(id) {
    ["#homeView", "#classView", "#settingsView"].forEach(function (v) { $(v).classList.toggle("hidden", v !== id); });
    window.scrollTo(0, 0);
  }
  function renderHome() {
    var list = $("#classList"); list.innerHTML = "";
    if (!store.classes.length) list.appendChild(el("p", { class: "muted", text: "Hali sinf yo'q. \"+ Yangi sinf\" tugmasini bosing." }));
    store.classes.slice().sort(function (a, b) { return b.updated - a.updated; }).forEach(function (c) {
      var R = BSBXlsx.compute(xdata(c)), filled = R.rows.filter(function (r) { return r.total != null; }).length;
      list.appendChild(el("div", { class: "card class-card", onclick: function () { openClass(c.id); } }, [
        el("b", { text: (c.sinf || "Nomsiz sinf") + (c.fan ? " — " + c.fan : "") }),
        el("div", { class: "muted small", text: c.chorak + "-chorak, " + (c.bsbNo || 1) + "-" + tmpl(c).label }),
        el("div", { class: "small", text: c.students.length + " o'quvchi, " + filled + " tasi baholangan" + (R.avgOverall != null ? " · o'rtacha " + pct(R.avgOverall) : "") })
      ]));
    });
    show("#homeView");
  }
  function openClass(id) {
    cur = store.classes.find(function (c) { return c.id === id; });
    if (!cur) return renderHome();
    reviewData = []; $("#review").classList.add("hidden"); $("#ocrProgress").textContent = "";
    if (/^\s*\d+-chorak \d+-BSB bo'yicha tahlil\s*$/.test(cur.title || "") || !cur.title) cur.title = autoTitle(cur);
    $("#fSinf").value = cur.sinf; $("#fFan").value = cur.fan; $("#fChorak").value = cur.chorak; $("#fBsbNo").value = cur.bsbNo;
    $("#fTitle").value = cur.title; $("#fXulosa").value = cur.xulosa;
    cur.xfont = cur.xfont || { name: "Arial", italic: false, bold: false, size: 11 };
    $("#xfName").value = cur.xfont.name; $("#xfItalic").checked = cur.xfont.italic; $("#xfBold").checked = cur.xfont.bold; $("#xfSize").value = cur.xfont.size;
    renderFonts();
    $("#fSign1L").value = cur.signs[0].label; $("#fSign1N").value = cur.signs[0].name;
    $("#fSign2L").value = cur.signs[1].label; $("#fSign2N").value = cur.signs[1].name;
    $("#maxInfo").textContent = maxes(cur).join(", ");
    var cn = $("#critNames"); cn.innerHTML = "";
    cur.criteria.forEach(function (n, i) {
      cn.appendChild(el("label", { text: (i + 1) + "-mezon" }, [el("input", { value: n, oninput: function (e) { cur.criteria[i] = e.target.value || (i + 1) + "-mezon"; renderScores(); renderReport(); touch(); } })]));
    });
    $("#namesInput").value = "";
    $("#step2").open = !cur.students.length;
    renderScores(); renderReport();
    show("#classView"); $("#saveState").textContent = "✓ Saqlandi";
  }

  /* --- ballar jadvali --- */
  function parseScore(v, max) {
    v = String(v).trim().replace(",", ".");
    if (v === "") return { val: null, ok: true };
    var n = Number(v);
    return { val: Number.isFinite(n) ? n : null, ok: Number.isFinite(n) && n >= 0 && n <= max };
  }
  function renderScores() {
    var t = $("#scoreTable"), c = cur, k = c.criteria.length, M = maxes(c);
    $("#stuCount").textContent = c.students.length ? c.students.length + " ta" : "";
    t.innerHTML = "";
    if (!c.students.length) { t.appendChild(el("tr", {}, [el("td", { class: "muted", text: "Avval o'quvchilar ro'yxatini joylang (2-qadam)." })])); return; }
    var head = el("tr", {}, [el("th", { text: "№" }), el("th", { text: "Familiya, ism" })]);
    c.criteria.forEach(function (n, i) { head.appendChild(el("th", { text: n + " (" + M[i] + ")" })); });
    head.appendChild(el("th", { text: "Jami" })); head.appendChild(el("th", { text: "%" })); head.appendChild(el("th", { text: "" }));
    t.appendChild(head);
    c.students.forEach(function (s, r) {
      var tr = el("tr", {}, [el("td", { text: r + 1 })]);
      tr.appendChild(el("td", { class: "name" }, [el("input", { value: s.name, onchange: function (e) { s.name = e.target.value.trim(); renderReport(); touch(); } })]));
      for (var i = 0; i < k; i++) (function (i) {
        var inp = el("input", { inputmode: "decimal", enterkeyhint: "next", value: s.scores[i] == null ? "" : s.scores[i], "data-r": r, "data-i": i });
        var chk = function () {
          var p = parseScore(inp.value, M[i]); inp.classList.toggle("bad", !p.ok);
          s.scores[i] = p.ok ? p.val : null; updateRow(tr, s); renderReport(); touch();
        };
        inp.addEventListener("input", chk);
        inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); focusNext(r, i); } });
        inp.addEventListener("focus", function () { inp.select(); });
        tr.appendChild(el("td", {}, [inp]));
      })(i);
      tr.appendChild(el("td", { class: "tot" })); tr.appendChild(el("td", { class: "pct" }));
      tr.appendChild(el("td", {}, [el("button", { class: "del", title: "O'chirish", text: "✕", onclick: function () {
        if (confirm(s.name + " ro'yxatdan o'chirilsinmi?")) { c.students.splice(r, 1); renderScores(); renderReport(); touch(); } } })]));
      updateRow(tr, s); t.appendChild(tr);
    });
  }
  function updateRow(tr, s) {
    var M = maxes(cur), has = s.scores.some(function (v) { return v != null; });
    var tot = has ? s.scores.reduce(function (a, v) { return a + (v || 0); }, 0) : null, mt = M.reduce(function (a, b) { return a + b; }, 0);
    tr.querySelector(".tot").textContent = tot == null ? "" : tot;
    tr.querySelector(".pct").textContent = tot == null ? "" : pct(tot / mt);
  }
  function focusNext(r, i) {
    var k = cur.criteria.length, nr = r, ni = i + 1;
    if (ni >= k) { ni = 0; nr++; }
    var n = document.querySelector('#scoreTable input[data-r="' + nr + '"][data-i="' + ni + '"]');
    if (n) n.focus(); else document.activeElement.blur();
  }

  /* --- hisobot (jadval + diagramma) --- */
  function xdata(c) {
    var k = c.criteria.length;
    return { title: c.title, sinf: c.sinf, fan: c.fan, criteria: c.criteria.slice(), max: tmpl(c).max.slice(0, k),
      students: c.students.map(function (s) { return { name: s.name, scores: s.scores.slice(0, k).concat(Array(Math.max(0, k - s.scores.length)).fill(null)) }; }),
      xulosa: c.xulosa, signs: c.signs, xulosaFont: c.xfont };
  }
  function reportTable(R, c) {
    var M = maxes(c), h = '<table><tr><th rowspan="2">№</th><th rowspan="2">Familiya, ism, sharifi</th><th colspan="' + R.k + '">Mezonlar bo\'yicha to\'plagan bali</th><th rowspan="2">Jami ball</th><th colspan="' + R.k + '">Mezonlar bo\'yicha foiz ko\'rsatkichi</th><th>Umumiy foiz</th></tr><tr>';
    c.criteria.forEach(function (n) { h += "<th>" + esc(n) + "</th>"; });
    c.criteria.forEach(function (n) { h += "<th>" + esc(n) + " %</th>"; });
    h += "<th>Umumiy %</th></tr><tr><td></td><td><b>Maksimal ball</b></td>";
    M.forEach(function (m) { h += "<td><b>" + m + "</b></td>"; });
    h += "<td><b>" + R.maxTot + "</b></td>" + Array(R.k + 2).join("<td><b>100%</b></td>") + "</tr>";
    R.rows.forEach(function (r, i) {
      h += "<tr><td>" + (i + 1) + '</td><td class="name">' + esc(r.name) + "</td>";
      r.scores.forEach(function (v) { h += "<td>" + (v == null ? "" : v) + "</td>"; });
      h += "<td>" + (r.total == null ? "" : r.total) + "</td>";
      r.pcts.forEach(function (v) { h += '<td class="pct">' + pct(v) + "</td>"; });
      h += '<td class="pct">' + pct(r.overall) + "</td></tr>";
    });
    h += '<tr class="avg"><td colspan="2">O\'rtacha ko\'rsatkich</td>';
    R.avgScores.forEach(function (v) { h += "<td>" + (v == null ? "" : v.toFixed(1)) + "</td>"; });
    h += "<td>" + (R.avgTotal == null ? "" : R.avgTotal.toFixed(1)) + "</td>";
    R.avgPcts.forEach(function (v) { h += "<td>" + pct(v) + "</td>"; });
    return h + "<td>" + pct(R.avgOverall) + "</td></tr></table>";
  }
  function barChart(title, labels, vals, cls, d) {
    var b = "", l = "";
    vals.forEach(function (v, i) {
      b += '<div class="bar"><span>' + (v == null ? "" : pct(v, d)) + '</span><i style="height:' + (v == null ? 0 : Math.max(0, Math.min(1, v)) * 88) + '%"></i></div>';
      l += "<div>" + esc(labels[i]) + "</div>";
    });
    var lh = cls.indexOf("rot") >= 0 ? ' style="height:' + (1 + 0.58 * Math.max.apply(null, labels.map(function (x) { return String(x).length; }).concat([4]))).toFixed(1) + 'em"' : "";
    return '<div class="chart ' + cls + '"><h4>' + esc(title) + '</h4><div class="chart-scroll"><div><div class="bars">' + b + '</div><div class="labels"' + lh + '>' + l + "</div></div></div></div>";
  }
  function chartsHtml(R, c) {
    return barChart("Mezonlar bo'yicha o'rtacha foiz ko'rsatkichi", c.criteria.map(function (n) { return n + " %"; }).concat(["Umumiy %"]), R.avgPcts.concat([R.avgOverall]), "c1", 1) +
      barChart("O'quvchilarning umumiy foiz ko'rsatkichi", R.rows.map(function (r) { return r.name; }), R.rows.map(function (r) { return r.overall; }), "green rot c2", 0);
  }
  var repTimer = null;
  function renderReport() {
    clearTimeout(repTimer);
    repTimer = setTimeout(function () {
      if (!cur) return;
      var R = BSBXlsx.compute(xdata(cur));
      $("#report").innerHTML = cur.students.length ? '<div class="table-wrap">' + reportTable(R, cur) + "</div>" + chartsHtml(R, cur) : '<p class="muted">Natija o\'quvchilar va ballar kiritilgach chiqadi.</p>';
    }, 120);
  }

  /* --- xulosa taklifi --- */
  function suggest() {
    var R = BSBXlsx.compute(xdata(cur));
    if (R.avgOverall == null) return alert("Avval ballarni kiriting.");
    var idx = R.avgPcts.map(function (v, i) { return [v, i]; }).filter(function (x) { return x[0] != null; }).sort(function (a, b) { return a[0] - b[0]; });
    var lo = idx[0], hi = idx[idx.length - 1];
    var weak = R.rows.filter(function (r) { return r.overall != null && r.overall < 0.6; }).length;
    var t = "O'quvchilarning umumiy o'zlashtirish ko'rsatkichi " + pct(R.avgOverall) + " ni tashkil etdi. " +
      "Eng yuqori natija " + cur.criteria[hi[1]] + " bo'yicha (" + pct(hi[0]) + "), eng past natija " + cur.criteria[lo[1]] + " bo'yicha (" + pct(lo[0]) + ") qayd etildi. " +
      "Bu bo'shliqni bartaraf etish uchun ko'proq amaliy mashqlar ishlashni kuchaytiramiz." +
      (weak ? " Natijasi 60% dan past bo'lgan " + weak + " nafar o'quvchi bilan qo'shimcha to'garak va bo'sh soatlarda alohida ishlash rejalashtirildi." : "");
    if (cur.xulosa && !confirm("Mavjud xulosa matni almashtirilsinmi?")) return;
    cur.xulosa = t; $("#fXulosa").value = t; touch();
  }

  /* --- xulosa shrifti --- */
  var FONTS = ["Arial", "Times New Roman", "Calibri", "Cambria", "Georgia", "Verdana", "Tahoma", "Courier New"];
  function fontCss(f) { return "font-family:'" + f.name + "',serif;font-style:" + (f.italic ? "italic" : "normal") + ";font-weight:" + (f.bold ? "700" : "400") + ";font-size:" + f.size + "pt"; }
  function renderFonts() {
    if (!cur) return;
    var f = cur.xfont, box = $("#fontSamples"), txt = (cur.xulosa || "O'quvchilar Bilish va qo'llashda ko'proq xatoliklarga yo'l qo'ygan.").slice(0, 90);
    $("#fXulosa").style.cssText = fontCss(f);
    box.innerHTML = "";
    FONTS.forEach(function (n) {
      [false, true].forEach(function (it) {
        var o = { name: n, italic: it, bold: f.bold, size: f.size }, on = n === f.name && it === f.italic;
        box.appendChild(el("button", { type: "button", class: "fsample" + (on ? " on" : ""), style: fontCss(Object.assign({}, o, { size: 10.5 })),
          onclick: function () { cur.xfont.name = n; cur.xfont.italic = it; $("#xfName").value = n; $("#xfItalic").checked = it; renderFonts(); touch(); } },
          [el("small", { text: n + (it ? " (qiya)" : "") }), el("span", { text: txt })]));
      });
    });
  }

  /* --- Excel va chop etish --- */
  function fileName(c) { return docName(c) + ".xlsx"; }
  function downloadExcel() {
    if (!cur.students.length) return alert("Ro'yxat bo'sh.");
    var bytes = BSBXlsx.build(xdata(cur));
    var blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    var a = el("a", { href: URL.createObjectURL(blob), download: fileName(cur) });
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }
  var VARIANTS = [
    { label: "Ixcham", pad: 2, font: 10, title: 14, ch: 11, sign: 11, bars: 115 },
    { label: "O'rtacha", pad: 4, font: 11.5, title: 16, ch: 12.5, sign: 12.5, bars: 125 },
    { label: "Keng", pad: 6, font: 13, title: 18, ch: 14, sign: 14, bars: 135 }
  ];
  var CUSTOM_FIELDS = [["title", "Sarlavha"], ["font", "Jadval matni"], ["pad", "Qator oralig'i"], ["sign", "Imzolar, Sinf/Fan"],
    ["ch1", "1-diagramma sarlavhasi"], ["ch2", "2-diagramma sarlavhasi"], ["gap", "Sarlavha va ustun oralig'i"], ["names", "Diagrammadagi ismlar"]];
  var MM = 3.7795;
  function sheetHtml(one) {
    var R = BSBXlsx.compute(xdata(cur));
    return '<p class="ptitle">' + esc(cur.title) + '</p><div class="pmeta">Sinf :<span>' + esc(cur.sinf) + '</span></div><div class="pmeta">Fan :<span>' + esc(cur.fan) + "</span></div>" +
      reportTable(R, cur) + (one ? "" : '<div class="pbreak"></div>') + chartsHtml(R, cur) +
      '<div class="pxul" style="' + fontCss(cur.xfont || { name: "Arial", size: 11 }) + '">' + esc(cur.xulosa).replace(/\n/g, "<br>") + "</div>" +
      cur.signs.map(function (s) { return '<div class="psign"><div>' + esc(s.label) + "</div><div>" + esc(s.name) + "</div></div>"; }).join("");
  }
  function pageSize(one) { return one ? { W: 196 * MM, H: 283 * MM } : { W: 277 * MM, H: 190 * MM }; }
  function makeSheet(one, v) {
    var d = el("div", { class: "psheet" + (one ? " p1" : "") });
    d.innerHTML = sheetHtml(one);
    d.style.setProperty("--rowpad", v.pad + "px"); d.style.setProperty("--tfont", v.font + "px"); d.style.setProperty("--bars", (v.bars || 125) + "px");
    d.style.setProperty("--titlefont", v.title + "px"); d.style.setProperty("--chfont", v.ch + "px"); d.style.setProperty("--signfont", v.sign + "px");
    d.style.setProperty("--ch1font", (v.ch1 || v.ch) + "px"); d.style.setProperty("--ch2font", (v.ch2 || v.ch) + "px");
    d.style.setProperty("--chgap", (v.gap == null ? 4 : v.gap) + "px"); d.style.setProperty("--namefont", (v.names || v.font * 0.9) + "px");
    return d;
  }
  function fitZoom(one, v) {
    var P = pageSize(one), d = makeSheet(one, v);
    d.style.cssText += ";position:absolute;left:-10000px;top:0;width:" + P.W + "px";
    document.body.appendChild(d);
    var br = d.querySelector(".pbreak"), h = br ? br.offsetTop : d.scrollHeight, w = d.scrollWidth;
    d.remove();
    return Math.min(1, (P.H * 0.97) / h, P.W / w);
  }
  function docName(c) {
    var t = (c.signs[1] && c.signs[1].name) || store.settings.oqituvchi || "";
    var parts = t.split(".").map(function (x) { return x.trim(); }).filter(Boolean);
    var teacher = parts.length > 1 ? parts[parts.length - 1] + "_" + parts.slice(0, -1).join("") : t;
    var yil = ((c.title || "").match(/\d{4}\s*-\s*\d{4}/) || [""])[0].replace(/\s/g, "");
    var n = [(c.sinf || "sinf").replace(/[-\s]/g, ""), c.fan || "fan", (c.chorak || 1) + "-chorak", (c.bsbNo || 1) + "-" + tmpl(c).label,
      teacher ? "(" + teacher + ")" : "", yil].filter(Boolean).join("_");
    return n.replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, "_");
  }
  function doPrint(one) {
    var box = el("div", { class: "pvbox" }), cards = el("div", { class: "pvcards" }), P = pageSize(one), CW = 240;
    var custom = Object.assign({ label: "O'zim sozlayman", pad: 4, font: 11, title: 16, ch: 12, sign: 12, bars: 125, ch1: 12, ch2: 12, gap: 6, names: 10 }, store.settings.pdfCustom || {});
    var list = VARIANTS.concat([custom]);
    var zs = VARIANTS.map(function (v) { return fitZoom(one, v); });
    var rec = 0; zs.forEach(function (z, i) { if (z >= 0.999) rec = i; });
    function card(v, i) {
      var z = fitZoom(one, v), sc = CW / P.W, sh = makeSheet(one, v);
      sh.style.width = (P.W / z) + "px"; if (z < 1) sh.style.zoom = z.toFixed(3);
      sh.style.transform = "scale(" + sc + ")";
      var page = el("div", { class: "pvpage", style: "width:" + CW + "px;height:" + Math.round(P.H * sc) + "px" }, [sh]);
      var kids = [el("b", { text: v.label + (i === rec ? " — tavsiya" : "") }),
        el("div", { class: "small muted", text: z >= 0.999 ? (one ? "Bitta varoqqa to'liq sig'adi" : "Jadval 1-varoqqa sig'adi") : "Sig'ishi uchun " + Math.round(z * 100) + "% gacha kichraytiriladi" })];
      if (v === custom) {
        var g = el("div", { class: "pvfields" });
        CUSTOM_FIELDS.forEach(function (f) {
          g.appendChild(el("label", { text: f[1] + " (px)" }, [el("input", { type: "number", step: "0.5", min: "0", max: "40", value: v[f[0]], onchange: function (e) {
            custom[f[0]] = Number(e.target.value) || 0; store.settings.pdfCustom = custom; writeSettings();
            if (!c.isConnected || c.__busy) return; c.__busy = true; var n = card(custom, i); c.replaceWith(n); } })]));
        });
        kids.push(g);
      }
      kids.push(page, el("button", { class: "btn primary", type: "button", text: "Shu variantda saqlash", onclick: function () { pv.remove(); printVariant(one, v, z); } }));
      var c = el("div", { class: "pvcard" + (i === rec ? " rec" : "") }, kids);
      return c;
    }
    list.forEach(function (v, i) { cards.appendChild(card(v, i)); });
    box.appendChild(el("div", { class: "row-between" }, [el("h3", { text: (one ? "1 varoq (vertikal)" : "2 varoq (gorizontal)") + " — variantni tanlang" }),
      el("button", { class: "btn", type: "button", text: "Yopish", onclick: function () { pv.remove(); } })]));
    box.appendChild(el("p", { class: "muted small", text: "Fayl nomi: " + docName(cur) + ".pdf" }));
    box.appendChild(cards);
    var pv = el("div", { id: "pv" }, [box]);
    document.body.appendChild(pv);
  }
  function printVariant(one, v, z) {
    var pr = $("#print"); pr.innerHTML = ""; var sh = makeSheet(one, v); if (z < 1) sh.style.zoom = z.toFixed(3); pr.appendChild(sh);
    var ps = $("#pageStyle") || document.head.appendChild(el("style", { id: "pageStyle" }));
    ps.textContent = "@page{size:A4 " + (one ? "portrait;margin:7mm" : "landscape;margin:10mm") + "}";
    var old = document.title; document.title = docName(cur);
    var restore = function () { document.title = old; window.removeEventListener("afterprint", restore); };
    window.addEventListener("afterprint", restore);
    setTimeout(function () { window.print(); setTimeout(restore, 1500); }, 60);
  }

  /* ===== Gemini: rasmdan o'qish ===== */
  function compress(file) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var MAX = 2400, w = img.naturalWidth, h = img.naturalHeight, s = Math.min(1, MAX / Math.max(w, h));
        var cv = document.createElement("canvas"); cv.width = Math.round(w * s); cv.height = Math.round(h * s);
        cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
        var data = cv.toDataURL("image/jpeg", 0.88); URL.revokeObjectURL(url);
        res({ url: data, b64: data.split(",")[1] });
      };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error("Rasmni ochib bo'lmadi")); };
      img.src = url;
    });
  }
  async function readOne(p) {
    var roster = cur.students.map(function (s) { return s.name; }), M = maxes(cur);
    p.error = null; p.loading = true; renderReview();
    try {
      if (!p.b64) { var im = await compress(p.file); p.img = im.url; p.b64 = im.b64; }
      var r = await fetch("/api/read", { method: "POST",
        headers: { "Content-Type": "application/json", "x-app-password": pass(), "x-gemini-key": store.settings.key || "" },
        body: JSON.stringify({ image: p.b64, mime: "image/jpeg", students: roster, max: M }) });
      var j = await r.json().catch(function () { return { error: r.status === 504 ? "Gemini javobi juda uzoq kutildi (504)" : "Server javobi noto'g'ri (" + r.status + ")" }; });
      if (!r.ok) throw new Error(j.error || "Xato " + r.status);
      p.items = j.notebooks.map(function (nb) { return prepItem(nb, roster, M); });
    } catch (e) { p.error = e.message; p.items = []; }
    p.loading = false; renderReview();
  }
  async function readPhotos(files) {
    if (!cur.students.length) return alert("Avval o'quvchilar ro'yxatini joylang.");
    var prog = $("#ocrProgress"), list = files.map(function (f) { return { file: f, name: f.name, items: [] }; });
    reviewData = reviewData.concat(list);
    for (var f = 0; f < list.length; f++) {
      prog.textContent = "⏳ " + (f + 1) + "/" + list.length + "-rasm o'qilmoqda… (1–3 daqiqa ketishi mumkin)";
      await readOne(list[f]);
    }
    var bad = reviewData.filter(function (p) { return p.error; }).length;
    prog.textContent = bad ? "⚠️ " + bad + " ta rasm o'qilmadi — \"Qayta urinish\" tugmasini bosing." : "✓ Tayyor. Pastdagi natijalarni tekshirib, \"Jadvalga qo'yish\" tugmasini bosing.";
  }
  function prepItem(nb, roster, M) {
    var k = M.length, sc = (nb.scores || []).slice(0, k);
    while (sc.length < k) sc.push(null);
    sc = sc.map(function (v) { return v == null || !Number.isFinite(Number(v)) ? null : Number(v); });
    var it = { raw: nb.raw_name || "", gem: nb.student_number, total: nb.written_total, unclear: nb.unclear || [], note: nb.note || "", scores: sc, filled: [] };
    // bitta ball yo'q bo'lsa, umumiy balldan taklif
    var nulls = sc.map(function (v, i) { return v == null ? i : -1; }).filter(function (i) { return i >= 0; });
    if (nulls.length === 1 && it.total != null) {
      var rest = sc.reduce(function (a, v) { return a + (v || 0); }, 0), g = it.total - rest;
      if (g >= 0 && g <= M[nulls[0]]) { sc[nulls[0]] = g; it.filled.push(nulls[0]); }
    }
    // ism
    var cands = candidates(it.raw, roster), gi = Number.isInteger(nb.student_number) ? nb.student_number - 1 : -1;
    if (gi < 0 || gi >= roster.length) gi = -1;
    it.nameNote = "";
    if (gi >= 0 && (cands.indexOf(gi) >= 0 || !cands.length && !it.raw)) it.idx = gi;
    else if (cands.length === 1) { it.idx = cands[0]; if (gi >= 0 && gi !== cands[0]) it.nameNote = "Gemini boshqa o'quvchini taklif qildi: " + roster[gi]; }
    else if (cands.length > 1) { it.idx = gi >= 0 && cands.indexOf(gi) >= 0 ? gi : -1; it.nameNote = "Bir nechta o'quvchiga mos keladi"; }
    else { it.idx = gi; it.nameNote = gi >= 0 ? "Ism ro'yxatdagiga to'liq mos emas" : "O'quvchi aniqlanmadi"; }
    it.issues = issues(it, M); it.accept = it.level === "ok";
    return it;
  }
  function issues(it, M) {
    var out = [], lvl = "ok";
    function add(t, l) { out.push({ t: t, l: l }); if (l === "b") lvl = "bad"; else if (lvl === "ok") lvl = "warn"; }
    if (it.idx == null || it.idx < 0) add("O'quvchini tanlang", "b");
    else if (it.nameNote) add(it.nameNote, "w");
    it.scores.forEach(function (v, i) {
      if (v == null) add((i + 1) + "-mezon o'qilmadi", "b");
      else if (v < 0 || v > M[i]) add((i + 1) + "-mezon " + M[i] + " dan katta", "b");
    });
    it.filled.forEach(function (i) { add((i + 1) + "-mezon ko'rinmadi, umumiy balldan hisoblandi", "w"); });
    it.unclear.forEach(function (i) { if (i >= 1 && i <= M.length) add(i + "-mezon raqami noaniq", "w"); });
    var sum = it.scores.reduce(function (a, v) { return a + (v || 0); }, 0);
    if (it.total == null) add("Daftardagi umumiy ball ko'rinmadi", "w");
    else if (sum !== it.total) add("Mezonlar yig'indisi " + sum + ", daftarda " + it.total, "b");
    if (it.dup) add("Bu o'quvchi boshqa daftarda ham bor", "b");
    if (it.note) add("Izoh: " + it.note, "w");
    it.level = lvl;
    return out;
  }
  function markDups() {
    var seen = {};
    reviewData.forEach(function (p) { p.items.forEach(function (it) { it.dup = false; if (it.idx >= 0) (seen[it.idx] = seen[it.idx] || []).push(it); }); });
    Object.keys(seen).forEach(function (k) { if (seen[k].length > 1) seen[k].forEach(function (it) { it.dup = true; }); });
  }
  function renderReview() {
    var box = $("#review"), roster = cur.students.map(function (s) { return s.name; }), M = maxes(cur);
    markDups();
    reviewData.forEach(function (p) { p.items.forEach(function (it) { var was = it.level; it.issues = issues(it, M); if (was && was !== "ok" && it.level === "ok" && !it.userTouched) {} }); });
    box.innerHTML = ""; box.classList.remove("hidden");
    var all = [], found = {};
    reviewData.forEach(function (p) { p.items.forEach(function (it) { all.push(it); if (it.idx >= 0) found[it.idx] = 1; }); });
    var missing = roster.filter(function (_, i) { return !found[i]; });
    var nOk = all.filter(function (i) { return i.level === "ok"; }).length;
    box.appendChild(el("div", { class: "rv-summary", html: "<b>Rasmdan topildi: " + all.length + " ta daftar.</b> ✅ " + nOk + " ta muammosiz, ⚠️ " + (all.length - nOk) + " ta tekshirish kerak." +
      (missing.length ? "<br>Topilmagan o'quvchilar (" + missing.length + "): " + missing.map(esc).join(", ") : "<br>Ro'yxatdagi hamma o'quvchi topildi.") }));
    reviewData.forEach(function (p) {
      var wrap = el("div", { class: "rv-photo" });
      wrap.appendChild(el("div", { class: "ph" }, [
        p.img ? el("img", { class: "thumb", src: p.img, alt: "", onclick: function () { openLightbox(p.img); } }) : null,
        el("div", { class: "small" }, [el("b", { text: p.name }), el("div", { class: p.error ? "err" : "muted", text: p.loading ? "⏳ o'qilmoqda…" : p.error ? "❌ " + p.error : p.items.length + " ta daftar · rasmni kattalashtirish uchun bosing" }),
          p.error && !p.loading ? el("button", { class: "btn small", type: "button", text: "↻ Qayta urinish", onclick: function () { readOne(p); } }) : null])
      ]));
      p.items.forEach(function (it) {
        var row = el("div", { class: "rv-item " + it.level });
        var sel = el("select", { onchange: function (e) { it.idx = Number(e.target.value); it.nameNote = ""; it.userTouched = true; renderReview(); } });
        sel.appendChild(el("option", { value: -1, text: "— o'quvchini tanlang —" }));
        roster.forEach(function (n, i) { var o = el("option", { value: i, text: (i + 1) + ". " + n }); if (i === it.idx) o.selected = true; sel.appendChild(o); });
        row.appendChild(el("div", { class: "rv-top" }, [el("span", { class: "rv-raw", text: it.raw ? "✏️ " + it.raw : "✏️ (ism ko'rinmadi)" }), sel]));
        var sc = el("div", { class: "rv-scores" });
        it.scores.forEach(function (v, i) {
          var flag = it.unclear.indexOf(i + 1) >= 0 || it.filled.indexOf(i) >= 0 || v == null;
          sc.appendChild(el("span", { class: "small muted", text: (i + 1) + ":" }));
          sc.appendChild(el("input", { inputmode: "decimal", value: v == null ? "" : v, class: flag ? "flag" : null, onchange: function (e) {
            var x = parseScore(e.target.value, M[i]); it.scores[i] = x.val; it.filled = it.filled.filter(function (f) { return f !== i; });
            it.unclear = it.unclear.filter(function (u) { return u !== i + 1; }); it.userTouched = true; renderReview(); } }));
        });
        var sum = it.scores.reduce(function (a, v) { return a + (v || 0); }, 0);
        sc.appendChild(el("span", { class: "small", html: "&nbsp;Jami: <b>" + sum + "</b> · daftarda: <b>" + (it.total == null ? "?" : it.total) + "</b>" }));
        row.appendChild(sc);
        if (it.issues.length) row.appendChild(el("div", { class: "rv-issues", html: it.issues.map(function (x) { return '<div class="' + x.l + '">' + (x.l === "b" ? "❗ " : "⚠️ ") + esc(x.t) + "</div>"; }).join("") }));
        var cb = el("input", { type: "checkbox", onchange: function (e) { it.accept = e.target.checked; } }); cb.checked = !!it.accept;
        row.appendChild(el("label", { class: "rv-accept" }, [cb, it.level === "ok" ? "Jadvalga qo'yish" : "Tekshirdim, jadvalga qo'yish"]));
        wrap.appendChild(row);
      });
      box.appendChild(wrap);
    });
    box.appendChild(el("div", { class: "btns" }, [
      el("button", { class: "btn primary", type: "button", text: "✅ Belgilanganlarni jadvalga qo'yish", onclick: applyReview }),
      el("button", { class: "btn", type: "button", text: "Bekor qilish", onclick: function () { reviewData = []; box.classList.add("hidden"); $("#ocrProgress").textContent = ""; } })
    ]));
  }
  function applyReview() {
    var n = 0, skipped = 0;
    reviewData.forEach(function (p) { p.items.forEach(function (it) {
      if (!it.accept) { skipped++; return; }
      if (it.idx == null || it.idx < 0) { skipped++; return; }
      cur.students[it.idx].scores = it.scores.slice(); n++;
    }); });
    reviewData = []; $("#review").classList.add("hidden");
    $("#ocrProgress").textContent = "✓ " + n + " ta o'quvchining ballari jadvalga qo'yildi" + (skipped ? ", " + skipped + " tasi belgilanmagani uchun qo'yilmadi." : ".");
    renderScores(); renderReport(); touch();
  }
  function openLightbox(src) { var lb = $("#lightbox"); lb.querySelector("img").src = src; lb.classList.remove("hidden"); }

  /* ===== Kirish ===== */
  function pass() { try { return localStorage.getItem("bsbTahlil.pass") || ""; } catch (e) { return ""; } }
  async function checkAuth(p) {
    try {
      var r = await fetch("/api/auth", { headers: { "x-app-password": p } });
      var j = await r.json().catch(function () { return {}; });
      if (r.ok) { serverKey = !!j.serverKey; return { ok: true }; }
      return { ok: false, error: j.error || "Xato" };
    } catch (e) { return { ok: !!p && p === pass(), offline: true, error: "Internet yo'q" }; }
  }
  async function start() {
    var p = pass();
    if (p && (await checkAuth(p)).ok) return enter();
    $("#login").classList.remove("hidden");
  }
  function enter() { $("#login").classList.add("hidden"); $("#app").classList.remove("hidden"); renderHome(); }

  /* ===== Hodisalar ===== */
  $("#loginForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    var p = $("#loginPass").value.trim(), r = await checkAuth(p);
    if (r.ok) { try { localStorage.setItem("bsbTahlil.pass", p); } catch (x) {} enter(); }
    else $("#loginErr").textContent = r.error || "Parol noto'g'ri";
  });
  $("#homeBtn").onclick = function () { saveNow(); renderHome(); };
  $("#backBtn").onclick = function () { saveNow(); renderHome(); };
  $("#newClassBtn").onclick = function () { openClass(newClass().id); };
  $("#settingsBtn").onclick = function () {
    var s = store.settings;
    $("#sTitle").value = s.title || DEFAULT_TITLE; $("#sRahbar").value = s.rahbar || ""; $("#sOqituvchi").value = s.oqituvchi || ""; $("#sKey").value = s.key || ""; $("#sSaved").textContent = "";
    $("#keyInfo").innerHTML = serverKey ? "✅ Serverda Gemini kaliti o'rnatilgan — bu yerda kiritish shart emas." : "⚠️ Serverda Gemini kaliti yo'q. Rasmdan o'qish uchun pastga kalitni kiriting.";
    show("#settingsView");
  };
  $("#settingsBack").onclick = function () { cur && !$("#classView").dataset.hidden ? renderHome() : renderHome(); };
  var SF = [["#sTitle", "title"], ["#sRahbar", "rahbar"], ["#sOqituvchi", "oqituvchi"], ["#sKey", "key"]];
  function collectSettings() { SF.forEach(function (p) { store.settings[p[1]] = $(p[0]).value.trim(); }); if (!store.settings.title) store.settings.title = DEFAULT_TITLE; }
  SF.forEach(function (p) { $(p[0]).addEventListener("input", function () { collectSettings(); writeSettings(); $("#sSaved").textContent = ""; }); });
  $("#sSaveBtn").onclick = function () {
    collectSettings();
    var ok = writeSettings() && JSON.stringify(readLS(SKEY)) === JSON.stringify(store.settings);
    $("#sSaved").textContent = ok ? "✓ Saqlandi. Bu ma'lumotlar shu brauzerda doimiy saqlanadi." : "⚠️ Saqlab bo'lmadi (brauzer xotirasi yopiq — yashirin rejimdan chiqing).";
  };
  $("#logoutBtn").onclick = function () { try { localStorage.removeItem("bsbTahlil.pass"); } catch (e) {} location.reload(); };

  function bind(sel, fn) { $(sel).addEventListener("input", function (e) { if (cur) { fn(e.target.value); touch(); } }); }
  bind("#fSinf", function (v) { cur.sinf = v.trim(); });
  bind("#fFan", function (v) { cur.fan = v.trim(); });
  bind("#fChorak", function (v) { cur.chorak = v; cur.title = syncTitle(cur.title, cur); $("#fTitle").value = cur.title; });
  bind("#fBsbNo", function (v) { cur.bsbNo = v; cur.title = syncTitle(cur.title, cur); $("#fTitle").value = cur.title; });
  bind("#fTitle", function (v) { cur.title = v; });
  bind("#fXulosa", function (v) { cur.xulosa = v; clearTimeout(window.__ft); window.__ft = setTimeout(renderFonts, 400); });
  bind("#fSign1L", function (v) { cur.signs[0].label = v; });
  bind("#fSign1N", function (v) { cur.signs[0].name = v; });
  bind("#fSign2L", function (v) { cur.signs[1].label = v; });
  bind("#fSign2N", function (v) { cur.signs[1].name = v; });
  $("#autoTitleBtn").onclick = function () { cur.title = autoTitle(cur); $("#fTitle").value = cur.title; touch(); };

  function addNames(replace) {
    var names = parseNames($("#namesInput").value);
    if (!names.length) return alert("Ro'yxat bo'sh.");
    var k = cur.criteria.length;
    var mk = function (n) { return { name: n, scores: Array(k).fill(null) }; };
    if (replace) {
      if (cur.students.some(function (s) { return s.scores.some(function (v) { return v != null; }); }) && !confirm("Joriy ro'yxat va ballar almashtiriladi. Davom etilsinmi?")) return;
      cur.students = names.map(mk);
    } else cur.students = cur.students.concat(names.map(mk));
    $("#namesInput").value = ""; renderScores(); renderReport(); touch();
    $("#step3").scrollIntoView({ behavior: "smooth" });
  }
  $("#namesReplaceBtn").onclick = function () { addNames(true); };
  $("#namesAppendBtn").onclick = function () { addNames(false); };
  $("#bulkBtn").onclick = function () {
    var M = maxes(cur), k = M.length, roster = cur.students.map(function (x) { return x.name; });
    var lines = $("#bulkInput").value.split(/\r?\n/).map(function (l) { return l.replace(/[*`|]/g, " ").trim(); }).filter(Boolean);
    var done = 0, bad = [], used = {};
    var fullIdx = {}; roster.forEach(function (n, i) { fullIdx[norm(n).split(/\s+/).slice(0, 2).join(" ")] = i; });
    var scoreLines = lines.filter(function (l) { return /[A-Za-zЀ-ӿ]/.test(l) && /(\d+\s+){2,}\d+|:\s*[-–]/.test(l.replace(/^\s*\d+\s*[.)]\s*/, "")); });
    var numbered = scoreLines.filter(function (l) { return /^\s*\d+\s*[.)]/.test(l); });
    if (numbered.length) scoreLines = numbered;   // Gemini blokidagi raqamlangan qatorlar ustun
    var byOrder = !scoreLines.length;   // faqat raqamlar bo'lsa — tartib bo'yicha
    (byOrder ? lines : scoreLines).forEach(function (l, r) {
      var m = l.match(/^\s*(\d+)\s*[.)]\s*/), no = m ? Number(m[1]) : null, rest = m ? l.slice(m[0].length) : l;
      var cut = rest.search(/[:\d]/), namePart = cut >= 0 ? rest.slice(0, cut) : rest;
      var nums = (rest.slice(Math.max(0, cut)).match(/\d+(?:[.,]\d+)?/g) || []).slice(0, k);
      var idx = -1;
      if (byOrder) idx = r;
      else {
        var key = norm(namePart).split(/\s+/).slice(0, 2).join(" ");
        if (fullIdx.hasOwnProperty(key)) idx = fullIdx[key];
        else { var c = candidates(namePart, roster); if (c.length === 1) idx = c[0]; else if (no && no <= roster.length) idx = no - 1; }
      }
      if (!nums.length) return;
      if (idx < 0 || idx >= roster.length || used[idx]) { bad.push(l); return; }
      if (nums.length < k) { bad.push(l); return; }
      var vals = nums.map(function (v, i) { return parseScore(v, M[i]); });
      if (vals.some(function (v) { return !v.ok; })) { bad.push(l); return; }
      cur.students[idx].scores = vals.map(function (v) { return v.val; }); used[idx] = 1; done++;
    });
    renderScores(); renderReport(); touch();
    var missing = roster.filter(function (_, i) { return !used[i] && !cur.students[i].scores.some(function (v) { return v != null; }); });
    $("#bulkResult").innerHTML = "✓ " + done + " ta o'quvchining ballari qo'yildi." +
      (bad.length ? '<div class="err">Qo\'yilmagan qatorlar (' + bad.length + "):<br>" + bad.map(esc).join("<br>") + "</div>" : "") +
      (missing.length ? '<div class="muted">Bali yo\'q o\'quvchilar: ' + missing.map(esc).join(", ") + "</div>" : "");
    if (!bad.length) $("#bulkInput").value = "";
  };
  $("#photoInput").addEventListener("change", function (e) { var f = Array.from(e.target.files || []); e.target.value = ""; if (f.length) readPhotos(f); });
  $("#suggestBtn").onclick = function () { suggest(); renderFonts(); };
  $("#xfName").onchange = function (e) { cur.xfont.name = e.target.value; renderFonts(); touch(); };
  $("#xfItalic").onchange = function (e) { cur.xfont.italic = e.target.checked; renderFonts(); touch(); };
  $("#xfBold").onchange = function (e) { cur.xfont.bold = e.target.checked; renderFonts(); touch(); };
  $("#xfSize").onchange = function (e) { cur.xfont.size = Number(e.target.value); renderFonts(); touch(); };
  $("#excelBtn").onclick = downloadExcel;
  $("#printBtn").onclick = function () { doPrint(false); };
  $("#printBtn1").onclick = function () { doPrint(true); };
  $("#deleteClassBtn").onclick = function () {
    if (!confirm("\"" + (cur.sinf || "Nomsiz") + "\" sinfi butunlay o'chirilsinmi?")) return;
    store.deleted.push(cur.id); store.classes = store.classes.filter(function (c) { return c !== cur; }); cur = null; saveNow(); renderHome();
  };
  $("#lightbox").onclick = function () { $("#lightbox").classList.add("hidden"); };
  $("#backupBtn").onclick = function () {
    var data = JSON.stringify({ app: "bsb-tahlil", version: 1, date: new Date().toISOString(), settings: Object.assign({}, store.settings, { key: "" }), classes: store.classes }, null, 1);
    var a = el("a", { href: URL.createObjectURL(new Blob([data], { type: "application/json" })), download: "BSB_zaxira_" + new Date().toISOString().slice(0, 10) + ".json" });
    document.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); }, 1000);
  };
  $("#restoreInput").addEventListener("change", function (e) {
    var f = e.target.files[0]; e.target.value = ""; if (!f) return;
    f.text().then(function (t) {
      var d = JSON.parse(t);
      if (!d || !Array.isArray(d.classes)) throw new Error();
      var ids = {}; store.classes.forEach(function (c) { ids[c.id] = c; });
      var added = 0, upd = 0;
      d.classes.forEach(function (c) { if (ids[c.id]) { Object.assign(ids[c.id], c); upd++; } else { store.classes.push(c); added++; } });
      if (d.settings) Object.keys(d.settings).forEach(function (k) { if (k !== "key" && d.settings[k] && !store.settings[k]) store.settings[k] = d.settings[k]; });
      saveNow(); renderHome(); alert("Tiklandi: " + added + " ta yangi, " + upd + " ta yangilangan sinf.");
    }).catch(function () { alert("Bu fayl zaxira nusxa emas."); });
  });
  window.addEventListener("beforeunload", saveNow);

  // test uchun
  window.__bsb = { translit: translit, parseNames: parseNames, candidates: candidates, prepItem: prepItem };
  start();
})();
