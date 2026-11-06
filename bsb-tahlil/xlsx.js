/* BSB tahlil — Excel (.xlsx) generator. Tashqi kutubxonasiz: XML + oddiy ZIP. */
(function (root) {
  "use strict";
  var enc = new TextEncoder();

  /* ---------- ZIP (STORE, siqishsiz) ---------- */
  var CRC = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(b) { var c = 0xFFFFFFFF; for (var i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function zip(files) {
    var parts = [], central = [], off = 0;
    files.forEach(function (f) {
      var name = enc.encode(f.name), data = typeof f.data === "string" ? enc.encode(f.data) : f.data, crc = crc32(data);
      var h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true);
      h.setUint16(8, 0, true); h.setUint16(10, 0, true); h.setUint16(12, 0x21, true);
      h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true);
      h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
      parts.push(new Uint8Array(h.buffer), name, data);
      var c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
      c.setUint16(10, 0, true); c.setUint16(12, 0, true); c.setUint16(14, 0x21, true);
      c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true);
      c.setUint16(28, name.length, true); c.setUint32(42, off, true);
      central.push(new Uint8Array(c.buffer), name);
      off += 30 + name.length + data.length;
    });
    var csize = central.reduce(function (s, p) { return s + p.length; }, 0);
    var e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
    e.setUint32(12, csize, true); e.setUint32(16, off, true);
    var all = parts.concat(central, [new Uint8Array(e.buffer)]);
    var out = new Uint8Array(off + csize + 22), p = 0;
    all.forEach(function (a) { out.set(a, p); p += a.length; });
    return out;
  }

  /* ---------- yordamchilar ---------- */
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function col(n) { var s = ""; while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
  function num(v) { return Number.isFinite(v) ? String(+v.toPrecision(15)) : ""; }

  /* uslublar (cellXfs indekslari) */
  var S = { title: 1, lblR: 2, box: 3, hdr: 4, maxLbl: 5, maxIn: 6, maxTxt: 7, no: 8, name: 9, score: 10, total: 11, pct: 12, avgLbl: 13, avgNum: 14, avgPct: 15, xul: 16, sign: 17, signName: 18, empty: 19 };
  function styles(xf5) {
  xf5 = xf5 || {};
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="2"><numFmt numFmtId="164" formatCode="0.0%"/><numFmt numFmtId="165" formatCode="0.0"/></numFmts>' +
    '<fonts count="5">' +
    '<font><sz val="10"/><name val="Arial"/><family val="2"/></font>' +
    '<font><b/><sz val="10"/><name val="Arial"/><family val="2"/></font>' +
    '<font><sz val="13"/><name val="Arial"/><family val="2"/></font>' +
    '<font><b/><sz val="10"/><color rgb="FF0000FF"/><name val="Arial"/><family val="2"/></font>' +
    '<font>' + (xf5.bold ? '<b/>' : '') + (xf5.italic ? '<i/>' : '') + '<sz val="' + (xf5.size || 11) + '"/><name val="' + esc(xf5.name || 'Arial') + '"/></font>' +
    '</fonts>' +
    '<fills count="6"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
    ['D9E1F2', 'E2EFDA', 'FFF2CC', 'FCE4D6'].map(function (c) { return '<fill><patternFill patternType="solid"><fgColor rgb="FF' + c + '"/><bgColor indexed="64"/></patternFill></fill>'; }).join("") +
    '</fills>' +
    '<borders count="3"><border><left/><right/><top/><bottom/><diagonal/></border>' +
    '<border>' + ['left', 'right', 'top', 'bottom'].map(function (s) { return '<' + s + ' style="thin"><color rgb="FF808080"/></' + s + '>'; }).join("") + '<diagonal/></border>' +
    '<border>' + ['left', 'right', 'top', 'bottom'].map(function (s) { return '<' + s + ' style="thin"><color rgb="FF000000"/></' + s + '>'; }).join("") + '<diagonal/></border>' +
    '</borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="20">' +
    xf(0, 0, 0, 0, null) +                       // 0
    xf(0, 2, 0, 0, "center", true) +             // 1 title
    xf(0, 0, 0, 0, "right") +                    // 2 label right
    xf(0, 0, 0, 2, "center", true) +             // 3 box
    xf(0, 1, 2, 1, "center", true) +             // 4 header
    xf(0, 1, 0, 1, "center", true) +             // 5 max label
    xf(0, 3, 4, 1, "center") +                   // 6 max input
    xf(0, 1, 0, 1, "center") +                   // 7 max text
    xf(0, 0, 0, 1, "center") +                   // 8 №
    xf(0, 0, 0, 1, "left") +                     // 9 name
    xf(0, 0, 4, 1, "center") +                   // 10 score
    xf(0, 0, 0, 1, "center") +                   // 11 total
    xf(164, 0, 3, 1, "center") +                 // 12 pct
    xf(0, 1, 5, 1, "center") +                   // 13 avg label
    xf(165, 1, 5, 1, "center") +                 // 14 avg num
    xf(164, 1, 5, 1, "center") +                 // 15 avg pct
    xf(0, 4, 0, 2, "center", true) +             // 16 xulosa
    xf(0, 1, 0, 0, "left") +                     // 17 sign
    xf(0, 1, 0, 0, "center") +                   // 18 sign name
    xf(0, 0, 5, 1, "center") +                   // 19 avg empty
    '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
  }
  function xf(fmt, font, fill, border, h, wrap) {
    var a = '<xf numFmtId="' + fmt + '" fontId="' + font + '" fillId="' + fill + '" borderId="' + border + '" xfId="0"' +
      (fmt ? ' applyNumberFormat="1"' : "") + (font ? ' applyFont="1"' : "") + (fill ? ' applyFill="1"' : "") + (border ? ' applyBorder="1"' : "");
    if (!h) return a + "/>";
    return a + ' applyAlignment="1"><alignment horizontal="' + h + '" vertical="center"' + (wrap ? ' wrapText="1"' : "") + '/></xf>';
  }

  /* ---------- hisob-kitob ---------- */
  function compute(d) {
    var k = d.criteria.length, maxTot = d.max.reduce(function (a, b) { return a + b; }, 0);
    var rows = d.students.map(function (s) {
      var sc = s.scores.slice(0, k), has = sc.some(function (v) { return v != null; });
      var tot = has ? sc.reduce(function (a, v) { return a + (v == null ? 0 : v); }, 0) : null;
      return { name: s.name, scores: sc, total: tot,
        pcts: sc.map(function (v, i) { return v == null ? null : v / d.max[i]; }),
        overall: tot == null ? null : tot / maxTot };
    });
    function avg(arr) { var x = arr.filter(function (v) { return v != null; }); return x.length ? x.reduce(function (a, b) { return a + b; }, 0) / x.length : null; }
    var avgScores = [], avgPcts = [];
    for (var i = 0; i < k; i++) {
      avgScores.push(avg(rows.map(function (r) { return r.scores[i]; })));
      avgPcts.push(avg(rows.map(function (r) { return r.pcts[i]; })));
    }
    return { k: k, maxTot: maxTot, rows: rows, avgScores: avgScores, avgTotal: avg(rows.map(function (r) { return r.total; })),
      avgPcts: avgPcts, avgOverall: avg(rows.map(function (r) { return r.overall; })) };
  }

  /* ---------- diagramma XML ---------- */
  function txPr(sz, rot) {
    return '<c:txPr><a:bodyPr' + (rot ? ' rot="' + rot + '" vert="horz"' : "") + '/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="' + sz + '"/></a:pPr><a:endParaRPr lang="en-US"/></a:p></c:txPr>';
  }
  function chartXml(o) {
    var cats = o.cats.map(function (c, i) { return '<c:pt idx="' + i + '"><c:v>' + esc(c) + '</c:v></c:pt>'; }).join("");
    var vals = o.vals.map(function (v, i) { return v == null ? "" : '<c:pt idx="' + i + '"><c:v>' + num(v) + '</c:v></c:pt>'; }).join("");
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<c:roundedCorners val="0"/><c:chart>' +
      '<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1400" b="1"/></a:pPr><a:r><a:rPr lang="en-US" sz="1400" b="1"/><a:t>' + esc(o.title) + '</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>' +
      '<c:autoTitleDeleted val="0"/><c:plotArea><c:layout/>' +
      '<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="0"/>' +
      '<c:ser><c:idx val="0"/><c:order val="0"/><c:spPr><a:solidFill><a:srgbClr val="' + o.color + '"/></a:solidFill></c:spPr><c:invertIfNegative val="0"/>' +
      '<c:dLbls><c:numFmt formatCode="' + o.fmt + '" sourceLinked="0"/><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>' + txPr(o.lblSz || 900) +
      '<c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls>' +
      '<c:cat><c:strRef><c:f>' + o.catRef + '</c:f><c:strCache><c:ptCount val="' + o.cats.length + '"/>' + cats + '</c:strCache></c:strRef></c:cat>' +
      '<c:val><c:numRef><c:f>' + o.valRef + '</c:f><c:numCache><c:formatCode>0.0%</c:formatCode><c:ptCount val="' + o.vals.length + '"/>' + vals + '</c:numCache></c:numRef></c:val>' +
      '</c:ser><c:gapWidth val="' + (o.gap || 150) + '"/><c:axId val="111"/><c:axId val="222"/></c:barChart>' +
      '<c:catAx><c:axId val="111"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:numFmt formatCode="General" sourceLinked="0"/>' +
      '<c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>' + txPr(o.catSz || 900, o.rot) +
      '<c:crossAx val="222"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>' +
      '<c:valAx><c:axId val="222"/><c:scaling><c:orientation val="minMax"/><c:max val="1"/><c:min val="0"/></c:scaling><c:delete val="0"/><c:axPos val="l"/>' +
      '<c:numFmt formatCode="0%" sourceLinked="0"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>' + txPr(800) +
      '<c:crossAx val="111"/><c:crosses val="autoZero"/><c:crossBetween val="between"/><c:majorUnit val="0.1"/></c:valAx>' +
      '</c:plotArea><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart></c:chartSpace>';
  }
  function anchor(r1, r2, c2, id) {
    return '<xdr:twoCellAnchor editAs="oneCell"><xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>' + r1 + '</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>' +
      '<xdr:to><xdr:col>' + c2 + '</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>' + r2 + '</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>' +
      '<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="' + (id + 1) + '" name="Diagramma ' + id + '"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>' +
      '<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">' +
      '<c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId' + id + '"/>' +
      '</a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>';
  }

  /* ---------- asosiy: workbook yaratish ---------- */
  function build(d) {
    var R = compute(d), k = R.k, n = R.rows.length;
    var C1 = 3, CK = 2 + k, TOT = 3 + k, P1 = 4 + k, PK = 3 + 2 * k, ALL = 4 + 2 * k, LAST = ALL;
    var first = 7, last = 6 + n, avg = last + 1;
    var SH = "'Tahlil'!";
    var rows = {}, merges = [], heights = { 1: 30, 4: 42, 5: 30 };
    function put(r, c, xml) { (rows[r] = rows[r] || {})[c] = xml; }
    function str(r, c, s, st) { put(r, c, '<c r="' + col(c) + r + '" s="' + st + '" t="inlineStr"><is><t xml:space="preserve">' + esc(s) + '</t></is></c>'); }
    function nm(r, c, v, st) { put(r, c, '<c r="' + col(c) + r + '" s="' + st + '"' + (v == null ? "/>" : '><v>' + num(v) + '</v></c>')); }
    function fm(r, c, f, v, st) {
      put(r, c, '<c r="' + col(c) + r + '" s="' + st + '"' + (v == null ? ' t="str"><f>' + esc(f) + '</f><v></v></c>' : '><f>' + esc(f) + '</f><v>' + num(v) + '</v></c>'));
    }
    function blank(r, c, st) { put(r, c, '<c r="' + col(c) + r + '" s="' + st + '"/>'); }
    function merge(r1, c1, r2, c2, st) {
      merges.push(col(c1) + r1 + ":" + col(c2) + r2);
      if (st != null) for (var r = r1; r <= r2; r++) for (var c = c1; c <= c2; c++) if (!(rows[r] && rows[r][c])) blank(r, c, st);
    }

    // sarlavha
    str(1, 1, d.title, S.title); merge(1, 1, 1, LAST);
    str(2, 2, "Sinf :", S.lblR); str(2, 3, d.sinf, S.box); merge(2, 3, 2, 4, S.box);
    str(3, 2, "Fan :", S.lblR); str(3, 3, d.fan, S.box); merge(3, 3, 3, Math.max(4, CK), S.box);

    // jadval sarlavhalari
    str(4, 1, "№", S.hdr); merge(4, 1, 5, 1, S.hdr);
    str(4, 2, "Familiya, ism, sharifi", S.hdr); merge(4, 2, 5, 2, S.hdr);
    str(4, C1, "Mezonlar bo'yicha to'plagan bali", S.hdr); if (k > 1) merge(4, C1, 4, CK, S.hdr);
    str(4, TOT, "Jami ball", S.hdr); merge(4, TOT, 5, TOT, S.hdr);
    str(4, P1, "Mezonlar bo'yicha foiz ko'rsatkichi", S.hdr); if (k > 1) merge(4, P1, 4, PK, S.hdr);
    str(4, ALL, "Umumiy foiz ko'rsatkichi", S.hdr); str(5, ALL, "Umumiy %", S.hdr);
    d.criteria.forEach(function (lab, i) { str(5, C1 + i, lab, S.hdr); str(5, P1 + i, lab + " %", S.hdr); });

    // maksimal ball
    blank(6, 1, S.maxTxt); str(6, 2, "Maksimal ball", S.maxLbl);
    d.max.forEach(function (m, i) { nm(6, C1 + i, m, S.maxIn); });
    fm(6, TOT, "SUM(" + col(C1) + "6:" + col(CK) + "6)", R.maxTot, S.maxTxt);
    for (var c = P1; c <= ALL; c++) str(6, c, "100%", S.maxTxt);

    // o'quvchilar
    R.rows.forEach(function (row, idx) {
      var r = first + idx, rng = col(C1) + r + ":" + col(CK) + r;
      nm(r, 1, idx + 1, S.no); str(r, 2, row.name, S.name);
      row.scores.forEach(function (v, i) { nm(r, C1 + i, v, S.score); });
      fm(r, TOT, 'IF(COUNT(' + rng + ')=0,"",SUM(' + rng + '))', row.total, S.total);
      for (var i = 0; i < k; i++) {
        var s = col(C1 + i);
        fm(r, P1 + i, 'IF(' + s + r + '="","",' + s + r + '/' + s + '$6)', row.pcts[i], S.pct);
      }
      fm(r, ALL, 'IF(' + col(TOT) + r + '="","",' + col(TOT) + r + '/$' + col(TOT) + '$6)', row.overall, S.pct);
    });

    // o'rtacha
    str(avg, 1, "O'rtacha ko'rsatkich", S.avgLbl); merge(avg, 1, avg, 2, S.avgLbl);
    function avgF(c) { return 'IFERROR(AVERAGE(' + col(c) + first + ':' + col(c) + last + '),"")'; }
    for (var i = 0; i < k; i++) { fm(avg, C1 + i, avgF(C1 + i), R.avgScores[i], S.avgNum); fm(avg, P1 + i, avgF(P1 + i), R.avgPcts[i], S.avgPct); }
    fm(avg, TOT, avgF(TOT), R.avgTotal, S.avgNum); fm(avg, ALL, avgF(ALL), R.avgOverall, S.avgPct);

    // diagrammalar joyi, xulosa, imzolar
    var ch1a = avg + 1, ch1b = avg + 15, ch2a = avg + 16, ch2b = avg + 34;
    var x = avg + 36;
    str(x, 2, d.xulosa || "", S.xul); merge(x, 2, x + 3, LAST - 1, S.xul);
    for (var h = x; h <= x + 3; h++) heights[h] = 24;
    var sc1 = Math.min(6, LAST - 3), sc2 = Math.min(sc1 + 3, LAST);
    var s1 = x + 6;
    (d.signs || []).forEach(function (sg, i) {
      var rr = s1 + i * 3;
      str(rr, 2, sg.label, S.sign); str(rr, sc1, sg.name, S.signName); merge(rr, sc1, rr, sc2);
    });
    var lastRow = s1 + Math.max(0, (d.signs || []).length - 1) * 3 + 1;

    // sheet XML
    var widths = { 1: 5, 2: 30 }; widths[TOT] = 9; widths[ALL] = 13;
    var cols = "";
    for (var cc = 1; cc <= LAST; cc++) cols += '<col min="' + cc + '" max="' + cc + '" width="' + (widths[cc] || 9.5) + '" customWidth="1"/>';
    var sd = Object.keys(rows).map(Number).sort(function (a, b) { return a - b; }).map(function (r) {
      var cells = Object.keys(rows[r]).map(Number).sort(function (a, b) { return a - b; }).map(function (c) { return rows[r][c]; }).join("");
      return '<row r="' + r + '"' + (heights[r] ? ' ht="' + heights[r] + '" customHeight="1"' : "") + '>' + cells + '</row>';
    }).join("");
    var dv = n ? '<dataValidations count="1"><dataValidation type="decimal" operator="between" allowBlank="1" showErrorMessage="1" errorTitle="Noto&apos;g&apos;ri ball" error="Ball 0 dan mezonning maksimal balidan oshmasligi kerak." sqref="' +
      col(C1) + first + ':' + col(CK) + last + '"><formula1>0</formula1><formula2>' + col(C1) + '$6</formula2></dataValidation></dataValidations>' : "";
    var sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:' + col(LAST) + lastRow + '"/>' +
      '<sheetViews><sheetView workbookViewId="0"><pane xSplit="2" ySplit="6" topLeftCell="C7" activePane="bottomRight" state="frozen"/><selection pane="bottomRight" activeCell="C7" sqref="C7"/></sheetView></sheetViews>' +
      '<sheetFormatPr defaultRowHeight="13.2"/><cols>' + cols + '</cols><sheetData>' + sd + '</sheetData>' +
      '<mergeCells count="' + merges.length + '">' + merges.map(function (m) { return '<mergeCell ref="' + m + '"/>'; }).join("") + '</mergeCells>' + dv +
      '<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>' +
      '<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>' +
      '<rowBreaks count="1" manualBreakCount="1"><brk id="' + avg + '" max="16383" man="1"/></rowBreaks>' +
      '<drawing r:id="rId1"/></worksheet>';

    var cats2 = R.rows.map(function (r) { return r.name; });
    var chart1 = chartXml({ title: "Mezonlar bo'yicha o'rtacha foiz ko'rsatkichi", color: "4472C4", fmt: "0.0%",
      cats: d.criteria.map(function (l) { return l + " %"; }).concat(["Umumiy %"]),
      catRef: SH + "$" + col(P1) + "$5:$" + col(ALL) + "$5",
      vals: R.avgPcts.concat([R.avgOverall]), valRef: SH + "$" + col(P1) + "$" + avg + ":$" + col(ALL) + "$" + avg });
    var chart2 = chartXml({ title: "O'quvchilarning umumiy foiz ko'rsatkichi", color: "70AD47", fmt: "0%", gap: 50, rot: -2700000, catSz: 800, lblSz: 800,
      cats: cats2, catRef: SH + "$B$" + first + ":$B$" + last,
      vals: R.rows.map(function (r) { return r.overall; }), valRef: SH + "$" + col(ALL) + "$" + first + ":$" + col(ALL) + "$" + last });
    var drawing = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">' +
      anchor(ch1a, ch1b, LAST, 1) + anchor(ch2a, ch2b, LAST, 2) + '</xdr:wsDr>';

    var CT = "application/vnd.openxmlformats-officedocument.";
    var files = [
      { name: "[Content_Types].xml", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="' + CT + 'spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="' + CT + 'spreadsheetml.worksheet+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="' + CT + 'spreadsheetml.styles+xml"/>' +
        '<Override PartName="/xl/drawings/drawing1.xml" ContentType="' + CT + 'drawing+xml"/>' +
        '<Override PartName="/xl/charts/chart1.xml" ContentType="' + CT + 'drawingml.chart+xml"/>' +
        '<Override PartName="/xl/charts/chart2.xml" ContentType="' + CT + 'drawingml.chart+xml"/></Types>' },
      { name: "_rels/.rels", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
      { name: "xl/workbook.xml", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<bookViews><workbookView/></bookViews><sheets><sheet name="Tahlil" sheetId="1" r:id="rId1"/></sheets>' +
        '<definedNames><definedName name="_xlnm.Print_Area" localSheetId="0">' + SH + '$A$1:$' + col(LAST) + '$' + lastRow + '</definedName></definedNames>' +
        '<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>' },
      { name: "xl/_rels/workbook.xml.rels", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
      { name: "xl/styles.xml", data: styles(d.xulosaFont) },
      { name: "xl/worksheets/sheet1.xml", data: sheet },
      { name: "xl/worksheets/_rels/sheet1.xml.rels", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>' },
      { name: "xl/drawings/drawing1.xml", data: drawing },
      { name: "xl/drawings/_rels/drawing1.xml.rels", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart1.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart2.xml"/></Relationships>' },
      { name: "xl/charts/chart1.xml", data: chart1 },
      { name: "xl/charts/chart2.xml", data: chart2 }
    ];
    return zip(files);
  }

  root.BSBXlsx = { build: build, compute: compute };
})(typeof window !== "undefined" ? window : globalThis);
