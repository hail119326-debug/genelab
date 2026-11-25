/* =========================================================
   student-shop.js — 유전자 편집 쇼핑몰
   왼쪽: 예산·선택 목록·탄생 버튼 / 오른쪽: 분류 탭 + 옵션 카드
   ========================================================= */
GL.Shop = {
  cat: 'disease',

  /* ---------- 계산 ---------- */
  isPicked: function (id) { return GL.state.picks.indexOf(id) > -1; },

  // L1 국가 지원: 아직 안 쓴 상태에서 '치료' 태그 옵션이면 무료
  isVoucherable: function (o) {
    var S = GL.state;
    return S.level === 1 && o.tag === 'treat' && !S.voucherId;
  },

  // 세부 선택(색상·정도·성별·키)이 있는 옵션의 실제 가격·확률·선택 라벨을 계산
  // src: 생략하면 이미 저장된 선택(GL.state.variants)을 쓰고, 상세 모달 미리보기에서는 스크래치 값을 넘겨요
  effective: function (o, src) {
    src = src || GL.state.variants[o.id];
    if (o.id === 'height') {
      var cfg = o.heightConfig;
      var delta = (src && src.delta != null) ? src.delta : cfg.defaultDelta;
      var rate = delta <= 0 ? null : Math.max(cfg.rateFloor, cfg.rateStart - (delta - 1) * cfg.rateStep);
      return { price: delta * cfg.perCm, rate: rate, label: delta > 0 ? ('+' + delta + 'cm') : '기준 그대로', delta: delta };
    }
    if (o.variants) {
      var idx = (src && src.idx != null) ? src.idx : (o.defaultIdx || 0);
      var v = o.variants[idx];
      return {
        price: v.price != null ? v.price : o.price,
        rate: v.rate !== undefined ? v.rate : o.rate,
        label: v.label, idx: idx
      };
    }
    return { price: o.price, rate: o.rate, label: null };
  },

  // 성별(sex) 선택에 따른 '키' 옵션 기준값
  heightBaseLabel: function (o) {
    var sexV = GL.state.variants.sex;
    var genderLabel = (sexV && sexV.idx != null) ? GL.optById.sex.variants[sexV.idx].label : null;
    var base = genderLabel ? o.genderBase[genderLabel] : o.genderBase['default'];
    return { genderLabel: genderLabel || '평균', base: base };
  },

  priceOf: function (o) { return GL.state.voucherId === o.id ? 0 : GL.Shop.effective(o).price; },

  spent: function () {
    return GL.state.picks.reduce(function (sum, id) { return sum + GL.Shop.priceOf(GL.optById[id]); }, 0);
  },

  // 쓸 수 있는 돈 = 기본 예산 − 세금 + 국가 지원 + 아르바이트 + 대출 (student-money.js)
  total: function () { return GL.Money.total(); },
  remaining: function () { return GL.Shop.total() - GL.Shop.spent(); },

  // id를 뺀 나머지로 계산한 남은 돈 (이미 고른 옵션의 세부 선택을 바꿀 때 예산 확인용)
  remainingExcluding: function (id) {
    var otherSpent = GL.state.picks.reduce(function (sum, pid) {
      return pid === id ? sum : sum + GL.Shop.priceOf(GL.optById[pid]);
    }, 0);
    return GL.Shop.total() - otherSpent;
  },

  // 고를 수 있는지 + 못 고르는 이유
  check: function (o) {
    if (GL.Shop.isPicked(o.id)) return { ok: true };
    if (GL.Shop.isVoucherable(o)) return { ok: true };
    if (GL.Shop.effective(o).price <= GL.Shop.remaining()) return { ok: true };
    if (GL.state.level === 1 && o.tag === 'treat') return { ok: false, why: '지원은 1개만' };
    return { ok: false, why: '예산 부족' };
  },

  add: function (o) {
    var S = GL.state;
    if (!GL.Shop.check(o).ok || GL.Shop.isPicked(o.id)) return;
    if (GL.Shop.isVoucherable(o)) S.voucherId = o.id;
    S.picks.push(o.id);
    GL.Shop.render();
    GL.App.save();
  },

  remove: function (id) {
    var S = GL.state;
    S.picks = S.picks.filter(function (x) { return x !== id; });
    if (S.voucherId === id) S.voucherId = null;
    GL.Shop.render();
    GL.App.save();
  },

  /* ---------- 그리기 ---------- */
  show: function () {
    var S = GL.state;
    if (S.results.length || S.submitted) { GL.Report.show(); return; }  // 쇼핑은 1회만
    var lv = GL.LEVELS[S.level];
    GL.util.$('shopLevel').innerHTML =
      '<span class="lv-chip lv' + S.level + '">L' + S.level + '</span> ' + GL.util.esc(lv.name);
    GL.util.$('shopBudget').textContent = '예산 ' + GL.util.money(S.budget);
    GL.Shop.renderTabs();
    GL.Shop.render();
    GL.util.$('birthBtn').onclick = GL.Shop.birthConfirm;
    GL.util.$('jobBtn').onclick = GL.Job.open;
    GL.util.$('supportBtn').onclick = GL.Money.applySupport;
    GL.util.$('loanBtn').onclick = GL.Money.openLoan;
    GL.util.$('cartToggle').onclick = function () {
      GL.util.$('shopPanel').classList.toggle('open');
    };
    GL.App.show('scr-shop', 2, 2045);
  },

  renderTabs: function () {
    var html = GL.CATS.map(function (c) {
      return '<button class="tab' + (c.key === GL.Shop.cat ? ' on' : '') + '" data-cat="' + c.key + '">' + c.name + '</button>';
    }).join('');
    var tabs = GL.util.$('catTabs');
    tabs.innerHTML = html;
    tabs.querySelectorAll('.tab').forEach(function (b) {
      b.onclick = function () {
        GL.Shop.cat = b.dataset.cat;
        GL.Shop.renderTabs();
        GL.Shop.renderGrid();
        GL.util.$('optGrid').scrollTop = 0;
      };
    });
    var cat = GL.CATS.filter(function (c) { return c.key === GL.Shop.cat; })[0];
    GL.util.$('catNote').textContent = cat.note;
  },

  render: function () {
    GL.Shop.renderGrid();
    GL.Shop.renderPanel();
  },

  renderGrid: function () {
    var u = GL.util;
    var list = GL.OPTIONS.filter(function (o) { return o.cat === GL.Shop.cat; });
    var grid = u.$('optGrid');
    grid.innerHTML = list.map(function (o) {
      var picked = GL.Shop.isPicked(o.id);
      var chk = GL.Shop.check(o);
      var eff = GL.Shop.effective(o);
      var free = (!picked && GL.Shop.isVoucherable(o)) || GL.state.voucherId === o.id;
      var lock = !chk.ok ? GL.Shop.LOCK_SVG : '';
      var priceTxt = free
        ? '<span class="price mono"><s>' + u.money(eff.price) + '</s> 무료</span>'
        : '<span class="price mono">' + lock + u.money(eff.price) + '</span>';
      var rateTxt = eff.rate === null ? '변경 없음' : '성공률 ' + eff.rate + '%';
      var state = picked ? '<span class="opt-state on">✓ 선택함' + (eff.label ? ' · ' + u.esc(eff.label) : '') + '</span>' : '';
      var variantHint = (o.variants || o.id === 'height') && !picked ? '<span class="opt-variant-hint small muted">세부 선택 가능</span>' : '';
      return '<button class="opt' + (picked ? ' sel' : '') + (!chk.ok ? ' locked' : '') + '" data-id="' + o.id + '">' +
        '<div class="opt-top"><span class="gene mono">' + u.esc(o.gene) + '</span>' +
        '<span class="tag ' + GL.TAGS[o.tag].cls + '">' + GL.TAGS[o.tag].name + '</span></div>' +
        '<div class="opt-name">' + u.esc(o.name) + '</div>' +
        '<div class="opt-bot">' + priceTxt + '<span class="rate mono">' + rateTxt + '</span></div>' +
        variantHint +
        state +
        '</button>';
    }).join('');
    grid.querySelectorAll('.opt').forEach(function (b) {
      b.onclick = function () { GL.Shop.openDetail(GL.optById[b.dataset.id]); };
    });
    GL.Shop.renderBanner();
  },

  LOCK_SVG: '<svg class="lock-ic" viewBox="0 0 16 16" aria-label="잠김"><rect x="3" y="7" width="10" height="7" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/></svg>',

  // 더 고를 수 있는 옵션이 하나도 없을 때 한 줄 안내
  renderBanner: function () {
    var any = GL.OPTIONS.some(function (o) { return !GL.Shop.isPicked(o.id) && GL.Shop.check(o).ok; });
    var b = GL.util.$('shopBanner');
    if (any) { b.classList.add('hidden'); return; }
    b.classList.remove('hidden');
    b.textContent = GL.state.picks.length
      ? '남은 예산으로 더 고를 수 있는 유전자가 없어요. 아르바이트·국가 지원·대출로 돈을 더 마련할 수 있어요.'
      : '우리 집 예산으로는 고를 수 있는 유전자가 없어요. 아르바이트·국가 지원·대출로 돈을 마련할 수 있어요.';
  },

  renderPanel: function () {
    var u = GL.util;
    var S = GL.state;
    var spent = GL.Shop.spent();
    var total = GL.Shop.total();
    var remain = total - spent;
    u.$('remain').textContent = u.money(remain);
    var pct = total > 0 ? Math.round(remain / total * 100) : 0;
    u.$('barFill').style.width = pct + '%';
    u.$('spentLine').textContent = u.money(spent) + ' 사용';

    var vNote = u.$('voucherNote');
    if (S.level === 1) {
      vNote.classList.remove('hidden');
      vNote.textContent = S.voucherId ? '국가 지원 1개를 사용했어요' : '국가 지원: 치료 옵션 1개 무료';
    } else {
      vNote.classList.add('hidden');
    }

    GL.Job.renderPanel();
    GL.Money.renderBreakdown();
    u.$('cartCount').textContent = S.picks.length;
    var cart = u.$('cartList');
    if (!S.picks.length) {
      cart.innerHTML = '<li class="cart-empty">오른쪽에서 유전자를 골라 보세요</li>';
    } else {
      cart.innerHTML = S.picks.map(function (id) {
        var o = GL.optById[id];
        var p = GL.Shop.priceOf(o);
        var eff = GL.Shop.effective(o);
        var name = u.esc(o.name) + (eff.label ? ' <span class="muted">· ' + u.esc(eff.label) + '</span>' : '');
        return '<li><span class="cart-name">' + name + '</span>' +
          '<span class="mono cart-price">' + (p ? u.money(p) : '무료') + '</span>' +
          '<button class="cart-x" data-id="' + id + '" aria-label="빼기">×</button></li>';
      }).join('');
      cart.querySelectorAll('.cart-x').forEach(function (b) {
        b.onclick = function () { GL.Shop.remove(b.dataset.id); };
      });
    }
  },

  /* ---------- 옵션 상세 (세부 선택이 있으면 색상·정도·성별·키 조절 UI 포함) ---------- */
  openDetail: function (o) {
    // 모달을 열 때마다 스크래치(미리보기용 임시 선택)를 저장된 값 또는 기본값으로 초기화
    var saved = GL.state.variants[o.id];
    if (o.id === 'height') {
      GL.Shop._scratch = { delta: saved && saved.delta != null ? saved.delta : o.heightConfig.defaultDelta };
    } else if (o.variants) {
      GL.Shop._scratch = { idx: saved && saved.idx != null ? saved.idx : (o.defaultIdx || 0) };
    } else {
      GL.Shop._scratch = null;
    }
    GL.Shop.renderDetail(o);
  },

  // 세부 선택 스크래치(_scratch)를 반영해서 모달을 (다시) 그림
  renderDetail: function (o) {
    var u = GL.util;
    var picked = GL.Shop.isPicked(o.id);
    var eff = GL.Shop.effective(o, GL.Shop._scratch);
    var free = GL.Shop.isVoucherable(o) || GL.state.voucherId === o.id;

    // 예산 확인: 이미 담은 옵션이면 그 옵션 몫은 빼고 계산
    var budget = picked ? GL.Shop.remainingExcluding(o.id) : GL.Shop.remaining();
    var afford = free || eff.price <= budget;
    var chkWhy = (GL.state.level === 1 && o.tag === 'treat') ? '지원은 1개만' : '예산 부족';
    var btn = picked
      ? '<button class="btn" id="dAct">선택 취소</button>'
      : (afford ? '<button class="btn btn-ink" id="dAct">선택하기</button>'
                : '<button class="btn" disabled>' + chkWhy + '</button>');

    var oddsHtml;
    if (eff.rate === null) {
      oddsHtml = '<p class="muted small">기준 그대로라 추가로 바뀌는 건 없어요.</p>';
    } else {
      var noneP = Math.round((100 - eff.rate) * (1 - GL.sim.SIDE_SHARE));
      var sideP = 100 - eff.rate - noneP;
      oddsHtml = '<div class="d-odds">' +
        '<div class="odds-bar"><span class="o-ok" style="width:' + eff.rate + '%"></span>' +
        '<span class="o-none" style="width:' + noneP + '%"></span>' +
        '<span class="o-side" style="width:' + sideP + '%"></span></div>' +
        '<div class="odds-legend mono"><span>● 성공 ' + eff.rate + '%</span><span>○ 효과 없음 ' + noneP + '%</span>' +
        '<span>▲ 의도하지 않은 변화 ' + sideP + '%</span></div>' +
      '</div>';
    }

    GL.App.modal(
      '<div class="d-top"><span class="gene mono">GENE · ' + u.esc(o.gene) + '</span>' +
      '<span class="tag ' + GL.TAGS[o.tag].cls + '">' + GL.TAGS[o.tag].name + '</span></div>' +
      '<h3>' + u.esc(o.name) + '</h3>' +
      '<p>' + u.esc(o.desc) + '</p>' +
      (o.gene === '다유전자' ? '<p class="muted small">다유전자: 수백 개 이상의 유전자가 함께 관여하는 특성이라 원하는 대로 바꾸기 어려워요.</p>' : '') +
      GL.Shop.variantBlockHtml(o) +
      oddsHtml +
      '<div class="modal-actions"><span class="price mono big-price">' +
        (free ? '무료 (국가 지원)' : u.money(eff.price)) +
      '</span><button class="btn" id="dClose">닫기</button>' + btn + '</div>');

    u.$('dClose').onclick = function () { GL.Shop._scratch = null; GL.App.closeModal(); };
    var act = u.$('dAct');
    if (act) act.onclick = function () {
      if (picked) {
        GL.Shop.remove(o.id);
      } else {
        if (o.id === 'height' || o.variants) {
          GL.state.variants[o.id] = GL.Shop._scratch ? { idx: GL.Shop._scratch.idx, delta: GL.Shop._scratch.delta } : undefined;
        }
        GL.Shop.add(o);
      }
      GL.Shop._scratch = null;
      GL.App.closeModal();
    };
    GL.Shop.bindVariantHandlers(o);
  },

  // 옵션 종류에 따라 세부 선택 UI 조각을 만듦
  variantBlockHtml: function (o) {
    if (o.id === 'height') return GL.Shop.heightBlockHtml(o);
    if (!o.variants) return '';
    if (o.variantType === 'swatch') return GL.Shop.swatchBlockHtml(o);
    if (o.variantType === 'arrow') return GL.Shop.arrowBlockHtml(o);
    if (o.variantType === 'spectrum') return GL.Shop.spectrumBlockHtml(o);
    return '';
  },

  // 색상 등 '어떤 종류'를 고르는 스와치 (예: 눈 색깔, 성별)
  swatchBlockHtml: function (o) {
    var u = GL.util;
    var idx = GL.Shop._scratch.idx;
    return '<div class="variant-block">' +
      '<span class="variant-label mono">세부 선택 · ' + (o.id === 'sex' ? '성별' : '색상') + '</span>' +
      '<div class="variant-swatches">' + o.variants.map(function (v, i) {
        var sw = v.hex ? '<span class="variant-swatch-dot" style="background:' + v.hex + '"></span>' : '';
        return '<button class="variant-swatch-btn' + (i === idx ? ' on' : '') + '" data-vi="' + i + '">' + sw + u.esc(v.label) + '</button>';
      }).join('') + '</div></div>';
  },

  // 화살표로 정도를 넘기는 방식 (예: 쌍꺼풀)
  arrowBlockHtml: function (o) {
    var u = GL.util;
    var idx = GL.Shop._scratch.idx;
    var v = o.variants[idx];
    return '<div class="variant-block">' +
      '<span class="variant-label mono">세부 선택 · 정도</span>' +
      '<div class="variant-arrow-row">' +
        '<button class="variant-arrow-btn" id="vPrev" aria-label="약하게"' + (idx === 0 ? ' disabled' : '') + '>' + GL.Shop.ARROW_L + '</button>' +
        '<div class="variant-arrow-mid">' +
          '<div class="variant-dots">' + o.variants.map(function (x, i) {
            return '<span class="variant-dot' + (i === idx ? ' on' : '') + '"></span>';
          }).join('') + '</div>' +
          '<span class="mono variant-arrow-text">' + u.esc(v.label) + '</span>' +
        '</div>' +
        '<button class="variant-arrow-btn" id="vNext" aria-label="진하게"' + (idx === o.variants.length - 1 ? ' disabled' : '') + '>' + GL.Shop.ARROW_R + '</button>' +
      '</div></div>';
  },

  // 스펙트럼 단계 버튼 (예: 외향적 성격, 공격성, 불안)
  spectrumBlockHtml: function (o) {
    var u = GL.util;
    var idx = GL.Shop._scratch.idx;
    return '<div class="variant-block">' +
      '<span class="variant-label mono">세부 선택 · 정도</span>' +
      '<div class="variant-spectrum-row">' + o.variants.map(function (v, i) {
        return '<button class="variant-seg-btn' + (i === idx ? ' on' : '') + '" data-vi="' + i + '">' + u.esc(v.label) + '</button>';
      }).join('') + '</div></div>';
  },

  // 키: 성별 옵션에서 고른 기준 + cm 스텝퍼
  heightBlockHtml: function (o) {
    var gb = GL.Shop.heightBaseLabel(o);
    var delta = GL.Shop._scratch.delta;
    var cfg = o.heightConfig;
    return '<div class="variant-block">' +
      '<span class="variant-label mono">세부 선택 · 몇 cm 더 키울지</span>' +
      '<p class="muted small" style="margin:0 0 8px">기준: ' + (gb.genderLabel === '평균' ? '성별 미선택, ' : GL.util.esc(gb.genderLabel) + ' ') + '평균 키 ' + gb.base + 'cm' +
        (gb.genderLabel === '평균' ? ' (성별 선택을 먼저 고르면 더 정확해져요)' : '') + '</p>' +
      '<div class="variant-arrow-row">' +
        '<button class="variant-arrow-btn" id="hDec" aria-label="1cm 줄이기"' + (delta <= 0 ? ' disabled' : '') + '>−</button>' +
        '<div class="variant-arrow-mid">' +
          '<span class="mono variant-height-num">' + (gb.base + delta) + 'cm</span>' +
          '<span class="mono small muted">기준보다 +' + delta + 'cm</span>' +
        '</div>' +
        '<button class="variant-arrow-btn" id="hInc" aria-label="1cm 늘리기"' + (delta >= cfg.maxCm ? ' disabled' : '') + '>+</button>' +
      '</div>' +
      '<div class="variant-jump-row">' + [0, 5, 10, 20].map(function (n) {
        return '<button class="variant-jump-btn" data-cm="' + n + '">' + (n === 0 ? '초기화' : '+' + n + 'cm') + '</button>';
      }).join('') + '</div></div>';
  },

  ARROW_L: '<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M7 1L3 5l4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  ARROW_R: '<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M3 1l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',

  // 세부 선택 UI의 버튼들에 클릭 핸들러 연결 (모달을 다시 그릴 때마다 호출)
  bindVariantHandlers: function (o) {
    var u = GL.util;
    if (o.id === 'height') {
      var dec = u.$('hDec'), inc = u.$('hInc');
      if (dec) dec.onclick = function () { GL.Shop._scratch.delta = Math.max(0, GL.Shop._scratch.delta - 1); GL.Shop.renderDetail(o); };
      if (inc) inc.onclick = function () { GL.Shop._scratch.delta = Math.min(o.heightConfig.maxCm, GL.Shop._scratch.delta + 1); GL.Shop.renderDetail(o); };
      document.querySelectorAll('.variant-jump-btn').forEach(function (b) {
        b.onclick = function () { GL.Shop._scratch.delta = Number(b.dataset.cm); GL.Shop.renderDetail(o); };
      });
      return;
    }
    if (!o.variants) return;
    if (o.variantType === 'arrow') {
      var prev = u.$('vPrev'), next = u.$('vNext');
      if (prev) prev.onclick = function () { GL.Shop._scratch.idx = Math.max(0, GL.Shop._scratch.idx - 1); GL.Shop.renderDetail(o); };
      if (next) next.onclick = function () { GL.Shop._scratch.idx = Math.min(o.variants.length - 1, GL.Shop._scratch.idx + 1); GL.Shop.renderDetail(o); };
      return;
    }
    // swatch, spectrum: data-vi를 가진 버튼들
    document.querySelectorAll('.variant-swatch-btn, .variant-seg-btn').forEach(function (b) {
      b.onclick = function () { GL.Shop._scratch.idx = Number(b.dataset.vi); GL.Shop.renderDetail(o); };
    });
  },

  /* ---------- 아이 탄생 ---------- */
  birthConfirm: function () {
    var n = GL.state.picks.length;
    if (n === 0) {
      GL.App.confirm('편집 없이 탄생시킬까요?', '고른 유전자가 없어요. 이대로 아이를 탄생시키면 다시 바꿀 수 없어요.',
        '탄생시키기', GL.Shop.birth);
    } else {
      GL.App.confirm(n + '개를 편집해서 탄생시킬까요?', '탄생한 뒤에는 고른 유전자를 바꿀 수 없어요.',
        '탄생시키기', GL.Shop.birth);
    }
  },

  birth: function () {
    var S = GL.state;
    S.spent = GL.Shop.spent();
    S.results = S.picks.map(function (id) {
      var o = GL.optById[id];
      var eff = GL.Shop.effective(o);
      // price를 결과에 같이 저장해 둬야 나중에(교사 대시보드 등 다른 세션에서) 다시 계산하지 않고도
      // 그때 고른 세부 선택의 정확한 가격을 알 수 있어요.
      return { id: id, status: GL.sim.roll(o, eff.rate), variant: eff.label || null, price: eff.price };
    });
    GL.App.save();

    // 짧은 편집 로그 연출 후 20년 뒤 리포트로
    var lines = ['수정란 준비 완료'];
    S.picks.slice(0, 6).forEach(function (id) { lines.push(GL.optById[id].gene + ' 편집 중…'); });
    if (S.picks.length > 6) lines.push('외 ' + (S.picks.length - 6) + '개 편집 중…');
    lines.push('탄생 · 20년이 흐릅니다');

    GL.App.lockModal = true;
    GL.App.modal('<div class="birth-log mono" id="birthLog"></div>');
    var log = GL.util.$('birthLog');
    var i = 0;
    var timer = setInterval(function () {
      if (i >= lines.length) {
        clearInterval(timer);
        setTimeout(function () {
          GL.App.closeModal();
          GL.App.lockModal = false;
          GL.Shop.yearJump(GL.Report.show);
        }, 450);
        return;
      }
      log.innerHTML += '<div>&gt; ' + GL.util.esc(lines[i++]) + '</div>';
    }, 260);
  },

  // 2045 → 2065 숫자가 올라가는 전환 화면
  yearJump: function (done) {
    var box = GL.util.$('yearJump');
    var num = GL.util.$('yearNum');
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    box.classList.remove('hidden');
    var y = reduce ? 2065 : 2045;
    num.textContent = y;
    var t = setInterval(function () {
      if (y < 2065) { y++; num.textContent = y; return; }
      clearInterval(t);
      setTimeout(function () {
        done();
        box.classList.add('hidden');
      }, 700);
    }, 55);
  }
};
