'use strict';
/* Фигурки упражнений (своя стилизация) и анатомическая карта мышц.
   Фигура строится из суставов: таз, наклон корпуса, цели для кистей и стоп.
   Локти и колени рассчитываются обратной кинематикой, поэтому длины частей тела постоянны. */
(function () {
  const NS = 'http://www.w3.org/2000/svg';
  function s(tag, attrs) { const el = document.createElementNS(NS, tag); for (const k in attrs) if (attrs[k] != null) el.setAttribute(k, attrs[k]); return el; }

  const L = { torso: 50, sh: 43, chest: 30, head: 63, ua: 28, fa: 26, th: 40, sn: 40 };
  const FLOOR = 186;
  const dirT = t => { const r = t * Math.PI / 180; return [Math.sin(r), -Math.cos(r)]; };
  const add = (p, v, k) => [p[0] + v[0] * k, p[1] + v[1] * k];
  const lerp = (a, b, f) => a + (b - a) * f;
  const lerpP = (a, b, f) => [lerp(a[0], b[0], f), lerp(a[1], b[1], f)];

  function ik(S, T, a, b, pref) {
    const dx = T[0] - S[0], dy = T[1] - S[1]; let d = Math.hypot(dx, dy) || 0.001;
    const u = [dx / d, dy / d];
    d = Math.min(Math.max(d, Math.abs(a - b) + 0.5), a + b - 0.3);
    const A = Math.acos(Math.min(1, Math.max(-1, (a * a + d * d - b * b) / (2 * a * d))));
    const rot = ang => [u[0] * Math.cos(ang) - u[1] * Math.sin(ang), u[0] * Math.sin(ang) + u[1] * Math.cos(ang)];
    const e1 = add(S, rot(A), a), e2 = add(S, rot(-A), a);
    const pick = { fwd: e1[0] > e2[0], back: e1[0] < e2[0], up: e1[1] < e2[1], down: e1[1] > e2[1] }[pref || 'back'];
    return { mid: pick ? e1 : e2, end: add(S, u, d) };
  }

  /* Позы. Фигура смотрит вправо, пол на y = 186. A — начало, B — конец движения. */
  const STAND = { hip: [100, 106], t: 0, foot: [100, 186] };
  const P = {
    bench: { eq: ['bench', 'bar'], kb: 'up', eb: 'down',
      A: { hip: [112, 126], t: -90, hand: [66, 72], foot: [140, 186] }, B: { hip: [112, 126], t: -90, hand: [86, 112], foot: [140, 186] } },
    incline: { eq: ['incline', 'bar'], kb: 'up', eb: 'down',
      A: { hip: [112, 140], t: -55, hand: [78, 62], foot: [152, 186] }, B: { hip: [112, 140], t: -55, hand: [94, 108], foot: [152, 186] } },
    pushup: { eq: [], kb: 'up', eb: 'up',
      A: { hip: [88, 151], t: -65, hand: [46, 186], foot: [162, 186] }, B: { hip: [83, 168], t: -80, hand: [50, 186], foot: [162, 186] } },
    dips: { eq: ['dipbars'], kb: 'fwd', eb: 'back',
      A: { hip: [98, 112], t: 8, hand: [102, 120], foot: [74, 152] }, B: { hip: [100, 134], t: 22, hand: [102, 120], foot: [78, 172] } },
    pullup: { eq: ['pullbar'], kb: 'back', eb: 'back', noFloor: true,
      A: { hip: [98, 118], t: -4, hand: [100, 16], foot: [90, 190] }, B: { hip: [100, 80], t: -6, hand: [100, 16], foot: [92, 154] } },
    pulldown: { eq: ['seat', 'cable:100,6', 'grip'], kb: 'up', eb: 'back',
      A: { hip: [96, 142], t: -8, hand: [98, 52], foot: [132, 186] }, B: { hip: [96, 142], t: -14, hand: [110, 100], foot: [132, 186] } },
    rowSeat: { eq: ['floorseat', 'cable:190,138', 'grip'], kb: 'up', eb: 'back',
      A: { hip: [74, 160], t: 10, hand: [128, 128], foot: [142, 168] }, B: { hip: [74, 160], t: -8, hand: [98, 132], foot: [142, 168] } },
    bbRow: { eq: ['bar'], kb: 'fwd', eb: 'up',
      A: { hip: [98, 114], t: 72, hand: [142, 152], foot: [112, 186] }, B: { hip: [98, 114], t: 72, hand: [128, 122], foot: [112, 186] } },
    deadlift: { eq: ['bigbar'], kb: 'fwd', eb: 'back',
      A: { hip: [84, 140], t: 58, hand: [124, 168], foot: [112, 186] }, B: { hip: [104, 106], t: 0, hand: [108, 114], foot: [110, 186] } },
    rdl: { eq: ['bar'], kb: 'fwd', eb: 'back',
      A: { hip: [104, 106], t: 0, hand: [108, 114], foot: [110, 186] }, B: { hip: [88, 110], t: 76, hand: [132, 160], foot: [110, 186] } },
    squat: { eq: ['backbar'], kb: 'fwd', eb: 'down',
      A: { hip: [106, 106], t: 0, hand: [96, 62], foot: [112, 186] }, B: { hip: [80, 146], t: 42, hand: [102, 112], foot: [112, 186] } },
    airSquat: { eq: [], kb: 'fwd', eb: 'up',
      A: { hip: [106, 106], t: 0, hand: [100, 46], foot: [112, 186] }, B: { hip: [80, 146], t: 30, hand: [96, 92], foot: [112, 186] } },
    legPress: { eq: ['press'], kb: 'up', eb: 'down',
      A: { hip: [70, 150], t: -62, hand: [88, 160], foot: [148, 108] }, B: { hip: [70, 150], t: -62, hand: [88, 160], foot: [116, 112] } },
    lunge: { eq: ['db'], kb: 'fwd', kb2: 'down', eb: 'back', split: true,
      A: { hip: [102, 110], t: 0, hand: [104, 162], foot: [128, 186], foot2: [76, 186] }, B: { hip: [100, 140], t: 0, hand: [102, 186], foot: [130, 186], foot2: [72, 186] } },
    legExt: { eq: ['seat', 'shinpad'], kb: 'up', eb: 'down',
      A: { hip: [88, 140], t: -8, hand: [96, 150], foot: [116, 186] }, B: { hip: [88, 140], t: -8, hand: [96, 150], foot: [154, 132] } },
    legCurl: { eq: ['flatbench', 'shinpad'], kb: 'down', eb: 'down',
      A: { hip: [104, 128], t: -90, hand: [44, 150], foot: [166, 132] }, B: { hip: [104, 128], t: -90, hand: [44, 150], foot: [128, 84] } },
    ohp: { eq: ['bar'], kb: 'fwd', eb: 'down',
      A: { hip: [100, 106], t: -4, hand: [106, 62], foot: [100, 186] }, B: { hip: [100, 106], t: -4, hand: [100, 6], foot: [100, 186] } },
    raise: { eq: ['db'], kb: 'fwd', eb: 'down',
      A: { hip: [100, 106], t: 0, hand: [104, 112], foot: [100, 186] }, B: { hip: [100, 106], t: 0, hand: [152, 64], foot: [100, 186] } },
    curl: { eq: ['bar'], kb: 'fwd', eb: 'back',
      A: { hip: [100, 106], t: 0, hand: [104, 114], foot: [100, 186] }, B: { hip: [100, 106], t: -2, hand: [118, 66], foot: [100, 186] } },
    dbCurl: { eq: ['db'], kb: 'fwd', eb: 'back',
      A: { hip: [100, 106], t: 0, hand: [104, 114], foot: [100, 186] }, B: { hip: [100, 106], t: -2, hand: [118, 66], foot: [100, 186] } },
    pushdown: { eq: ['cable:132,4', 'grip'], kb: 'fwd', eb: 'back',
      A: { hip: [96, 106], t: 8, hand: [120, 72], foot: [100, 186] }, B: { hip: [96, 106], t: 8, hand: [112, 120], foot: [100, 186] } },
    french: { eq: ['bench', 'bar'], kb: 'up', eb: 'up',
      A: { hip: [112, 126], t: -90, hand: [66, 72], foot: [140, 186] }, B: { hip: [112, 126], t: -90, hand: [40, 98], foot: [140, 186] } },
    crunch: { eq: ['mat'], kb: 'up', eb: 'up',
      A: { hip: [112, 172], t: -88, hand: 'chest', foot: [148, 186] }, B: { hip: [112, 172], t: -52, hand: 'chest', foot: [148, 186] } },
    hanging: { eq: ['pullbar'], kb: 'fwd', eb: 'back', noFloor: true,
      A: { hip: [98, 116], t: -2, hand: [100, 16], foot: [96, 196] }, B: { hip: [96, 116], t: -14, hand: [100, 16], foot: [174, 112] } },
    plank: { eq: ['mat'], kb: 'down', eb: 'down',
      A: { hip: [104, 158], t: -80, hand: [78, 184], foot: [178, 184] }, B: { hip: [104, 154], t: -78, hand: [78, 184], foot: [178, 184] } },
    hipThrust: { eq: ['lowbench', 'hipbar'], kb: 'up', eb: 'down',
      A: { hip: [98, 168], t: -50, hand: 'hip', foot: [150, 186] }, B: { hip: [110, 136], t: -95, hand: 'hip', foot: [150, 186] } },
    run: { eq: [], kb: 'fwd', eb: 'down', split: true, arms2: true,
      A: { hip: [100, 106], t: 12, hand: [126, 96], hand2: [84, 128], foot: [132, 178], foot2: [70, 170] },
      B: { hip: [100, 106], t: 12, hand: [84, 128], hand2: [126, 96], foot: [78, 170], foot2: [130, 180] } },
    bike: { eq: ['bike'], kb: 'fwd', eb: 'down', split: true,
      A: { hip: [86, 112], t: 32, hand: [140, 104], foot: [118, 170], foot2: [102, 150] }, B: { hip: [86, 112], t: 32, hand: [140, 104], foot: [102, 150], foot2: [118, 170] } },
    calf: { eq: ['db'], kb: 'fwd', eb: 'back', toes: true,
      A: { hip: [100, 106], t: 0, hand: [104, 158], foot: [100, 186] }, B: { hip: [100, 98], t: 0, hand: [104, 150], foot: [100, 178] } },
    hyper: { eq: ['hyperpad'], kb: 'down', eb: 'up',
      A: { hip: [100, 120], t: 128, hand: 'chest', foot: [168, 158] }, B: { hip: [100, 120], t: 86, hand: 'chest', foot: [168, 158] } },
    hold: { eq: ['bar'], kb: 'fwd', eb: 'back',
      A: { hip: [100, 106], t: 0, hand: [104, 114], foot: [100, 186] }, B: { hip: [100, 103], t: 0, hand: [104, 109], foot: [100, 186] } },
    press: { eq: [], kb: 'fwd', eb: 'down',
      A: { hip: [100, 106], t: 0, hand: [112, 76], foot: [100, 186] }, B: { hip: [100, 106], t: 0, hand: [150, 72], foot: [100, 186] } }
  };
  const MAP = {
    bench: 'bench', decline_bench: 'bench', close_bench: 'bench', chest_press: 'bench', db_bench: ['bench', 'db'], flyes: ['bench', 'db'],
    incline_bench: 'incline', incline_db: ['incline', 'db'], pushups: 'pushup', dips_chest: 'dips', dips_tri: 'dips',
    pullups: 'pullup', chinups: 'pullup', lat_pulldown: 'pulldown', close_pulldown: 'pulldown', seated_row: 'rowSeat', machine_row: 'rowSeat', rower: 'rowSeat',
    bb_row: 'bbRow', db_row: ['bbRow', 'db'], tbar_row: 'bbRow', rear_fly: ['bbRow', 'db'], deadlift: 'deadlift', rdl: 'rdl',
    squat: 'squat', front_squat: 'squat', hack_squat: 'squat', air_squat: 'airSquat', leg_press: 'legPress', lunges: 'lunge', bulgarian: 'lunge', stretch: ['lunge', 'none'],
    leg_ext: 'legExt', leg_curl: 'legCurl', seated_curl: 'legExt', ohp: 'ohp', db_press: ['ohp', 'db'], arnold: ['ohp', 'db'], machine_press: 'ohp',
    lateral: 'raise', front_raise: 'raise', svend: 'press', pec_deck: 'press', cable_cross: 'press', upright_row: 'curl',
    bb_curl: 'curl', db_curl: 'dbCurl', hammer: 'dbCurl', preacher: 'curl', cable_curl: 'curl', pushdown: 'pushdown', rope_pushdown: 'pushdown',
    french: 'french', pullover: ['french', 'db'], oh_ext: ['ohp', 'db'], crunch: 'crunch', cable_crunch: 'crunch', russian_twist: 'crunch',
    leg_raise_bars: 'hanging', hanging_raise: 'hanging', plank: 'plank', hip_thrust: 'hipThrust', glute_kick: 'hipThrust',
    run: 'run', ellipse: 'run', stairs: 'run', bike: 'bike', jump_rope: 'calf', calf_stand: 'calf', calf_seat: 'calf',
    hyperext: 'hyper', shrugs: 'hold', wrist_curl: 'curl', adductor: 'legExt', abductor: 'legExt', face_pull: 'pushdown', reverse_pec: ['bbRow', 'db']
  };

  function solve(tpl, f) {
    const a = tpl.A, b = tpl.B;
    const hip = lerpP(a.hip, b.hip, f), t = lerp(a.t, b.t, f), dt = dirT(t);
    const sh = add(hip, dt, L.sh), neck = add(hip, dt, L.torso), head = add(hip, dt, L.head);
    const target = (v1, v2) => {
      const conv = v => (v === 'chest' ? add(hip, dt, L.chest) : v === 'hip' ? [hip[0] + 6, hip[1] - 4] : v);
      return lerpP(conv(v1), conv(v2), f);
    };
    const hand = target(a.hand, b.hand), foot = target(a.foot, b.foot);
    const hand2 = a.hand2 ? target(a.hand2, b.hand2) : [hand[0] - 3, hand[1] - 2];
    const foot2 = a.foot2 ? target(a.foot2, b.foot2) : [foot[0] - 3, foot[1] - 1];
    const sh2 = [sh[0] - 2, sh[1] - 2], hip2 = [hip[0] - 2, hip[1] - 1];
    const arm = ik(sh, hand, L.ua, L.fa, tpl.eb), arm2 = ik(sh2, hand2, L.ua, L.fa, tpl.eb);
    const leg = ik(hip, foot, L.th, L.sn, tpl.kb), leg2 = ik(hip2, foot2, L.th, L.sn, tpl.kb2 || tpl.kb);
    return { hip, hip2, sh, sh2, neck, head, dt, elbow: arm.mid, hand: arm.end, elbow2: arm2.mid, hand2: arm2.end, knee: leg.mid, foot: leg.end, knee2: leg2.mid, foot2: leg2.end };
  }

  /* Цвет сегмента по нагрузке на его мышцы */
  const SEG = {
    torso: ['chest', 'abs', 'obliques', 'lats', 'midback', 'lowback', 'traps'], shoulder: ['delts_front', 'delts_side', 'delts_rear'],
    upper: ['biceps', 'triceps'], fore: ['forearms'], thigh: ['quads', 'hams', 'glutes', 'adductors'], shin: ['calves']
  };
  function segColor(loads, key, colorFn) { const v = Math.max(0, ...SEG[key].map(m => loads[m] || 0)); return colorFn(v); }

  function equipment(g, names) {
    const out = {};
    const st = { fill: 'var(--eq)', stroke: 'none' };
    names.forEach(n => {
      if (n === 'bench' || n === 'flatbench') { g.appendChild(s('rect', Object.assign({ x: 48, y: 137, width: 84, height: 9, rx: 3 }, st))); g.appendChild(s('rect', Object.assign({ x: 60, y: 146, width: 6, height: 40 }, st))); g.appendChild(s('rect', Object.assign({ x: 116, y: 146, width: 6, height: 40 }, st))); }
      if (n === 'incline') { g.appendChild(s('path', Object.assign({ d: 'M62 104 L118 148 L124 140 L68 96 Z' }, st))); g.appendChild(s('rect', Object.assign({ x: 104, y: 148, width: 40, height: 8, rx: 3 }, st))); g.appendChild(s('rect', Object.assign({ x: 112, y: 156, width: 6, height: 30 }, st))); }
      if (n === 'lowbench') { g.appendChild(s('rect', Object.assign({ x: 26, y: 140, width: 40, height: 9, rx: 3 }, st))); g.appendChild(s('rect', Object.assign({ x: 38, y: 149, width: 6, height: 37 }, st))); }
      if (n === 'seat') { g.appendChild(s('rect', Object.assign({ x: 70, y: 146, width: 46, height: 8, rx: 3 }, st))); g.appendChild(s('rect', Object.assign({ x: 90, y: 154, width: 6, height: 32 }, st))); }
      if (n === 'floorseat') { g.appendChild(s('rect', Object.assign({ x: 52, y: 166, width: 44, height: 8, rx: 3 }, st))); g.appendChild(s('rect', Object.assign({ x: 140, y: 150, width: 7, height: 36, rx: 2 }, st))); }
      if (n === 'press') { g.appendChild(s('path', Object.assign({ d: 'M36 140 L76 168 L82 160 L44 132 Z' }, st))); out.plate = s('rect', Object.assign({ width: 8, height: 44, rx: 3 }, st)); g.appendChild(out.plate); }
      if (n === 'dipbars') { g.appendChild(s('rect', Object.assign({ x: 84, y: 120, width: 40, height: 6, rx: 3 }, st))); g.appendChild(s('rect', Object.assign({ x: 116, y: 126, width: 6, height: 60 }, st))); }
      if (n === 'pullbar') { g.appendChild(s('rect', Object.assign({ x: 50, y: 13, width: 100, height: 6, rx: 3 }, st))); g.appendChild(s('rect', Object.assign({ x: 50, y: 13, width: 6, height: 190 }, st))); }
      if (n === 'hyperpad') { g.appendChild(s('path', Object.assign({ d: 'M92 126 L120 126 L170 168 L162 176 Z' }, st))); }
      if (n === 'mat') g.appendChild(s('rect', { x: 30, y: 184, width: 150, height: 4, rx: 2, fill: 'var(--accent)', opacity: 0.35 }));
      if (n === 'bike') { g.appendChild(s('path', { d: 'M70 118 L110 118 M92 118 L110 162 L140 108 M110 162 L80 186 M110 162 L138 186', stroke: 'var(--eq)', 'stroke-width': 6, 'stroke-linecap': 'round', fill: 'none' })); g.appendChild(s('circle', { cx: 110, cy: 160, r: 12, fill: 'none', stroke: 'var(--eq)', 'stroke-width': 4 })); }
      if (n.startsWith('cable')) { const [cx, cy] = n.split(':')[1].split(',').map(Number); g.appendChild(s('circle', { cx, cy, r: 6, fill: 'var(--eq)' })); out.cable = s('line', { x1: cx, y1: cy, stroke: 'var(--muted)', 'stroke-width': 1.6 }); g.appendChild(out.cable); }
    });
    return out;
  }
  function handGear(g, names, alt) {
    const gear = {};
    const bar = names.includes('bar') || names.includes('backbar') || names.includes('hipbar');
    if (alt === 'db' || (names.includes('db') && alt !== 'none')) { gear.db = s('g', null); gear.db.appendChild(s('rect', { x: -9, y: -2.5, width: 18, height: 5, rx: 2, fill: 'var(--ink)' })); gear.db.appendChild(s('rect', { x: -11, y: -7, width: 6, height: 14, rx: 2, fill: 'var(--p20)' })); gear.db.appendChild(s('rect', { x: 5, y: -7, width: 6, height: 14, rx: 2, fill: 'var(--p20)' })); }
    else if (bar || names.includes('bigbar')) { gear.plate = s('circle', { r: names.includes('bigbar') ? 18 : 14, fill: 'var(--p25)' }); gear.hub = s('circle', { r: 3, fill: 'var(--ink)' }); }
    if (names.includes('grip')) gear.grip = s('rect', { x: -10, y: -2.5, width: 20, height: 5, rx: 2.5, fill: 'var(--ink)' });
    if (names.includes('shinpad')) gear.pad = s('circle', { r: 6, fill: 'var(--eq)' });
    return gear;
  }

  /* Создаёт фигуру; возвращает {svg, set(f)} или null, если для упражнения нет позы */
  function figure(exId, loads, colorFn, opts) {
    opts = opts || {};
    let key = MAP[exId], alt = null; if (Array.isArray(key)) { alt = key[1]; key = key[0]; }
    const tpl = P[key]; if (!tpl) return null;
    const svg = s('svg', { viewBox: opts.thumb ? '20 0 170 200' : '0 0 200 200', class: 'pose', role: 'img', 'aria-label': 'Техника: схема движения' });
    const g = s('g', null); svg.appendChild(g);
    if (!tpl.noFloor) g.appendChild(s('rect', { x: 10, y: FLOOR, width: 180, height: 2, rx: 1, fill: 'var(--line)' }));
    const eq = equipment(g, tpl.eq);
    const base = 'var(--body)', far = 'var(--body-far)';
    const col = k => segColor(loads, k, colorFn) || base;
    const line = (w, c) => { const el = s('line', { stroke: c, 'stroke-width': w, 'stroke-linecap': 'round' }); g.appendChild(el); return el; };
    // дальние конечности
    const F = { thigh: line(14, far), shin: line(11, far), foot: line(7, far), upper: line(10, far), fore: line(8, far) };
    // корпус и голова
    const torso = line(21, col('torso')); const neckL = line(9, base); const head = s('circle', { r: 11, fill: base }); g.appendChild(head);
    // ближние конечности
    const N = { thigh: line(15, col('thigh')), shin: line(12, col('shin')), foot: line(8, base) };
    const shoulder = s('circle', { r: 8, fill: col('shoulder') });
    const gear = handGear(g, tpl.eq, alt);
    if (gear.plate) g.appendChild(gear.plate); if (gear.hub) g.appendChild(gear.hub);
    N.upper = line(11, col('upper')); N.fore = line(9, col('fore')); g.appendChild(shoulder);
    if (gear.db) g.appendChild(gear.db); if (gear.grip) g.appendChild(gear.grip); if (gear.pad) g.appendChild(gear.pad);
    const L2 = (el, a, b) => { el.setAttribute('x1', a[0].toFixed(1)); el.setAttribute('y1', a[1].toFixed(1)); el.setAttribute('x2', b[0].toFixed(1)); el.setAttribute('y2', b[1].toFixed(1)); };
    function set(f) {
      const j = solve(tpl, f);
      const toe = (ft, kn) => (tpl.toes ? [ft[0] + 9, ft[1] + 7] : [ft[0] + 9, ft[1] + (key === 'legCurl' || key === 'legPress' ? -2 : 0)]);
      L2(F.thigh, j.hip2, j.knee2); L2(F.shin, j.knee2, j.foot2); L2(F.foot, j.foot2, toe(j.foot2)); L2(F.upper, j.sh2, j.elbow2); L2(F.fore, j.elbow2, j.hand2);
      L2(torso, j.hip, add(j.hip, j.dt, L.torso - 4)); L2(neckL, j.neck, add(j.hip, j.dt, L.head - 6));
      head.setAttribute('cx', j.head[0].toFixed(1)); head.setAttribute('cy', j.head[1].toFixed(1));
      L2(N.thigh, j.hip, j.knee); L2(N.shin, j.knee, j.foot); L2(N.foot, j.foot, toe(j.foot));
      shoulder.setAttribute('cx', j.sh[0].toFixed(1)); shoulder.setAttribute('cy', j.sh[1].toFixed(1));
      L2(N.upper, j.sh, j.elbow); L2(N.fore, j.elbow, j.hand);
      const at = (el, p) => el && el.setAttribute('transform', 'translate(' + p[0].toFixed(1) + ' ' + p[1].toFixed(1) + ')');
      const gearPt = key === 'squat' ? [j.sh[0] - 3, j.sh[1] - 4] : j.hand;
      if (gear.plate) { gear.plate.setAttribute('cx', gearPt[0].toFixed(1)); gear.plate.setAttribute('cy', gearPt[1].toFixed(1)); gear.hub.setAttribute('cx', gearPt[0].toFixed(1)); gear.hub.setAttribute('cy', gearPt[1].toFixed(1)); }
      at(gear.db, j.hand); at(gear.grip, j.hand); at(gear.pad, j.foot);
      if (eq.cable) { eq.cable.setAttribute('x2', j.hand[0].toFixed(1)); eq.cable.setAttribute('y2', j.hand[1].toFixed(1)); }
      if (eq.plate) { eq.plate.setAttribute('x', (j.foot[0] + 6).toFixed(1)); eq.plate.setAttribute('y', (j.foot[1] - 24).toFixed(1)); eq.plate.setAttribute('transform', 'rotate(-30 ' + (j.foot[0] + 10).toFixed(1) + ' ' + j.foot[1].toFixed(1) + ')'); }
    }
    set(opts.phase == null ? 0.5 : opts.phase);
    return { svg, set };
  }

  /* Анимация всех живых фигур одним циклом */
  const live = new Set(); let raf = 0, t0 = 0;
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function loop(ts) {
    if (!t0) t0 = ts;
    live.forEach(fig => { if (!fig.svg.isConnected) { live.delete(fig); return; } const ph = (1 - Math.cos((ts - t0) / 2600 * 2 * Math.PI)) / 2; fig.set(ph); });
    raf = live.size ? requestAnimationFrame(loop) : 0;
  }
  function animate(fig) { if (!fig || reduce) return; live.add(fig); if (!raf) raf = requestAnimationFrame(loop); }

  /* ---------- Анатомическая карта ---------- */
  const MIRROR = 'translate(120 0) scale(-1 1)';
  const SIL = [ // силуэт: [тип, атрибуты, зеркалить]
    ['circle', { cx: 60, cy: 19, r: 12 }], ['rect', { x: 54, y: 28, width: 12, height: 14, rx: 4 }],
    ['path', { d: 'M52 38 L68 38 L82 45 Q90 51 86 70 L79 100 L81 118 L79 130 L60 134 L41 130 L39 118 L41 100 L34 70 Q30 51 38 45 Z' }],
    ['line', { x1: 35, y1: 52, x2: 30, y2: 95, 'stroke-width': 13 }, 1], ['line', { x1: 30, y1: 95, x2: 26, y2: 126, 'stroke-width': 10 }, 1], ['circle', { cx: 25, cy: 132, r: 5.5 }, 1],
    ['line', { x1: 50, y1: 126, x2: 49, y2: 168, 'stroke-width': 19 }, 1], ['line', { x1: 49, y1: 170, x2: 48, y2: 210, 'stroke-width': 13 }, 1], ['ellipse', { cx: 50, cy: 218, rx: 7, ry: 4 }, 1]
  ];
  const FRONT = [ // [мышца, path, зеркалить]
    ['traps', 'M52 40 Q45 43 39 46 L52 47 Z', 1],
    ['delts_front', 'M40 46 Q32 47 30 57 Q31 65 34 69 Q38 61 45 55 Q45 49 40 46 Z', 1],
    ['delts_side', 'M31 50 Q26 56 27 66 L30.5 70 Q29 60 33 52 Z', 1],
    ['chest', 'M59 50 L45 51 Q38 57 38 65 Q42 74 52 74 Q58 72 59 68 Z', 1],
    ['biceps', 'M34 72 Q28 82 29 94 Q32 98 35 94 Q37.5 82 37 74 Z', 1],
    ['forearms', 'M29 98 Q24 110 25 124 L28.5 124 Q33 110 34.5 99 Z', 1],
    ['obliques', 'M43 77 Q40.5 90 43 105 L51.5 112 L51.5 79 Z', 1],
    ['abs', 'M53.5 76 h6 v10 h-6 Z M60.5 76 h6 v10 h-6 Z M53.5 88 h6 v10 h-6 Z M60.5 88 h6 v10 h-6 Z M53.5 100 h6 v9 h-6 Z M60.5 100 h6 v9 h-6 Z M54 111 L66 111 L63 121 L57 121 Z', 0],
    ['quads', 'M44 126 Q38 142 41 160 Q45 168 50 168 Q55 158 56 142 Q55 132 52 126 Z', 1],
    ['adductors', 'M55.5 130 Q58.5 141 57.5 154 L59.5 154 L59.5 131 Z', 1],
    ['calves', 'M43.5 176 Q41 190 44 204 L46.5 204 Q48 190 47 176 Z M50 177 Q54 187 52.5 200 L49.5 204 Q49.5 190 50 177 Z', 1]
  ];
  const BACK = [
    ['traps', 'M60 36 L48 43 L40 47 Q52 51 56 68 L60 86 L64 68 Q68 51 80 47 L72 43 Z', 0],
    ['delts_rear', 'M40 47 Q32 48 30 57 Q31 65 34 69 Q38 61 44 55 Z', 1],
    ['midback', 'M44 55 Q49 57 53 66 L49 72 Q45 66 42.5 60 Z', 1],
    ['lats', 'M42 61 Q38 74 42 90 Q46 100 54 106 L56 92 Q52.5 77 49 64 Z', 1],
    ['lowback', 'M55 90 Q54 102 55 114 L59 116 L59 90 Z', 1],
    ['triceps', 'M34 70 Q28 80 29 94 Q32 98 35 94 Q37.5 82 37 72 Z', 1],
    ['forearms', 'M29 98 Q24 110 25 124 L28.5 124 Q33 110 34.5 99 Z', 1],
    ['glutes', 'M43 113 Q39 123 43 132 Q51 138 59 132 L59 115 Q51 111 43 113 Z', 1],
    ['hams', 'M43 137 Q40 151 43 165 Q47 169 51 167 Q55 152 56 139 Q50 141 43 137 Z', 1],
    ['calves', 'M43 173 Q39 183 42 197 Q46 201 49 197 Q53 185 52 175 Q48 171 43 173 Z', 1]
  ];
  function anatomy(loads, colorFn, views, names) {
    views = views || 'fb';
    const svg = s('svg', { viewBox: '0 0 ' + views.length * 120 + ' 228', class: 'anat', role: 'img', 'aria-label': 'Карта нагрузки на мышцы' });
    views.split('').forEach((v, i) => {
      const g = s('g', { transform: 'translate(' + i * 120 + ' 0)' }); svg.appendChild(g);
      const put = (el, mir) => { g.appendChild(el); if (mir) { const c = el.cloneNode(true); c.setAttribute('transform', MIRROR); g.appendChild(c); } };
      SIL.forEach(([tag, a, mir]) => { const at = Object.assign({}, a); if (tag === 'line') { at.stroke = 'var(--body)'; at['stroke-linecap'] = 'round'; } else at.fill = 'var(--body)'; put(s(tag, at), mir); });
      (v === 'f' ? FRONT : BACK).forEach(([m, d, mir]) => {
        const c = colorFn(loads[m] || 0);
        const el = s('path', { d, fill: c || 'var(--muscle)', stroke: 'var(--surface)', 'stroke-width': 0.8, 'stroke-linejoin': 'round' });
        const tt = s('title', null); tt.textContent = (names && names[m]) || m; el.appendChild(tt);
        put(el, mir);
      });
      const lab = s('text', { x: 60, y: 226, 'text-anchor': 'middle', 'font-size': 9, fill: 'var(--muted)' }); lab.textContent = v === 'f' ? 'спереди' : 'сзади'; g.appendChild(lab);
    });
    return svg;
  }

  window.KF_POSE = { figure, animate, anatomy, has: id => !!MAP[id] };
})();
