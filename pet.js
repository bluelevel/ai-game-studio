'use strict';
/* ================= 말랑이 키우기 =================
   복불복 게임이 아니라 혼자 키우는 펫. app.js 의 $, sfx, esc, rand, runToken, homeEl 을 쓴다.
   시간은 실제 시각으로 흐른다 — 앱을 꺼 둔 동안 지난 시간도 다시 열 때 한꺼번에 반영한다. */
const PET_KEY = 'bokbulbok-pet-v1';
const PET_COLORS = ['#ffb3c7', '#9ad7ff', '#ffd98a', '#a8e6a1', '#d4b3ff', '#ffc29a'];
const HOUR = 3600000;
// 한 시간에 줄어드는(+는 늘어나는) 양 — [깨어 있을 때, 잘 때]
const RATE = {
  food: [-6, -3],     // 배부름: 깨어 있으면 17시간쯤에 바닥
  joy: [-5, 0],       // 기분
  clean: [-4, -2],    // 깨끗함 (똥 하나마다 깨어 있을 때 -4 더)
  energy: [-5, 25],   // 기운: 자면 4시간이면 가득
};
const STATS = [
  ['food', '🍙', '배부름'],
  ['joy', '💛', '기분'],
  ['clean', '🫧', '깨끗함'],
  ['energy', '⚡', '기운'],
];
const clamp = (x) => Math.max(0, Math.min(100, x));

function newPet() {
  return { stage: 'egg', taps: 0, name: '말랑이', color: PET_COLORS[rand(PET_COLORS.length)], born: 0, last: Date.now(),
    food: 80, joy: 80, clean: 90, energy: 90, sleeping: false, poops: 0, poopAt: [], sickMin: 0, sick: false };
}
function loadPet() {
  let p = null;
  try { p = JSON.parse(localStorage.getItem(PET_KEY) || 'null'); } catch (e) { /* 기본값 */ }
  if (!p || typeof p !== 'object') return newPet();
  const d = newPet();
  for (const k of Object.keys(d)) if (typeof p[k] !== typeof d[k]) p[k] = d[k];
  if (!Array.isArray(p.poopAt)) p.poopAt = [];
  return p;
}
let pet = loadPet();
const savePet = () => { try { localStorage.setItem(PET_KEY, JSON.stringify(pet)); } catch (e) { /* 무시 */ } };

// 자란 정도 — 태어난 지 하루까지 아기, 사흘까지 어린이, 그 뒤로 어른
function growth(now = Date.now()) {
  if (pet.stage === 'egg') return 'egg';
  const age = now - pet.born;
  return age < 24 * HOUR ? 'baby' : age < 72 * HOUR ? 'child' : 'adult';
}
const GROWTH_NAME = { egg: '알', baby: '아기', child: '어린이', adult: '어른' };

// 지난 시간만큼 상태를 바꾼다. 오래 꺼 두었으면 10분 단위로 나눠 계산 (자다가 기운이 차면 깨어나도록)
function petTick(now = Date.now()) {
  if (pet.stage === 'egg') { pet.last = now; return; }
  let left = Math.max(0, now - pet.last);
  let t = pet.last;
  while (left > 0) {
    const step = Math.min(left, 10 * 60000);
    const h = step / HOUR;
    t += step; left -= step;
    // 먹은 뒤 시간이 지나 생긴 똥 (최대 3개)
    while (pet.poopAt.length && pet.poopAt[0] <= t) { pet.poopAt.shift(); pet.poops = Math.min(3, pet.poops + 1); }
    const s = pet.sleeping ? 1 : 0;
    pet.food = clamp(pet.food + RATE.food[s] * h);
    pet.joy = clamp(pet.joy + RATE.joy[s] * h * (pet.sick ? 2 : 1));
    pet.clean = clamp(pet.clean + (RATE.clean[s] - (s ? 0 : 4 * pet.poops)) * h);
    pet.energy = clamp(pet.energy + RATE.energy[s] * h);
    if (pet.sleeping && pet.energy >= 100) pet.sleeping = false;          // 다 자면 스스로 일어난다
    // 굶거나 너무 더러운 채로 한 시간이 지나면 아프다
    if (pet.food <= 0 || pet.clean <= 0 || pet.poops >= 3) pet.sickMin += step / 60000;
    else pet.sickMin = Math.max(0, pet.sickMin - step / 60000);
    if (pet.sickMin >= 60) pet.sick = true;
  }
  pet.last = now;
  savePet();
}

function petMood() {
  if (pet.sleeping) return 'sleep';
  if (pet.sick) return 'sick';
  const low = Math.min(pet.food, pet.joy, pet.clean, pet.energy);
  if (low < 25) return 'sad';
  if ((pet.food + pet.joy + pet.clean + pet.energy) / 4 > 72) return 'happy';
  return 'normal';
}
function petSays() {
  if (pet.sleeping) return '쿨쿨… 💤';
  if (pet.sick) return '몸이 안 좋아요… 💊';
  if (pet.food < 30) return '배고파요…';
  if (pet.poops > 0 || pet.clean < 30) return '씻고 싶어요!';
  if (pet.energy < 25) return '졸려요…';
  if (pet.joy < 30) return '심심해요, 놀아 줘!';
  if (petMood() === 'happy') return '기분 최고!';
  return '오늘도 반가워요';
}

// 말랑이 그림 (SVG) — 몸은 말랑한 젤리, 자라면 머리에 새싹이 난다
function petSVG(mood, look) {
  const c = pet.color;
  if (look === 'egg') {
    const cracks = [
      '', 'M92 70 l8 10 l-6 8',
      'M92 70 l8 10 l-6 8 M120 96 l-8 6 l6 9',
      'M92 70 l8 10 l-6 8 M120 96 l-8 6 l6 9 M78 112 l10 4 l-4 10',
      'M92 70 l8 10 l-6 8 l9 7 M120 96 l-8 6 l6 9 l-9 6 M78 112 l10 4 l-4 10 l10 3',
    ][Math.min(4, pet.taps)];
    return `<svg viewBox="0 0 200 200" class="pet-svg egg">
      <ellipse cx="100" cy="182" rx="52" ry="8" fill="#00000033"/>
      <path d="M100 30 C140 30 160 100 160 128 C160 162 134 180 100 180 C66 180 40 162 40 128 C40 100 60 30 100 30Z" fill="#fff7ec" stroke="#e8d9c4" stroke-width="3"/>
      <circle cx="78" cy="84" r="10" fill="${c}"/><circle cx="122" cy="120" r="14" fill="${c}"/><circle cx="86" cy="146" r="8" fill="${c}"/><circle cx="118" cy="66" r="6" fill="${c}"/>
      <path d="${cracks}" fill="none" stroke="#7a6a58" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
  }
  const sprout = look === 'child'
    ? '<path d="M100 66 Q100 50 102 40" stroke="#4aa05a" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M102 42 Q120 26 134 36 Q120 52 102 42Z" fill="#6fd17f"/>'
    : look === 'adult'
      ? '<path d="M100 66 Q100 46 100 32" stroke="#4aa05a" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M100 40 Q118 22 136 32 Q120 50 100 40Z" fill="#6fd17f"/><path d="M100 46 Q82 28 64 38 Q80 56 100 46Z" fill="#6fd17f"/><circle cx="100" cy="30" r="8" fill="#ffd23f"/><circle cx="100" cy="30" r="3.5" fill="#ff9a3d"/>'
      : '';
  const eyes = {
    sleep: '<path d="M68 112 q10 9 20 0 M112 112 q10 9 20 0" stroke="#2a2440" stroke-width="5" fill="none" stroke-linecap="round"/>',
    sick: '<path d="M70 104 l16 14 M86 104 l-16 14 M114 104 l16 14 M130 104 l-16 14" stroke="#2a2440" stroke-width="5" stroke-linecap="round"/>',
  }[mood] || `<g class="eyes"><ellipse cx="78" cy="110" rx="9" ry="${mood === 'sad' ? 8 : 11}" fill="#2a2440"/><ellipse cx="122" cy="110" rx="9" ry="${mood === 'sad' ? 8 : 11}" fill="#2a2440"/>
      <circle cx="81" cy="106" r="3.5" fill="#fff"/><circle cx="125" cy="106" r="3.5" fill="#fff"/></g>`;
  const mouth = {
    happy: '<path d="M88 132 Q100 148 112 132 Z" fill="#7a2a3a"/>',
    normal: '<path d="M90 134 Q100 142 110 134" stroke="#2a2440" stroke-width="4.5" fill="none" stroke-linecap="round"/>',
    sad: '<path d="M90 140 Q100 131 110 140" stroke="#2a2440" stroke-width="4.5" fill="none" stroke-linecap="round"/>',
    sleep: '<ellipse cx="100" cy="136" rx="5" ry="4" fill="#2a2440"/>',
    sick: '<path d="M88 138 q6 -5 12 0 q6 5 12 0" stroke="#2a2440" stroke-width="4.5" fill="none" stroke-linecap="round"/>',
  }[mood];
  const extra = mood === 'sick' ? '<path d="M150 80 q8 14 0 18 q-8 -4 0 -18Z" fill="#8fd3ff"/>' : '';
  return `<svg viewBox="0 0 200 200" class="pet-svg ${mood === 'sick' ? 'sick' : ''}">
    <ellipse cx="100" cy="184" rx="62" ry="9" fill="#00000033"/>
    <g class="body">
      ${sprout}
      <path d="M100 64 C150 64 170 110 170 140 C170 172 140 182 100 182 C60 182 30 172 30 140 C30 110 50 64 100 64Z" fill="${c}"/>
      <ellipse cx="72" cy="88" rx="16" ry="10" fill="#ffffff66" transform="rotate(-25 72 88)"/>
      <ellipse cx="60" cy="130" rx="11" ry="7" fill="#ff7a9a55"/><ellipse cx="140" cy="130" rx="11" ry="7" fill="#ff7a9a55"/>
      ${eyes}${mouth}${extra}
    </g>
  </svg>`;
}

const petEl = $('#pet');
let petTimer = null;
let petAnim = '';            // 잠깐 붙는 움직임: eat | jump | wash | wobble | hatch

function renderPet() {
  petTick();
  const look = growth();
  const mood = petMood();
  const room = $('#pet-room');
  room.classList.toggle('night', pet.sleeping);
  $('#pet-name').textContent = pet.name;
  $('#pet-age').textContent = look === 'egg' ? '알' : `${GROWTH_NAME[look]} · ${Math.floor((Date.now() - pet.born) / (24 * HOUR)) + 1}일째`;
  $('#pet-body').className = `pet-body ${look} ${petAnim}`;
  $('#pet-body').innerHTML = petSVG(mood, look);
  $('#pet-say').textContent = look === 'egg' ? (pet.taps ? '톡톡… 조금만 더!' : '알을 톡톡 두드려 보세요') : petSays();
  $('#pet-poops').innerHTML = Array.from({ length: pet.poops }, (_, k) => `<button class="poop" data-poop style="left:${14 + k * 22}%" aria-label="똥 치우기">💩</button>`).join('');
  const egg = look === 'egg';
  $('#pet-stats').hidden = egg;
  $('#pet-actions').hidden = egg;
  if (egg) return;
  $('#pet-stats').innerHTML = STATS.map(([k, icon, label]) => {
    const v = Math.round(pet[k]);
    return `<div class="stat"><span class="stat-k">${icon} ${label}</span><span class="stat-bar"><i class="${v < 30 ? 'low' : ''}" style="width:${v}%"></i></span><span class="stat-v">${v}</span></div>`;
  }).join('');
  const zz = pet.sleeping;
  $('#pet-actions').innerHTML = `
    <button class="act" data-act="feed" ${zz ? 'disabled' : ''}><span>🍙</span>밥 주기</button>
    <button class="act" data-act="play" ${zz ? 'disabled' : ''}><span>🎾</span>놀아 주기</button>
    <button class="act" data-act="wash" ${zz ? 'disabled' : ''}><span>🛁</span>씻기기</button>
    <button class="act" data-act="sleep"><span>${zz ? '☀️' : '🌙'}</span>${zz ? '깨우기' : '재우기'}</button>
    ${pet.sick ? `<button class="act wide" data-act="medicine" ${zz ? 'disabled' : ''}><span>💊</span>약 먹이기</button>` : ''}`;
}
// 잠깐 움직임을 보여 주고 말풍선을 바꾼다
function petReact(anim, say, ms = 900) {
  petAnim = anim;
  renderPet();
  if (say) $('#pet-say').textContent = say;
  const token = runToken;
  setTimeout(() => { if (token === runToken && petAnim === anim) { petAnim = ''; renderPet(); } }, ms);
}

function petAction(act) {
  petTick();
  if (act === 'feed') {
    if (pet.food >= 92) { pet.joy = clamp(pet.joy - 3); sfx.step(); return petReact('wobble', '배불러요… 그만!'); }
    pet.food = clamp(pet.food + 30);
    pet.poopAt.push(Date.now() + (90 + rand(61)) * 60000);   // 한두 시간 뒤에 똥
    pet.poopAt.sort((a, b) => a - b);
    sfx.step(); setTimeout(() => sfx.step(), 220); setTimeout(() => sfx.step(), 440);
    savePet();
    return petReact('eat', '냠냠 맛있다!', 1100);
  }
  if (act === 'play') {
    if (pet.energy < 15) return petReact('wobble', '너무 피곤해요…');
    if (pet.food < 10) return petReact('wobble', '배고파서 못 놀아요…');
    pet.joy = clamp(pet.joy + 20); pet.energy = clamp(pet.energy - 10); pet.food = clamp(pet.food - 6);
    sfx.pass(); savePet();
    return petReact('jump', ['신난다!', '한 번 더!', '헤헤 재밌어!'][rand(3)], 1000);
  }
  if (act === 'wash') {
    pet.clean = 100; pet.poops = 0;
    sfx.twist(); savePet();
    return petReact('wash', '뽀득뽀득 깨끗해!', 1300);
  }
  if (act === 'sleep') {
    if (pet.sleeping) {
      pet.sleeping = false;
      if (pet.energy < 50) pet.joy = clamp(pet.joy - 5);
      savePet();
      return petReact('wobble', pet.energy < 50 ? '으음… 더 자고 싶은데…' : '잘 잤다!');
    }
    pet.sleeping = true; savePet(); renderPet();
    return;
  }
  if (act === 'medicine') {
    pet.sick = false; pet.sickMin = 0; pet.joy = clamp(pet.joy - 5);
    sfx.step(); savePet();
    petReact('wobble', '으, 써… 그래도 나아졌어요');
  }
}

$('#pet-actions').addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (b && !b.disabled) petAction(b.dataset.act);
});
$('#pet-room').addEventListener('click', (e) => {
  if (e.target.closest('[data-poop]')) {                    // 똥 하나 치우기
    petTick();
    pet.poops = Math.max(0, pet.poops - 1);
    pet.clean = clamp(pet.clean + 5);
    sfx.step(); savePet(); renderPet();
    return;
  }
  if (!e.target.closest('#pet-body')) return;
  if (pet.stage === 'egg') {                                 // 알 두드리기 — 다섯 번이면 깨어난다
    pet.taps++;
    sfx.step();
    if (pet.taps >= 5) {
      pet.stage = 'born'; pet.born = Date.now(); pet.last = Date.now();
      savePet(); sfx.reveal();
      return petReact('hatch', `안녕! 나는 ${pet.name}야`, 1400);
    }
    savePet();
    return petReact('wobble', '톡톡… 조금만 더!', 500);
  }
  if (!pet.sleeping) {                                       // 쓰다듬기
    pet.joy = clamp(pet.joy + 2); savePet(); sfx.tick();
    petReact('jump', ['헤헤', '간지러워!', '좋아요~'][rand(3)], 700);
  }
});
$('#pet-name').addEventListener('click', () => {
  const v = prompt('이름을 지어 주세요', pet.name);
  if (v === null) return;
  pet.name = v.trim().slice(0, 8) || pet.name;
  savePet(); renderPet(); renderPetCard();
});
$('#pet-reset').addEventListener('click', () => {
  if (!confirm(`${pet.name}와 헤어지고 새 알을 받을까요? 되돌릴 수 없습니다.`)) return;
  pet = newPet(); savePet(); petAnim = ''; renderPet();
});
$('#pet-back').addEventListener('click', goHome);

// 홈 화면 카드 — 지금 상태를 한 줄로
function renderPetCard() {
  petTick();
  $('#pet-card-sub').textContent = pet.stage === 'egg' ? '알을 깨워 주세요' : `${pet.name} · ${petSays()}`;
}
$('#open-pet').addEventListener('click', () => {
  runToken++;
  sfx.unlock();
  homeEl.hidden = true;
  petEl.hidden = false;
  petAnim = '';
  renderPet();
  window.scrollTo(0, 0);
  clearInterval(petTimer);
  const token = runToken;
  petTimer = setInterval(() => {                             // 켜 둔 동안에도 시간이 흐른다
    if (token !== runToken || petEl.hidden) { clearInterval(petTimer); return; }
    if (!petAnim) renderPet();
  }, 15000);
});
renderPetCard();
