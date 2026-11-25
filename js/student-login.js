/* =========================================================
   student-login.js — 학년·반·번호·이름 입력 → 본인 확인 → (투표 마감 뒤) 형편 카드 뒤집기
   이미 제출한 학생이면 쇼핑 없이 제출 결과 화면으로 (쇼핑은 1회만)
   ========================================================= */
GL.Login = {
  init: function () {
    var u = GL.util;
    ['inCls', 'inNum'].forEach(function (k) {
      u.$(k).addEventListener('input', function () { this.value = this.value.replace(/\D/g, '').slice(0, 2); });
    });
    ['inGrade', 'inCls', 'inNum', 'inName'].forEach(function (k) {
      u.$(k).addEventListener('input', function () { this.classList.remove('bad'); u.$('loginErr').textContent = ''; });
      u.$(k).addEventListener('keydown', function (e) { if (e.key === 'Enter') GL.Login.submit(); });
    });
    u.$('loginBtn').onclick = GL.Login.submit;
    // 같은 기기를 반 친구들이 돌려 쓰는 경우가 많아서 학년·반은 기억해 둠
    try {
      var last = JSON.parse(localStorage.getItem('genelab-lastcls') || 'null');
      if (last) { u.$('inGrade').value = last.g; u.$('inCls').value = last.c; }
    } catch (e) {}
  },

  submit: async function () {
    var u = GL.util;
    var err = u.$('loginErr');
    var btn = u.$('loginBtn');
    var g = Number(u.$('inGrade').value), c = Number(u.$('inCls').value), n = Number(u.$('inNum').value);
    var name = u.$('inName').value.replace(/\s+/g, '');
    var bad = function (k, msg) { u.$(k).classList.add('bad'); u.$(k).focus(); err.textContent = msg; };
    if (!(g >= 1 && g <= 6)) return bad('inGrade', '학년을 골라 주세요.');
    if (!(c >= 1 && c <= 30)) return bad('inCls', '반을 숫자로 입력해 주세요.');
    if (!(n >= 1 && n <= 60)) return bad('inNum', '번호를 숫자로 입력해 주세요.');
    if (!name) return bad('inName', '이름을 입력해 주세요.');
    if (btn.disabled) return;

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>확인 중';
    var res = await GL.api.call('login', { grade: g, cls: c, num: n, name: name });
    btn.disabled = false;
    btn.textContent = '들어가기';

    if (!res.ok) { err.textContent = res.msg || '잠시 후 다시 시도해 주세요.'; return; }
    try { localStorage.setItem('genelab-lastcls', JSON.stringify({ g: g, c: c })); } catch (e) {}

    // 본인 확인 (번호 오입력·장난 방지)
    var clsLabel = g + '-' + c;
    GL.App.confirm(g + '학년 ' + c + '반 ' + n + '번 ' + res.name + ' 맞나요?',
      '본인이 맞을 때만 눌러 주세요. 다른 친구의 번호로 들어가면 그 친구의 결과가 바뀌어요.',
      '맞아요', function () { GL.Login.enter(res.id, clsLabel, res); },
      '아니에요', function () { u.$('inNum').select(); });
  },

  // 형편 카드 단계와 예산 정하기 (0 = 아직 카드 없음)
  setLevel: function (level) {
    var S = GL.state;
    S.level = Number(level) || 0;
    S.budget = S.level ? GL.LEVELS[S.level].budget : 0;
  },

  enter: function (id, clsLabel, res) {
    var S = GL.state = GL.newState();
    GL.Letter.reset();
    S.id = id;
    S.name = res.name;
    S.clsLabel = clsLabel;
    GL.Login.setLevel(res.level);   // 투표 마감 전이면 0 (카드는 마감 때 나눠 줌)
    S.startedAt = Date.now();

    if (res.sub) {
      // 이미 제출한 학생: 첫 쇼핑 결과를 그대로 불러오고 답변만 고칠 수 있게
      var sub = res.sub;
      S.results = sub.picks || [];
      S.picks = S.results.map(function (p) { return p.id; });
      S.spent = Number(sub.spent) || 0;
      S.earned = Number(sub.earned) || 0;
      S.rate = Number(sub.rate) || 0;
      S.tax = Number(sub.tax) || 0;
      S.support = Number(sub.support) || 0;
      S.supportStatus = sub.supportStatus || '미신청';
      S.loan = Number(sub.loan) || 0;
      S.answers = GL.STORY.emptyAnswers();
      Object.keys(S.answers).forEach(function (k) { if (sub[k] != null) S.answers[k] = String(sub[k]); });
      S.submitted = true;
      S.count = Number(sub.count) || 1;
      GL.App.showDone();
      GL.App.toast('이미 제출한 기록을 불러왔어요');
      return;
    }

    // 세율 투표: 마감됐으면 바로 카드, 이미 투표했으면 기다리기, 아니면 투표
    var v = res.vote || {};
    if (v.closed && S.level) { GL.Vote.applyRate(v.rate); GL.Card.show(); }
    else if (v.closed) GL.Vote.wait();
    else if (v.myVote !== null && v.myVote !== undefined) GL.Vote.wait();
    else GL.Vote.show();
  }
};

GL.Card = {
  // 카드 뒷면(아직 안 고른 상태) 내용 — 5장 다 똑같이 생겼어요
  backHtml_: function () {
    return '<div class="face face-back">' +
      '<span class="mono">FAMILY CARD</span>' +
      '<div class="seq mono" aria-hidden="true">ATGCGTACCTGAATGCCGTA<br>TACGCATGGACTTACGGCAT<br>GGCTTAACGTACGATCCGTA<br>CCGAATTGCATGCATCCGGA</div>' +
      '<span class="tap mono">터치해서 뒤집기</span>' +
      '</div>';
  },

  show: function () {
    var S = GL.state;
    var lv = GL.LEVELS[S.level];
    GL.util.$('cardWho').textContent = S.clsLabel + ' ' + GL.util.numOf(S.id) + '번 ' + S.name;

    // 우리 반 세율에 따른 세금 (지원금은 쇼핑 화면에서 신청해야 받음)
    var taxLine = '';
    if (S.tax) taxLine = '세금 −' + GL.util.money(S.tax) + ' (세율 ' + S.rate + '%)';
    else if (GL.POLICY.support(S.rate || 0, S.level) > 0) taxLine = '국가 지원 신청 가능';

    // 학생이 어떤 카드를 고르든 결과는 이미 정해져 있어요(형편은 고르는 게 아니니까요) —
    // 5장을 뒤집어 놓고 하나를 고르게 해서, 그 카드가 내 결과를 보여주는 것처럼 느끼게 함
    var fan = GL.util.$('cardFan');
    fan.innerHTML = '';
    GL.util.$('cardPickHint').classList.remove('invisible');
    GL.util.$('cardAfter').classList.add('invisible');

    var picked = false;
    var slots = [];
    for (var i = 0; i < 5; i++) {
      var el = document.createElement('div');
      el.className = 'flip';
      el.innerHTML = '<div class="flip-inner">' + GL.Card.backHtml_() +
        '<div class="face face-front">' +
          '<span class="mono muted">LEVEL ' + S.level + ' / 5</span>' +
          '<div>' +
            '<p class="card-name">' + GL.util.esc(lv.name) + '</p>' +
            '<p class="card-budget mono">' + GL.util.esc(GL.util.money(lv.budget)) + '</p>' +
          '</div>' +
          (taxLine ? '<p class="card-tax mono">' + GL.util.esc(taxLine) + '</p>' : '<p class="card-tax mono"></p>') +
          '<p class="card-note">' + GL.util.esc(lv.note) + '</p>' +
        '</div>' +
        '</div>';
      (function (card) {
        card.onclick = function () {
          if (picked) return;
          picked = true;
          GL.util.$('cardPickHint').classList.add('invisible');
          slots.forEach(function (other) {
            other.onclick = null;
            if (other !== card) other.classList.add('not-chosen');
          });
          card.classList.add('flipped');
          setTimeout(function () { GL.util.$('cardAfter').classList.remove('invisible'); }, 650);
        };
      })(el);
      slots.push(el);
      fan.appendChild(el);
    }

    GL.util.$('startShopBtn').onclick = function () {
      GL.state.startedAt = Date.now();
      GL.Shop.show();
    };
    GL.App.show('scr-card', 1, 2045);
  }
};
