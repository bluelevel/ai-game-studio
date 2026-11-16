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
    const padX = n > 6 ? 24 : 40;
    const top = 48, bot = H - 48;
    const labelPx = n <= 4 ? 19 : n <= 6 ? 17 : 14;      // 이름·당첨/통과 글씨 — 인원이 적을수록 크게
    const X = (c) => padX + (c * (W - 2 * padX)) / (n - 1);
    const Y = (l) => (l < 0 ? top : l >= LEVELS ? bot : top + ((l + 1) * (bot - top)) / (LEVELS + 1));
    const nameMax = n > 8 ? 2 : n > 5 ? 3 : 4;
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
      ctx.font = `900 ${labelPx}px system-ui, sans-serif`;
      for (let c = 0; c < n; c++) {
        ctx.fillStyle = color(taken[c]);
        ctx.fillText(fitText(pname(taken[c]), nameMax), X(c), 22);
        if (revealed[c]) {
          ctx.fillStyle = outcome[c] ? '#ff5d5d' : '#3fd6a1';
          ctx.fillText(outcome[c] ? '당첨' : '통과', X(c), H - 22);
        } else {
          ctx.fillStyle = '#736ea6';
          ctx.fillText('?', X(c), H - 22);
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
      ctx.font = `900 ${n <= 5 ? 24 : n <= 7 ? 20 : 16}px system-ui, sans-serif`;
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
  return { order, finish, runners };
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
  const laneH = n <= 5 ? 62 : n <= 7 ? 52 : 42;
  stage.innerHTML = `
    <p class="turn" id="g-msg">다 같이 출발 · 꼴찌가 당첨</p>
    <div class="race" style="--lane-h:${laneH}px">${state.players.map((_, p) => `
      <div class="lane">
        <span class="lane-name" style="color:${color(p)}">${esc(fitText(pname(p), 3))}</span>
        <div class="track">
          <div class="trail" style="background:${color(p)}"></div>
          <span class="runner" style="background:${color(p)}"><span>🐎</span></span>
          <i class="finish"></i>
        </div>
        <span class="rank"></span>
      </div>`).join('')}</div>
    <button class="btn primary big" id="g-go">출발!</button>`;
  const msg = $('#g-msg');
  const lanes = [...stage.querySelectorAll('.lane')];
  const tracks = lanes.map((l) => $('.track', l));
  const runnerEls = lanes.map((l) => $('.runner', l));
  const trails = lanes.map((l) => $('.trail', l));
  const ranks = lanes.map((l) => $('.rank', l));

  function place(p, pos) {
    const W = tracks[p].clientWidth;
    const rw = runnerEls[p].offsetWidth;
    const front = rw + 4 + pos * (W - 20 - rw - 4);     // 달리는 말의 앞쪽 끝 — pos 1 이면 결승선
    runnerEls[p].style.transform = `translate(${front - rw}px, -50%)`;
    trails[p].style.width = `${Math.max(0, front - rw / 2)}px`;
  }
  for (let p = 0; p < n; p++) place(p, 0);

  $('#g-go').addEventListener('click', (e) => {
    e.currentTarget.remove();
    const plan = buildRace(n);
    const raceEl = $('.race', stage);
    raceEl.classList.add('running');
    const t0 = performance.now();
    let arrived = 0;
    let lastTalk = -1000;
    (function frame(now) {
      if (token !== runToken) return;
      const t = now - t0;
      const pos = plan.runners.map((pts) => raceProgress(pts, t));
      for (let p = 0; p < n; p++) place(p, pos[p]);
      while (arrived < n - 1 && t >= plan.finish[plan.order[arrived]]) {
        const p = plan.order[arrived++];
        ranks[p].textContent = `${arrived}등`;
        runnerEls[p].classList.add('done');
        buzz(12);
      }
      if (arrived >= n - 1) {                           // 한 명만 남으면 그 사람이 꼴찌
        const loser = plan.order[n - 1];
        raceEl.classList.remove('running');
        lanes[loser].classList.add('lose');
        ranks[loser].textContent = '꼴찌';
        msg.innerHTML = `<b style="color:${color(loser)}">${esc(pname(loser))}</b> 꼴찌!`;
        showResult(loser);
        return;
      }
      if (t - lastTalk > 450) {
        lastTalk = t;
        if (arrived === 0) {
          const lead = pos.indexOf(Math.max(...pos));
          msg.innerHTML = `<b style="color:${color(lead)}">${esc(pname(lead))}</b> 선두`;
        } else {
          msg.textContent = `${arrived}명 도착 · 남은 ${n - arrived}명 중 꼴찌는?`;
        }
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

renderPlayers();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => { /* 오프라인 지원만 빠짐 */ });
}
