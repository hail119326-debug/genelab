/* =========================================================
   simulate.js — 편집 결과 굴리기 + 요약
   성공률 rate% → 성공
   실패한 나머지 중 1/4 → 의도하지 않은 변화(side) (적은 확률)
   나머지 → 효과 없음(none)
   예) 성공률 40%: 성공 40% / 변화 15% / 효과 없음 45%
       성공률 95%: 성공 95% / 변화 1.25% / 효과 없음 3.75%
   ========================================================= */
GL.sim = {
  SIDE_SHARE: 0.25,

  // rateOverride: 세부 선택(색상·정도·성별·키)이 있는 옵션은 고른 단계에 따라 확률이 달라져서 따로 넘겨요.
  // rateOverride가 null이면 '기본 유지'처럼 실제로는 편집하지 않는 선택이라 굴리지 않고 바로 '효과 없음'.
  roll: function (opt, rateOverride) {
    var rate = rateOverride !== undefined ? rateOverride : opt.rate;
    if (rate === null) return 'none';
    var r = Math.random() * 100;
    if (r < rate) return 'ok';
    if (r < rate + (100 - rate) * GL.sim.SIDE_SHARE) return 'side';
    return 'none';
  },

  // picks: [{id, status}] → 개수 요약
  summarize: function (picks) {
    var s = { total: 0, treat: 0, border: 0, enhance: 0, side: 0, none: 0, ids: {}, firstSide: null, firstEnh: null };
    (picks || []).forEach(function (p) {
      var o = GL.optById[p.id];
      if (!o) return;
      s.total++;
      s.ids[o.id] = true;
      s[o.tag]++;
      if (p.status === 'none') s.none++;
      if (p.status === 'side') {
        s.side++;
        if (!s.firstSide) s.firstSide = o;
      }
      if (o.tag === 'enhance' && !s.firstEnh) s.firstEnh = o;
    });
    return s;
  },

  STATUS: {
    ok:   { mark: '●', label: '성공',      cls: 'st-ok' },
    none: { mark: '○', label: '효과 없음', cls: 'st-none' },
    side: { mark: '▲', label: '의도하지 않은 변화', cls: 'st-side' }
  },

  sideText: function (opt) { return opt.side || GL.DEFAULT_SIDE; }
};
