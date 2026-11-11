/*
 * 세금 계산 순수 함수 — 화면 코드와 분리. 입력 객체를 받아 결과 객체를 돌려준다.
 * 모든 단계 금액은 원 미만 절사.
 */
(function (root) {
  function pick(list, date) {
    var best = null;
    list.forEach(function (it) { if (it.from <= date && (!best || it.from > best.from)) best = it; });
    return (best || list[0]).value;
  }
  function progressive(base, brackets) {
    if (base <= 0) return 0;
    for (var i = 0; i < brackets.length; i++) {
      var b = brackets[i];
      if (base <= b[0]) return Math.floor(base * b[1] / 100) - b[2];
    }
    return 0;
  }
  function rateOf(base, brackets) {
    for (var i = 0; i < brackets.length; i++) if (base <= brackets[i][0]) return brackets[i][1];
    return 0;
  }
  function parseDate(s) { var p = String(s).split('-'); return { y: +p[0], m: +p[1], d: +p[2] }; }
  /*
   * 만 년수: 취득일의 n년 뒤 같은 날(응당일)이 양도일 이전이거나 같으면 n년으로 센다.
   * 예) 2024-03-01 취득 → 2026-03-01 양도 = 2년.  (초일 불산입 처리 — 조 세무사 최종 확인 사항)
   */
  function fullYears(from, to) {
    var a = parseDate(from), b = parseDate(to);
    var n = b.y - a.y;
    if (b.m < a.m || (b.m === a.m && b.d < a.d)) n--;
    return Math.max(0, n);
  }
  function fl(x) { return Math.floor(x); }

  /* ---------------- 증여세 ---------------- */
  function giftTax(inp, cfg) {
    var g = cfg.gift, date = inp.date || cfg.기준일;
    var rel = inp.relation, isAsc = rel === 'ascendant';
    var amount = fl(inp.amount || 0), prior = fl(inp.priorAmount || 0);
    var rows = [];

    var combined = amount + prior;
    var taxable = (prior > 0 && combined >= g.aggregateThreshold) ? combined : amount;
    rows.push({ k: '이번 증여재산가액', v: amount });
    if (prior > 0) rows.push({ k: '10년 내 동일인 증여 합산', v: taxable - amount, op: '+' });
    rows.push({ k: '증여세 과세가액', v: taxable, total: true });

    var ded = pick(g.deduction, date);
    var limit = isAsc && inp.minor ? ded.ascendantMinor : (ded[rel] || 0);
    var remain = Math.max(0, limit - fl(inp.priorDeduction || 0));
    var deduction = Math.min(remain, taxable);
    rows.push({ k: '증여재산공제', v: deduction, op: '−', note: '한도 ' + won(limit) + (inp.priorDeduction ? ' − 이미 받은 공제 ' + won(inp.priorDeduction) : '') });

    var marriage = 0;
    if (isAsc && inp.marriage) {
      var mLimit = pick(g.marriageBirthLimit, date);
      marriage = Math.min(Math.max(0, mLimit - fl(inp.marriageUsed || 0)), taxable - deduction);
      rows.push({ k: '혼인·출산 증여재산공제', v: marriage, op: '−' });
    }

    var base = Math.max(0, taxable - deduction - marriage);
    rows.push({ k: '과세표준', v: base, total: true });

    var below = base < g.minTaxBase;
    var brackets = pick(g.rates, date);
    var calc = below ? 0 : progressive(base, brackets);
    rows.push({ k: '산출세액', v: calc, note: below ? '과세표준 50만원 미만 → 부과하지 않음' : '세율 ' + rateOf(base, brackets) + '% (누진공제 반영)' });

    var surcharge = 0;
    if (isAsc && inp.skipGen && calc > 0) {
      var sr = (inp.minor && amount > g.skipGenLargeAmount) ? g.skipGenRateMinorLarge : g.skipGenRate;
      surcharge = fl(calc * sr / 100);
      rows.push({ k: '세대생략 할증', v: surcharge, op: '+', note: sr + '%' });
    }

    var credit = Math.min(fl(inp.priorTax || 0), calc + surcharge);
    if (credit > 0) rows.push({ k: '기납부세액공제', v: credit, op: '−' });

    var filing = inp.onTime ? fl((calc + surcharge - credit) * g.filingCreditRate / 100) : 0;
    rows.push({ k: '신고세액공제', v: filing, op: '−', note: inp.onTime ? g.filingCreditRate + '%' : '기한 후 신고 → 공제 없음' });

    var pay = calc + surcharge - credit - filing;
    return { tax: pay, base: base, calc: calc, surcharge: surcharge, filing: filing, rows: rows, below: below };
  }

  /* ---------------- 양도소득세 ---------------- */
  function capitalGainsTax(inp, cfg) {
    var c = cfg.cgt, date = inp.saleDate;
    var isHouse = inp.assetType === 'house';
    // 금액은 전체 기준으로 받고, 공동명의면 지분(분자/분모)만큼 나눈다. 12억 판정은 전체 양도가액으로 한다.
    var num = +inp.shareNum || 1, den = +inp.shareDen || 1;
    if (!(num > 0 && den > 0 && num <= den)) { num = 1; den = 1; }
    var joint = num < den, shareTxt = inp.shareLabel || (num + '/' + den);
    var part = function (x) { return fl(fl(x || 0) * num / den); };
    var full = fl(inp.price || 0);
    var price = part(inp.price), cost = part(inp.cost), expense = part(inp.expense);
    var years = fullYears(inp.acqDate, inp.saleDate);
    var line = pick(c.highPriceLine, date);
    // 1세대 1주택 비과세·고가주택 계산은 보유 2년 이상일 때만
    var oneHouse = isHouse && !!inp.oneHouse && years >= 2;
    var rows = [];
    var notices = c.notices.filter(function (n) { return date >= n.from; });

    if (oneHouse && full <= line) {
      return { tax: 0, local: 0, total: 0, exempt: true, years: years, rows: [
        { k: '양도가액(주택 전체)', v: full },
        { k: '고가주택 기준', v: line, note: '12억원 이하 → 비과세' }
      ], notices: notices };
    }

    var gain = price - cost - expense;
    var jn = function (x) { return joint ? '전체 ' + won(fl(x || 0)) + ' × 지분 ' + shareTxt : ''; };
    rows.push({ k: joint ? '양도가액 (내 지분)' : '양도가액', v: price, note: jn(inp.price) });
    rows.push({ k: joint ? '취득가액 (내 지분)' : '취득가액', v: cost, op: '−', note: jn(inp.cost) });
    rows.push({ k: joint ? '필요경비 (내 지분)' : '필요경비', v: expense, op: '−', note: jn(inp.expense) });
    rows.push({ k: '양도차익', v: gain, total: true });
    if (gain <= 0) {
      return { tax: 0, local: 0, total: 0, loss: true, years: years, rows: rows, notices: notices };
    }

    var taxGain = gain, high = false;
    if (oneHouse && full > line) {
      high = true;
      taxGain = fl(gain * (full - line) / full);
      rows.push({ k: '과세 양도차익 (12억 초과분)', v: taxGain, total: true, note: '양도차익 × (' + won(full) + ' − 12억) ÷ ' + won(full) });
    }

    var lt = c.ltd, resid = Math.min(+inp.residYears || 0, years), rate = 0, table = '';
    if (years >= lt.minYears) {
      if (oneHouse && resid >= lt.table2.residMin) {
        var h = Math.min(years * lt.table2.holdPerYear, lt.table2.holdMax);
        var r = Math.min(resid * lt.table2.residPerYear, lt.table2.residMax);
        rate = h + r; table = '표2: 보유 ' + h + '% + 거주 ' + r + '%';
      } else {
        rate = Math.min(years * lt.table1.perYear, lt.table1.max); table = '표1: 보유 ' + years + '년';
      }
    } else table = '보유 3년 미만 → 공제 없음';
    var ltd = fl(taxGain * rate / 100);
    rows.push({ k: '장기보유특별공제', v: ltd, op: '−', note: rate + '% (' + table + ')' });

    var income = taxGain - ltd;
    rows.push({ k: '양도소득금액', v: income, total: true });
    var bd = Math.min(pick(c.basicDeduction, date), income);
    rows.push({ k: '양도소득 기본공제', v: bd, op: '−', note: '같은 해 다른 양도가 없다고 가정' });
    var base = Math.max(0, income - bd);
    rows.push({ k: '과세표준', v: base, total: true });

    var brackets = pick(c.basicRates, date);
    var basic = progressive(base, brackets), tax = basic, how = '기본세율 ' + rateOf(base, brackets) + '%', shortRate = 0;
    if (years < 2) {
      // 단기보유 세율과 기본세율 중 큰 세액 (제104조① 후단)
      shortRate = pick(c.shortRates, date)[isHouse ? 'house' : 'other'][years < 1 ? 'under1' : 'under2'];
      var short = fl(base * shortRate / 100);
      if (short >= basic) { tax = short; how = '단기보유 ' + shortRate + '% (기본세율 ' + won(basic) + '보다 큼)'; }
      else how += ' (단기보유 ' + shortRate + '% ' + won(short) + '보다 큼)';
    }
    rows.push({ k: '산출세액', v: tax, note: how });
    var local = fl(tax * c.localTaxRate / 100);
    rows.push({ k: '지방소득세', v: local, op: '+', note: '10%' });

    return { tax: tax, local: local, total: tax + local, years: years, high: high, rate: rate, base: base, shortRate: shortRate, rows: rows, notices: notices };
  }

  function won(n) { return Math.round(n).toLocaleString('ko-KR') + '원'; }

  var API = { giftTax: giftTax, capitalGainsTax: capitalGainsTax, fullYears: fullYears, progressive: progressive, pick: pick };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.TaxCalc = API;
})(this);
