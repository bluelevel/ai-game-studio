'use strict';

/* ================= 공통 ================= */
const $ = (sel, el = document) => el.querySelector(sel);
const PALETTE = ['#ff5d5d', '#ffb84d', '#ffe14d', '#7ddc5a', '#3fd6c1', '#4da6ff', '#8f7bff', '#e06bff', '#ff7ab8', '#c3cad9'];
const MIN_P = 2;
const MAX_P = 10;
const STORE_KEY = 'bokbulbok-v1';

function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (s && Array.isArray(s.players) && s.players.length >= MIN_P) {
      return { players: s.players.slice(0, MAX_P).map(String), losers: Number(s.losers) || 1, penalty: String(s.penalty || '') };
    }
  } catch (e) { /* 저장소를 못 쓰는 환경이면 기본값 사용 */ }
  return { players: ['', '', ''], losers: 1, penalty: '' };
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
const loserCount = () => Math.max(1, Math.min(state.losers, state.players.length - 1));
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
  renderLosers();
}
function renderLosers() {
  const k = loserCount();
  $('#loser-count').textContent = k;
  $('#loser-minus').disabled = k <= 1;
  $('#loser-plus').disabled = k >= state.players.length - 1;
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
$('#loser-minus').addEventListener('click', () => { state.losers = loserCount() - 1; persist(); renderLosers(); });
$('#loser-plus').addEventListener('click', () => { state.losers = loserCount() + 1; persist(); renderLosers(); });
$('#penalty').value = state.penalty;
$('#penalty').addEventListener('input', (e) => { state.penalty = e.target.value; persist(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') e.target.blur(); });

function goHome() {
  runToken++;
  currentGame = null;
  document.body.classList.remove('boom');
  gameEl.hidden = true;
  homeEl.hidden = false;
  renderPlayers();
  window.scrollTo(0, 0);
}
function startGame(id) {
  runToken++;
  currentGame = id;
  document.body.classList.remove('boom');
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

function showResult(losers) {
  buzz([120, 60, 240]);
  const el = document.createElement('section');
  el.className = 'result';
  el.innerHTML = `
    <p class="result-label">${state.penalty.trim() ? esc(state.penalty.trim()) : '당첨'}</p>
    <ul>${losers.map((i) => `<li style="--c:${color(i)}">${esc(pname(i))}</li>`).join('')}</ul>
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
  const k = loserCount();
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
    const outcome = shuffle(Array.from({ length: n }, (_, i) => i < k));   // 도착 자리별 당첨 여부
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
      const dur = 1500;
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
      if (!skip) await sleep(350);
    }
    if (token !== runToken) return;
    revealed.fill(true);
    draw(n, -1, 0);
    go.remove();
    const losers = [];
    for (let p = 0; p < n; p++) if (outcome[paths[p].end]) losers.push(p);
    $('#l-msg').textContent = '결과가 나왔습니다';
    showResult(losers);
  }

  renderPick();
}

/* ================= 2. 룰렛 ================= */
function rouletteGame(token) {
  const k = loserCount();
  let remaining = state.players.map((_, i) => i);
  const losers = [];
  let rot = 0;
  let spinning = false;

  stage.innerHTML = `
    <p class="turn" id="r-msg"></p>
    <div class="wheel-wrap"><div class="pointer"></div><canvas id="wheel"></canvas></div>
    <button class="btn primary big" id="spin">돌리기</button>`;
  const size = Math.min(stage.clientWidth, 360);
  const ctx = setupCanvas($('#wheel'), size, size);
  const msg = $('#r-msg');
  const btn = $('#spin');

  function setMsg() {
    msg.textContent = k > 1 ? `${k}명 중 ${losers.length + 1}번째 당첨자를 뽑습니다` : '화살표에 멈춘 사람이 당첨';
  }
  function draw() {
    const m = remaining.length;
    const a = (Math.PI * 2) / m;
    const R = size / 2 - 6;
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.rotate(rot - Math.PI / 2);
    for (let i = 0; i < m; i++) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, R, i * a, (i + 1) * a);
      ctx.closePath();
      ctx.fillStyle = color(remaining[i]);
      ctx.fill();
      ctx.strokeStyle = '#14122b'; ctx.lineWidth = 3; ctx.stroke();
      ctx.save();
      ctx.rotate((i + 0.5) * a);
      ctx.fillStyle = '#16122e';
      ctx.font = `900 ${m > 7 ? 14 : 18}px system-ui, sans-serif`;
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(fitText(pname(remaining[i]), 5), R - 14, 0);
      ctx.restore();
    }
    ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI * 2);
    ctx.fillStyle = '#14122b'; ctx.fill();
    ctx.strokeStyle = '#f4f1ff'; ctx.lineWidth = 4; ctx.stroke();
    ctx.restore();
  }

  btn.addEventListener('click', () => {
    if (spinning) return;
    spinning = true;
    btn.disabled = true;
    const m = remaining.length;
    const a = (Math.PI * 2) / m;
    const w = rand(m);                                   // 멈출 칸
    const f = (12 + rand(77)) / 100;                     // 칸 안에서의 위치 (경계는 피함)
    const TAU = Math.PI * 2;
    const mod = (x) => ((x % TAU) + TAU) % TAU;
    const from = rot;
    const to = from + TAU * (5 + rand(3)) + mod(-(w + f) * a - mod(from));
    const dur = 4600;
    const t0 = performance.now();
    let lastTick = -1;
    (function frame(now) {
      if (token !== runToken) return;
      const t = Math.min(1, (now - t0) / dur);
      rot = from + (to - from) * (1 - Math.pow(1 - t, 4));
      const tick = Math.floor(mod(-rot) / a);
      if (tick !== lastTick) { lastTick = tick; if (t > 0.6) buzz(8); }
      draw();
      if (t < 1) return requestAnimationFrame(frame);
      const who = remaining[w];
      losers.push(who);
      msg.innerHTML = `<b style="color:${color(who)}">${esc(pname(who))}</b> 당첨!`;
      if (losers.length >= k) {
        btn.remove();
        showResult(losers);
        return;
      }
      buzz(120);
      setTimeout(() => {
        if (token !== runToken) return;
        remaining = remaining.filter((p) => p !== who);
        rot = 0;
        draw();
        setMsg();
        btn.textContent = '한 명 더 돌리기';
        btn.disabled = false;
        spinning = false;
      }, 1400);
    })(t0);
  });

  setMsg();
  draw();
}

/* ================= 3. 카드 뽑기 ================= */
function cardGame(token) {
  const n = state.players.length;
  const k = loserCount();
  const deck = shuffle(Array.from({ length: n }, (_, i) => i < k));   // true = 당첨 카드
  const owner = new Array(n).fill(-1);
  const losers = [];
  let turn = 0;
  let locked = false;
  const cols = n <= 4 ? 2 : n <= 9 ? 3 : 4;

  stage.innerHTML = `
    <p class="turn" id="c-msg"></p>
    <div class="cards" style="--cols:${cols}">${deck.map((_, c) => `
      <button class="card" data-c="${c}" aria-label="카드 ${c + 1}">
        <span class="card-in"><span class="face front">?</span><span class="face back"></span></span>
      </button>`).join('')}</div>
    <p class="hint">당첨 카드 ${k}장 · 순서대로 한 장씩 고르세요</p>`;
  const msg = $('#c-msg');
  const cardEls = [...stage.querySelectorAll('.card')];

  function setMsg() { msg.innerHTML = `<b style="color:${color(turn)}">${esc(pname(turn))}</b> 차례 · 카드를 고르세요`; }
  function flip(c, who, dim) {
    owner[c] = who;
    const el = cardEls[c];
    el.disabled = true;
    $('.back', el).innerHTML = `<span class="mark">${deck[c] ? '💥' : '😌'}</span>${who >= 0 ? `<span class="who" style="color:${color(who)}">${esc(pname(who))}</span>` : ''}`;
    el.classList.add('flipped', deck[c] ? 'bad' : 'ok');
    if (dim) el.classList.add('dim');
  }
  function finish() {
    locked = true;
    msg.textContent = '결과가 나왔습니다';
    setTimeout(() => { if (token === runToken) showResult(losers); }, 700);
  }

  $('.cards', stage).addEventListener('click', (e) => {
    const el = e.target.closest('.card');
    if (!el || locked || owner[+el.dataset.c] >= 0) return;
    const c = +el.dataset.c;
    flip(c, turn, false);
    if (deck[c]) { losers.push(turn); buzz(100); } else buzz(15);
    turn++;
    const cardsLeft = n - turn;
    const badLeft = k - losers.length;
    if (badLeft === 0) {
      // 당첨 카드가 다 나왔으면 나머지는 안전 — 뒤집어서 보여 주고 끝
      owner.forEach((o, i) => { if (o < 0) flip(i, -1, true); });
      finish();
    } else if (cardsLeft === badLeft) {
      // 남은 카드가 전부 당첨이면 남은 사람 모두 당첨
      owner.forEach((o, i) => { if (o < 0) { flip(i, turn, false); losers.push(turn); turn++; } });
      finish();
    } else {
      setMsg();
    }
  });

  setMsg();
}

/* ================= 4. 시한폭탄 ================= */
// 공정성: 한 차례에 정확히 한 번만 누른다(선택 없음). 처음 두 바퀴(2n번)는 절대 터지지 않고,
// 그다음 두 바퀴(2n+1 ~ 4n번째) 중 한 칸에서 균등하게 터진다. 자리마다 정확히 2칸씩이므로
// 누가 먼저 시작하든 모두 1/n 이고, 시작하는 사람도 무작위로 뽑는다.
function bombGame(token) {
  const n = state.players.length;
  const fuse = 2 * n + 1 + rand(2 * n);   // 터지는 누름 횟수: 2n+1 ~ 4n (정확히 두 바퀴 = 자리마다 2칸씩), 아무도 모름
  let turn = rand(n);
  let total = 0;
  let over = false;
  let cooling = false;                    // 넘겨받기 전에 같은 사람이 연달아 누르는 것 방지

  stage.innerHTML = `
    <p class="turn" id="b-msg"></p>
    <button class="bomb-btn" id="bomb" aria-label="폭탄 누르기">💣</button>
    <p class="hint">한 사람이 한 번씩 누르고 다음 사람에게 넘깁니다 · 시작 순서와 터지는 시점은 무작위 · 1명만 걸리는 게임</p>`;
  const msg = $('#b-msg');
  const bomb = $('#bomb');

  function update() {
    msg.innerHTML = `<b style="color:${color(turn)}">${esc(pname(turn))}</b> 차례 · 한 번 누르세요 <span class="muted">(${total}번째까지 무사)</span>`;
  }
  bomb.addEventListener('click', () => {
    if (over || cooling || token !== runToken) return;
    total++;
    if (total >= fuse) {
      over = true;
      bomb.textContent = '💥';
      bomb.classList.add('exploded');
      bomb.disabled = true;
      document.body.classList.add('boom');
      msg.innerHTML = `<b style="color:${color(turn)}">${esc(pname(turn))}</b> 손에서 터졌습니다!`;
      showResult([turn]);
      return;
    }
    buzz(20);
    bomb.classList.remove('shake');
    void bomb.offsetWidth;
    bomb.classList.add('shake');
    turn = (turn + 1) % n;
    update();
    cooling = true;
    setTimeout(() => { cooling = false; }, 450);
  });

  update();
}

const GAMES = {
  ladder: { title: '사다리 타기', start: ladderGame },
  roulette: { title: '룰렛', start: rouletteGame },
  cards: { title: '카드 뽑기', start: cardGame },
  bomb: { title: '시한폭탄', start: bombGame },
};

renderPlayers();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => { /* 오프라인 지원만 빠짐 */ });
}
