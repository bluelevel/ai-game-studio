'use strict';

/* ================= 공통 ================= */
const $ = (sel, el = document) => el.querySelector(sel);
// 앞 순서일수록 서로 확 다른 색이 오도록 배치 (2명: 빨강·파랑, 3명: +노랑, 4명: +초록 …)
const PALETTE = ['#ff4d4d', '#3d9bff', '#ffe14d', '#4fd65a', '#c06bff', '#ff9a3d', '#2fd6c8', '#ff7ab8', '#e8ecf5', '#b08968'];
const MIN_P = 2;
const MAX_P = 10;
const STORE_KEY = 'bokbulbok-v1';

function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (s && Array.isArray(s.players) && s.players.length >= MIN_P) {
      return { players: s.players.slice(0, MAX_P).map(String) };
    }
  } catch (e) { /* 저장소를 못 쓰는 환경이면 기본값 사용 */ }
  return { players: ['', '', ''] };
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
const pname = (i) => state.players[i].trim() || `${i + 1}번`;
const color = (i) => PALETTE[i % PALETTE.length];
const buzz = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) { /* 무시 */ } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
      <span class="dot" style="background:${color(i)}"></span>
      <input data-i="${i}" value="${esc(p)}" maxlength="8" placeholder="${i + 1}번" aria-label="참가자 ${i + 1} 이름" enterkeyhint="done" autocomplete="off">
      <button class="icon-btn" data-del="${i}" aria-label="참가자 ${i + 1} 삭제" ${n <= MIN_P ? 'disabled' : ''}>✕</button>
    </li>`).join('');
  $('#player-count').textContent = `${n}명`;
  $('#add-player').disabled = n >= MAX_P;
}
$('#players').addEventListener('input', (e) => {
  const i = e.target.dataset.i;
  if (i !== undefined) { state.players[+i] = e.target.value; persist(); }
});
$('#players').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-del]');
  if (!btn || state.players.length <= MIN_P) return;
  state.players.splice(+btn.dataset.del, 1);
  persist(); renderPlayers();
});
$('#add-player').addEventListener('click', () => {
  if (state.players.length >= MAX_P) return;
  state.players.push('');
  persist(); renderPlayers();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.target.blur(); });

function goHome() {
  runToken++;
  currentGame = null;
  gameEl.hidden = true;
  homeEl.hidden = false;
  renderPlayers();
  window.scrollTo(0, 0);
}
function startGame(id) {
  runToken++;
  currentGame = id;
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

function showResult(who) {
  buzz([120, 60, 240]);
  const el = document.createElement('section');
  el.className = 'result';
  el.innerHTML = `
    <p class="result-label">당첨</p>
    <p class="result-name" style="color:${color(who)}">${esc(pname(who))}</p>
    <div class="row">
      <button class="btn primary" data-act="again">한 번 더</button>
      <button class="btn" data-act="home">게임 고르기</button>
    </div>`;
  el.addEventListener('click', (e) => {
    const act = e.target.dataset.act;
    if (act === 'again') startGame(currentGame);
    if (act === 'home') goHome();
  });
  stage.appendChild(el);
  el.scrollIntoView({ behavior: 'smooth', block: 'end' });
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
function fitText(s, max) { return [...s].length > max ? [...s].slice(0, max).join('') : s; }

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
      <p class="turn"><b style="color:${color(turn)}">${esc(pname(turn))}</b> 차례 · 출발 자리를 고르세요</p>
      <div class="slots">${taken.map((p, c) => (p < 0
        ? `<button class="slot" data-c="${c}">${c + 1}</button>`
        : `<button class="slot taken" disabled style="--c:${color(p)}">${esc(pname(p))}</button>`)).join('')}</div>
      <p class="hint">사다리와 결과는 모두 고른 뒤에 만들어집니다</p>`;
    $('.slots', stage).addEventListener('click', (e) => {
      const b = e.target.closest('[data-c]');
      if (!b) return;
      taken[+b.dataset.c] = turn++;
      buzz(15);
      if (turn === n - 1) { taken[taken.indexOf(-1)] = turn++; }   // 마지막 사람은 남은 자리
      if (turn >= n) run(); else renderPick();
    });
  }

  async function run() {
    const LEVELS = 10;
    const rungs = buildLadder(n, LEVELS);
    const outcome = shuffle(Array.from({ length: n }, (_, i) => i === 0));   // 도착 자리별 당첨 여부 (당첨은 한 자리)
    const paths = [];                                                        // 참가자 순서대로
    const slotOf = new Array(n);
    taken.forEach((p, c) => { slotOf[p] = c; });
    for (let p = 0; p < n; p++) paths.push(traceLadder(rungs, slotOf[p]));

    stage.innerHTML = `
      <p class="turn" id="l-msg">사다리가 만들어졌습니다</p>
      <div class="ladder-wrap"><canvas id="ladder"></canvas></div>
      <button class="btn primary big" id="l-go">출발!</button>`;
    const W = stage.clientWidth;
    const H = Math.max(340, Math.min(480, Math.round(window.innerHeight * 0.55)));
    const ctx = setupCanvas($('#ladder'), W, H);
    const padX = n > 6 ? 22 : 36;
    const top = 40, bot = H - 40;
    const X = (c) => padX + (c * (W - 2 * padX)) / (n - 1);
    const Y = (l) => (l < 0 ? top : l >= LEVELS ? bot : top + ((l + 1) * (bot - top)) / (LEVELS + 1));
    const nameMax = n > 7 ? 2 : n > 5 ? 3 : 4;
    const revealed = new Array(n).fill(false);

    function pathLen(pts) {
      let d = 0;
      for (let i = 1; i < pts.length; i++) d += Math.abs(X(pts[i][0]) - X(pts[i - 1][0])) + Math.abs(Y(pts[i][1]) - Y(pts[i - 1][1]));
      return d;
    }
    function strokePath(pts, len, col) {
      ctx.strokeStyle = col; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(X(pts[0][0]), Y(pts[0][1]));
      let left = len;
      for (let i = 1; i < pts.length && left > 0; i++) {
        const x0 = X(pts[i - 1][0]), y0 = Y(pts[i - 1][1]), x1 = X(pts[i][0]), y1 = Y(pts[i][1]);
        const seg = Math.abs(x1 - x0) + Math.abs(y1 - y0);
        const t = seg === 0 ? 1 : Math.min(1, left / seg);
        ctx.lineTo(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
        left -= seg;
      }
      ctx.stroke();
    }
    function draw(done, cur, curLen) {
      ctx.clearRect(0, 0, W, H);
      ctx.strokeStyle = '#4a467f'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath();
      for (let c = 0; c < n; c++) { ctx.moveTo(X(c), top); ctx.lineTo(X(c), bot); }
      rungs.forEach((row, l) => row.forEach((on, c) => { if (on) { ctx.moveTo(X(c), Y(l)); ctx.lineTo(X(c + 1), Y(l)); } }));
      ctx.stroke();
      for (let p = 0; p < done; p++) strokePath(paths[p].pts, Infinity, color(p));
      if (cur >= 0) strokePath(paths[cur].pts, curLen, color(cur));
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '800 13px system-ui, sans-serif';
      for (let c = 0; c < n; c++) {
        ctx.fillStyle = color(taken[c]);
        ctx.fillText(fitText(pname(taken[c]), nameMax), X(c), 18);
        if (revealed[c]) {
          ctx.fillStyle = outcome[c] ? '#ff5d5d' : '#3fd6a1';
          ctx.fillText(outcome[c] ? '당첨' : '통과', X(c), H - 18);
        } else {
          ctx.fillStyle = '#736ea6';
          ctx.fillText('?', X(c), H - 18);
        }
      }
    }
    draw(0, -1, 0);

    await new Promise((res) => $('#l-go').addEventListener('click', res, { once: true }));
    if (token !== runToken) return;
    let skip = false;
    const go = $('#l-go');
    go.textContent = '결과 바로 보기';
    go.classList.remove('primary');
    go.addEventListener('click', () => { skip = true; }, { once: true });

    for (let p = 0; p < n && !skip; p++) {
      $('#l-msg').innerHTML = `<b style="color:${color(p)}">${esc(pname(p))}</b> 내려가는 중…`;
      const total = pathLen(paths[p].pts);
      const dur = 2400;
      const t0 = performance.now();
      await new Promise((res) => {
        (function frame(now) {
          if (token !== runToken) return res();
          const t = Math.min(1, (now - t0) / dur);
          draw(p, p, total * t);
          if (t < 1 && !skip) requestAnimationFrame(frame); else res();
        })(t0);
      });
      if (token !== runToken) return;
      revealed[paths[p].end] = true;
      draw(p + 1, -1, 0);
      if (outcome[paths[p].end]) buzz(80);
      if (!skip) await sleep(550);
    }
    if (token !== runToken) return;
    revealed.fill(true);
    draw(n, -1, 0);
    go.remove();
    $('#l-msg').textContent = '결과가 나왔습니다';
    showResult(paths.findIndex((path) => outcome[path.end]));
  }

  renderPick();
}

/* ================= 2. 룰렛 ================= */
function rouletteGame(token) {
  const n = state.players.length;
  const TAU = Math.PI * 2;
  const a = TAU / n;
  const mod = (x) => ((x % TAU) + TAU) % TAU;
  let rot = 0;

  stage.innerHTML = `
    <p class="turn" id="r-msg">화살표에 멈춘 사람이 당첨</p>
    <div class="wheel-wrap"><div class="pointer"></div><canvas id="wheel"></canvas></div>
    <button class="btn primary big" id="spin">돌리기</button>`;
  const size = Math.min(stage.clientWidth, 360);
  const ctx = setupCanvas($('#wheel'), size, size);
  const msg = $('#r-msg');
  const btn = $('#spin');
  const pointer = $('.pointer', stage);

  function draw() {
    const R = size / 2 - 6;
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.rotate(rot - Math.PI / 2);
    for (let i = 0; i < n; i++) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, R, i * a, (i + 1) * a);
      ctx.closePath();
      ctx.fillStyle = color(i);
      ctx.fill();
      ctx.strokeStyle = '#14122b'; ctx.lineWidth = 3; ctx.stroke();
      ctx.save();
      ctx.rotate((i + 0.5) * a);
      ctx.fillStyle = '#16122e';
      ctx.font = `900 ${n > 7 ? 14 : 18}px system-ui, sans-serif`;
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(fitText(pname(i), 5), R - 14, 0);
      ctx.restore();
    }
    ctx.beginPath(); ctx.arc(0, 0, 22, 0, TAU);
    ctx.fillStyle = '#14122b'; ctx.fill();
    ctx.strokeStyle = '#f4f1ff'; ctx.lineWidth = 4; ctx.stroke();
    ctx.restore();
  }

  btn.addEventListener('click', () => {
    btn.remove();
    msg.textContent = '두구두구…';
    const who = rand(n);                                 // 멈출 칸 = 당첨자
    const f = (8 + rand(85)) / 100;                      // 칸 안에서의 위치 (경계 바로 위는 피함)
    const to = TAU * (5 + rand(3)) + mod(-(who + f) * a);
    const dur = 10000;                                   // 마지막 3초쯤은 한두 칸을 기어가듯 넘어간다
    const t0 = performance.now();
    let lastTick = -1;
    (function frame(now) {
      if (token !== runToken) return;
      const t = Math.min(1, (now - t0) / dur);
      rot = to * (1 - Math.pow(1 - t, 3));
      const tick = Math.floor(mod(-rot) / a);
      if (tick !== lastTick) {
        lastTick = tick;
        if (t > 0.45) {                                    // 느려진 뒤로는 칸이 넘어갈 때마다 바늘이 튕긴다
          buzz(t > 0.7 ? 25 : 8);
          pointer.classList.remove('tick');
          void pointer.offsetWidth;
          pointer.classList.add('tick');
        }
      }
      draw();
      if (t < 1) return requestAnimationFrame(frame);
      msg.innerHTML = `<b style="color:${color(who)}">${esc(pname(who))}</b> 당첨!`;
      showResult(who);
    })(t0);
  }, { once: true });

  draw();
}

const GAMES = {
  ladder: { title: '사다리 타기', start: ladderGame },
  roulette: { title: '룰렛', start: rouletteGame },
};

renderPlayers();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => { /* 오프라인 지원만 빠짐 */ });
}
