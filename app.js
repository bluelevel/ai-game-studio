'use strict';

/* ================= 공통 ================= */
const $ = (sel, el = document) => el.querySelector(sel);
// 앞 순서일수록 서로 확 다른 색이 오도록 배치 (2명: 빨강·파랑, 3명: +노랑, 4명: +초록 …)
const PALETTE = ['#ff4d4d', '#3d9bff', '#ffe14d', '#4fd65a', '#c06bff', '#ff9a3d', '#2fd6c8', '#ff7ab8', '#e8ecf5', '#b08968'];
// 캐릭터 얼굴 — 빠르거나 느린 인상이 없는 것만 (달리기에서 불리해 보이지 않게)
const FACES = ['🦊', '🐼', '🐸', '🐯', '🐵', '🐶', '🐱', '🐷', '🐨', '🦁'];
const MIN_P = 2;
const MAX_P = 10;
const STORE_KEY = 'bokbulbok-v1';
const TAU = Math.PI * 2;
// 깜짝 이벤트가 나올 확률(%) — 사다리 연장, 룰렛 한 바퀴 더, 달리기 부스터
const SURPRISE = { ladder: 25, roulette: 25, race: 25 };

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
function loadState() {
  const st = { players: [], sound: true, day: today() };
  let s = null;
  try { s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) { /* 저장소를 못 쓰는 환경이면 기본값 사용 */ }
  if (s && Array.isArray(s.players)) {
    const sameDay = s.day === st.day;                       // 전적은 날짜가 바뀌면 0부터
    const used = new Set();
    s.players.slice(0, MAX_P).forEach((p) => {
      const o = typeof p === 'string' ? { name: p } : (p || {});
      let f = Number.isInteger(o.face) && o.face >= 0 && o.face < FACES.length && !used.has(o.face) ? o.face : -1;
      if (f < 0) f = FACES.findIndex((_, k) => !used.has(k));
      used.add(f);
      st.players.push({ name: String(o.name || ''), face: f, hits: sameDay ? Number(o.hits) || 0 : 0 });
    });
    if (s.sound === false) st.sound = false;
  }
  if (st.players.length < MIN_P) st.players = [0, 1, 2].map((f) => ({ name: '', face: f, hits: 0 }));
  return st;
}
const state = loadState();
function persist() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* 무시 */ }
}

// 편향 없는 0..n-1 난수
function rand(n) {
  const limit = Math.floor(0x100000000 / n) * n;
  const buf = new Uint32Array(1);
  let x;
  do { crypto.getRandomValues(buf); x = buf[0]; } while (x >= limit);
  return x % n;
}
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pname = (i) => state.players[i].name.trim() || `${i + 1}번`;
const face = (i) => FACES[state.players[i].face];
const color = (i) => PALETTE[i % PALETTE.length];
const avatar = (i, cls = '') => `<span class="av ${cls}" style="background:${color(i)}">${face(i)}</span>`;
const named = (i) => `<b style="color:${color(i)}">${esc(pname(i))}</b>`;
const buzz = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) { /* 무시 */ } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// 배경색 위에 올릴 글자색 — 밝은 색(노랑·흰색) 위에는 어두운 글자
function ink(hex) {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b > 170 ? '#16122e' : '#ffffff';
}

/* ================= 효과음 (파일 없이 합성) ================= */
const sfx = (() => {
  let ctx = null;
  function audio() {
    if (!state.sound) return null;
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    } catch (e) { return null; }
  }
  function tone(freq, dur, type, vol, when = 0, slideTo = 0) {
    const c = audio();
    if (!c) return;
    const t = c.currentTime + when;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain).connect(c.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }
  return {
    unlock: audio,                                                           // 첫 터치에서 소리 장치를 깨운다
    tick() { tone(1500, 0.03, 'square', 0.05); },                            // 룰렛 칸 넘어가는 소리
    step() { tone(560, 0.05, 'triangle', 0.08); },                           // 사다리 꺾일 때
    hoof() { tone(150, 0.06, 'triangle', 0.1, 0, 70); },                     // 달리는 발소리
    pass() { tone(660, 0.09, 'sine', 0.11); tone(990, 0.16, 'sine', 0.11, 0.08); },
    go() { tone(440, 0.1, 'square', 0.07); tone(880, 0.22, 'square', 0.07, 0.11); },
    twist() { tone(260, 0.55, 'sawtooth', 0.1, 0, 1500); },                  // 깜짝 이벤트 (부스터·한 바퀴 더·사다리 연장)
    reveal() {
      tone(120, 0.5, 'sawtooth', 0.16, 0, 50);
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.4, 'triangle', 0.12, 0.12 + i * 0.09));
    },
  };
})();

/* ================= 홈 ================= */
const homeEl = $('#home');
const gameEl = $('#game');
const stage = $('#stage');
let runToken = 0;       // 화면을 벗어나면 진행 중인 애니메이션을 끊기 위한 값
let currentGame = null;

function renderPlayers() {
  const n = state.players.length;
  $('#players').innerHTML = state.players.map((p, i) => `
    <li>
      <button class="av-btn" data-face="${i}" aria-label="참가자 ${i + 1} 캐릭터 바꾸기">${avatar(i)}</button>
      <input data-i="${i}" value="${esc(p.name)}" maxlength="6" placeholder="${i + 1}번" aria-label="참가자 ${i + 1} 이름" enterkeyhint="done" autocomplete="off">
      ${n > MIN_P ? `<button class="del" data-del="${i}" aria-label="참가자 ${i + 1} 삭제">✕</button>` : ''}
    </li>`).join('')
    + (n < MAX_P ? '<li><button class="av add" data-add aria-label="참가자 추가">+</button><span class="add-label">추가</span></li>' : '');
  $('#player-count').textContent = `${n}명`;
  renderTally();
}
function renderTally() {
  const total = state.players.reduce((sum, p) => sum + p.hits, 0);
  $('#tally').hidden = total === 0;
  $('#tally-list').innerHTML = state.players.map((p, i) => `<span>${avatar(i)}${p.hits}</span>`).join('');
}
const freeFace = (from = 0) => {
  const used = new Set(state.players.map((p) => p.face));
  for (let k = 0; k < FACES.length; k++) {
    const f = (from + k) % FACES.length;
    if (!used.has(f)) return f;
  }
  return from % FACES.length;
};

$('#players').addEventListener('input', (e) => {
  const i = e.target.dataset.i;
  if (i !== undefined) { state.players[+i].name = e.target.value; persist(); }
});
$('#players').addEventListener('click', (e) => {
  const t = e.target.closest('button');
  if (!t) return;
  if (t.dataset.face !== undefined) {                       // 얼굴 바꾸기: 남이 안 쓰는 다음 얼굴
    const p = state.players[+t.dataset.face];
    p.face = freeFace(p.face + 1);
  } else if (t.dataset.del !== undefined && state.players.length > MIN_P) {
    state.players.splice(+t.dataset.del, 1);
  } else if (t.dataset.add !== undefined && state.players.length < MAX_P) {
    state.players.push({ name: '', face: freeFace(), hits: 0 });
  } else return;
  persist(); renderPlayers();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.target.blur(); });
$('#tally-reset').addEventListener('click', () => {
  state.players.forEach((p) => { p.hits = 0; });
  persist(); renderTally();
});
const soundBtn = $('#sound');
function renderSound() { soundBtn.textContent = state.sound ? '🔊' : '🔇'; }
soundBtn.addEventListener('click', () => {
  state.sound = !state.sound;
  persist(); renderSound();
  sfx.pass();
});

function goHome() {
  runToken++;
  currentGame = null;
  stage.innerHTML = '';
  gameEl.hidden = true;
  homeEl.hidden = false;
  renderPlayers();
  window.scrollTo(0, 0);
}
function startGame(id) {
  runToken++;
  currentGame = id;
  sfx.unlock();
  homeEl.hidden = true;
  gameEl.hidden = false;
  $('#game-title').textContent = GAMES[id].title;
  stage.innerHTML = '';
  window.scrollTo(0, 0);
  GAMES[id].start(runToken);
}
$('.games').addEventListener('click', (e) => {
  const card = e.target.closest('[data-game]');
  if (card) startGame(card.dataset.game);
});
$('#back').addEventListener('click', goHome);

// 결과 공개 — 판이 멈춘 모습을 잠깐 보여 준 뒤 당첨자 색으로 화면 전체를 덮는다
function showResult(who) {
  const token = runToken;
  state.players[who].hits++;
  persist();
  setTimeout(() => {
    if (token !== runToken) return;
    sfx.reveal();
    buzz([150, 70, 300]);
    const c = color(who);
    const text = ink(c);
    const name = pname(who);
    const len = [...name].length;
    const size = len <= 2 ? 100 : len === 3 ? 86 : len === 4 ? 70 : 54;
    const bits = ['#ffd23f', '#ffffff', '#16122e', ...PALETTE.filter((k) => k !== c)];
    let confetti = '';
    for (let k = 0; k < 64; k++) {
      confetti += `<i style="--x:${rand(100)}%;--w:${8 + rand(8)}px;--h:${8 + rand(14)}px;--k:${bits[rand(bits.length)]};--d:${2200 + rand(2600)}ms;--delay:-${rand(4000)}ms;--r:${200 + rand(700)}deg"></i>`;
    }
    const el = document.createElement('section');
    el.className = 'reveal';
    el.style.cssText = `--c:${c};--ink:${text};--shade:${text === '#ffffff' ? '#16122e' : '#ffffff'}`;
    el.innerHTML = `
      <div class="rays"></div>
      <div class="confetti">${confetti}</div>
      <div class="reveal-in">
        <p class="reveal-tag">오늘의 당첨</p>
        ${avatar(who, 'reveal-av')}
        <p class="reveal-name" style="font-size:${size}px">${esc(name)}</p>
        <div class="row">
          <button class="btn primary" data-act="again">한 번 더</button>
          <button class="btn" data-act="home">게임 고르기</button>
        </div>
      </div>`;
    el.addEventListener('click', (e) => {
      const act = e.target.dataset.act;
      if (act === 'again') startGame(currentGame);
      if (act === 'home') goHome();
    });
    stage.appendChild(el);
  }, 1100);
}

function setupCanvas(canvas, w, h) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.height = `${h}px`;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}
function drawAvatar(ctx, x, y, r, p, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = color(p);
  ctx.fill();
  ctx.font = `${Math.round(r * 1.16)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(face(p), x, y + r * 0.08);
  ctx.restore();
}

/* ================= 1. 사다리 타기 ================= */
// 사다리 생성 — 테스트할 수 있도록 순수 함수로 분리
function buildLadder(n, levels) {
  const rungs = [];
  for (let l = 0; l < levels; l++) {
    const row = new Array(n - 1).fill(false);
    for (let c = 0; c < n - 1; c++) {
      if (!(c > 0 && row[c - 1]) && rand(100) < 45) row[c] = true;
    }
    rungs.push(row);
  }
  // 모든 칸 사이에 가로줄이 최소 하나는 있게
  for (let c = 0; c < n - 1; c++) {
    if (rungs.some((r) => r[c])) continue;
    const free = [];
    for (let l = 0; l < levels; l++) if (!rungs[l][c - 1] && !rungs[l][c + 1]) free.push(l);
    const l = free.length ? free[rand(free.length)] : rand(levels);
    if (c > 0) rungs[l][c - 1] = false;
    if (c < n - 2) rungs[l][c + 1] = false;
    rungs[l][c] = true;
  }
  return rungs;
}
// 깜짝 연장 구간 — 뭔가 일어나도록 가로줄이 너무 적으면 다시 뽑는다
function extraRungs(n, levels) {
  for (;;) {
    const rows = [];
    let count = 0;
    for (let l = 0; l < levels; l++) {
      const row = new Array(n - 1).fill(false);
      for (let c = 0; c < n - 1; c++) {
        if (!(c > 0 && row[c - 1]) && rand(100) < 50) { row[c] = true; count++; }
      }
      rows.push(row);
    }
    if (count >= Math.min(2, n - 1)) return rows;
  }
}
function traceLadder(rungs, start) {
  let c = start;
  const pts = [[c, -1]];
  for (let l = 0; l < rungs.length; l++) {
    if (rungs[l][c]) { pts.push([c, l]); c++; pts.push([c, l]); }
    else if (c > 0 && rungs[l][c - 1]) { pts.push([c, l]); c--; pts.push([c, l]); }
  }
  pts.push([c, rungs.length]);
  return { pts, end: c };
}

function ladderGame(token) {
  const n = state.players.length;
  const taken = new Array(n).fill(-1);   // 자리 -> 참가자
  let turn = 0;

  function renderPick() {
    stage.innerHTML = `
      <p class="turn">${named(turn)} 차례 · 출발 자리를 고르세요</p>
      <div class="slots">${taken.map((p, c) => (p < 0
        ? `<button class="slot" data-c="${c}">${c + 1}</button>`
        : `<button class="slot taken" disabled>${avatar(p)}</button>`)).join('')}</div>
      <p class="hint">사다리와 결과는 모두 고른 뒤에 만들어집니다</p>`;
    $('.slots', stage).addEventListener('click', (e) => {
      const b = e.target.closest('[data-c]');
      if (!b) return;
      taken[+b.dataset.c] = turn++;
      buzz(15);
      sfx.step();
      if (turn === n - 1) { taken[taken.indexOf(-1)] = turn++; }   // 마지막 사람은 남은 자리
      if (turn >= n) run(); else renderPick();
    });
  }

  async function run() {
    const BASE = 10, EXTRA = 3;
    // 어쩌다 한 번: 첫 사람이 바닥에 닿는 순간 사다리가 더 길어진다. 늘어난 사다리 전체로
    // 결과가 정해지고 당첨 자리는 따로 고르게 섞으므로, 길어지든 아니든 확률은 모두 같다.
    const hasExt = rand(100) < SURPRISE.ladder;
    const rungs = buildLadder(n, BASE);
    if (hasExt) rungs.push(...extraRungs(n, EXTRA));
    const outcome = shuffle(Array.from({ length: n }, (_, i) => i === 0));   // 도착 자리별 당첨 여부 (당첨은 한 자리)
    const slotOf = new Array(n);
    taken.forEach((p, c) => { slotOf[p] = c; });
    const paths = [];                                                        // 참가자 순서대로, 사다리 끝까지
    const firstLeg = [];                                                     // 늘어나기 전 길이까지만
    for (let p = 0; p < n; p++) {
      paths.push(traceLadder(rungs, slotOf[p]));
      firstLeg.push(traceLadder(rungs.slice(0, BASE), slotOf[p]).pts);
    }
    const loser = paths.findIndex((path) => outcome[path.end]);
    let ext = 0;                                                             // 0: 원래 길이 → 1: 늘어난 길이

    stage.innerHTML = `
      <p class="turn" id="l-msg">사다리가 만들어졌습니다</p>
      <div class="board"><canvas id="ladder"></canvas></div>
      <button class="btn primary big" id="l-go">출발!</button>`;
    const msg = $('#l-msg');
    const W = stage.clientWidth;
    const H = Math.max(400, Math.min(540, Math.round(window.innerHeight * 0.58)));
    const ctx = setupCanvas($('#ladder'), W, H);
    const ar = n <= 5 ? 22 : n <= 7 ? 18 : 14;              // 캐릭터 반지름 — 인원이 적을수록 크게
    const padX = ar + 12;
    const top = ar * 2 + 22, bot = H - (ar * 2 + 26);
    const labelPx = n <= 5 ? 16 : n <= 7 ? 14 : 12;
    const X = (c) => padX + (c * (W - 2 * padX)) / (n - 1);
    // 늘어날 때는 위쪽 사다리가 줄어들며 아래에 새 칸이 생긴다
    const Y = (l) => (l < 0 ? top : Math.min(bot, top + ((l + 1) * (bot - top)) / (BASE + EXTRA * ext + 1)));
    const revealed = new Array(n).fill(false);

    function pathLen(pts) {
      let d = 0;
      for (let i = 1; i < pts.length; i++) d += Math.abs(X(pts[i][0]) - X(pts[i - 1][0])) + Math.abs(Y(pts[i][1]) - Y(pts[i - 1][1]));
      return d;
    }
    // 길을 len 만큼 그리고, 그 끝 지점과 몇 번째 구간인지 돌려준다
    function strokePath(pts, len, col, width, alpha) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = col; ctx.lineWidth = width;
      ctx.beginPath();
      let x = X(pts[0][0]), y = Y(pts[0][1]), seg = 0;
      ctx.moveTo(x, y);
      let left = len;
      for (let i = 1; i < pts.length && left > 0; i++) {
        const x0 = X(pts[i - 1][0]), y0 = Y(pts[i - 1][1]), x1 = X(pts[i][0]), y1 = Y(pts[i][1]);
        const d = Math.abs(x1 - x0) + Math.abs(y1 - y0);
        const t = d === 0 ? 1 : Math.min(1, left / d);
        x = x0 + (x1 - x0) * t; y = y0 + (y1 - y0) * t; seg = i;
        ctx.lineTo(x, y);
        left -= d;
      }
      ctx.stroke();
      ctx.restore();
      return { x, y, seg };
    }
    function pill(x, y, text, bg, fg) {
      const w = labelPx * 2 + 14, h = labelPx + 12, r = 9;
      ctx.beginPath();
      ctx.moveTo(x - w / 2 + r, y - h / 2);
      ctx.arcTo(x + w / 2, y - h / 2, x + w / 2, y + h / 2, r);
      ctx.arcTo(x + w / 2, y + h / 2, x - w / 2, y + h / 2, r);
      ctx.arcTo(x - w / 2, y + h / 2, x - w / 2, y - h / 2, r);
      ctx.arcTo(x - w / 2, y - h / 2, x + w / 2, y - h / 2, r);
      ctx.fillStyle = bg; ctx.fill();
      ctx.fillStyle = fg;
      ctx.font = `900 ${labelPx}px system-ui, sans-serif`;
      ctx.fillText(text, x, y + 1);
    }
    function strokeRungs(from, to) {
      ctx.beginPath();
      for (let l = from; l < to; l++) rungs[l].forEach((on, c) => { if (on) { ctx.moveTo(X(c), Y(l)); ctx.lineTo(X(c + 1), Y(l)); } });
      ctx.stroke();
    }
    // done: 도착한 사람 수, cur: 지금 내려가는 사람(-1 이면 없음), pts/len: 그 사람의 길과 내려간 거리
    function draw(done, cur, pts, len) {
      ctx.clearRect(0, 0, W, H);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = '#5a5596'; ctx.lineWidth = 5;
      ctx.beginPath();
      for (let c = 0; c < n; c++) { ctx.moveTo(X(c), top); ctx.lineTo(X(c), bot); }
      ctx.stroke();
      strokeRungs(0, BASE);
      if (ext > 0) {                                                       // 새로 생긴 칸은 노랗게 나타난다
        ctx.save();
        ctx.globalAlpha = ext; ctx.strokeStyle = '#ffd23f';
        strokeRungs(BASE, rungs.length);
        ctx.restore();
      }
      for (let p = 0; p < done; p++) strokePath(paths[p].pts, Infinity, color(p), 5, 0.85);
      let head = null;
      if (cur >= 0) {
        strokePath(pts, len, color(cur), 16, 0.25);                        // 빛나는 자국
        head = strokePath(pts, len, color(cur), 7, 1);
      }
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let c = 0; c < n; c++) {
        const p = taken[c];
        drawAvatar(ctx, X(c), ar + 8, ar, p, p < done || p === cur ? 0.3 : 1);   // 출발한 캐릭터는 흐리게
        const by = H - (ar + 12);
        if (!revealed[c]) {                                                // 아직 안 열린 상자
          ctx.font = `${Math.round(ar * 1.5)}px system-ui, sans-serif`;
          ctx.fillText('🎁', X(c), by);
        } else if (outcome[c]) pill(X(c), by, '당첨', '#ff4d4d', '#ffffff');
        else pill(X(c), by, '통과', '#3fd6a1', '#0b3527');
      }
      if (head) {
        ctx.beginPath(); ctx.arc(head.x, head.y, ar + 6, 0, TAU);
        ctx.fillStyle = `${color(cur)}66`; ctx.fill();
        drawAvatar(ctx, head.x, head.y, ar, cur);
      }
      for (let p = 0; p < done; p++) drawAvatar(ctx, X(paths[p].end), bot - ar * 0.4, ar * 0.8, p);   // 도착한 캐릭터
      return head;
    }
    draw(0, -1);

    await new Promise((res) => $('#l-go').addEventListener('click', res, { once: true }));
    if (token !== runToken) return;
    sfx.go();
    let skip = false;
    const go = $('#l-go');
    go.textContent = '결과 바로 보기';
    go.classList.remove('primary');
    go.addEventListener('click', () => { skip = true; }, { once: true });
    const stopped = () => skip || token !== runToken;

    // dur 동안 매 프레임 step(0..1)을 부른다. 건너뛰거나 화면을 떠나면 바로 끝난다
    const tween = (dur, step) => new Promise((res) => {
      const t0 = performance.now();
      (function frame(now) {
        if (stopped()) return res();
        const t = Math.min(1, (now - t0) / dur);
        step(t);
        if (t < 1) requestAnimationFrame(frame); else res();
      })(t0);
    });
    // p 가 pts 를 따라 from → to 거리만큼 내려간다. 꺾일 때마다 소리
    function descend(p, pts, from, to, dur) {
      let lastSeg = -1;
      return tween(dur, (t) => {
        const head = draw(p, p, pts, from + (to - from) * t);
        if (lastSeg >= 0 && head.seg !== lastSeg) sfx.step();
        lastSeg = head.seg;
      });
    }

    let done = 0;
    for (let p = 0; p < n && !stopped(); p++) {
      msg.innerHTML = `${named(p)} 내려가는 중…`;
      const full = paths[p].pts;
      if (hasExt && ext === 0) {                                           // 첫 사람: 바닥에 닿는 순간 사다리가 늘어난다
        const leg = firstLeg[p];
        await descend(p, leg, 0, pathLen(leg), 2400);
        if (stopped()) break;
        msg.innerHTML = '앗! 사다리가 <b style="color:#ffd23f">더 길어집니다</b>';
        sfx.twist();
        buzz([60, 40, 60]);
        await tween(900, (t) => { ext = t * t * (3 - 2 * t); draw(p, p, leg, Infinity); });
        if (stopped()) break;
        ext = 1;
        await sleep(350);
        if (stopped()) break;
        msg.innerHTML = `${named(p)} 더 내려가는 중…`;
        await descend(p, full, pathLen(leg), pathLen(full), 1100);
      } else {
        await descend(p, full, 0, pathLen(full), hasExt ? 3000 : 2400);
      }
      if (stopped()) break;
      revealed[paths[p].end] = true;
      done = p + 1;
      draw(done, -1);
      if (p === loser) break;                                             // 당첨 상자가 열리면 더 볼 것이 없다
      sfx.pass();
      buzz(15);
      await sleep(550);
    }
    if (token !== runToken) return;
    if (hasExt) ext = 1;
    revealed.fill(true);
    draw(done > loser ? done : n, -1);
    go.remove();
    msg.innerHTML = `${named(loser)} 상자에서 당첨!`;
    showResult(loser);
  }

  renderPick();
}

/* ================= 2. 룰렛 ================= */
function rouletteGame(token) {
  const n = state.players.length;
  const a = TAU / n;
  const mod = (x) => ((x % TAU) + TAU) % TAU;
  let rot = 0;
  let lit = 0;            // 테두리 전구 깜빡임 단계

  stage.innerHTML = `
    <p class="turn" id="r-msg">화살표에 멈춘 사람이 당첨</p>
    <div class="wheel-wrap"><div class="pointer"></div><canvas id="wheel"></canvas></div>
    <button class="btn primary big" id="spin">돌리기</button>`;
  const size = Math.min(stage.clientWidth, 360);
  const ctx = setupCanvas($('#wheel'), size, size);
  const msg = $('#r-msg');
  const btn = $('#spin');
  const pointer = $('.pointer', stage);
  const C = size / 2;
  const R = C - 22;                                   // 판 반지름 (바깥은 전구 테두리)
  const fr = Math.min(28, R * Math.sin(a / 2) * 0.5); // 칸 안 얼굴 크기

  function draw() {
    ctx.clearRect(0, 0, size, size);
    // 테두리와 전구 (판과 함께 돌지 않는다)
    ctx.beginPath(); ctx.arc(C, C, C - 2, 0, TAU);
    ctx.fillStyle = '#2a2656'; ctx.fill();
    ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 4; ctx.stroke();
    for (let k = 0; k < 20; k++) {
      const on = (k + lit) % 2 === 0;
      const t = (k * TAU) / 20;
      ctx.beginPath(); ctx.arc(C + (R + 10) * Math.cos(t), C + (R + 10) * Math.sin(t), on ? 5.5 : 4.5, 0, TAU);
      ctx.shadowColor = '#ffd23f'; ctx.shadowBlur = on ? 10 : 0;
      ctx.fillStyle = on ? '#fffbe0' : '#b8900a'; ctx.fill();
    }
    ctx.shadowBlur = 0;
    // 칸
    for (let i = 0; i < n; i++) {
      const a0 = rot - Math.PI / 2 + i * a;
      ctx.beginPath(); ctx.moveTo(C, C); ctx.arc(C, C, R, a0, a0 + a); ctx.closePath();
      ctx.fillStyle = color(i); ctx.fill();
      ctx.strokeStyle = '#14122b'; ctx.lineWidth = 3; ctx.stroke();
      const am = a0 + a / 2;                           // 얼굴은 판이 돌아도 늘 바로 선 채로
      const fx = C + R * 0.64 * Math.cos(am), fy = C + R * 0.64 * Math.sin(am);
      ctx.beginPath(); ctx.arc(fx, fy, fr, 0, TAU);
      ctx.fillStyle = '#ffffffe6'; ctx.fill();
      ctx.font = `${Math.round(fr * 1.2)}px system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#16122e';
      ctx.fillText(face(i), fx, fy + fr * 0.08);
    }
    // 입체감을 주는 가장자리 그늘과 가운데 축
    const shade = ctx.createRadialGradient(C, C, R * 0.55, C, C, R);
    shade.addColorStop(0, '#00000000'); shade.addColorStop(1, '#00000055');
    ctx.beginPath(); ctx.arc(C, C, R, 0, TAU); ctx.fillStyle = shade; ctx.fill();
    ctx.beginPath(); ctx.arc(C, C, 24, 0, TAU);
    ctx.fillStyle = '#14122b'; ctx.fill();
    ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 5; ctx.stroke();
  }

  btn.addEventListener('click', () => {
    btn.remove();
    sfx.go();
    msg.textContent = '두구두구…';
    const who = rand(n);                                 // 멈출 칸 = 당첨자
    const f = (8 + rand(85)) / 100;                      // 칸 안에서의 위치 (경계 바로 위는 피함)
    const to = TAU * (5 + rand(3)) + mod(-(who + f) * a);
    const dur = 10000;                                   // 마지막 3초쯤은 한두 칸을 기어가듯 넘어간다
    // 가끔: 거의 멈출 때쯤 한 바퀴 넘게 더 돈다. 멈출 칸(who)은 이미 정해져 있어 결과는 그대로다.
    const encore = rand(100) < SURPRISE.roulette;
    const to1 = encore ? to - TAU * (1 + rand(100) / 100) : to;    // 처음에 멈추는 척하는 자리
    const CUT = 0.86, MORE = 4400;
    const rot1 = to1 * (1 - Math.pow(1 - CUT, 3));
    let again = false;
    const t0 = performance.now();
    let lastTick = -1;
    let lastSound = 0;
    (function frame(now) {
      if (token !== runToken) return;
      let t = Math.min(1, (now - t0) / dur);
      let end = t >= 1;
      if (encore && t >= CUT) {
        if (!again) {
          again = true;
          msg.innerHTML = '<b style="color:#ffd23f">한 바퀴 더!</b>';
          sfx.twist();
          buzz([60, 40, 60]);
        }
        const u = Math.min(1, (now - t0 - dur * CUT) / MORE);
        rot = rot1 + (to - rot1) * (1 - Math.pow(1 - Math.pow(u, 1.6), 3));
        end = u >= 1;
        t = u < 0.5 ? 0 : u;                             // 다시 빨라진 동안은 바늘을 튕기지 않는다
      } else {
        rot = to1 * (1 - Math.pow(1 - t, 3));
        end = !encore && t >= 1;
      }
      lit = Math.floor((now - t0) / 170);
      const tick = Math.floor(mod(-rot) / a);
      if (tick !== lastTick) {
        lastTick = tick;
        if (now - lastSound > 45) { lastSound = now; sfx.tick(); }   // 칸이 넘어갈 때마다 딸깍
        if (t > 0.45) {                                              // 느려진 뒤로는 바늘도 튕긴다
          buzz(t > 0.7 ? 25 : 8);
          pointer.classList.remove('tick');
          void pointer.offsetWidth;
          pointer.classList.add('tick');
        }
      }
      draw();
      if (!end) return requestAnimationFrame(frame);
      msg.innerHTML = `${named(who)} 당첨!`;
      showResult(who);
    })(t0);
  }, { once: true });

  draw();
}

/* ================= 3. 달리기 경주 ================= */
// 경주 계획 — 순위는 여기서 균등하게 정해지고(모든 순서가 같은 확률), 화면의 달리기는
// 그 결과를 향해 가는 연출이다. 앞 75% 구간의 빠르기는 순위와 무관하게 뽑으므로
// 중간에 앞서 있다고 유리한 것이 아니고, 순위는 마지막 구간에서 갈린다.
function buildRace(n) {
  const order = shuffle(Array.from({ length: n }, (_, i) => i));   // order[r] = r+1등으로 들어올 참가자
  const finish = new Array(n);
  let t = 7200;
  order.forEach((p, r) => { if (r > 0) t += 250 + rand(201); finish[p] = t; });
  const SEG = 6;
  const runners = [];
  for (let p = 0; p < n; p++) {
    const t75 = 4600 + rand(901);                     // 75% 지점 통과 시각 (ms)
    const w = Array.from({ length: SEG }, () => 60 + rand(81));
    const sum = w.reduce((x, y) => x + y, 0);
    const pts = [[0, 0]];
    let d = 0;
    for (let j = 0; j < SEG; j++) { d += (w[j] / sum) * 0.75; pts.push([(t75 * (j + 1)) / SEG, d]); }
    const k = (35 + rand(31)) / 100;
    pts.push([t75 + (finish[p] - t75) * k, 0.75 + 0.25 * ((35 + rand(31)) / 100)]);
    pts.push([finish[p], 1]);
    runners.push(pts);
  }
  // 가끔: 앞 순위로 들어올 사람 하나가 뒤처져 있다가 부스터로 치고 나온다.
  // 순위(order)는 위에서 이미 정해졌고 여기서는 그 사람이 달리는 모양만 바꾼다.
  let boost = null;
  if (rand(100) < SURPRISE.race) {
    const p = order[rand(Math.max(1, Math.min(n - 1, Math.ceil(n / 2))))];
    const from = 4700 + rand(601);
    const to = from + 850;
    const w = Array.from({ length: SEG }, () => 60 + rand(81));
    const sum = w.reduce((x, y) => x + y, 0);
    const pts = [[0, 0]];
    let d = 0;
    for (let j = 0; j < SEG; j++) { d += (w[j] / sum) * 0.5; pts.push([(from * (j + 1)) / SEG, d]); }
    pts.push([to, 0.88]);
    pts.push([finish[p], 1]);
    runners[p] = pts;
    boost = { p, from, to };
  }
  return { order, finish, runners, boost };
}
function raceProgress(pts, t) {
  for (let i = 1; i < pts.length; i++) {
    if (t <= pts[i][0]) {
      const [t0, d0] = pts[i - 1];
      const [t1, d1] = pts[i];
      return d0 + ((d1 - d0) * (t - t0)) / (t1 - t0);
    }
  }
  return 1;
}

function raceGame(token) {
  const n = state.players.length;
  const laneH = n <= 5 ? 66 : n <= 7 ? 56 : 44;
  const chip = n <= 6 ? 34 : n <= 8 ? 28 : 22;        // 순위표 얼굴 크기
  stage.innerHTML = `
    <div class="rankbar" id="g-rank" style="--s:${chip}px"></div>
    <div class="stadium" style="--lane-h:${laneH}px">
      <div class="crowd"></div>
      ${state.players.map((_, p) => `<div class="lane"><i class="dust"></i>${avatar(p, 'runner')}<span class="rank"></span></div>`).join('')}
      <i class="tape"></i>
    </div>
    <p class="turn" id="g-msg">다 같이 출발 · 꼴찌가 당첨</p>
    <button class="btn primary big" id="g-go">출발!</button>`;
  const msg = $('#g-msg');
  const rankbar = $('#g-rank');
  const stadium = $('.stadium', stage);
  const lanes = [...stage.querySelectorAll('.lane')];
  const runnerEls = lanes.map((l) => $('.runner', l));
  const dusts = lanes.map((l) => $('.dust', l));
  const ranks = lanes.map((l) => $('.rank', l));
  const rw = runnerEls[0].offsetWidth;

  function place(p, pos) {
    const W = lanes[p].clientWidth;
    const front = rw + 6 + pos * (W - 56 - rw - 6);     // 달리는 캐릭터의 앞쪽 끝 — pos 1 이면 결승선
    runnerEls[p].style.transform = `translate(${front - rw}px, -50%)`;
    dusts[p].style.transform = `translateX(${front - rw * 1.75}px)`;
  }
  // 위쪽 순위표: 들어온 사람은 등수 고정, 달리는 사람은 지금 위치 순
  function showRanks(list, loser = -1) {
    rankbar.innerHTML = list.map((p, r) => `<span class="${p === loser ? 'last' : ''}"><i>${p === loser ? '꼴찌' : r + 1}</i>${avatar(p)}</span>`).join('');
  }
  for (let p = 0; p < n; p++) place(p, 0);
  showRanks(state.players.map((_, p) => p));

  $('#g-go').addEventListener('click', (e) => {
    e.currentTarget.remove();
    sfx.go();
    const plan = buildRace(n);
    const boost = plan.boost;
    let boosting = false;
    stadium.classList.add('running');
    const t0 = performance.now();
    let arrived = 0;
    let lastTalk = -1000;
    let lastHoof = 0;
    (function frame(now) {
      if (token !== runToken) return;
      const t = now - t0;
      const pos = plan.runners.map((pts) => raceProgress(pts, t));
      for (let p = 0; p < n; p++) place(p, pos[p]);
      if (t - lastHoof > 130) { lastHoof = t; sfx.hoof(); }
      if (boost) {
        const on = t >= boost.from && t < boost.to;
        if (on && !boosting) { sfx.twist(); buzz([60, 40, 60]); }
        if (on !== boosting) { boosting = on; runnerEls[boost.p].classList.toggle('boost', on); lastTalk = -1000; }
      }
      while (arrived < n - 1 && t >= plan.finish[plan.order[arrived]]) {
        const p = plan.order[arrived++];
        ranks[p].textContent = `${arrived}등`;
        runnerEls[p].classList.add('done');
        dusts[p].hidden = true;
        sfx.pass();
        buzz(12);
      }
      const running = plan.order.slice(arrived).sort((x, y) => pos[y] - pos[x]);
      if (arrived >= n - 1) {                           // 한 명만 남으면 그 사람이 꼴찌
        const loser = plan.order[n - 1];
        stadium.classList.remove('running');
        lanes[loser].classList.add('lose');
        ranks[loser].textContent = '꼴찌';
        showRanks(plan.order, loser);
        msg.innerHTML = `${named(loser)} 꼴찌!`;
        showResult(loser);
        return;
      }
      if (t - lastTalk > 350) {
        lastTalk = t;
        showRanks([...plan.order.slice(0, arrived), ...running]);
        if (boosting) msg.innerHTML = `🔥 ${named(boost.p)} 부스터!`;
        else if (arrived === 0) msg.innerHTML = `${named(running[0])} 선두 · ${named(running[n - 1])} 위험`;
        else msg.textContent = `${arrived}명 도착 · 남은 ${n - arrived}명 중 꼴찌는?`;
      }
      requestAnimationFrame(frame);
    })(t0);
  }, { once: true });
}

const GAMES = {
  ladder: { title: '사다리 타기', start: ladderGame },
  roulette: { title: '룰렛', start: rouletteGame },
  race: { title: '달리기 경주', start: raceGame },
};

renderSound();
renderPlayers();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => { /* 오프라인 지원만 빠짐 */ });
}
