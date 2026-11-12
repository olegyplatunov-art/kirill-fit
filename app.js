'use strict';
/* Кирилл Fit — личное приложение для тренировок и питания.
   Все данные хранятся только на этом iPhone (IndexedDB). Сетевых запросов с данными нет. */
(function () {
  const VERSION = '1.1.0';
  const SCHEMA = 1;

  /* ---------- DOM-помощники (без innerHTML) ---------- */
  function add(el, kids) {
    for (const c of kids.flat(Infinity)) {
      if (c == null || c === false) continue;
      el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    if (props) for (const k in props) {
      const v = props[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style') Object.assign(el.style, v);
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    return add(el, kids);
  }
  const NS = 'http://www.w3.org/2000/svg';
  function s(tag, attrs, ...kids) {
    const el = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) if (attrs[k] != null) el.setAttribute(k, attrs[k]);
    return add(el, kids);
  }
  const ICONS = {
    back: 'M15 18l-6-6 6-6', chev: 'M9 6l6 6-6 6', plus: 'M12 5v14|M5 12h14', minus: 'M5 12h14',
    x: 'M6 6l12 12|M18 6L6 18', check: 'M5 12l5 5 9-10', edit: 'M4 20h4L19 9l-4-4L4 16v4z|M14 6l4 4',
    clock: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z|M12 7v5l3 2', dumbbell: 'M6 7v10|M3 9.5v5|M18 7v10|M21 9.5v5|M6 12h12',
    chart: 'M5 20V11|M11 20V5|M17 20v-6|M3 20h18', book: 'M4 5a2 2 0 0 1 2-2h13v14H6a2 2 0 0 0-2 2V5z|M4 19a2 2 0 0 0 2 2h13v-4',
    more: 'M5 12h.01|M12 12h.01|M19 12h.01', trash: 'M4 7h16|M9 7V4h6v3|M6 7l1 13h10l1-13',
    up: 'M6 15l6-6 6 6', down: 'M6 9l6 6 6-6', bookmark: 'M6 3h12v18l-6-4-6 4z', play: 'M7 4l13 8-13 8z',
    drop: 'M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z', share: 'M12 3v12|M7 8l5-5 5 5|M5 14v6h14v-6',
    list: 'M8 6h13|M8 12h13|M8 18h13|M3 6h.01|M3 12h.01|M3 18h.01', paste: 'M9 4h6v3H9z|M7 5H5v16h14V5h-2'
  };
  function icon(name, fill) {
    const svg = s('svg', { viewBox: '0 0 24 24', fill: fill ? 'currentColor' : 'none', stroke: 'currentColor',
      'stroke-width': name === 'more' ? 3 : 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' });
    ICONS[name].split('|').forEach(d => svg.appendChild(s('path', { d })));
    return svg;
  }

  /* ---------- Утилиты ---------- */
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  const pad = n => String(n).padStart(2, '0');
  const dayKey = d => { d = new Date(d); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const today = () => dayKey(Date.now());
  const keyToDate = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (k, n) => { const d = keyToDate(k); d.setDate(d.getDate() + n); return dayKey(d); };
  const fmtDate = (k, opt) => keyToDate(k).toLocaleDateString('ru-RU', opt || { day: 'numeric', month: 'long' });
  const num = v => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };
  const r1 = n => Math.round(n * 10) / 10;
  const r0 = n => Math.round(n);
  const fmtNum = n => (n == null ? '—' : (Math.abs(n - Math.round(n)) < 0.05 ? String(Math.round(n)) : String(r1(n)).replace('.', ',')));
  const fmtDur = ms => { const t = Math.max(0, Math.floor(ms / 1000)); const hh = Math.floor(t / 3600), mm = Math.floor(t % 3600 / 60), ss = t % 60;
    return hh ? hh + ':' + pad(mm) + ':' + pad(ss) : mm + ':' + pad(ss); };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const isStandalone = () => window.navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;

  /* ---------- Хранилище ---------- */
  function defaultState() {
    return {
      schemaVersion: SCHEMA, onboarded: false,
      profile: { name: 'Кирилл', sex: 'm', birth: '', height: null, goal: 'maintain', bmrManual: null },
      settings: { rest: 90, step: 2.5, pin: null, hideInstall: false },
      customEx: [], exNotes: {}, bookmarks: [],
      programs: [], workouts: [], active: null,
      foods: [], recentFoods: [], meals: {}, days: {},
      targets: { train: { kcal: 3000, p: 180, f: 85, c: 370 }, rest: { kcal: 2600, p: 180, f: 80, c: 300 }, water: 3000 },
      supps: DEFAULT_SUPPS.slice(), body: []
    };
  }
  let S = defaultState();
  const DB = { name: 'kirillfit', store: 'kv' };
  let dbp = null;
  function idb() {
    if (!dbp) dbp = new Promise((res, rej) => {
      if (!('indexedDB' in window)) return rej(new Error('no idb'));
      const rq = indexedDB.open(DB.name, 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore(DB.store);
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => rej(rq.error);
    });
    return dbp;
  }
  async function loadState() {
    let raw = null;
    try {
      const db = await idb();
      raw = await new Promise((res, rej) => { const rq = db.transaction(DB.store).objectStore(DB.store).get('state'); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });
    } catch (e) { try { raw = localStorage.getItem('kirillfit'); } catch (e2) { raw = null; } }
    if (raw) { try { const obj = typeof raw === 'string' ? JSON.parse(raw) : raw; const v = validate(obj); if (v) S = v; } catch (e) { /* повреждённые данные игнорируем */ } }
  }
  let saveTimer = null;
  function save(now) {
    clearTimeout(saveTimer);
    const run = async () => {
      const data = JSON.stringify(S);
      try {
        const db = await idb();
        await new Promise((res, rej) => { const tx = db.transaction(DB.store, 'readwrite'); tx.objectStore(DB.store).put(data, 'state'); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
      } catch (e) { try { localStorage.setItem('kirillfit', data); } catch (e2) { toast('Не удалось сохранить данные'); } }
    };
    if (now) run(); else saveTimer = setTimeout(run, 250);
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(true); });

  /* Проверка структуры (импорт бэкапа и загрузка) */
  function validate(o) {
    if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
    if (typeof o.schemaVersion !== 'number' || o.schemaVersion > SCHEMA) return null;
    const d = defaultState();
    const isArr = Array.isArray, isObj = x => x && typeof x === 'object' && !isArr(x);
    const str = (x, max) => (typeof x === 'string' ? x.slice(0, max || 200) : '');
    const n = x => (typeof x === 'number' && Number.isFinite(x) ? x : null);
    const out = d;
    out.onboarded = !!o.onboarded;
    if (isObj(o.profile)) out.profile = { name: str(o.profile.name, 40) || 'Кирилл', sex: o.profile.sex === 'f' ? 'f' : 'm', birth: /^\d{4}-\d{2}-\d{2}$/.test(o.profile.birth) ? o.profile.birth : '',
      height: n(o.profile.height), goal: ['cut', 'maintain', 'bulk'].includes(o.profile.goal) ? o.profile.goal : 'maintain', bmrManual: n(o.profile.bmrManual) };
    if (isObj(o.settings)) out.settings = { rest: n(o.settings.rest) || 90, step: n(o.settings.step) || 2.5,
      pin: isObj(o.settings.pin) && typeof o.settings.pin.hash === 'string' && typeof o.settings.pin.salt === 'string' ? { hash: str(o.settings.pin.hash, 200), salt: str(o.settings.pin.salt, 200) } : null,
      hideInstall: !!o.settings.hideInstall };
    const muscleKeys = Object.keys(MUSCLES);
    if (isArr(o.customEx)) out.customEx = o.customEx.filter(isObj).slice(0, 500).map(e => {
      const m = {}; if (isObj(e.muscles)) for (const k of muscleKeys) if (n(e.muscles[k])) m[k] = clamp(n(e.muscles[k]), 0, 100);
      return { id: str(e.id, 60) || uid(), name: str(e.name, 80) || 'Упражнение', group: GROUPS.includes(e.group) ? e.group : 'Грудь', equip: EQUIP.includes(e.equip) ? e.equip : 'Свой вес',
        type: ['w', 'r', 't'].includes(e.type) ? e.type : 'w', muscles: m, desc: str(e.desc, 2000), video: safeUrl(e.video), custom: true };
    });
    if (isObj(o.exNotes)) for (const k in o.exNotes) if (typeof o.exNotes[k] === 'string') out.exNotes[str(k, 60)] = str(o.exNotes[k], 1000);
    if (isArr(o.bookmarks)) out.bookmarks = o.bookmarks.filter(x => typeof x === 'string').slice(0, 500);
    const item = it => ({ exId: str(it.exId, 60), name: str(it.name, 80), sets: clamp(n(it.sets) || 3, 1, 20), reps: clamp(n(it.reps) || 0, 0, 200), kg: clamp(n(it.kg) || 0, 0, 1000), min: clamp(n(it.min) || 0, 0, 600) });
    if (isArr(o.programs)) out.programs = o.programs.filter(isObj).slice(0, 200).map(p => ({ id: str(p.id, 60) || uid(), name: str(p.name, 80) || 'Тренировка', items: isArr(p.items) ? p.items.filter(isObj).slice(0, 40).map(item) : [] }));
    const set = x => ({ kg: clamp(n(x.kg) || 0, 0, 1000), reps: clamp(n(x.reps) || 0, 0, 500), min: clamp(n(x.min) || 0, 0, 600), type: ['work', 'warm', 'fail', 'drop'].includes(x.type) ? x.type : 'work', note: str(x.note, 300), t: n(x.t) || 0 });
    if (isArr(o.workouts)) out.workouts = o.workouts.filter(isObj).slice(0, 20000).map(w => ({ id: str(w.id, 60) || uid(), programId: str(w.programId, 60), name: str(w.name, 80), start: n(w.start) || 0, end: n(w.end), kcal: n(w.kcal), note: str(w.note, 1000),
      items: isArr(w.items) ? w.items.filter(isObj).slice(0, 40).map(it => ({ exId: str(it.exId, 60), name: str(it.name, 80), plan: isObj(it.plan) ? item(it.plan) : item({}), sets: isArr(it.sets) ? it.sets.filter(isObj).slice(0, 50).map(set) : [] })) : [] }));
    out.active = typeof o.active === 'string' && out.workouts.some(w => w.id === o.active && !w.end) ? o.active : null;
    if (isArr(o.foods)) out.foods = o.foods.filter(isObj).slice(0, 3000).map(f => ({ id: str(f.id, 60) || uid(), name: str(f.name, 80) || 'Продукт', kcal: clamp(n(f.kcal) || 0, 0, 1000), p: clamp(n(f.p) || 0, 0, 100), f: clamp(n(f.f) || 0, 0, 100), c: clamp(n(f.c) || 0, 0, 100), dish: !!f.dish }));
    if (isArr(o.recentFoods)) out.recentFoods = o.recentFoods.filter(x => typeof x === 'string').slice(0, 30);
    if (isObj(o.meals)) for (const k in o.meals) if (/^\d{4}-\d{2}-\d{2}$/.test(k) && isArr(o.meals[k]))
      out.meals[k] = o.meals[k].filter(isObj).slice(0, 100).map(m => ({ id: str(m.id, 60) || uid(), type: str(m.type, 40), foodId: str(m.foodId, 60), name: str(m.name, 80), g: clamp(n(m.g) || 0, 0, 5000),
        kcal: clamp(n(m.kcal) || 0, 0, 1000), p: clamp(n(m.p) || 0, 0, 100), f: clamp(n(m.f) || 0, 0, 100), c: clamp(n(m.c) || 0, 0, 100), t: n(m.t) || 0 }));
    if (isObj(o.days)) for (const k in o.days) if (/^\d{4}-\d{2}-\d{2}$/.test(k) && isObj(o.days[k])) {
      const x = o.days[k]; out.days[k] = { water: clamp(n(x.water) || 0, 0, 20000), active: n(x.active), bmr: n(x.bmr), supps: isArr(x.supps) ? x.supps.filter(y => typeof y === 'string').slice(0, 50).map(y => y.slice(0, 60)) : [] };
    }
    if (isObj(o.targets)) { const t = x => (isObj(x) ? { kcal: clamp(n(x.kcal) || 0, 0, 10000), p: clamp(n(x.p) || 0, 0, 1000), f: clamp(n(x.f) || 0, 0, 1000), c: clamp(n(x.c) || 0, 0, 2000) } : null);
      out.targets = { train: t(o.targets.train) || d.targets.train, rest: t(o.targets.rest) || d.targets.rest, water: clamp(n(o.targets.water) || 3000, 0, 20000) }; }
    if (isArr(o.supps)) out.supps = o.supps.filter(x => typeof x === 'string').slice(0, 50).map(x => x.slice(0, 60));
    if (isArr(o.body)) out.body = o.body.filter(isObj).slice(0, 5000).map(b => ({ date: /^\d{4}-\d{2}-\d{2}$/.test(b.date) ? b.date : today(), weight: n(b.weight), chest: n(b.chest), waist: n(b.waist), arm: n(b.arm), thigh: n(b.thigh) }));
    return out;
  }
  function safeUrl(u) {
    if (typeof u !== 'string' || !u) return '';
    try { const x = new URL(u); return x.protocol === 'https:' ? x.href.slice(0, 500) : ''; } catch (e) { return ''; }
  }

  /* ---------- Модель ---------- */
  const allEx = () => BUILTIN_EXERCISES.concat(S.customEx);
  const exById = id => S.customEx.find(e => e.id === id) || BUILTIN_EXERCISES.find(e => e.id === id) || null;
  const exName = (id, fallback) => (exById(id) || {}).name || fallback || 'Упражнение';
  const allFoods = () => S.foods.concat(BUILTIN_FOODS);
  const foodById = id => S.foods.find(f => f.id === id) || BUILTIN_FOODS.find(f => f.id === id) || null;
  const doneWorkouts = () => S.workouts.filter(w => w.end).sort((a, b) => b.start - a.start);
  const activeWorkout = () => (S.active ? S.workouts.find(w => w.id === S.active) : null);
  const day = k => S.days[k] || (S.days[k] = { water: 0, active: null, bmr: null, supps: [] });

  function itemPct(it) {
    const ex = exById(it.exId); const type = ex ? ex.type : 'w';
    if (type === 't') { const plan = (it.plan.min || 0) * (it.plan.sets || 1); const doneMin = it.sets.reduce((a, x) => a + (x.min || 0), 0); return plan ? clamp(doneMin / plan, 0, 1) : (it.sets.length ? 1 : 0); }
    const work = it.sets.filter(x => x.type !== 'warm').length; return it.plan.sets ? clamp(work / it.plan.sets, 0, 1) : (work ? 1 : 0);
  }
  const workoutPct = w => (w.items.length ? w.items.reduce((a, it) => a + itemPct(it), 0) / w.items.length : 0);
  const tonnage = w => w.items.reduce((a, it) => a + it.sets.filter(x => x.type !== 'warm').reduce((b, x) => b + (x.kg || 0) * (x.reps || 0), 0), 0);
  const e1rm = (kg, reps) => (kg > 0 && reps > 0 ? kg * (1 + reps / 30) : 0);
  function lastSets(exId, excludeId) {
    for (const w of doneWorkouts()) { if (w.id === excludeId) continue; const it = w.items.find(i => i.exId === exId && i.sets.length); if (it) return { sets: it.sets, date: w.start }; }
    return null;
  }
  function estMinutes(items) { return Math.round(items.reduce((a, it) => { const ex = exById(it.exId); return a + (ex && ex.type === 't' ? (it.min || it.plan && it.plan.min || 5) * (it.sets || 1) : (it.sets || (it.plan && it.plan.sets) || 3) * 2.6); }, 0)); }
  function planText(p, type) {
    if (type === 't') return (p.sets > 1 ? p.sets + '×' : '') + (p.min || 0) + ' мин';
    if (type === 'r' || !p.kg) return p.sets + '×' + p.reps;
    return p.sets + '×' + p.reps + '×' + fmtNum(p.kg) + ' кг';
  }
  function age() { if (!S.profile.birth) return null; const b = keyToDate(S.profile.birth), t = new Date(); let a = t.getFullYear() - b.getFullYear(); if (t < new Date(t.getFullYear(), b.getMonth(), b.getDate())) a--; return a; }
  function lastWeight() { const b = S.body.filter(x => x.weight).sort((a, c) => (a.date < c.date ? 1 : -1))[0]; return b ? b.weight : null; }
  function mifflin() { const w = lastWeight(), hgt = S.profile.height, a = age(); if (!w || !hgt || a == null) return null; return Math.round(10 * w + 6.25 * hgt - 5 * a + (S.profile.sex === 'f' ? -161 : 5)); }
  const bmrFor = k => { const d = S.days[k]; return (d && d.bmr) || S.profile.bmrManual || mifflin(); };
  const isTrainDay = k => S.workouts.some(w => dayKey(w.start) === k);
  const targetFor = k => (isTrainDay(k) ? S.targets.train : S.targets.rest);
  function eaten(k) { const t = { kcal: 0, p: 0, f: 0, c: 0 }; (S.meals[k] || []).forEach(m => { const q = m.g / 100; t.kcal += m.kcal * q; t.p += m.p * q; t.f += m.f * q; t.c += m.c * q; }); return t; }
  function activeKcal(k) { const d = S.days[k]; if (d && d.active != null) return d.active; const sum = S.workouts.filter(w => dayKey(w.start) === k && w.kcal).reduce((a, w) => a + w.kcal, 0); return sum || null; }
  function burned(k) { const b = bmrFor(k) || 0, a = activeKcal(k) || 0; return b + a; }
  function nextProgram() {
    if (!S.programs.length) return null;
    const last = id => { const w = doneWorkouts().find(x => x.programId === id); return w ? w.start : 0; };
    return S.programs.slice().sort((a, b) => last(a.id) - last(b.id))[0];
  }

  /* ---------- Звук и вибрация ---------- */
  let actx = null;
  function unlockAudio() { if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; } } if (actx && actx.state === 'suspended') actx.resume(); }
  document.addEventListener('touchend', unlockAudio, { passive: true }); document.addEventListener('click', unlockAudio);
  function beep() {
    if (navigator.vibrate) try { navigator.vibrate([200, 100, 200]); } catch (e) { /* нет вибрации */ }
    if (!actx) return; const t0 = actx.currentTime;
    [0, 0.25, 0.5].forEach(dt => { const o = actx.createOscillator(), g = actx.createGain(); o.frequency.value = 880; o.connect(g); g.connect(actx.destination);
      g.gain.setValueAtTime(0.0001, t0 + dt); g.gain.exponentialRampToValueAtTime(0.4, t0 + dt + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.18); o.start(t0 + dt); o.stop(t0 + dt + 0.2); });
  }

  /* Экран не гаснет во время тренировки */
  let wake = null;
  async function keepAwake(on) {
    try { if (on && 'wakeLock' in navigator && !wake && document.visibilityState === 'visible') { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); }
      if (!on && wake) { await wake.release(); wake = null; } } catch (e) { wake = null; }
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.active) keepAwake(true); });

  /* ---------- Навигация ---------- */
  const UI = { tab: 'train', seg: { train: 'desk', stats: 'stats', ref: null }, stack: [], cal: dayKey(new Date(new Date().getFullYear(), new Date().getMonth(), 1)), dietDate: today(), period: 'week', measure: 'weight', locked: false, pinBuf: '', pinFails: 0, pinUntil: 0, onb: 0, exQuery: '' };
  let live = {};
  let lastKey = '';
  function push(name, params) { UI.stack.push({ name, params: params || {} }); render(); }
  function pop() { UI.stack.pop(); render(); }
  function replaceTop(name, params) { UI.stack[UI.stack.length - 1] = { name, params: params || {} }; render(); }
  function setTab(t) { UI.tab = t; UI.stack = []; render(); }

  const root = () => document.getElementById('view');
  function render() {
    const top = UI.stack[UI.stack.length - 1];
    const key = UI.tab + '|' + (top ? top.name + JSON.stringify(top.params) : (UI.seg[UI.tab] || '')) + '|' + UI.stack.length;
    const keep = key === lastKey ? window.scrollY : 0;
    lastKey = key; live = { elapsed: [] };
    const v = root(); v.textContent = '';
    const tabbar = document.getElementById('tabbar');
    if (UI.locked) { tabbar.hidden = true; v.appendChild(screenLock()); return; }
    if (!S.onboarded) { tabbar.hidden = true; v.appendChild(screenOnboarding()); return; }
    tabbar.hidden = false; renderTabbar();
    let el;
    if (top) el = SCREENS[top.name](top.params);
    else el = ({ train: screenTrain, stats: screenStats, ref: screenRef, more: screenMore })[UI.tab]();
    v.appendChild(el);
    window.scrollTo(0, keep);
    tick();
  }
  function renderTabbar() {
    const bar = document.getElementById('tabbar'); bar.textContent = '';
    [['train', 'dumbbell', 'Тренировки'], ['stats', 'chart', 'Аналитика'], ['ref', 'book', 'Справочник'], ['more', 'more', 'Ещё']].forEach(([id, ic, label]) => {
      bar.appendChild(h('button', { type: 'button', 'aria-current': UI.tab === id && !UI.stack.length ? 'page' : (UI.tab === id ? 'page' : null), onclick: () => setTab(id) }, icon(ic), label));
    });
  }
  function topbar(title, opts) {
    opts = opts || {};
    const left = opts.back ? h('button', { class: 'round', type: 'button', 'aria-label': 'Назад', onclick: opts.onBack || pop }, icon('back')) : (opts.left || h('span'));
    const right = h('div', { class: 'right' });
    if (opts.timer) { const t = h('div', { class: 'pill-time', 'aria-label': 'Время тренировки' }, '0:00'); live.elapsed.push(t); right.appendChild(t); }
    (opts.actions || []).forEach(a => right.appendChild(a));
    return h('header', { class: 'top' }, left, h('h1', null, title), right);
  }
  function seg(options, cur, onPick, small) {
    return h('div', { class: 'seg' + (small ? ' small' : ''), role: 'tablist' }, options.map(([id, label]) =>
      h('button', { type: 'button', role: 'tab', 'aria-pressed': String(cur === id), onclick: () => onPick(id) }, label)));
  }

  /* ---------- Всплывающие окна ---------- */
  function toast(text) {
    const t = h('div', { class: 'toast', role: 'status' }, text); document.body.appendChild(t); setTimeout(() => t.remove(), 2200);
  }
  function sheet(title, build) {
    const back = h('div', { class: 'sheet-back', onclick: e => { if (e.target === back) close(); } });
    const box = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title });
    function close() { back.remove(); }
    box.appendChild(h('div', { class: 'grab' })); box.appendChild(h('h3', null, title));
    add(box, [build(close)]); back.appendChild(box); document.body.appendChild(back);
    const first = box.querySelector('input'); if (first && !first.dataset.nofocus) setTimeout(() => first.focus(), 60);
    return close;
  }
  function confirmSheet(title, text, okLabel, onOk, danger) {
    sheet(title, close => h('div', null, text ? h('p', { class: 'muted' }, text) : null,
      h('button', { class: 'btn' + (danger ? ' danger' : ''), type: 'button', onclick: () => { close(); onOk(); } }, okLabel),
      h('button', { class: 'btn ghost', type: 'button', onclick: close }, 'Отмена')));
  }
  /* fields: [{key, label, type, value, placeholder, step, options}] */
  function formSheet(title, fields, onSave, saveLabel) {
    sheet(title, close => {
      const inputs = {};
      const form = h('div', null, fields.map(f => {
        let el;
        if (f.type === 'select') el = h('select', { class: 'in' }, f.options.map(([v, l]) => h('option', { value: v, selected: String(f.value) === String(v) ? 'selected' : null }, l)));
        else if (f.type === 'textarea') el = h('textarea', { class: 'in', rows: 4, maxlength: f.max || 1000, placeholder: f.placeholder || '' });
        else el = h('input', { class: 'in', type: f.type === 'number' ? 'text' : (f.type || 'text'), inputmode: f.type === 'number' ? 'decimal' : null, placeholder: f.placeholder || '', maxlength: f.max || 120, autocomplete: 'off' });
        if (f.type !== 'select') el.value = f.value == null ? '' : (f.type === 'number' ? fmtNum(f.value).replace('—', '') : f.value);
        inputs[f.key] = el;
        return h('label', { class: 'f' }, h('span', null, f.label), el);
      }));
      const ok = h('button', { class: 'btn', type: 'button', onclick: () => {
        const vals = {}; for (const f of fields) { const raw = inputs[f.key].value.trim(); vals[f.key] = f.type === 'number' ? (raw === '' ? null : num(raw)) : raw; }
        if (onSave(vals) !== false) close();
      } }, saveLabel || 'Сохранить');
      return h('div', null, form, ok, h('button', { class: 'btn ghost', type: 'button', onclick: close }, 'Отмена'));
    });
  }

  /* ---------- Графические элементы ---------- */
  function ring(size, width, frac, color, kids, track) {
    const r = (size - width) / 2, C = 2 * Math.PI * r;
    const arc = s('circle', { cx: size / 2, cy: size / 2, r, fill: 'none', stroke: color, 'stroke-width': width, 'stroke-linecap': 'round', 'stroke-dasharray': C, 'stroke-dashoffset': C * (1 - clamp(frac, 0, 1)), transform: 'rotate(-90 ' + size / 2 + ' ' + size / 2 + ')' });
    const svg = s('svg', { width: size, height: size, viewBox: '0 0 ' + size + ' ' + size, 'aria-hidden': 'true' },
      s('circle', { cx: size / 2, cy: size / 2, r, fill: 'none', stroke: track || 'var(--surface2)', 'stroke-width': width }), arc);
    const el = h('div', { class: 'ring', style: { width: size + 'px', height: size + 'px' } }, svg, h('div', { class: 'c' }, kids));
    el.setFrac = f => arc.setAttribute('stroke-dashoffset', C * (1 - clamp(f, 0, 1)));
    return el;
  }
  const pctColor = p => (p >= 0.999 ? 'var(--ok)' : p <= 0 ? 'var(--bad)' : 'var(--warn)');
  const pctClass = p => (p >= 0.999 ? 'done' : p <= 0 ? 'zero' : 'part');

  const BUCKETS = [[80, 'var(--p25)', '80–100 %'], [50, 'var(--p20)', '50–79 %'], [20, 'var(--p15)', '20–49 %'], [1, 'var(--p10)', '1–19 %']];
  const bucketColor = v => { for (const [min, c] of BUCKETS) if (v >= min) return c; return null; };
  /* loads: muscle → 0..100 (относительная нагрузка) */
  function bodyMap(loads, views) { return KF_POSE.anatomy(loads, bucketColor, views, MUSCLES); }
  function relLoads(muscles) { const max = Math.max(1, ...Object.values(muscles || {})); const o = {}; for (const k in muscles) o[k] = muscles[k] / max * 100; return o; }
  function exThumb(ex) {
    if (!ex) return h('div', { class: 'thumb' });
    const m = ex.muscles || {};
    const fig = KF_POSE.figure(ex.id, relLoads(m), bucketColor, { thumb: true, phase: 0.55 });
    if (fig) return h('div', { class: 'thumb' }, fig.svg);
    const backKeys = ['traps', 'delts_rear', 'lats', 'midback', 'lowback', 'triceps', 'glutes', 'hams'];
    let fr = 0, bk = 0; for (const k in m) { if (backKeys.includes(k)) bk += m[k]; else fr += m[k]; }
    return h('div', { class: 'thumb' }, bodyMap(relLoads(m), bk > fr ? 'b' : 'f'));
  }
  /* Панель упражнения: анимированная фигура + карта мышц */
  function exPanel(ex) {
    const loads = relLoads(ex ? ex.muscles : {});
    const fig = ex ? KF_POSE.figure(ex.id, loads, bucketColor, { phase: 0 }) : null;
    if (!fig) return h('div', { class: 'ex-figure' }, bodyMap(loads));
    KF_POSE.animate(fig);
    return h('div', { class: 'ex-figure duo' }, h('div', { class: 'pose-wrap' }, fig.svg), h('div', { class: 'anat-wrap' }, bodyMap(loads)));
  }
  function legend() { return h('div', { class: 'legend' }, BUCKETS.slice().reverse().map(([, c, l]) => h('span', null, h('i', { style: { background: c } }), l))); }

  /* Штанга: каждое выполненное упражнение — блин на грифе */
  const PLATE = ['var(--p25)', 'var(--p20)', 'var(--p15)', 'var(--p10)'];
  function barbell(w) {
    const svg = s('svg', { class: 'barbell', viewBox: '0 0 320 92', role: 'img', 'aria-label': 'Выполнено упражнений: ' + w.items.filter(it => itemPct(it) >= 1).length + ' из ' + w.items.length });
    svg.appendChild(s('rect', { x: 4, y: 43, width: 312, height: 6, rx: 3, fill: 'var(--muted)' }));
    svg.appendChild(s('rect', { x: 84, y: 38, width: 6, height: 16, rx: 2, fill: 'var(--ink)' }));
    svg.appendChild(s('rect', { x: 230, y: 38, width: 6, height: 16, rx: 2, fill: 'var(--ink)' }));
    const n = w.items.length || 1, pw = Math.min(10, 74 / n);
    w.items.forEach((it, i) => {
      const p = itemPct(it); const hgt = 82 - Math.min(i, 3) * 6; const col = PLATE[i % 4];
      [[84 - (i + 1) * pw], [236 + i * pw]].forEach(([x]) => {
        svg.appendChild(s('rect', { x: x + 0.5, y: 46 - hgt / 2, width: pw - 1, height: hgt, rx: 2, fill: p >= 1 ? col : 'none', stroke: p >= 1 ? 'none' : 'var(--line)', 'stroke-width': 1, 'fill-opacity': 1 }));
        if (p > 0 && p < 1) svg.appendChild(s('rect', { x: x + 0.5, y: 46 + hgt / 2 - hgt * p, width: pw - 1, height: hgt * p, rx: 2, fill: col, 'fill-opacity': 0.45 }));
      });
    });
    return svg;
  }

  /* Графики */
  function lineChart(points, opts) {
    opts = opts || {};
    const W = 320, H = 170, L = 34, R = 10, T = 14, B = 26;
    const svg = s('svg', { class: 'chart', viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': opts.label || 'График' });
    if (!points.length) { svg.appendChild(s('text', { x: W / 2, y: H / 2, 'text-anchor': 'middle' }, 'Пока нет данных')); return svg; }
    const ys = points.map(p => p.y); let lo = Math.min(...ys), hi = Math.max(...ys); if (hi - lo < 1) { lo -= 1; hi += 1; } const padv = (hi - lo) * 0.15; lo -= padv; hi += padv;
    const X = i => L + (points.length === 1 ? (W - L - R) / 2 : i * (W - L - R) / (points.length - 1)), Y = v => T + (hi - v) / (hi - lo) * (H - T - B);
    for (let g = 0; g <= 3; g++) { const v = lo + (hi - lo) * g / 3; svg.appendChild(s('line', { class: 'grid', x1: L, x2: W - R, y1: Y(v), y2: Y(v) })); svg.appendChild(s('text', { x: L - 4, y: Y(v) + 4, 'text-anchor': 'end' }, fmtNum(v))); }
    if (points.length > 1) svg.appendChild(s('polyline', { points: points.map((p, i) => X(i) + ',' + Y(p.y)).join(' '), fill: 'none', stroke: opts.color || 'var(--accent)', 'stroke-width': 2.5, 'stroke-linejoin': 'round' }));
    points.forEach((p, i) => svg.appendChild(s('circle', { cx: X(i), cy: Y(p.y), r: 3.5, fill: opts.color || 'var(--accent)' }, s('title', null, p.x + ': ' + fmtNum(p.y)))));
    const step = Math.ceil(points.length / 5);
    points.forEach((p, i) => { if (i % step === 0 || i === points.length - 1) svg.appendChild(s('text', { x: X(i), y: H - 8, 'text-anchor': 'middle' }, p.x)); });
    const lp = points[points.length - 1];
    svg.appendChild(s('text', { x: X(points.length - 1), y: Y(lp.y) - 9, 'text-anchor': 'end', fill: 'var(--ink)', 'font-weight': 700 }, fmtNum(lp.y)));
    return svg;
  }
  function barsChart(rows, series) {
    const W = 320, H = 170, L = 38, R = 6, T = 10, B = 26;
    const svg = s('svg', { class: 'chart', viewBox: '0 0 ' + W + ' ' + H, role: 'img', aria: null, 'aria-label': 'Калории по дням' });
    const max = Math.max(100, ...rows.flatMap(r => series.map(sr => r[sr.key] || 0))) * 1.1;
    const Y = v => T + (1 - v / max) * (H - T - B);
    for (let g = 0; g <= 3; g++) { const v = max * g / 3; svg.appendChild(s('line', { class: 'grid', x1: L, x2: W - R, y1: Y(v), y2: Y(v) })); svg.appendChild(s('text', { x: L - 4, y: Y(v) + 4, 'text-anchor': 'end' }, String(Math.round(v)))); }
    const bw = (W - L - R) / rows.length, inner = Math.min(9, (bw - 4) / series.length);
    rows.forEach((r, i) => {
      series.forEach((sr, j) => { const v = r[sr.key] || 0; const x = L + i * bw + (bw - inner * series.length) / 2 + j * inner;
        svg.appendChild(s('rect', { x, y: Y(v), width: inner - 1, height: Math.max(0, H - B - Y(v)), rx: 2, fill: sr.color }, s('title', null, r.label + ' · ' + sr.name + ': ' + Math.round(v)))); });
      if (i % 2 === 0 || rows.length < 8) svg.appendChild(s('text', { x: L + i * bw + bw / 2, y: H - 8, 'text-anchor': 'middle' }, r.label));
    });
    return svg;
  }
  const GROUP_COLOR = { 'Грудь': '#D2332B', 'Спина': '#1F5FBF', 'Ноги': '#D9A21B', 'Плечи': '#2E8B57', 'Руки': '#7E57C2', 'Пресс': '#1FA2A0', 'Ягодицы': '#E07B39', 'Кардио': '#8A949E' };
  function donut(parts, centerText) {
    const total = parts.reduce((a, p) => a + p.v, 0); const size = 200, r = 74, w = 26, C = 2 * Math.PI * r;
    const svg = s('svg', { viewBox: '0 0 200 200', width: 200, height: 200, role: 'img', 'aria-label': 'Распределение' });
    svg.appendChild(s('circle', { cx: 100, cy: 100, r, fill: 'none', stroke: 'var(--surface2)', 'stroke-width': w }));
    let off = 0;
    if (total > 0) parts.forEach(p => { const len = C * p.v / total;
      svg.appendChild(s('circle', { cx: 100, cy: 100, r, fill: 'none', stroke: p.color, 'stroke-width': w, 'stroke-dasharray': Math.max(0, len - 2) + ' ' + C, 'stroke-dashoffset': -off, transform: 'rotate(-90 100 100)' }, s('title', null, p.label + ': ' + Math.round(p.v / total * 100) + ' %')));
      off += len; });
    svg.appendChild(s('text', { x: 100, y: 106, 'text-anchor': 'middle', 'font-size': 22, 'font-weight': 700, fill: 'var(--ink)', 'font-family': 'ui-rounded, -apple-system, sans-serif' }, centerText || ''));
    return h('div', { style: { display: 'grid', placeItems: 'center', margin: '4px 0 10px' } }, svg,
      h('div', { class: 'legend', style: { justifyContent: 'center' } }, parts.filter(p => p.v > 0).map(p => h('span', null, h('i', { style: { background: p.color } }), p.label + ' ' + Math.round(p.v / (total || 1) * 100) + ' %'))));
  }

  /* ---------- Таймеры ---------- */
  const REST = { end: 0, total: 0 };
  function startRest(sec) { REST.total = sec; REST.end = Date.now() + sec * 1000; tick(); }
  function stopRest() { REST.end = 0; tick(); }
  function tick() {
    const w = activeWorkout();
    if (live.elapsed) live.elapsed.forEach(el => { el.textContent = w ? fmtDur(Date.now() - w.start) : '0:00'; });
    if (live.rest) {
      const left = REST.end ? Math.max(0, REST.end - Date.now()) : 0;
      live.rest.v.textContent = REST.end ? fmtDur(left) : fmtDur(S.settings.rest * 1000);
      live.rest.ring.setFrac(REST.end ? left / (REST.total * 1000) : 0);
      live.rest.wrap.classList.toggle('rest-on', !!REST.end);
      if (live.rest.ctl) live.rest.ctl.hidden = !REST.end;
    }
    if (REST.end && Date.now() >= REST.end) { REST.end = 0; beep(); toast('Отдых окончен — следующий подход'); if (live.rest) tick(); }
  }
  setInterval(tick, 500);

  /* ================= ЭКРАНЫ ================= */

  /* ---- Тренировки (корень) ---- */
  function screenTrain() {
    const cur = UI.seg.train;
    const actions = [h('button', { class: 'round', type: 'button', 'aria-label': 'История тренировок', onclick: () => push('history') }, icon('clock'))];
    return h('div', null, topbar('Тренировки', { left: h('span'), actions }),
      seg([['desk', 'Рабочий стол'], ['programs', 'Программы'], ['diet', 'Диета'], ['supps', 'Спорт. питание']], cur, id => { UI.seg.train = id; render(); }),
      ({ desk: viewDesk, programs: viewPrograms, diet: viewDiet, supps: viewSupps })[cur]());
  }

  function installHint() {
    if (!isIOS || isStandalone() || S.settings.hideInstall) return null;
    return h('div', { class: 'ios-hint' }, h('b', null, 'Установите на экран «Домой»'),
      h('ol', { style: { margin: '6px 0 6px', paddingLeft: '20px' } }, h('li', null, 'Нажмите «Поделиться» внизу Safari'), h('li', null, 'Выберите «На экран „Домой“»'), h('li', null, 'Нажмите «Добавить»')),
      h('button', { class: 'link', type: 'button', onclick: () => { S.settings.hideInstall = true; save(); render(); } }, 'Скрыть'));
  }

  function viewDesk() {
    const hr = new Date().getHours();
    const hello = hr < 5 ? 'Доброй ночи' : hr < 12 ? 'Доброе утро' : hr < 18 ? 'Добрый день' : 'Добрый вечер';
    const out = h('div', null, h('div', { class: 'greet' }, h('div', { class: 'greet-date' }, new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })),
      h('div', { class: 'greet-hi' }, hello + ', ' + (S.profile.name || 'Кирилл'))));
    const w = activeWorkout();
    if (w) out.appendChild(h('button', { class: 'banner', type: 'button', onclick: () => push('workout', { id: w.id }) }, 'Идёт тренировка «' + w.name + '» — продолжить'));
    add(out, [installHint()]);
    // Следующая тренировка
    out.appendChild(h('div', { class: 'h2' }, 'Следующая тренировка'));
    const np = w ? S.programs.find(p => p.id === w.programId) : nextProgram();
    if (!S.programs.length) out.appendChild(h('div', { class: 'block empty' }, h('b', null, 'Программ пока нет'), 'Создайте свою тренировку из упражнений справочника.',
      h('button', { class: 'btn', type: 'button', style: { marginTop: '12px' }, onclick: () => push('programEdit', {}) }, 'Создать программу')));
    else if (np || w) {
      const pct = w ? workoutPct(w) : 0; const count = doneWorkouts().filter(x => x.programId === (np && np.id)).length;
      const items = w ? w.items.map(i => i.plan) : np.items;
      out.appendChild(h('button', { class: 'block item', type: 'button', style: { borderRadius: '16px' }, onclick: () => (w ? push('workout', { id: w.id }) : push('program', { id: np.id })) },
        ring(64, 6, pct, pctColor(pct || 0.0001), h('span', { class: 'v', style: { fontSize: '16px', color: w ? pctColor(pct) : 'var(--muted)' } }, w ? Math.round(pct * 100) + ' %' : '—')),
        h('div', { class: 'grow' }, h('div', { class: 's' }, 'Выполнено занятий: ' + count), h('div', { class: 't', style: { fontSize: '19px' } }, w ? w.name : np.name),
          h('div', { class: 's' }, items.length + ' упр. · ~' + estMinutes(items) + ' мин')), icon('chev')));
    }
    // Баланс дня
    const k = today(), e = eaten(k), b = burned(k), t = targetFor(k);
    out.appendChild(h('div', { class: 'h2' }, 'Баланс сегодня', h('button', { type: 'button', onclick: () => { UI.seg.train = 'diet'; UI.dietDate = k; render(); } }, 'Дневник')));
    out.appendChild(h('div', { class: 'block' }, balanceRow(e.kcal, b),
      macroBar('Белок', e.p, t.p, 'г'), h('div', { class: 'small muted', style: { marginTop: '6px' } }, lastWeight() ? fmtNum(e.p / lastWeight()) + ' г на кг веса' : 'Запишите вес в «Аналитике», чтобы видеть г/кг')));
    // Календарь
    out.appendChild(h('div', { class: 'h2' }, 'График тренировок'));
    out.appendChild(calendar());
    // Неделя
    const weekAgo = Date.now() - 7 * 864e5; const wk = doneWorkouts().filter(x => x.start >= weekAgo);
    out.appendChild(h('div', { class: 'block grid3', style: { textAlign: 'center' } },
      statCell(wk.length, 'тренировок за 7 дней'), statCell(fmtNum(wk.reduce((a, x) => a + tonnage(x), 0) / 1000), 'тонн поднято'),
      statCell(wk.length ? Math.round(wk.reduce((a, x) => a + (x.end - x.start), 0) / wk.length / 60000) : 0, 'мин в среднем')));
    return out;
  }
  const statCell = (v, l) => h('div', null, h('div', { class: 'num', style: { fontSize: '26px', fontWeight: 700 } }, String(v)), h('div', { class: 'small muted' }, l));
  function balanceRow(eat, burn) {
    const bal = Math.round(eat - burn); const goal = S.profile.goal;
    let tone = 'var(--ok)', note = 'в норме';
    if (goal === 'cut') { if (bal > 0) { tone = 'var(--bad)'; note = 'профицит'; } else note = 'дефицит'; }
    else if (goal === 'bulk') { if (bal < 0) { tone = 'var(--bad)'; note = 'дефицит'; } else note = 'профицит'; }
    else { if (Math.abs(bal) > 300) { tone = 'var(--warn)'; note = bal > 0 ? 'профицит' : 'дефицит'; } }
    return h('div', { class: 'balance' },
      h('div', null, h('div', { class: 'big' }, String(Math.round(eat))), h('div', { class: 'cap' }, 'съедено')), h('div', { class: 'op' }, '−'),
      h('div', null, h('div', { class: 'big' }, String(Math.round(burn))), h('div', { class: 'cap' }, 'потрачено')), h('div', { class: 'op' }, '='),
      h('div', null, h('div', { class: 'big', style: { color: tone } }, (bal > 0 ? '+' : '') + bal), h('div', { class: 'cap' }, note)));
  }
  function macroBar(label, v, target, unit) {
    const frac = target ? v / target : 0;
    return h('div', { class: 'macro' }, h('span', null, label), h('div', { class: 'bar' }, h('i', { style: { width: clamp(frac * 100, 0, 100) + '%', background: frac > 1.1 ? 'var(--warn)' : 'var(--accent)' } })),
      h('span', { class: 'num' }, Math.round(v) + ' / ' + Math.round(target || 0) + ' ' + unit));
  }
  function calendar() {
    const first = keyToDate(UI.cal); const y = first.getFullYear(), m = first.getMonth();
    const start = new Date(y, m, 1 - ((first.getDay() + 6) % 7));
    const marks = {}; S.workouts.forEach(w => { marks[dayKey(w.start)] = (marks[dayKey(w.start)] || 0) + 1; });
    const grid = h('div', { class: 'cal' }, ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(d => h('div', { class: 'dow' }, d)));
    for (let i = 0; i < 42; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i); const k = dayKey(d);
      if (i >= 35 && d.getMonth() !== m) break;
      grid.appendChild(h('div', { class: 'd' + (d.getMonth() !== m ? ' out' : '') + (k === today() ? ' today' : ''), onclick: marks[k] ? () => daySheet(k) : null, role: marks[k] ? 'button' : null },
        String(d.getDate()), h('span', { class: 'mark' }, marks[k] ? s('svg', { viewBox: '0 0 24 16', 'aria-label': 'Тренировка' }, s('path', { d: 'M6 3v10M3 5.5v5M18 3v10M21 5.5v5M6 8h12', stroke: 'var(--accent)', 'stroke-width': 2.4, 'stroke-linecap': 'round', fill: 'none' })) : null)));
    }
    const nav = dir => { const d = new Date(y, m + dir, 1); UI.cal = dayKey(d); render(); };
    return h('div', { class: 'block' }, h('div', { class: 'row between', style: { marginBottom: '6px' } },
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Предыдущий месяц', onclick: () => nav(-1) }, icon('back')),
      h('b', null, first.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }).replace(' г.', '')),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Следующий месяц', onclick: () => nav(1) }, icon('chev'))), grid);
  }
  function daySheet(k) {
    sheet(fmtDate(k, { day: 'numeric', month: 'long', weekday: 'long' }), close => h('div', { class: 'list' }, S.workouts.filter(w => dayKey(w.start) === k).map(w =>
      h('button', { class: 'item', type: 'button', onclick: () => { close(); push(w.end ? 'workoutView' : 'workout', { id: w.id }); } },
        h('div', { class: 'grow' }, h('div', { class: 't' }, w.name), h('div', { class: 's' }, (w.end ? fmtDur(w.end - w.start) : 'идёт') + ' · ' + fmtNum(tonnage(w)) + ' кг тоннаж')), icon('chev')))));
  }

  /* ---- Программы ---- */
  function viewPrograms() {
    const out = h('div');
    if (!S.programs.length) out.appendChild(h('div', { class: 'block empty' }, h('b', null, 'Нет программ'), 'Соберите тренировку из упражнений — например, «Грудь + трицепс».'));
    S.programs.forEach(p => {
      const count = doneWorkouts().filter(w => w.programId === p.id).length; const last = doneWorkouts().find(w => w.programId === p.id);
      out.appendChild(h('button', { class: 'hero item', type: 'button', style: { display: 'flex' }, onclick: () => push('program', { id: p.id }) },
        h('div', { class: 'grow' }, h('div', { class: 'name' }, p.name), h('div', { class: 's' }, p.items.length + ' упражнений · ~' + estMinutes(p.items) + ' мин'),
          h('div', { class: 's' }, 'Выполнено занятий: ' + count + (last ? ' · последнее ' + fmtDate(dayKey(last.start)) : ''))), icon('chev')));
    });
    out.appendChild(h('button', { class: 'btn', type: 'button', onclick: () => push('programEdit', {}) }, 'Новая программа'));
    return out;
  }

  function screenProgram({ id }) {
    const p = S.programs.find(x => x.id === id); if (!p) { UI.stack.pop(); return screenTrain(); }
    const w = activeWorkout();
    const out = h('div', null, topbar(p.name, { back: true, actions: [h('button', { class: 'round', type: 'button', 'aria-label': 'Изменить программу', onclick: () => push('programEdit', { id }) }, icon('edit'))] }));
    const last = doneWorkouts().find(x => x.programId === id);
    out.appendChild(h('div', { class: 'block row' }, ring(64, 6, last ? workoutPct(last) : 0, pctColor(last ? workoutPct(last) : 0.0001), h('span', { class: 'v', style: { fontSize: '16px' } }, last ? Math.round(workoutPct(last) * 100) + ' %' : '—')),
      h('div', { class: 'grow' }, h('div', { class: 'muted small' }, last ? 'В прошлый раз, ' + fmtDate(dayKey(last.start)) : 'Ещё не выполнялась'), h('div', { style: { fontWeight: 700, fontSize: '19px' } }, p.name)),
      h('div', { class: 'muted small' }, '~' + estMinutes(p.items) + ' мин')));
    const list = h('div', { class: 'list' });
    p.items.forEach(it => { const ex = exById(it.exId); list.appendChild(h('button', { class: 'item', type: 'button', onclick: () => push('exCard', { id: it.exId, tab: 'desc' }) },
      exThumb(ex), h('div', { class: 'grow' }, h('div', { class: 't' }, exName(it.exId, it.name)), h('div', { class: 's' }, planText(it, ex ? ex.type : 'w'))), icon('chev'))); });
    if (!p.items.length) list.appendChild(h('div', { class: 'empty' }, 'Добавьте упражнения через карандаш вверху.'));
    out.appendChild(list);
    if (w && w.programId === id) out.appendChild(h('button', { class: 'btn', type: 'button', onclick: () => push('workout', { id: w.id }) }, 'Продолжить тренировку'));
    else out.appendChild(h('button', { class: 'btn', type: 'button', disabled: p.items.length ? null : true, onclick: () => startWorkout(p) }, 'Начать тренировку'));
    return out;
  }

  function startWorkout(p) {
    const go = () => {
      const w = { id: uid(), programId: p.id, name: p.name, start: Date.now(), end: null, kcal: null, note: '',
        items: p.items.map(it => ({ exId: it.exId, name: exName(it.exId, it.name), plan: { sets: it.sets, reps: it.reps, kg: it.kg, min: it.min }, sets: [] })) };
      S.workouts.push(w); S.active = w.id; save(true); keepAwake(true); unlockAudio();
      UI.stack = [{ name: 'workout', params: { id: w.id } }]; UI.tab = 'train'; render();
    };
    const cur = activeWorkout();
    if (cur) confirmSheet('Уже идёт тренировка', '«' + cur.name + '» не завершена. Завершить её и начать новую?', 'Завершить и начать новую', () => { finishWorkout(cur, null, true); go(); });
    else go();
  }

  /* Редактирование программы */
  function screenProgramEdit({ id }) {
    if (!UI.draft || UI.draft.forId !== (id || 'new')) {
      const p = id ? S.programs.find(x => x.id === id) : null;
      UI.draft = { forId: id || 'new', name: p ? p.name : '', items: p ? p.items.map(i => Object.assign({}, i)) : [] };
    }
    const d = UI.draft;
    const out = h('div', null, topbar(id ? 'Изменить программу' : 'Новая программа', { back: true, onBack: () => { UI.draft = null; pop(); } }));
    const name = h('input', { class: 'in', placeholder: 'Например, Грудь + трицепс', maxlength: 60, value: d.name, oninput: e => { d.name = e.target.value; } });
    out.appendChild(h('label', { class: 'f' }, h('span', null, 'Название'), name));
    out.appendChild(h('div', { class: 'h2' }, 'Упражнения'));
    d.items.forEach((it, i) => {
      const ex = exById(it.exId); const type = ex ? ex.type : 'w';
      const fld = (key, label) => h('label', { class: 'f', style: { marginBottom: 0 } }, h('span', null, label), h('input', { class: 'in num', inputmode: 'decimal', value: it[key] ? fmtNum(it[key]) : '', placeholder: '0',
        oninput: e => { it[key] = num(e.target.value) || 0; } }));
      out.appendChild(h('div', { class: 'block' },
        h('div', { class: 'row', style: { marginBottom: '10px' } }, h('div', { class: 'grow', style: { fontWeight: 700 } }, (i + 1) + '. ' + exName(it.exId, it.name)),
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Выше', disabled: i === 0 ? true : null, onclick: () => { d.items.splice(i - 1, 0, d.items.splice(i, 1)[0]); render(); } }, icon('up')),
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Ниже', disabled: i === d.items.length - 1 ? true : null, onclick: () => { d.items.splice(i + 1, 0, d.items.splice(i, 1)[0]); render(); } }, icon('down')),
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Удалить', onclick: () => { d.items.splice(i, 1); render(); } }, icon('trash'))),
        type === 't' ? h('div', { class: 'grid2' }, fld('sets', 'Подходов'), fld('min', 'Минут в подходе'))
          : type === 'r' ? h('div', { class: 'grid2' }, fld('sets', 'Подходов'), fld('reps', 'Повторов'))
            : h('div', { class: 'grid3' }, fld('sets', 'Подходов'), fld('reps', 'Повторов'), fld('kg', 'Вес, кг'))));
    });
    out.appendChild(h('button', { class: 'btn soft', type: 'button', onclick: () => pickExercise(ex => {
      const last = lastSets(ex.id); const ls = last ? last.sets.filter(x => x.type !== 'warm') : [];
      d.items.push({ exId: ex.id, name: ex.name, sets: ex.type === 't' ? 1 : (ls.length || 3), reps: ls[0] ? ls[0].reps : (ex.type === 't' ? 0 : 10), kg: ls[0] ? ls[0].kg : 0, min: ex.type === 't' ? (ls[0] ? ls[0].min : 10) : 0 });
      render(); }) }, '+ Добавить упражнение'));
    out.appendChild(h('div', { style: { height: '12px' } }));
    out.appendChild(h('button', { class: 'btn', type: 'button', onclick: () => {
      const nm = d.name.trim(); if (!nm) { toast('Введите название программы'); name.focus(); return; }
      if (id) { const p = S.programs.find(x => x.id === id); p.name = nm; p.items = d.items; }
      else S.programs.push({ id: uid(), name: nm, items: d.items });
      UI.draft = null; save(); toast('Программа сохранена'); pop(); } }, 'Сохранить программу'));
    if (id) out.appendChild(h('button', { class: 'btn ghost', type: 'button', onclick: () => confirmSheet('Удалить программу?', 'История выполненных тренировок сохранится.', 'Удалить', () => {
      S.programs = S.programs.filter(x => x.id !== id); UI.draft = null; save(); UI.stack = []; UI.seg.train = 'programs'; render(); }, true) }, 'Удалить программу'));
    return out;
  }

  /* Выбор упражнения */
  function pickExercise(onPick) {
    let q = '', grp = '';
    sheet('Выберите упражнение', close => {
      const list = h('div', { class: 'list' });
      const draw = () => {
        list.textContent = '';
        const ql = q.toLowerCase();
        const items = allEx().filter(e => (!grp || e.group === grp) && (!ql || e.name.toLowerCase().includes(ql)));
        items.slice(0, 120).forEach(e => list.appendChild(h('button', { class: 'item', type: 'button', onclick: () => { close(); onPick(e); } }, exThumb(e),
          h('div', { class: 'grow' }, h('div', { class: 't' }, e.name), h('div', { class: 's' }, e.group + ' · ' + e.equip)))));
        if (!items.length) list.appendChild(h('div', { class: 'empty' }, 'Ничего не найдено. Создайте своё упражнение в «Справочнике».'));
      };
      const chips = h('div', { class: 'chips', style: { margin: '10px 0' } });
      const drawChips = () => { chips.textContent = ''; [['', 'Все']].concat(GROUPS.map(g => [g, g])).forEach(([g, l]) => chips.appendChild(h('button', { class: 'chip', type: 'button', 'aria-pressed': String(grp === g), onclick: () => { grp = g; drawChips(); draw(); } }, l))); };
      drawChips(); draw();
      return h('div', null, h('input', { class: 'in', type: 'search', placeholder: 'Поиск', 'data-nofocus': '1', oninput: e => { q = e.target.value; draw(); } }), chips, list);
    });
  }

  /* ---- Активная тренировка: список ---- */
  function screenWorkout({ id }) {
    const w = S.workouts.find(x => x.id === id); if (!w) { UI.stack = []; return screenTrain(); }
    if (w.end) return screenWorkoutView({ id });
    const pct = workoutPct(w);
    const out = h('div', null, topbar('Упражнения', { back: true, onBack: () => { UI.stack = []; render(); }, timer: true,
      actions: [h('button', { class: 'round', type: 'button', 'aria-label': 'Добавить упражнение', onclick: () => pickExercise(ex => {
        const last = lastSets(ex.id); const ls = last ? last.sets.filter(x => x.type !== 'warm') : [];
        w.items.push({ exId: ex.id, name: ex.name, plan: { sets: ls.length || 3, reps: ls[0] ? ls[0].reps : 10, kg: ls[0] ? ls[0].kg : 0, min: ex.type === 't' ? 10 : 0 }, sets: [] }); save(); render(); }) }, icon('plus'))] }));
    out.appendChild(h('div', { class: 'hero' },
      h('div', { class: 'row' }, ring(64, 6, pct, pctColor(pct || 0.0001), h('span', { class: 'v', style: { fontSize: '16px', color: pctColor(pct) } }, Math.round(pct * 100) + ' %')),
        h('div', { class: 'grow' }, h('div', { class: 'muted small' }, w.items.length + ' упражнений · ~' + estMinutes(w.items.map(i => i.plan)) + ' мин'), h('div', { class: 'name' }, w.name))),
      barbell(w)));
    const list = h('div', { class: 'list' });
    w.items.forEach((it, i) => {
      const ex = exById(it.exId); const p = itemPct(it);
      const doneTxt = it.sets.length ? it.sets.filter(x => x.type !== 'warm').map(x => (ex && ex.type === 't') ? fmtNum(x.min) + ' мин' : (x.kg ? fmtNum(x.kg) + '×' + x.reps : String(x.reps))).join(', ') : planText(it.plan, ex ? ex.type : 'w');
      list.appendChild(h('button', { class: 'item', type: 'button', onclick: () => push('workoutEx', { id, i }) }, exThumb(ex),
        h('div', { class: 'grow' }, h('div', { class: 't' }, exName(it.exId, it.name)), h('div', { class: 's' }, doneTxt)),
        h('span', { class: 'pct ' + pctClass(p) }, Math.round(p * 100) + ' %'), icon('chev')));
    });
    out.appendChild(list);
    const firstUndone = w.items.findIndex(it => itemPct(it) < 1);
    if (firstUndone >= 0) out.appendChild(h('button', { class: 'btn', type: 'button', onclick: () => push('workoutEx', { id, i: firstUndone }) }, pct > 0 ? 'Продолжить: ' + exName(w.items[firstUndone].exId, w.items[firstUndone].name) : 'Начать с первого упражнения'));
    out.appendChild(h('button', { class: 'btn danger', type: 'button', onclick: () => finishSheet(w) }, 'Завершить тренировку'));
    out.appendChild(h('button', { class: 'btn ghost', type: 'button', onclick: () => confirmSheet('Сбросить прогресс?', 'Все записанные подходы этой тренировки будут удалены.', 'Сбросить', () => { w.items.forEach(it => { it.sets = []; }); save(); render(); }, true) }, 'Сбросить прогресс'));
    out.appendChild(h('button', { class: 'link', type: 'button', style: { display: 'block', margin: '12px auto 0' }, onclick: () => confirmSheet('Отменить тренировку?', 'Тренировка будет удалена без сохранения в истории.', 'Отменить тренировку', () => {
      S.workouts = S.workouts.filter(x => x.id !== w.id); S.active = null; keepAwake(false); stopRest(); save(); UI.stack = []; render(); }, true) }, 'Отменить тренировку'));
    return out;
  }

  /* ---- Активная тренировка: упражнение ---- */
  const SET_TYPES = [['work', 'Рабочий'], ['warm', 'Разминка'], ['fail', 'До отказа'], ['drop', 'Дроп-сет']];
  function screenWorkoutEx({ id, i }) {
    const w = S.workouts.find(x => x.id === id); if (!w || !w.items[i]) { UI.stack.pop(); return screenWorkout({ id }); }
    const it = w.items[i]; const ex = exById(it.exId); const type = ex ? ex.type : 'w';
    const out = h('div', null, topbar((i + 1) + '/' + w.items.length + ' ' + (ex ? ex.group : ''), { back: true, timer: !w.end }));
    out.appendChild(exPanel(ex));
    out.appendChild(h('div', { class: 'ex-title' }, exName(it.exId, it.name)));
    const last = lastSets(it.exId, w.id);
    if (last) out.appendChild(h('div', { class: 'prev-line' }, 'Прошлый раз (' + fmtDate(dayKey(last.date)) + '): ',
      h('b', null, last.sets.filter(x => x.type !== 'warm').map(x => type === 't' ? fmtNum(x.min) + ' мин' : (x.kg ? fmtNum(x.kg) + '×' + x.reps : x.reps)).join(', '))));
    else out.appendChild(h('div', { class: 'prev-line' }, 'План: ', h('b', null, planText(it.plan, type))));
    if (S.exNotes[it.exId]) out.appendChild(h('div', { class: 'prev-line small' }, 'Заметка: ' + S.exNotes[it.exId]));

    const workCount = it.sets.filter(x => x.type !== 'warm').length;
    const doneMin = it.sets.reduce((a, x) => a + (x.min || 0), 0);
    const restV = h('span', { class: 'v', style: { fontSize: '22px' } }, fmtDur(S.settings.rest * 1000));
    const restRing = ring(96, 7, 0, 'var(--accent)', restV, 'var(--surface2)');
    const restCtl = h('div', { class: 'row', style: { justifyContent: 'center', gap: '6px', marginTop: '6px' }, hidden: true },
      h('button', { class: 'chip', type: 'button', onclick: () => { REST.end -= 30000; REST.total = Math.max(1, REST.total - 30); tick(); } }, '−30'),
      h('button', { class: 'chip', type: 'button', onclick: () => { REST.end += 30000; REST.total += 30; tick(); } }, '+30'),
      h('button', { class: 'chip', type: 'button', onclick: stopRest }, 'Стоп'));
    const restWrap = h('div', null, h('button', { class: 'ring-btn', type: 'button', 'aria-label': 'Таймер отдыха', onclick: () => (REST.end ? stopRest() : startRest(S.settings.rest)) }, restRing), h('div', { class: 'lbl' }, 'Отдых'));
    live.rest = { v: restV, ring: restRing, wrap: restWrap, ctl: restCtl };
    const planReps = type === 't' ? (it.plan.min || 0) : (it.plan.reps || 0);
    const doneFrac = type === 't' ? (it.plan.min * (it.plan.sets || 1) ? doneMin / (it.plan.min * (it.plan.sets || 1)) : 0) : (it.plan.sets ? workCount / it.plan.sets : 0);
    out.appendChild(h('div', { class: 'three' },
      h('div', null, ring(96, 7, 1, 'var(--accent)', h('span', { class: 'v', style: { fontSize: '26px' } }, planReps ? String(planReps) : 'Нет'), 'var(--surface2)'), h('div', { class: 'lbl' }, type === 't' ? 'Минут по плану' : 'Повторений по плану')),
      restWrap,
      h('div', null, ring(96, 7, doneFrac, pctColor(doneFrac), h('span', { class: 'v', style: { fontSize: '24px' } }, type === 't' ? fmtNum(doneMin) + '/' + fmtNum((it.plan.min || 0) * (it.plan.sets || 1)) : workCount + '/' + (it.plan.sets || 0))), h('div', { class: 'lbl' }, type === 't' ? 'Минут выполнено' : 'Подходов выполнено'))));
    out.appendChild(h('div', { style: { margin: '-8px 0 14px' } }, restCtl));

    // Предзаполнение: следующий подход прошлого раза → последний подход сейчас → план
    const nextIdx = workCount; const lw = last ? last.sets.filter(x => x.type !== 'warm') : [];
    const lastNow = it.sets[it.sets.length - 1];
    const pre = lw[nextIdx] || lastNow || { kg: it.plan.kg, reps: it.plan.reps, min: it.plan.min };
    let setType = 'work', comment = '';
    const kgIn = h('input', { class: 'in', inputmode: 'decimal', placeholder: 'Кг', 'aria-label': 'Килограммы', value: pre.kg ? fmtNum(pre.kg) : '' });
    const repsIn = h('input', { class: 'in', inputmode: 'numeric', placeholder: type === 't' ? 'Минуты' : 'Повторы', 'aria-label': type === 't' ? 'Минуты' : 'Повторы', value: type === 't' ? (pre.min ? fmtNum(pre.min) : '') : (pre.reps ? String(pre.reps) : '') });
    const addSet = () => {
      const a = type === 't' ? null : num(kgIn.value), b = num(repsIn.value);
      if (!b || b <= 0) { toast(type === 't' ? 'Введите минуты' : 'Введите число повторов'); repsIn.focus(); return; }
      const set = { kg: type === 'w' ? Math.max(0, a || 0) : 0, reps: type === 't' ? 0 : Math.round(b), min: type === 't' ? b : 0, type: setType, note: comment, t: Date.now() };
      it.sets.push(set); UI.newSet = set.t; save();
      if (type !== 't') startRest(S.settings.rest);
      if (itemPct(it) >= 1 && i < w.items.length - 1) toast('Упражнение выполнено — можно переходить к следующему');
      render();
    };
    out.appendChild(h('div', { class: 'entry' + (type === 'w' ? '' : ' one') }, type === 'w' ? kgIn : null, repsIn,
      h('button', { class: 'plus', type: 'button', 'aria-label': 'Записать подход', onclick: addSet }, icon('plus'))));
    const typeChips = h('div', { class: 'chips', style: { marginTop: '10px' } });
    const drawTypes = () => { typeChips.textContent = ''; SET_TYPES.forEach(([k, l]) => typeChips.appendChild(h('button', { class: 'chip', type: 'button', 'aria-pressed': String(setType === k), onclick: () => { setType = k; drawTypes(); } }, l))); };
    drawTypes(); out.appendChild(typeChips);
    const cmtBtn = h('button', { class: 'link', type: 'button', onclick: () => formSheet('Комментарий к подходу', [{ key: 'c', label: 'Комментарий', value: comment, max: 300 }], v => { comment = v.c; cmtBtn.textContent = comment ? 'Комментарий: ' + comment : 'Добавить комментарий к подходу'; }) }, 'Добавить комментарий к подходу');
    out.appendChild(cmtBtn);

    if (it.sets.length) {
      const sets = h('div', { class: 'sets' });
      let wn = 0;
      it.sets.forEach((x, j) => {
        const label = x.type === 'warm' ? 'Р' : String(++wn);
        sets.appendChild(h('div', { class: 'set' + (x.t === UI.newSet ? ' new' : '') }, h('span', { class: 'n' }, label),
          h('div', null, h('span', { class: 'v' }, type === 't' ? fmtNum(x.min) + ' мин' : (x.kg ? fmtNum(x.kg) + ' кг × ' + x.reps : x.reps + ' повт.')), x.note ? h('div', { class: 'small muted' }, x.note) : null),
          x.type !== 'work' ? h('span', { class: 'tag' }, SET_TYPES.find(t => t[0] === x.type)[1]) : h('span'),
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Изменить подход ' + label, onclick: () => editSet(it, j, type) }, icon('edit'))));
      });
      out.appendChild(sets);
    }
    out.appendChild(h('div', { class: 'nav2' },
      h('button', { class: 'btn soft', type: 'button', disabled: i === 0 ? true : null, onclick: () => replaceTop('workoutEx', { id, i: i - 1 }) }, '← Пред.'),
      i < w.items.length - 1 ? h('button', { class: 'btn', type: 'button', onclick: () => replaceTop('workoutEx', { id, i: i + 1 }) }, 'След. →')
        : h('button', { class: 'btn', type: 'button', onclick: () => { UI.stack.pop(); render(); } }, 'К списку')));
    out.appendChild(h('button', { class: 'link', type: 'button', style: { display: 'block', margin: '12px auto 0' }, onclick: () => push('exCard', { id: it.exId, tab: 'desc' }) }, 'Техника выполнения'));
    return out;
  }
  function editSet(it, j, type) {
    const x = it.sets[j];
    const fields = type === 't' ? [{ key: 'min', label: 'Минуты', type: 'number', value: x.min }] : (type === 'w' ? [{ key: 'kg', label: 'Вес, кг', type: 'number', value: x.kg }] : []).concat([{ key: 'reps', label: 'Повторы', type: 'number', value: x.reps }]);
    fields.push({ key: 'type', label: 'Тип подхода', type: 'select', value: x.type, options: SET_TYPES });
    fields.push({ key: 'note', label: 'Комментарий', value: x.note, max: 300 });
    sheet('Подход', close => {
      const box = h('div');
      box.appendChild(h('button', { class: 'btn', type: 'button', onclick: () => { close(); formSheet('Изменить подход', fields, v => {
        if (v.kg != null) x.kg = Math.max(0, v.kg); if (v.reps != null) x.reps = Math.max(0, Math.round(v.reps)); if (v.min != null) x.min = Math.max(0, v.min);
        x.type = v.type; x.note = v.note; save(); render(); }); } }, 'Изменить'));
      box.appendChild(h('button', { class: 'btn danger', type: 'button', onclick: () => { it.sets.splice(j, 1); save(); close(); render(); } }, 'Удалить подход'));
      box.appendChild(h('button', { class: 'btn ghost', type: 'button', onclick: close }, 'Отмена'));
      return box;
    });
  }

  /* Завершение */
  function finishSheet(w) {
    const dur = Date.now() - w.start;
    sheet('Завершить тренировку', close => {
      const kcalIn = h('input', { class: 'in num', inputmode: 'numeric', placeholder: 'Например, 450' });
      const noteIn = h('textarea', { class: 'in', rows: 3, maxlength: 1000, placeholder: 'Самочувствие, сон, что изменить' });
      const pct = workoutPct(w);
      return h('div', null,
        h('div', { class: 'block grid3', style: { textAlign: 'center' } }, statCell(fmtDur(dur), 'длительность'), statCell(fmtNum(tonnage(w)), 'кг тоннаж'), statCell(Math.round(pct * 100) + ' %', 'выполнено')),
        h('label', { class: 'f' }, h('span', null, 'Активные калории с Apple Watch (за тренировку)'), kcalIn),
        h('label', { class: 'f' }, h('span', null, 'Заметка'), noteIn),
        h('button', { class: 'btn', type: 'button', onclick: () => { close(); finishWorkout(w, { kcal: num(kcalIn.value), note: noteIn.value.trim().slice(0, 1000) }); } }, 'Сохранить тренировку'),
        h('button', { class: 'btn ghost', type: 'button', onclick: close }, 'Вернуться к тренировке'));
    });
  }
  function finishWorkout(w, extra, silent) {
    // рекорды: сравниваем лучший 1ПМ с прошлым лучшим
    const prs = [];
    w.items.forEach(it => {
      const best = Math.max(0, ...it.sets.filter(x => x.type !== 'warm').map(x => e1rm(x.kg, x.reps)));
      if (!best) return;
      const prev = Math.max(0, ...doneWorkouts().filter(x => x.id !== w.id).flatMap(x => x.items.filter(y => y.exId === it.exId).flatMap(y => y.sets.filter(z => z.type !== 'warm').map(z => e1rm(z.kg, z.reps)))));
      if (prev && best > prev + 0.01) prs.push(exName(it.exId, it.name));
    });
    w.items = w.items.filter(it => it.sets.length || !silent);
    w.end = Date.now(); if (extra) { w.kcal = extra.kcal || null; w.note = extra.note || ''; }
    S.active = null; stopRest(); keepAwake(false); save(true);
    if (silent) return;
    UI.stack = [{ name: 'workoutView', params: { id: w.id, fresh: prs } }]; render();
  }

  /* Просмотр завершённой тренировки */
  function screenWorkoutView({ id, fresh }) {
    const w = S.workouts.find(x => x.id === id); if (!w) { UI.stack = []; return screenTrain(); }
    const out = h('div', null, topbar(fmtDate(dayKey(w.start)), { back: true, onBack: () => { if (fresh) UI.stack = []; else UI.stack.pop(); render(); },
      actions: [h('button', { class: 'round', type: 'button', 'aria-label': 'Удалить тренировку', onclick: () => confirmSheet('Удалить тренировку из истории?', null, 'Удалить', () => { S.workouts = S.workouts.filter(x => x.id !== id); save(); UI.stack = []; render(); }, true) }, icon('trash'))] }));
    if (fresh) out.appendChild(h('div', { class: 'block' }, h('div', { style: { fontSize: '22px', fontWeight: 800 } }, 'Тренировка сохранена'),
      fresh.length ? h('div', { style: { marginTop: '6px' } }, 'Новые рекорды: ' + fresh.join(', ')) : h('div', { class: 'muted' }, 'Хорошая работа. Отдыхайте и не забудьте про белок.')));
    out.appendChild(h('div', { class: 'hero' }, h('div', { class: 'name' }, w.name), barbell(w),
      h('div', { class: 'grid3', style: { textAlign: 'center' } }, statCell(fmtDur(w.end - w.start), 'длительность'), statCell(fmtNum(tonnage(w)), 'кг тоннаж'), statCell(w.kcal ? Math.round(w.kcal) : '—', 'ккал (часы)'))));
    if (w.note) out.appendChild(h('div', { class: 'block' }, w.note));
    const list = h('div', { class: 'list' });
    w.items.forEach(it => { const ex = exById(it.exId); const type = ex ? ex.type : 'w';
      list.appendChild(h('button', { class: 'item', type: 'button', onclick: () => push('exCard', { id: it.exId, tab: 'hist' }) }, exThumb(ex), h('div', { class: 'grow' }, h('div', { class: 't' }, exName(it.exId, it.name)),
        h('div', { class: 's' }, it.sets.length ? it.sets.map(x => (x.type === 'warm' ? 'р ' : '') + (type === 't' ? fmtNum(x.min) + ' мин' : (x.kg ? fmtNum(x.kg) + '×' + x.reps : x.reps))).join(', ') : 'не выполнялось')), h('span', { class: 'pct ' + pctClass(itemPct(it)) }, Math.round(itemPct(it) * 100) + ' %'))); });
    out.appendChild(list);
    out.appendChild(h('button', { class: 'btn soft', type: 'button', onclick: () => formSheet('Калории с Apple Watch', [{ key: 'k', label: 'Активные ккал за тренировку', type: 'number', value: w.kcal }], v => { w.kcal = v.k; save(); render(); }) }, 'Изменить калории'));
    return out;
  }

  function screenHistory() {
    const out = h('div', null, topbar('История', { back: true }));
    const ws = doneWorkouts();
    if (!ws.length) out.appendChild(h('div', { class: 'block empty' }, h('b', null, 'Тренировок пока нет'), 'Завершённые тренировки появятся здесь.'));
    let month = '';
    ws.forEach(w => {
      const m = new Date(w.start).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
      if (m !== month) { month = m; out.appendChild(h('div', { class: 'h2' }, m.replace(' г.', ''))); }
      out.appendChild(h('button', { class: 'block item', type: 'button', style: { borderRadius: '16px' }, onclick: () => push('workoutView', { id: w.id }) },
        h('div', { class: 'grow' }, h('div', { class: 't' }, w.name), h('div', { class: 's' }, fmtDate(dayKey(w.start), { day: 'numeric', month: 'short', weekday: 'short' }) + ' · ' + fmtDur(w.end - w.start) + ' · ' + fmtNum(tonnage(w)) + ' кг')),
        h('span', { class: 'pct ' + pctClass(workoutPct(w)) }, Math.round(workoutPct(w) * 100) + ' %')));
    });
    return out;
  }

  /* ---- Диета ---- */
  const MEAL_TYPES = ['Завтрак', 'Обед', 'Ужин', 'Перекус', 'До тренировки', 'После тренировки'];
  function viewDiet() {
    const k = UI.dietDate; const e = eaten(k), t = targetFor(k), d = S.days[k] || {};
    const out = h('div');
    out.appendChild(h('div', { class: 'row between', style: { marginBottom: '10px' } },
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Предыдущий день', onclick: () => { UI.dietDate = addDays(k, -1); render(); } }, icon('back')),
      h('b', null, k === today() ? 'Сегодня, ' + fmtDate(k) : fmtDate(k, { day: 'numeric', month: 'long', weekday: 'short' })),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Следующий день', disabled: k >= today() ? true : null, onclick: () => { UI.dietDate = addDays(k, 1); render(); } }, icon('chev'))));
    out.appendChild(h('div', { class: 'block' }, balanceRow(e.kcal, burned(k)),
      h('div', { class: 'small muted', style: { margin: '8px 0 2px', textAlign: 'center' } }, (isTrainDay(k) ? 'День тренировки' : 'День отдыха') + ' · цель ' + t.kcal + ' ккал'),
      macroBar('Ккал', e.kcal, t.kcal, ''), macroBar('Белки', e.p, t.p, 'г'), macroBar('Жиры', e.f, t.f, 'г'), macroBar('Углев.', e.c, t.c, 'г')));
    // Расход
    const bmr = bmrFor(k), act = activeKcal(k);
    out.appendChild(h('div', { class: 'h2' }, 'Расход', h('button', { type: 'button', onclick: pasteFromHealth }, 'Вставить из «Здоровья»')));
    out.appendChild(h('div', { class: 'list' },
      h('button', { class: 'item', type: 'button', onclick: () => formSheet('Активные калории', [{ key: 'v', label: 'Активная энергия за день из Apple Watch, ккал', type: 'number', value: d.active }], v => { day(k).active = v.v; save(); render(); }) },
        h('div', { class: 'grow' }, h('div', { class: 't' }, 'Активные (Apple Watch)'), h('div', { class: 's' }, 'Приложение «Здоровье» → Активная энергия')), h('span', { class: 'num', style: { fontWeight: 700 } }, act != null ? Math.round(act) + ' ккал' : 'ввести')),
      h('button', { class: 'item', type: 'button', onclick: () => formSheet('Базовый обмен', [{ key: 'v', label: 'Энергия покоя за день, ккал (пусто — расчёт по профилю)', type: 'number', value: d.bmr }], v => { day(k).bmr = v.v; save(); render(); }) },
        h('div', { class: 'grow' }, h('div', { class: 't' }, 'Базовый обмен'), h('div', { class: 's' }, d.bmr ? 'введено вручную' : (S.profile.bmrManual ? 'из профиля' : (mifflin() ? 'расчёт Миффлина — Сан Жеора' : 'заполните профиль в «Ещё»')))),
        h('span', { class: 'num', style: { fontWeight: 700 } }, bmr ? Math.round(bmr) + ' ккал' : '—'))));
    // Вода
    const water = d.water || 0;
    out.appendChild(h('div', { class: 'h2' }, 'Вода'));
    out.appendChild(h('div', { class: 'block row' }, icon('drop'), h('div', { class: 'grow' }, h('div', { class: 'num', style: { fontWeight: 700, fontSize: '20px' } }, water + ' / ' + S.targets.water + ' мл'),
      h('div', { class: 'bar', style: { marginTop: '6px' } }, h('i', { style: { width: clamp(water / (S.targets.water || 1) * 100, 0, 100) + '%' } }))),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Минус 250 мл', onclick: () => { day(k).water = Math.max(0, water - 250); save(); render(); } }, icon('minus')),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Плюс 250 мл', onclick: () => { day(k).water = water + 250; save(); render(); } }, icon('plus'))));
    // Приёмы пищи
    out.appendChild(h('div', { class: 'h2' }, 'Приёмы пищи'));
    const meals = S.meals[k] || [];
    const types = MEAL_TYPES.filter(tp => meals.some(m => m.type === tp));
    types.forEach(tp => {
      const ms = meals.filter(m => m.type === tp).sort((a, b) => a.t - b.t);
      const sum = ms.reduce((a, m) => a + m.kcal * m.g / 100, 0); const prot = ms.reduce((a, m) => a + m.p * m.g / 100, 0);
      out.appendChild(h('div', { class: 'meal' }, h('div', { class: 'meal-h' }, h('span', null, tp), h('span', { class: 'num' }, Math.round(sum) + ' ккал · ' + Math.round(prot) + ' г белка'),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Добавить в ' + tp, onclick: () => addFoodFlow(k, tp) }, icon('plus'))),
        ms.map(m => h('button', { class: 'food', type: 'button', onclick: () => editMeal(k, m) }, h('span', null, m.name), h('span', { class: 'num' }, Math.round(m.kcal * m.g / 100) + ' ккал'),
          h('span', { class: 's' }, fmtNum(m.g) + ' г · Б ' + fmtNum(m.p * m.g / 100) + ' · Ж ' + fmtNum(m.f * m.g / 100) + ' · У ' + fmtNum(m.c * m.g / 100)), h('span', { class: 's' }, new Date(m.t).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }))))));
    });
    if (!meals.length) out.appendChild(h('div', { class: 'block empty' }, h('b', null, 'Пока ничего не записано'), 'Добавьте первый приём пищи.'));
    out.appendChild(h('button', { class: 'btn', type: 'button', onclick: () => {
      sheet('Какой приём пищи?', close => h('div', { class: 'list' }, MEAL_TYPES.map(tp => h('button', { class: 'item', type: 'button', onclick: () => { close(); addFoodFlow(k, tp); } }, h('span', { class: 'grow t' }, tp), icon('chev')))));
    } }, '+ Добавить еду'));
    out.appendChild(h('button', { class: 'btn ghost', type: 'button', onclick: () => push('foods') }, 'Мои продукты и блюда'));
    return out;
  }
  async function pasteFromHealth() {
    /* Команда iOS «Расход из Здоровья» копирует «активная;базовая» в буфер обмена */
    try {
      const txt = await navigator.clipboard.readText();
      const nums = (txt.match(/\d+(?:[.,]\d+)?/g) || []).map(num).filter(x => x != null && x >= 0 && x < 20000);
      if (!nums.length) { toast('В буфере нет чисел. Запустите команду «Расход из Здоровья»'); return; }
      const d = day(UI.dietDate); d.active = Math.round(nums[0]); if (nums[1]) d.bmr = Math.round(nums[1]); save(); render();
      toast('Расход обновлён: ' + d.active + (nums[1] ? ' + ' + d.bmr : '') + ' ккал');
    } catch (e) { toast('Нет доступа к буферу обмена — введите числа вручную'); }
  }
  function addFoodFlow(k, type) {
    pickFood(f => gramsSheet(f, 100, g => {
      (S.meals[k] || (S.meals[k] = [])).push({ id: uid(), type, foodId: f.id, name: f.name, g, kcal: f.kcal, p: f.p, f: f.f, c: f.c, t: k === today() ? Date.now() : keyToDate(k).getTime() + 12 * 3600e3 });
      S.recentFoods = [f.id].concat(S.recentFoods.filter(x => x !== f.id)).slice(0, 20); save(); render();
    }));
  }
  function gramsSheet(f, g0, onOk) {
    sheet(f.name, close => {
      const info = h('div', { class: 'block num', style: { textAlign: 'center', fontSize: '18px' } });
      const gIn = h('input', { class: 'in num', inputmode: 'decimal', value: g0 ? fmtNum(g0) : '' });
      const upd = () => { const g = num(gIn.value) || 0; info.textContent = Math.round(f.kcal * g / 100) + ' ккал · Б ' + fmtNum(f.p * g / 100) + ' · Ж ' + fmtNum(f.f * g / 100) + ' · У ' + fmtNum(f.c * g / 100); };
      gIn.addEventListener('input', upd); upd();
      return h('div', null, h('label', { class: 'f' }, h('span', null, 'Вес порции, г'), gIn),
        h('div', { class: 'chips', style: { marginBottom: '12px' } }, [50, 100, 150, 200, 250, 300].map(v => h('button', { class: 'chip', type: 'button', onclick: () => { gIn.value = v; upd(); } }, v + ' г'))), info,
        h('button', { class: 'btn', type: 'button', onclick: () => { const g = num(gIn.value); if (!g || g <= 0) { toast('Введите вес порции'); return; } close(); onOk(g); } }, 'Добавить'),
        h('button', { class: 'btn ghost', type: 'button', onclick: close }, 'Отмена'));
    });
  }
  function editMeal(k, m) {
    sheet(m.name, close => h('div', null,
      h('button', { class: 'btn', type: 'button', onclick: () => { close(); gramsSheet(m, m.g, g => { m.g = g; save(); render(); }); } }, 'Изменить вес порции'),
      h('button', { class: 'btn danger', type: 'button', onclick: () => { S.meals[k] = (S.meals[k] || []).filter(x => x.id !== m.id); save(); close(); render(); } }, 'Удалить'),
      h('button', { class: 'btn ghost', type: 'button', onclick: close }, 'Отмена')));
  }
  function pickFood(onPick) {
    let q = '';
    sheet('Выберите продукт', close => {
      const list = h('div', { class: 'list' });
      const draw = () => {
        list.textContent = ''; const ql = q.toLowerCase();
        let items;
        if (!ql) { const rec = S.recentFoods.map(foodById).filter(Boolean); items = rec.concat(allFoods().filter(f => !rec.includes(f))); }
        else items = allFoods().filter(f => f.name.toLowerCase().includes(ql));
        items.slice(0, 80).forEach(f => list.appendChild(h('button', { class: 'item', type: 'button', onclick: () => { close(); onPick(f); } },
          h('div', { class: 'grow' }, h('div', { class: 't' }, f.name + (f.dish ? ' (блюдо)' : '')), h('div', { class: 's' }, Math.round(f.kcal) + ' ккал · Б ' + fmtNum(f.p) + ' · Ж ' + fmtNum(f.f) + ' · У ' + fmtNum(f.c) + ' на 100 г')))));
        if (!items.length) list.appendChild(h('div', { class: 'empty' }, 'Не нашли? Создайте свой продукт.'));
      };
      draw();
      return h('div', null, h('input', { class: 'in', type: 'search', placeholder: 'Поиск продукта', 'data-nofocus': '1', oninput: e => { q = e.target.value; draw(); } }),
        h('button', { class: 'btn soft', type: 'button', style: { margin: '10px 0' }, onclick: () => { close(); foodForm(null, f => onPick(f)); } }, '+ Свой продукт или блюдо'), list);
    });
  }
  function foodForm(f, after) {
    formSheet(f ? 'Изменить продукт' : 'Новый продукт', [
      { key: 'name', label: 'Название', value: f ? f.name : '', placeholder: 'Например, Протеиновый коктейль', max: 60 },
      { key: 'kcal', label: 'Ккал на 100 г', type: 'number', value: f ? f.kcal : null }, { key: 'p', label: 'Белки на 100 г', type: 'number', value: f ? f.p : null },
      { key: 'f', label: 'Жиры на 100 г', type: 'number', value: f ? f.f : null }, { key: 'c', label: 'Углеводы на 100 г', type: 'number', value: f ? f.c : null },
      { key: 'dish', label: 'Это блюдо?', type: 'select', value: f && f.dish ? '1' : '0', options: [['0', 'Продукт'], ['1', 'Блюдо']] }
    ], v => {
      if (!v.name) { toast('Введите название'); return false; }
      if (v.kcal == null) { toast('Введите калорийность'); return false; }
      const obj = { id: f ? f.id : 'c' + uid(), name: v.name.slice(0, 60), kcal: clamp(v.kcal, 0, 1000), p: clamp(v.p || 0, 0, 100), f: clamp(v.f || 0, 0, 100), c: clamp(v.c || 0, 0, 100), dish: v.dish === '1' };
      if (f) Object.assign(f, obj); else S.foods.unshift(obj);
      save(); if (after) after(obj); else render();
    });
  }
  function screenFoods() {
    const out = h('div', null, topbar('Мои продукты', { back: true, actions: [h('button', { class: 'round', type: 'button', 'aria-label': 'Новый продукт', onclick: () => foodForm(null) }, icon('plus'))] }));
    if (!S.foods.length) out.appendChild(h('div', { class: 'block empty' }, h('b', null, 'Своих продуктов нет'), 'Добавьте блюда, которые едите часто: так запись займёт одно касание.'));
    else out.appendChild(h('div', { class: 'list' }, S.foods.map(f => h('button', { class: 'item', type: 'button', onclick: () => sheet(f.name, close => h('div', null,
      h('button', { class: 'btn', type: 'button', onclick: () => { close(); foodForm(f); } }, 'Изменить'),
      h('button', { class: 'btn danger', type: 'button', onclick: () => { S.foods = S.foods.filter(x => x.id !== f.id); save(); close(); render(); } }, 'Удалить'),
      h('button', { class: 'btn ghost', type: 'button', onclick: close }, 'Отмена'))) },
      h('div', { class: 'grow' }, h('div', { class: 't' }, f.name), h('div', { class: 's' }, Math.round(f.kcal) + ' ккал · Б ' + fmtNum(f.p) + ' · Ж ' + fmtNum(f.f) + ' · У ' + fmtNum(f.c))), icon('chev')))));
    out.appendChild(h('p', { class: 'small muted' }, 'Встроенный список содержит ' + BUILTIN_FOODS.length + ' базовых продуктов со средними значениями КБЖУ. Для точности сверяйте с этикеткой.'));
    return out;
  }

  /* ---- Спорт. питание ---- */
  function viewSupps() {
    const k = today(); const d = S.days[k] || { supps: [] };
    const out = h('div');
    out.appendChild(h('div', { class: 'h2' }, 'Сегодня, ' + fmtDate(k), h('button', { type: 'button', onclick: editSupps }, 'Изменить список')));
    if (!S.supps.length) out.appendChild(h('div', { class: 'block empty' }, 'Список пуст. Добавьте свои добавки.'));
    else out.appendChild(h('div', { class: 'list' }, S.supps.map(name => { const on = (d.supps || []).includes(name);
      return h('button', { class: 'check', type: 'button', 'aria-pressed': String(on), onclick: () => { const dd = day(k); dd.supps = on ? dd.supps.filter(x => x !== name) : dd.supps.concat(name); save(); render(); } },
        h('span', { class: 'box' }, on ? icon('check') : null), h('span', { class: 'lbl' }, name)); })));
    // серия дней
    let streak = 0;
    for (let i = 0; i < 366; i++) { const dd = S.days[addDays(k, -i)]; const full = dd && S.supps.length && S.supps.every(x => (dd.supps || []).includes(x));
      if (full) streak++; else if (i === 0) continue; else break; }
    out.appendChild(h('div', { class: 'block row' }, h('div', { class: 'grow' }, 'Дней подряд, когда всё принято'), h('span', { class: 'num', style: { fontSize: '24px', fontWeight: 700 } }, String(streak))));
    out.appendChild(h('p', { class: 'small muted' }, 'Протеин и гейнер учитывайте в «Диете» как продукт — тогда белок попадёт в баланс дня.'));
    return out;
  }
  function editSupps() {
    sheet('Мои добавки', close => {
      const box = h('div');
      const draw = () => { box.textContent = '';
        box.appendChild(h('div', { class: 'list' }, S.supps.map((nm, i) => h('div', { class: 'item' }, h('span', { class: 'grow' }, nm),
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Удалить ' + nm, onclick: () => { S.supps.splice(i, 1); save(); draw(); } }, icon('trash'))))));
        const inp = h('input', { class: 'in', placeholder: 'Например, Цинк 25 мг', maxlength: 60, 'data-nofocus': '1' });
        box.appendChild(h('div', { class: 'row', style: { marginTop: '10px' } }, inp, h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Добавить', onclick: () => { const v = inp.value.trim(); if (v && !S.supps.includes(v)) { S.supps.push(v); save(); draw(); } } }, icon('plus'))));
        box.appendChild(h('button', { class: 'btn', type: 'button', style: { marginTop: '14px' }, onclick: () => { close(); render(); } }, 'Готово'));
      };
      draw(); return box;
    });
  }

  /* ---- Аналитика ---- */
  function screenStats() {
    const cur = UI.seg.stats;
    return h('div', null, topbar('Аналитика', { left: h('span') }),
      seg([['stats', 'Статистика'], ['muscles', 'Мышцы'], ['measures', 'Замеры']], cur, id => { UI.seg.stats = id; render(); }),
      ({ stats: viewStatsMain, muscles: viewMuscles, measures: viewMeasures })[cur]());
  }
  function periodWorkouts() {
    const ws = doneWorkouts(); const p = UI.period;
    if (p === 'last') return ws.slice(0, 1);
    if (p === 'all') return ws;
    const since = Date.now() - (p === 'week' ? 7 : 30) * 864e5; return ws.filter(w => w.start >= since);
  }
  const periodSeg = () => seg([['last', 'Последняя'], ['week', 'Неделя'], ['month', 'Месяц'], ['all', 'Всё время']], UI.period, id => { UI.period = id; render(); }, true);
  function viewStatsMain() {
    const out = h('div');
    // калории 14 дней
    const rows = []; for (let i = 13; i >= 0; i--) { const k = addDays(today(), -i); rows.push({ label: String(keyToDate(k).getDate()), eat: eaten(k).kcal, burn: burned(k) }); }
    out.appendChild(h('div', { class: 'h2' }, 'Калории за 14 дней'));
    out.appendChild(h('div', { class: 'block' }, barsChart(rows, [{ key: 'eat', name: 'Съедено', color: 'var(--accent)' }, { key: 'burn', name: 'Потрачено', color: 'var(--p15)' }]),
      h('div', { class: 'legend' }, h('span', null, h('i', { style: { background: 'var(--accent)' } }), 'Съедено'), h('span', null, h('i', { style: { background: 'var(--p15)' } }), 'Потрачено (базовый обмен + Apple Watch)'))));
    // вес
    const ws = S.body.filter(b => b.weight).sort((a, b) => (a.date < b.date ? -1 : 1)).slice(-30);
    out.appendChild(h('div', { class: 'h2' }, 'Мой вес', h('button', { type: 'button', onclick: () => bodyForm(['weight']) }, 'Записать')));
    out.appendChild(h('div', { class: 'block' }, h('div', null, 'Текущий вес: ', h('b', { class: 'num' }, lastWeight() ? fmtNum(lastWeight()) + ' кг' : '—')),
      lineChart(ws.map(b => ({ x: fmtDate(b.date, { day: 'numeric', month: 'numeric' }), y: b.weight })), { label: 'Вес тела' })));
    // распределение по группам
    out.appendChild(h('div', { class: 'h2' }, 'Распределение по группам упражнений'));
    out.appendChild(periodSeg());
    const cnt = {}; periodWorkouts().forEach(w => w.items.forEach(it => { const ex = exById(it.exId); const g = ex ? ex.group : 'Другое'; cnt[g] = (cnt[g] || 0) + it.sets.filter(x => x.type !== 'warm').length; }));
    const total = Object.values(cnt).reduce((a, b) => a + b, 0);
    out.appendChild(h('div', { class: 'block' }, total ? donut(Object.keys(cnt).map(g => ({ label: g, v: cnt[g], color: GROUP_COLOR[g] || '#999' })), total + ' подх.') : h('div', { class: 'empty' }, 'Нет тренировок за этот период.')));
    // тоннаж
    const pw = periodWorkouts();
    out.appendChild(h('div', { class: 'block grid3', style: { textAlign: 'center' } }, statCell(pw.length, 'тренировок'), statCell(fmtNum(pw.reduce((a, w) => a + tonnage(w), 0) / 1000), 'тонн'),
      statCell(pw.filter(w => w.kcal).length ? Math.round(pw.reduce((a, w) => a + (w.kcal || 0), 0)) : '—', 'ккал (часы)')));
    // рост
    out.appendChild(h('div', { class: 'h2' }, 'Рост', h('button', { type: 'button', onclick: () => formSheet('Рост', [{ key: 'h', label: 'Рост, см', type: 'number', value: S.profile.height }], v => { S.profile.height = v.h; save(); render(); }) }, 'Изменить')));
    out.appendChild(h('div', { class: 'block' }, 'Текущий рост: ', h('b', { class: 'num' }, S.profile.height ? fmtNum(S.profile.height) + ' см' : '—')));
    return out;
  }
  function viewMuscles() {
    const out = h('div'); out.appendChild(periodSeg());
    const mus = {}, grp = {};
    periodWorkouts().forEach(w => w.items.forEach(it => { const ex = exById(it.exId); if (!ex) return; const n = it.sets.filter(x => x.type !== 'warm').length; if (!n) return;
      for (const m in ex.muscles) { const v = n * ex.muscles[m] / 100; mus[m] = (mus[m] || 0) + v; grp[MUSCLE_GROUP[m]] = (grp[MUSCLE_GROUP[m]] || 0) + v; } }));
    const tot = Object.values(grp).reduce((a, b) => a + b, 0);
    if (!tot) { out.appendChild(h('div', { class: 'block empty' }, h('b', null, 'Нет данных'), 'Завершите тренировку, и здесь появится нагрузка по мышцам.')); return out; }
    out.appendChild(h('div', { class: 'ex-figure' }, bodyMap(relLoads(mus))));
    out.appendChild(legend());
    out.appendChild(h('div', { class: 'block' }, donut(Object.keys(grp).sort((a, b) => grp[b] - grp[a]).map(g => ({ label: g, v: grp[g], color: GROUP_COLOR[g] || '#999' })), '100 %')));
    out.appendChild(h('div', { class: 'h2' }, 'Рабочие подходы по группам'));
    out.appendChild(h('div', { class: 'list' }, Object.keys(grp).sort((a, b) => grp[b] - grp[a]).map(g => h('div', { class: 'item' }, h('i', { style: { width: '12px', height: '12px', borderRadius: '6px', background: GROUP_COLOR[g] } }),
      h('span', { class: 'grow t' }, g), h('span', { class: 'num' }, fmtNum(grp[g]) + ' подх. · ' + Math.round(grp[g] / tot * 100) + ' %')))));
    out.appendChild(h('p', { class: 'small muted' }, 'Подход засчитывается мышце пропорционально её доле в упражнении. Показаны только задействованные группы.'));
    return out;
  }
  const MEASURES = [['weight', 'Вес', 'кг'], ['chest', 'Грудь', 'см'], ['waist', 'Талия', 'см'], ['arm', 'Бицепс', 'см'], ['thigh', 'Бедро', 'см']];
  function bodyForm(keys) {
    keys = keys || MEASURES.map(m => m[0]);
    const k = today(); const ex = S.body.find(b => b.date === k) || {};
    formSheet('Замеры на ' + fmtDate(k), [{ key: 'date', label: 'Дата', type: 'date', value: k }].concat(keys.map(key => { const m = MEASURES.find(x => x[0] === key); return { key, label: m[1] + ', ' + m[2], type: 'number', value: ex[key] }; })), v => {
      const date = /^\d{4}-\d{2}-\d{2}$/.test(v.date) ? v.date : k;
      let rec = S.body.find(b => b.date === date); if (!rec) { rec = { date, weight: null, chest: null, waist: null, arm: null, thigh: null }; S.body.push(rec); }
      keys.forEach(key => { if (v[key] != null) rec[key] = clamp(v[key], 0, 500); });
      save(); render();
    });
  }
  function viewMeasures() {
    const out = h('div');
    out.appendChild(seg(MEASURES.map(m => [m[0], m[1]]), UI.measure, id => { UI.measure = id; render(); }, true));
    const m = MEASURES.find(x => x[0] === UI.measure);
    const pts = S.body.filter(b => b[m[0]]).sort((a, b) => (a.date < b.date ? -1 : 1));
    out.appendChild(h('div', { class: 'block' }, lineChart(pts.slice(-30).map(b => ({ x: fmtDate(b.date, { day: 'numeric', month: 'numeric' }), y: b[m[0]] })), { label: m[1] }),
      pts.length > 1 ? h('div', { class: 'small muted', style: { textAlign: 'center' } }, 'Изменение с ' + fmtDate(pts[0].date) + ': ' + ((pts[pts.length - 1][m[0]] - pts[0][m[0]]) >= 0 ? '+' : '') + fmtNum(pts[pts.length - 1][m[0]] - pts[0][m[0]]) + ' ' + m[2]) : null));
    out.appendChild(h('button', { class: 'btn', type: 'button', onclick: () => bodyForm() }, 'Записать замеры'));
    const rows = S.body.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 30);
    if (rows.length) {
      out.appendChild(h('div', { class: 'h2' }, 'Записи'));
      out.appendChild(h('div', { class: 'list' }, rows.map(b => h('button', { class: 'item', type: 'button', onclick: () => confirmSheet('Удалить запись за ' + fmtDate(b.date) + '?', null, 'Удалить', () => { S.body = S.body.filter(x => x !== b); save(); render(); }, true) },
        h('div', { class: 'grow' }, h('div', { class: 't' }, fmtDate(b.date)), h('div', { class: 's' }, MEASURES.filter(mm => b[mm[0]]).map(mm => mm[1] + ' ' + fmtNum(b[mm[0]])).join(' · ') || '—')), icon('trash')))));
    }
    return out;
  }

  /* ---- Справочник ---- */
  function screenRef() {
    const out = h('div', null, topbar('Справочник', { left: h('span'), actions: [h('button', { class: 'round', type: 'button', 'aria-label': 'Новое упражнение', onclick: () => push('exEdit', {}) }, icon('plus'))] }));
    const q = h('input', { class: 'in', type: 'search', placeholder: 'Поиск упражнения', value: UI.exQuery, oninput: e => { UI.exQuery = e.target.value; drawRes(); } });
    out.appendChild(q);
    const res = h('div', { style: { marginTop: '12px' } }); out.appendChild(res);
    function drawRes() {
      res.textContent = ''; const ql = UI.exQuery.trim().toLowerCase();
      if (ql) { const items = allEx().filter(e => e.name.toLowerCase().includes(ql));
        res.appendChild(h('div', { class: 'list' }, items.map(exRow), items.length ? null : h('div', { class: 'empty' }, 'Ничего не найдено'))); return; }
      const groups = [['__bm', 'Закладки', S.bookmarks.length], ['__my', 'Мои упражнения', S.customEx.length]].filter(g => g[2]).concat(GROUPS.map(g => [g, g, allEx().filter(e => e.group === g).length]));
      res.appendChild(h('div', { class: 'list' }, groups.map(([id, label, n]) => h('button', { class: 'item', type: 'button', onclick: () => push('refGroup', { g: id }) },
        h('i', { style: { width: '12px', height: '12px', borderRadius: '6px', background: GROUP_COLOR[id] || 'var(--accent)', flex: 'none' } }), h('span', { class: 'grow t' }, label), h('span', { class: 'muted num' }, String(n)), icon('chev')))));
    }
    drawRes();
    return out;
  }
  const exRow = e => h('button', { class: 'item', type: 'button', onclick: () => push('exCard', { id: e.id, tab: 'desc' }) }, exThumb(e),
    h('div', { class: 'grow' }, h('div', { class: 't' }, e.name), h('div', { class: 's' }, e.equip + (e.custom ? ' · моё' : ''))), icon('chev'));
  function screenRefGroup({ g }) {
    const label = g === '__bm' ? 'Закладки' : g === '__my' ? 'Мои упражнения' : g;
    const items = g === '__bm' ? S.bookmarks.map(exById).filter(Boolean) : g === '__my' ? S.customEx : allEx().filter(e => e.group === g);
    return h('div', null, topbar(label, { back: true }), h('div', { class: 'list' }, items.map(exRow)),
      items.length ? null : h('div', { class: 'block empty' }, 'Пусто'));
  }
  function exHistory(id) {
    return doneWorkouts().map(w => ({ w, it: w.items.find(i => i.exId === id && i.sets.length) })).filter(x => x.it);
  }
  function screenExCard({ id, tab }) {
    const ex = exById(id); if (!ex) { UI.stack.pop(); return screenRef(); }
    const bm = S.bookmarks.includes(id);
    const actions = [h('button', { class: 'round', type: 'button', 'aria-label': bm ? 'Убрать из закладок' : 'В закладки', 'aria-pressed': String(bm), onclick: () => { S.bookmarks = bm ? S.bookmarks.filter(x => x !== id) : S.bookmarks.concat(id); save(); render(); } }, icon('bookmark', bm))];
    if (ex.video) actions.push(h('a', { class: 'round', href: ex.video, target: '_blank', rel: 'noopener noreferrer', 'aria-label': 'Видео техники' }, icon('play')));
    const out = h('div', null, topbar(ex.group, { back: true, actions }));
    out.appendChild(seg([['desc', 'Описание'], ['mus', 'Мышцы'], ['hist', 'История'], ['prog', 'Прогресс']], tab, t => replaceTop('exCard', { id, tab: t }), true));
    const hist = exHistory(id);
    if (tab === 'desc') {
      out.appendChild(exPanel(ex));
      out.appendChild(h('div', { class: 'ex-title' }, ex.name));
      out.appendChild(h('div', { class: 'muted', style: { margin: '0 2px 10px' } }, ex.equip + ' · ' + (ex.type === 'w' ? 'вес × повторы' : ex.type === 'r' ? 'повторы' : 'минуты')));
      if (ex.desc) out.appendChild(h('div', { class: 'block' }, h('div', { class: 'h2', style: { margin: '0 0 6px' } }, 'Техника'), h('p', { class: 'desc', style: { margin: 0 } }, ex.desc)));
      out.appendChild(h('div', { class: 'block' }, h('div', { class: 'h2', style: { margin: '0 0 6px' } }, 'Моя заметка', h('button', { type: 'button', onclick: () => formSheet('Заметка к упражнению', [{ key: 'n', label: 'Настройка тренажёра, хват, ощущения', type: 'textarea', value: S.exNotes[id] || '' }], v => { if (v.n) S.exNotes[id] = v.n.slice(0, 1000); else delete S.exNotes[id]; save(); render(); }) }, S.exNotes[id] ? 'Изменить' : 'Добавить')),
        h('p', { class: 'desc', style: { margin: 0 } }, S.exNotes[id] || 'Пока нет заметки.')));
      if (ex.custom) out.appendChild(h('button', { class: 'btn soft', type: 'button', onclick: () => push('exEdit', { id }) }, 'Изменить упражнение'));
    } else if (tab === 'mus') {
      out.appendChild(h('div', { class: 'ex-figure' }, bodyMap(relLoads(ex.muscles))));
      out.appendChild(legend());
      out.appendChild(h('div', { class: 'h2' }, 'Распределение мышечной нагрузки'));
      const blk = h('div', { class: 'block' });
      Object.keys(ex.muscles).sort((a, b) => ex.muscles[b] - ex.muscles[a]).forEach(m => {
        const v = ex.muscles[m]; const rel = v / Math.max(...Object.values(ex.muscles)) * 100;
        blk.appendChild(h('div', { class: 'mbar' }, h('div', { class: 'row between' }, h('span', null, MUSCLES[m]), h('span', { class: 'num', style: { color: bucketColor(rel) } }, v + ' %')),
          h('div', { class: 'bar' }, h('i', { style: { width: v + '%', background: bucketColor(rel) } }))));
      });
      out.appendChild(blk);
    } else if (tab === 'hist') {
      if (!hist.length) out.appendChild(h('div', { class: 'block empty' }, h('b', null, 'Истории пока нет'), 'Подходы появятся после первой тренировки с этим упражнением.'));
      hist.slice(0, 60).forEach(({ w, it }) => out.appendChild(h('div', { class: 'block' }, h('div', { class: 'row between' }, h('b', null, fmtDate(dayKey(w.start), { day: 'numeric', month: 'long', year: 'numeric' })), h('span', { class: 'muted small' }, w.name)),
        h('div', { style: { marginTop: '6px' } }, it.sets.map((x, j) => h('div', { class: 'row between small', style: { padding: '3px 0' } }, h('span', { class: 'muted' }, x.type === 'warm' ? 'Разминка' : 'Подход ' + (j + 1)),
          h('span', { class: 'num' }, ex.type === 't' ? fmtNum(x.min) + ' мин' : (x.kg ? fmtNum(x.kg) + ' кг × ' + x.reps : x.reps + ' повт.')), x.note ? h('span', { class: 'muted' }, x.note) : null))))));
    } else {
      const chron = hist.slice().reverse();
      if (ex.type === 'w') {
        const pts = chron.map(({ w, it }) => ({ x: fmtDate(dayKey(w.start), { day: 'numeric', month: 'numeric' }), y: Math.max(...it.sets.filter(x => x.type !== 'warm').map(x => e1rm(x.kg, x.reps)), 0) })).filter(p => p.y > 0);
        const maxPts = chron.map(({ w, it }) => ({ x: fmtDate(dayKey(w.start), { day: 'numeric', month: 'numeric' }), y: Math.max(...it.sets.map(x => x.kg || 0)) })).filter(p => p.y > 0);
        out.appendChild(h('div', { class: 'h2' }, 'Максимальный вес, кг')); out.appendChild(h('div', { class: 'block' }, lineChart(maxPts.slice(-30), { label: 'Максимальный вес' })));
        out.appendChild(h('div', { class: 'h2' }, 'Расчётный 1ПМ, кг')); out.appendChild(h('div', { class: 'block' }, lineChart(pts.slice(-30), { label: 'Расчётный 1ПМ', color: 'var(--p25)' }),
          h('div', { class: 'small muted' }, 'Формула Эпли: вес × (1 + повторы / 30).')));
        const recs = [1, 3, 5, 8, 10, 12].map(r => { let best = null; hist.forEach(({ w, it }) => it.sets.forEach(x => { if (x.type !== 'warm' && x.reps >= r && x.kg > 0 && (!best || x.kg > best.kg)) best = { kg: x.kg, d: w.start }; })); return [r, best]; }).filter(x => x[1]);
        if (recs.length) { out.appendChild(h('div', { class: 'h2' }, 'Рекорды'));
          out.appendChild(h('div', { class: 'list' }, recs.map(([r, b]) => h('div', { class: 'item' }, h('span', { class: 'grow t' }, r + ' ' + (r === 1 ? 'повтор' : r < 5 ? 'повтора' : 'повторов')), h('span', { class: 'num', style: { fontWeight: 700 } }, fmtNum(b.kg) + ' кг'), h('span', { class: 'muted small' }, fmtDate(dayKey(b.d)))))));
        }
      } else {
        const pts = chron.map(({ w, it }) => ({ x: fmtDate(dayKey(w.start), { day: 'numeric', month: 'numeric' }), y: ex.type === 't' ? it.sets.reduce((a, x) => a + x.min, 0) : it.sets.reduce((a, x) => a + x.reps, 0) }));
        out.appendChild(h('div', { class: 'h2' }, ex.type === 't' ? 'Минут за тренировку' : 'Повторов за тренировку')); out.appendChild(h('div', { class: 'block' }, lineChart(pts.slice(-30))));
      }
    }
    return out;
  }
  function screenExEdit({ id }) {
    const ex = id ? S.customEx.find(e => e.id === id) : null;
    if (!UI.exDraft || UI.exDraft.forId !== (id || 'new')) UI.exDraft = { forId: id || 'new', name: ex ? ex.name : '', group: ex ? ex.group : 'Грудь', equip: ex ? ex.equip : 'Штанга', type: ex ? ex.type : 'w',
      primary: ex ? (Object.keys(ex.muscles).sort((a, b) => ex.muscles[b] - ex.muscles[a])[0] || 'chest') : 'chest', secondary: ex ? Object.keys(ex.muscles).sort((a, b) => ex.muscles[b] - ex.muscles[a]).slice(1) : [], desc: ex ? ex.desc : '', video: ex ? ex.video : '' };
    const d = UI.exDraft;
    const out = h('div', null, topbar(ex ? 'Изменить упражнение' : 'Новое упражнение', { back: true, onBack: () => { UI.exDraft = null; pop(); } }));
    const sel = (key, opts) => h('select', { class: 'in', onchange: e => { d[key] = e.target.value; if (key === 'primary') render(); } }, opts.map(([v, l]) => h('option', { value: v, selected: d[key] === v ? 'selected' : null }, l)));
    out.appendChild(h('label', { class: 'f' }, h('span', null, 'Название'), h('input', { class: 'in', maxlength: 80, value: d.name, placeholder: 'Например, Жим в Смите', oninput: e => { d.name = e.target.value; } })));
    out.appendChild(h('div', { class: 'grid2' }, h('label', { class: 'f' }, h('span', null, 'Группа'), sel('group', GROUPS.map(g => [g, g]))), h('label', { class: 'f' }, h('span', null, 'Оборудование'), sel('equip', EQUIP.map(g => [g, g])))));
    out.appendChild(h('label', { class: 'f' }, h('span', null, 'Как записывать'), sel('type', [['w', 'Вес × повторы'], ['r', 'Только повторы'], ['t', 'Минуты']])));
    out.appendChild(h('label', { class: 'f' }, h('span', null, 'Основная мышца'), sel('primary', Object.keys(MUSCLES).map(m => [m, MUSCLES[m]]))));
    out.appendChild(h('div', { class: 'f' }, h('span', { class: 'muted small', style: { display: 'block', margin: '0 0 6px 2px' } }, 'Вспомогательные мышцы'),
      h('div', { class: 'chips' }, Object.keys(MUSCLES).filter(m => m !== d.primary).map(m => h('button', { class: 'chip', type: 'button', 'aria-pressed': String(d.secondary.includes(m)), onclick: () => { d.secondary = d.secondary.includes(m) ? d.secondary.filter(x => x !== m) : d.secondary.concat(m); render(); } }, MUSCLES[m])))));
    out.appendChild(h('label', { class: 'f', style: { marginTop: '12px' } }, h('span', null, 'Техника'), h('textarea', { class: 'in', rows: 4, maxlength: 2000, oninput: e => { d.desc = e.target.value; } }, d.desc)));
    out.appendChild(h('label', { class: 'f' }, h('span', null, 'Ссылка на видео (https://…)'), h('input', { class: 'in', type: 'url', maxlength: 500, value: d.video, oninput: e => { d.video = e.target.value; } })));
    out.appendChild(h('button', { class: 'btn', type: 'button', onclick: () => {
      const nm = d.name.trim(); if (!nm) { toast('Введите название'); return; }
      const vid = d.video.trim(); if (vid && !safeUrl(vid)) { toast('Ссылка должна начинаться с https://'); return; }
      const sec = d.secondary.filter(m => m !== d.primary); const share = sec.length ? Math.round(40 / sec.length) : 0;
      const muscles = { [d.primary]: sec.length ? 60 : 100 }; sec.forEach(m => { muscles[m] = share; });
      const obj = { id: ex ? ex.id : 'u' + uid(), name: nm.slice(0, 80), group: d.group, equip: d.equip, type: d.type, muscles, desc: d.desc.trim().slice(0, 2000), video: safeUrl(vid), custom: true };
      if (ex) Object.assign(ex, obj); else S.customEx.push(obj);
      UI.exDraft = null; save(); toast('Упражнение сохранено'); replaceTop('exCard', { id: obj.id, tab: 'desc' }); } }, 'Сохранить'));
    if (ex) out.appendChild(h('button', { class: 'btn ghost', type: 'button', onclick: () => confirmSheet('Удалить упражнение?', 'Записанные подходы в истории сохранятся.', 'Удалить', () => {
      S.customEx = S.customEx.filter(x => x.id !== id); S.programs.forEach(p => { p.items = p.items.filter(i => i.exId !== id); }); UI.exDraft = null; save(); UI.stack = []; render(); }, true) }, 'Удалить упражнение'));
    return out;
  }

  /* ---- Ещё ---- */
  function screenMore() {
    const p = S.profile; const out = h('div', null, topbar('Ещё', { left: h('span') }));
    const goalName = { cut: 'Сушка', maintain: 'Поддержание', bulk: 'Набор массы' };
    const row = (t, sub, val, onclick) => h('button', { class: 'item', type: 'button', onclick }, h('div', { class: 'grow' }, h('div', { class: 't' }, t), sub ? h('div', { class: 's' }, sub) : null), val != null ? h('span', { class: 'muted num' }, String(val)) : null, icon('chev'));
    out.appendChild(h('div', { class: 'h2' }, 'Профиль'));
    out.appendChild(h('div', { class: 'list' },
      row('Мои данные', [p.sex === 'f' ? 'Ж' : 'М', age() != null ? age() + ' лет' : null, p.height ? fmtNum(p.height) + ' см' : null, lastWeight() ? fmtNum(lastWeight()) + ' кг' : null].filter(Boolean).join(' · ') || 'Не заполнено', null, profileForm),
      row('Цель', goalName[p.goal], null, () => formSheet('Цель', [{ key: 'g', label: 'Цель', type: 'select', value: p.goal, options: [['cut', 'Сушка'], ['maintain', 'Поддержание'], ['bulk', 'Набор массы']] }], v => { p.goal = v.g; save(); render(); })),
      row('Базовый обмен', p.bmrManual ? 'Введён вручную' : (mifflin() ? 'Расчёт Миффлина — Сан Жеора' : 'Нужны вес, рост и дата рождения'), (p.bmrManual || mifflin() || '—') + ' ккал',
        () => formSheet('Базовый обмен', [{ key: 'b', label: 'Ккал в сутки (из «Здоровья»: энергия покоя). Пусто — расчёт', type: 'number', value: p.bmrManual }], v => { p.bmrManual = v.b; save(); render(); }))));
    out.appendChild(h('div', { class: 'h2' }, 'Цели питания'));
    const tt = t => t.kcal + ' ккал · Б ' + t.p + ' · Ж ' + t.f + ' · У ' + t.c;
    out.appendChild(h('div', { class: 'list' }, row('День тренировки', tt(S.targets.train), null, () => targetForm('train')), row('День отдыха', tt(S.targets.rest), null, () => targetForm('rest')),
      row('Вода', S.targets.water + ' мл', null, () => formSheet('Вода', [{ key: 'w', label: 'Мл в день', type: 'number', value: S.targets.water }], v => { S.targets.water = clamp(Math.round(v.w || 0), 0, 20000); save(); render(); }))));
    out.appendChild(h('div', { class: 'h2' }, 'Тренировки'));
    out.appendChild(h('div', { class: 'list' }, row('Отдых между подходами', null, S.settings.rest + ' с', () => formSheet('Отдых', [{ key: 'r', label: 'Секунд', type: 'number', value: S.settings.rest }], v => { S.settings.rest = clamp(Math.round(v.r || 90), 10, 900); save(); render(); }))));
    out.appendChild(h('div', { class: 'h2' }, 'Данные и безопасность'));
    out.appendChild(h('div', { class: 'list' }, row('Сохранить резервную копию', 'Файл JSON → «Файлы» или iCloud Drive', null, exportBackup),
      row('Восстановить из копии', 'Заменит текущие данные', null, importBackup), row('Экспорт тренировок в CSV', 'Для Excel или Numbers', null, exportCSV),
      row(S.settings.pin ? 'Изменить или убрать PIN-код' : 'Установить PIN-код', 'Код на вход в приложение', null, pinSettings)));
    out.appendChild(h('div', { class: 'h2' }, 'Apple Watch'));
    out.appendChild(h('div', { class: 'block small' }, h('p', { style: { marginTop: 0 } }, 'Запускайте на часах «Тренировка» → «Силовая тренировка». После неё введите активные калории в итог тренировки или в «Диету» → «Расход».'),
      h('p', { style: { marginBottom: 0 } }, 'Быстрее: команда в приложении «Команды», которая берёт из «Здоровья» активную и базовую энергию за сегодня и копирует их через «;» — затем кнопка «Вставить из «Здоровья»» в «Диете».')));
    out.appendChild(h('button', { class: 'btn ghost', type: 'button', style: { marginTop: '8px' }, onclick: () => confirmSheet('Удалить все данные?', 'Тренировки, питание и настройки будут стёрты с этого iPhone. Сначала сохраните резервную копию.', 'Удалить всё', () =>
      confirmSheet('Точно удалить?', 'Действие нельзя отменить.', 'Да, удалить всё', () => { S = defaultState(); save(true); UI.stack = []; UI.tab = 'train'; render(); }, true), true) }, 'Удалить все данные'));
    out.appendChild(h('p', { class: 'small muted', style: { textAlign: 'center', marginTop: '16px' } }, 'Кирилл Fit ' + VERSION + ' · данные хранятся только на этом iPhone'));
    return out;
  }
  function profileForm() {
    const p = S.profile;
    formSheet('Мои данные', [
      { key: 'name', label: 'Имя', value: p.name, max: 40 }, { key: 'sex', label: 'Пол', type: 'select', value: p.sex, options: [['m', 'Мужской'], ['f', 'Женский']] },
      { key: 'birth', label: 'Дата рождения', type: 'date', value: p.birth }, { key: 'height', label: 'Рост, см', type: 'number', value: p.height },
      { key: 'weight', label: 'Вес сегодня, кг', type: 'number', value: lastWeight() }
    ], v => {
      p.name = (v.name || 'Кирилл').slice(0, 40); p.sex = v.sex === 'f' ? 'f' : 'm'; p.birth = /^\d{4}-\d{2}-\d{2}$/.test(v.birth) ? v.birth : ''; p.height = v.height ? clamp(v.height, 100, 250) : null;
      if (v.weight && v.weight !== lastWeight()) { let rec = S.body.find(b => b.date === today()); if (!rec) { rec = { date: today(), weight: null, chest: null, waist: null, arm: null, thigh: null }; S.body.push(rec); } rec.weight = clamp(v.weight, 30, 300); }
      save(); render();
    });
  }
  function targetForm(which) {
    const t = S.targets[which];
    formSheet(which === 'train' ? 'День тренировки' : 'День отдыха', [{ key: 'kcal', label: 'Калории', type: 'number', value: t.kcal }, { key: 'p', label: 'Белки, г', type: 'number', value: t.p },
      { key: 'f', label: 'Жиры, г', type: 'number', value: t.f }, { key: 'c', label: 'Углеводы, г', type: 'number', value: t.c }], v => {
      t.kcal = clamp(Math.round(v.kcal || 0), 0, 10000); t.p = clamp(Math.round(v.p || 0), 0, 1000); t.f = clamp(Math.round(v.f || 0), 0, 1000); t.c = clamp(Math.round(v.c || 0), 0, 2000); save(); render();
    });
  }
  async function exportBackup() {
    const data = JSON.stringify(Object.assign({ app: 'kirill-fit', exportedAt: new Date().toISOString() }, S), null, 1);
    await deliverFile('kirill-fit-backup-' + today() + '.json', data, 'application/json');
  }
  async function deliverFile(name, text, type) {
    const file = new File([text], name, { type });
    try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); toast('Файл готов'); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
    const url = URL.createObjectURL(file); const a = h('a', { href: url, download: name }); document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000); toast('Файл сохранён');
  }
  function importBackup() {
    const inp = h('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' } });
    inp.addEventListener('change', () => {
      const f = inp.files && inp.files[0]; inp.remove(); if (!f) return;
      if (f.size > 20 * 1024 * 1024) { toast('Файл больше 20 МБ — это не резервная копия'); return; }
      const rd = new FileReader();
      rd.onload = () => {
        let obj; try { obj = JSON.parse(rd.result); } catch (e) { toast('Файл повреждён или это не резервная копия'); return; }
        const v = validate(obj); if (!v) { toast('Файл не похож на резервную копию «Кирилл Fit»'); return; }
        confirmSheet('Восстановить данные?', 'Текущие данные заменятся данными из файла: ' + v.workouts.length + ' тренировок, ' + Object.keys(v.meals).length + ' дней питания.', 'Восстановить', () => {
          v.settings.pin = S.settings.pin; S = v; S.onboarded = true; save(true); UI.stack = []; render(); toast('Данные восстановлены'); });
      };
      rd.readAsText(f);
    });
    document.body.appendChild(inp); inp.click();
  }
  function exportCSV() {
    const esc = v => { const t = String(v == null ? '' : v); return /[";\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
    const lines = [['Дата', 'Тренировка', 'Упражнение', 'Подход', 'Тип', 'Вес, кг', 'Повторы', 'Минуты', 'Комментарий'].join(';')];
    doneWorkouts().slice().reverse().forEach(w => w.items.forEach(it => it.sets.forEach((x, j) => lines.push([dayKey(w.start), w.name, exName(it.exId, it.name), j + 1, x.type, fmtNum(x.kg), x.reps, fmtNum(x.min), x.note].map(esc).join(';')))));
    deliverFile('kirill-fit-workouts-' + today() + '.csv', '\ufeff' + lines.join('\n'), 'text/csv');
  }

  /* ---- PIN ---- */
  async function hashPin(pin, saltB64) {
    const salt = saltB64 ? Uint8Array.from(atob(saltB64), c => c.charCodeAt(0)) : crypto.getRandomValues(new Uint8Array(16));
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 150000, hash: 'SHA-256' }, key, 256);
    return { hash: btoa(String.fromCharCode(...new Uint8Array(bits))), salt: btoa(String.fromCharCode(...salt)) };
  }
  function pinSettings() {
    if (!crypto.subtle) { toast('PIN доступен только при открытии по https'); return; }
    sheet('PIN-код', close => h('div', null, h('p', { class: 'muted' }, '4 цифры при каждом открытии приложения. Это защита от случайного доступа, а не замена коду iPhone.'),
      h('button', { class: 'btn', type: 'button', onclick: () => { close(); formSheet('Новый PIN-код', [{ key: 'a', label: '4 цифры', type: 'password' }, { key: 'b', label: 'Повторите', type: 'password' }], v => {
        if (!/^\d{4}$/.test(v.a)) { toast('Нужно ровно 4 цифры'); return false; } if (v.a !== v.b) { toast('Коды не совпадают'); return false; }
        hashPin(v.a).then(r => { S.settings.pin = r; save(true); toast('PIN-код установлен'); render(); });
      }); } }, S.settings.pin ? 'Изменить PIN-код' : 'Установить PIN-код'),
      S.settings.pin ? h('button', { class: 'btn danger', type: 'button', onclick: () => { S.settings.pin = null; save(true); close(); toast('PIN-код убран'); render(); } }, 'Убрать PIN-код') : null,
      h('button', { class: 'btn ghost', type: 'button', onclick: close }, 'Отмена')));
  }
  function screenLock() {
    const dots = h('div', { class: 'pin-dots' }, [0, 1, 2, 3].map(i => h('i', { class: i < UI.pinBuf.length ? 'on' : '' })));
    const msg = h('p', { class: 'muted', style: { textAlign: 'center', minHeight: '1.4em' } }, UI.pinUntil > Date.now() ? 'Слишком много попыток. Подождите 30 секунд.' : (UI.pinFails ? 'Неверный код' : ''));
    const press = async d => {
      if (UI.pinUntil > Date.now()) return;
      if (d === 'del') UI.pinBuf = UI.pinBuf.slice(0, -1); else if (UI.pinBuf.length < 4) UI.pinBuf += d;
      if (UI.pinBuf.length === 4) {
        const r = await hashPin(UI.pinBuf, S.settings.pin.salt); UI.pinBuf = '';
        if (r.hash === S.settings.pin.hash) { UI.locked = false; UI.pinFails = 0; }
        else { UI.pinFails++; if (UI.pinFails >= 5) { UI.pinUntil = Date.now() + 30000; UI.pinFails = 0; setTimeout(render, 30100); } }
      }
      render();
    };
    return h('div', { class: 'center-screen', style: { alignItems: 'center' } }, h('div', { style: { fontSize: '22px', fontWeight: 700 } }, 'Введите PIN-код'), dots, msg,
      h('div', { class: 'keypad' }, ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map(k => k === '' ? h('span') : h('button', { type: 'button', 'aria-label': k === 'del' ? 'Стереть' : k, onclick: () => press(k) }, k === 'del' ? '⌫' : k))));
  }

  /* ---- Первый запуск ---- */
  function screenOnboarding() {
    const p = S.profile;
    if (UI.onb === 0) return h('div', { class: 'center-screen' },
      barbell({ items: [0, 1, 2, 3].map(() => ({ exId: 'bench', plan: { sets: 1 }, sets: [{ type: 'work' }] })) }),
      h('div', { class: 'welcome-title' }, 'С днём рождения, Кирилл!'),
      h('p', { class: 'desc muted' }, 'Это твой личный дневник тренировок и питания: программы, подходы, рекорды и баланс калорий в одном месте. Без подписок и рекламы, данные остаются только на этом iPhone.'),
      installHint(),
      h('button', { class: 'btn', type: 'button', style: { marginTop: '16px' }, onclick: () => { UI.onb = 1; render(); } }, 'Начать настройку'),
      h('button', { class: 'link', type: 'button', style: { margin: '12px auto 0', display: 'block' }, onclick: importBackup }, 'Восстановить из резервной копии'));
    if (UI.onb === 1) {
      const f = { sex: h('select', { class: 'in' }, h('option', { value: 'm' }, 'Мужской'), h('option', { value: 'f' }, 'Женский')),
        birth: h('input', { class: 'in', type: 'date', value: p.birth }), height: h('input', { class: 'in num', inputmode: 'decimal', placeholder: 'см', value: p.height ? fmtNum(p.height) : '' }),
        weight: h('input', { class: 'in num', inputmode: 'decimal', placeholder: 'кг', value: lastWeight() ? fmtNum(lastWeight()) : '' }),
        goal: h('select', { class: 'in' }, h('option', { value: 'cut' }, 'Сушка'), h('option', { value: 'maintain' }, 'Поддержание'), h('option', { value: 'bulk' }, 'Набор массы')) };
      f.sex.value = p.sex; f.goal.value = p.goal;
      return h('div', { style: { paddingTop: '24px' } }, h('div', { class: 'muted' }, 'Шаг 1 из 2'), h('div', { class: 'welcome-title', style: { fontSize: '30px' } }, 'Профиль'),
        h('p', { class: 'muted' }, 'Нужен, чтобы считать расход калорий и белок на килограмм веса.'),
        h('div', { class: 'grid2' }, h('label', { class: 'f' }, h('span', null, 'Пол'), f.sex), h('label', { class: 'f' }, h('span', null, 'Дата рождения'), f.birth)),
        h('div', { class: 'grid2' }, h('label', { class: 'f' }, h('span', null, 'Рост, см'), f.height), h('label', { class: 'f' }, h('span', null, 'Вес, кг'), f.weight)),
        h('label', { class: 'f' }, h('span', null, 'Цель'), f.goal),
        h('button', { class: 'btn', type: 'button', onclick: () => {
          p.sex = f.sex.value; p.birth = /^\d{4}-\d{2}-\d{2}$/.test(f.birth.value) ? f.birth.value : ''; p.height = num(f.height.value); p.goal = f.goal.value;
          const wt = num(f.weight.value); if (wt) { S.body = S.body.filter(b => b.date !== today()); S.body.push({ date: today(), weight: clamp(wt, 30, 300), chest: null, waist: null, arm: null, thigh: null }); }
          // предложение целей
          const bmr = mifflin(); if (bmr && wt) { const k = p.goal === 'cut' ? 0.85 : p.goal === 'bulk' ? 1.1 : 1;
            const mk = mult => { const kcal = Math.round(bmr * mult * k / 10) * 10; const pr = Math.round(wt * 2.0), fa = Math.round(wt * 0.9); return { kcal, p: pr, f: fa, c: Math.max(0, Math.round((kcal - pr * 4 - fa * 9) / 4)) }; };
            S.targets.train = mk(1.65); S.targets.rest = mk(1.4); }
          UI.onb = 2; save(); render(); } }, 'Дальше'),
        h('button', { class: 'link', type: 'button', style: { margin: '12px auto 0', display: 'block' }, onclick: () => { UI.onb = 2; render(); } }, 'Пропустить'));
    }
    const t = S.targets; const fields = {};
    const inp = (grp, key) => (fields[grp + key] = h('input', { class: 'in num', inputmode: 'numeric', value: String(t[grp][key]) }));
    const addStarter = h('input', { type: 'checkbox', checked: true, id: 'starter', style: { width: '22px', height: '22px' } });
    return h('div', { style: { paddingTop: '24px' } }, h('div', { class: 'muted' }, 'Шаг 2 из 2'), h('div', { class: 'welcome-title', style: { fontSize: '30px' } }, 'Цели питания'),
      h('p', { class: 'muted' }, 'Подставлены по формуле Миффлина — Сан Жеора и 2 г белка на кг. Поменяй под свой план — всё можно изменить позже в «Ещё».'),
      ['train', 'rest'].map(grp => h('div', { class: 'block' }, h('b', null, grp === 'train' ? 'День тренировки' : 'День отдыха'),
        h('div', { class: 'grid4', style: { marginTop: '8px' } }, [['kcal', 'Ккал'], ['p', 'Белки'], ['f', 'Жиры'], ['c', 'Углев.']].map(([k, l]) => h('label', { class: 'f', style: { marginBottom: 0 } }, h('span', null, l), inp(grp, k)))))),
      h('label', { class: 'row', style: { margin: '6px 2px 16px' } }, addStarter, h('span', null, 'Добавить 3 программы-примера (их можно изменить или удалить)')),
      h('button', { class: 'btn', type: 'button', onclick: () => {
        ['train', 'rest'].forEach(grp => ['kcal', 'p', 'f', 'c'].forEach(k => { const v = num(fields[grp + k].value); if (v != null) t[grp][k] = clamp(Math.round(v), 0, 10000); }));
        if (addStarter.checked && !S.programs.length) STARTER_PROGRAMS.forEach(sp => S.programs.push({ id: uid(), name: sp.name, items: sp.items.map(([exId, sets, reps, kg]) => ({ exId, name: exName(exId), sets, reps, kg, min: 0 })) }));
        S.onboarded = true; save(true); UI.tab = 'train'; UI.seg.train = 'desk'; render(); } }, 'Готово'));
  }

  const SCREENS = { program: screenProgram, programEdit: screenProgramEdit, workout: screenWorkout, workoutEx: screenWorkoutEx, workoutView: screenWorkoutView, history: screenHistory,
    foods: screenFoods, refGroup: screenRefGroup, exCard: screenExCard, exEdit: screenExEdit };

  /* ---------- Запуск ---------- */
  async function boot() {
    await loadState();
    if (S.settings.pin && crypto.subtle) UI.locked = true;
    if (S.active) { UI.stack = [{ name: 'workout', params: { id: S.active } }]; keepAwake(true); }
    render();
    if ('serviceWorker' in navigator && location.protocol === 'https:' && !window.KF_NO_SW) navigator.serviceWorker.register('sw.js').catch(() => {});
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  }
  boot();
})();
