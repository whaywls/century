/* 계산기 화면 공통: 금액 입력 콤마, 한글 단위 읽기, 결과 표 그리기. 입력값은 어디에도 저장·전송하지 않는다. */
var CalcUI = (function () {
  var CONFIG = { blog: 'https://blog.naver.com/taxcentury', kakao: 'http://pf.kakao.com/_ESWXG/chat' };
  document.querySelectorAll('[data-link]').forEach(function (el) { el.href = CONFIG[el.dataset.link]; });

  function won(n) { return Math.round(n).toLocaleString('ko-KR') + '원'; }
  function korean(n) {
    n = Math.floor(n); if (!n) return '';
    var eok = Math.floor(n / 1e8), man = Math.floor((n % 1e8) / 1e4), rest = n % 1e4, out = [];
    if (eok) out.push(eok.toLocaleString('ko-KR') + '억');
    if (man) out.push(man.toLocaleString('ko-KR') + '만');
    if (rest && !eok) out.push(rest.toLocaleString('ko-KR'));
    return out.join(' ') + '원';
  }
  function num(el) { return +(String(el.value).replace(/[^0-9]/g, '')) || 0; }
  function bindMoney(root) {
    root.querySelectorAll('input[data-money]').forEach(function (el) {
      var out = el.closest('.field').querySelector('.readout');
      function fmt() {
        var v = num(el); el.value = v ? v.toLocaleString('ko-KR') : '';
        if (out) out.textContent = korean(v);
      }
      el.addEventListener('input', fmt); fmt();
    });
  }
  function rowsHtml(rows) {
    return rows.map(function (r) {
      return '<tr class="' + (r.total ? 'total' : '') + '"><td>' + (r.op ? '<span class="op">' + r.op + '</span>' : '') + r.k +
        (r.note ? '<small>' + r.note + '</small>' : '') + '</td><td>' + won(r.v) + '</td></tr>';
    }).join('');
  }
  function show(el, on) { el.hidden = !on; el.querySelectorAll('input,select').forEach(function (i) { i.disabled = !on; }); }
  return { won: won, korean: korean, num: num, bindMoney: bindMoney, rowsHtml: rowsHtml, show: show, CONFIG: CONFIG };
})();
