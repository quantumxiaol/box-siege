/* ============================================================
   方块围城 BOX SIEGE
   方块风俯视角生存射击 · 单人 / 同键盘双人合作 / 双人对战
   纯原生 Canvas + WebAudio，无外部素材，GitHub Pages 直接部署
   ============================================================ */
'use strict';

/* ---------- 报错可视化（方便调试） ---------- */
window.addEventListener('error', e => {
  const box = document.getElementById('errbox');
  box.textContent = 'JS 错误：' + e.message + ' @' + (e.lineno || '?');
  box.classList.add('show');
});

/* ---------- 小工具 ---------- */
const TAU = Math.PI * 2;
const rand  = (a, b) => a + Math.random() * (b - a);
const irand = (a, b) => Math.floor(rand(a, b + 1));
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
const pick  = arr => arr[Math.floor(Math.random() * arr.length)];

/* ---------- 画布 ---------- */
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = 960, H = 600;
{
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.scale(dpr, dpr);
}

/* ---------- 配色 ---------- */
const C = {
  floor:    '#E4DAC6',
  floorLine:'rgba(34,38,75,.05)',
  wallTop:  '#F4F1E8',
  wallSide: '#8E8E96',
  wallEdge: '#3A3A44',
  blood:    'rgba(166,24,24,',
  scorch:   'rgba(40,38,40,',
  navy:     '#22264B',
  amber:    '#F7A026',
  p1:       '#D96C2C',
  p1dark:   '#A84E1B',
  p2:       '#3D6FB4',
  p2dark:   '#2A5288',
  skin:     '#EFC9A2',
  zombie:   '#8FA36B',
  zombieDk: '#6B7D4C',
  fast:     '#B4553C',
  fastDk:   '#8C3E2A',
  brute:    '#5E7350',
  bruteDk:  '#45573A',
  gun:      '#2E2E36',
};

/* ============================================================
   音效：全部用 WebAudio 合成，零素材
   ============================================================ */
const Sfx = (() => {
  let ac = null, master = null, muted = false;
  function ensure() {
    if (!ac) {
      try {
        ac = new (window.AudioContext || window.webkitAudioContext)();
        master = ac.createGain();
        master.gain.value = 0.5;
        master.connect(ac.destination);
      } catch (e) { ac = null; }
    }
    if (ac && ac.state === 'suspended') ac.resume();
    return ac;
  }
  function tone(freqA, freqB, dur, type, vol, delay = 0) {
    if (muted || !ensure()) return;
    const t0 = ac.currentTime + delay;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freqA, t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(freqB, 1), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function noise(dur, vol, filterFreq, type = 'lowpass', delay = 0) {
    if (muted || !ensure()) return;
    const t0 = ac.currentTime + delay;
    const len = Math.max(1, Math.floor(ac.sampleRate * dur));
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ac.createBufferSource(); src.buffer = buf;
    const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = filterFreq;
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0);
  }
  return {
    unlock() { ensure(); },
    shoot()    { tone(760, 180, 0.08, 'square', 0.10); },
    uzi()      { tone(900, 300, 0.05, 'square', 0.07); },
    shotgun()  { noise(0.16, 0.22, 900); tone(220, 60, 0.14, 'sawtooth', 0.12); },
    rocket()   { noise(0.25, 0.16, 500); tone(160, 50, 0.3, 'sawtooth', 0.10); },
    throwG()   { tone(500, 700, 0.09, 'sine', 0.08); },
    place()    { tone(300, 180, 0.08, 'triangle', 0.10); },
    explode()  { noise(0.55, 0.34, 320); tone(90, 30, 0.5, 'sine', 0.30); },
    zdie()     { noise(0.10, 0.14, 700, 'bandpass'); tone(160, 60, 0.09, 'sawtooth', 0.07); },
    hurt()     { tone(200, 90, 0.16, 'sawtooth', 0.14); noise(0.08, 0.10, 1200, 'highpass'); },
    pickup()   { tone(660, 660, 0.07, 'sine', 0.10); tone(990, 990, 0.09, 'sine', 0.10, 0.07); },
    newWeap()  { [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.1, 'square', 0.09, i * 0.08)); },
    levelup()  { [392, 523, 659].forEach((f, i) => tone(f, f, 0.12, 'triangle', 0.10, i * 0.09)); },
    ui()       { tone(440, 440, 0.05, 'square', 0.07); },
    over()     { [330, 262, 196, 131].forEach((f, i) => tone(f, f * 0.9, 0.25, 'triangle', 0.12, i * 0.18)); },
    toggleMute() { muted = !muted; return muted; },
    isMuted() { return muted; },
  };
})();

/* ============================================================
   输入
   ============================================================ */
const keys = Object.create(null);
const pressed = Object.create(null); // 边沿触发
window.addEventListener('keydown', e => {
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','Slash'].includes(e.code)) e.preventDefault();
  if (!keys[e.code]) pressed[e.code] = true;
  keys[e.code] = true;
  Sfx.unlock();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

const CTRL_P1 = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', fire: 'Slash',  prev: 'Comma', next: 'Period' };
const CTRL_P2 = { up: 'KeyW',    down: 'KeyS',     left: 'KeyA',     right: 'KeyD',      fire: 'Space',  prev: 'KeyQ',  next: 'KeyE'   };

function readInput(ctrl, mergeAlt) {
  const k = c => !!keys[c] || (mergeAlt && !!keys[mergeAlt[c]]);
  return {
    mx: (k(ctrl.right) ? 1 : 0) - (k(ctrl.left) ? 1 : 0),
    my: (k(ctrl.down)  ? 1 : 0) - (k(ctrl.up)   ? 1 : 0),
    fire: k(ctrl.fire),
    prev: !!pressed[ctrl.prev] || (mergeAlt && !!pressed[mergeAlt[ctrl.prev]]),
    next: !!pressed[ctrl.next] || (mergeAlt && !!pressed[mergeAlt[ctrl.next]]),
  };
}

/* ============================================================
   武器
   ============================================================ */
const WEAPONS = [
  { id: 'pistol',  name: '手枪',   cd: 0.26, dmg: 34, spd: 560, spread: 0.02 },
  { id: 'uzi',     name: '乌兹',   cd: 0.085, dmg: 19, spd: 600, spread: 0.06, max: 300, start: 200 },
  { id: 'shotgun', name: '霰弹枪', cd: 0.62, dmg: 15, spd: 640, spread: 0.44, pellets: 6, life: 0.20, max: 60, start: 32 },
  { id: 'grenade', name: '手雷',   cd: 0.70, max: 12, start: 6 },
  { id: 'mine',    name: '地雷',   cd: 0.50, max: 10, start: 5 },
  { id: 'rocket',  name: '火箭筒', cd: 0.95, dmg: 130, spd: 430, max: 10, start: 4 },
  { id: 'barrel',  name: '油桶',   cd: 0.50, max: 6,  start: 3 },
];
const UNLOCK_AT = [0, 8, 20, 35, 55, 80, 110]; // 按总击杀解锁

/* ============================================================
   房间（地图）
   ============================================================ */
const WALL_T = 26; // 外墙厚度
const MAPS = [
  {
    name: '训练场',
    blocks: [
      { x: 170, y: 110, w: 84, h: 84 }, { x: 706, y: 110, w: 84, h: 84 },
      { x: 170, y: 406, w: 84, h: 84 }, { x: 706, y: 406, w: 84, h: 84 },
      { x: 312, y: 140, w: 84, h: 84 }, { x: 564, y: 376, w: 84, h: 84 },
    ],
    barrels: [{ x: 120, y: 300 }, { x: 826, y: 300 }],
    spawns: { single: [[480, 300]], coop: [[440, 300], [520, 300]], versus: [[480, 110], [480, 490]] },
  },
  {
    name: '回廊',
    blocks: [
      { x: 280, y: 170, w: 400, h: 42 }, { x: 280, y: 388, w: 400, h: 42 },
      { x: 280, y: 212, w: 42, h: 176 }, { x: 638, y: 212, w: 42, h: 176 },
    ],
    barrels: [{ x: 470, y: 268 }, { x: 514, y: 324 }],
    spawns: { single: [[480, 300]], coop: [[448, 300], [512, 300]], versus: [[480, 110], [480, 490]] },
  },
  {
    name: '十字阵',
    blocks: [
      { x: 438, y: 90,  w: 84, h: 170 }, { x: 438, y: 340, w: 84, h: 170 },
      { x: 190, y: 258, w: 220, h: 84 }, { x: 550, y: 258, w: 220, h: 84 },
    ],
    barrels: [{ x: 110, y: 110 }, { x: 836, y: 110 }, { x: 110, y: 476 }, { x: 836, y: 476 }],
    spawns: { single: [[480, 300]], coop: [[448, 300], [512, 300]], versus: [[140, 300], [820, 300]] },
  },
];
const SPAWN_GATES = [ // 僵尸入场口（四边中点）
  { x: W / 2, y: WALL_T + 12 }, { x: W / 2, y: H - WALL_T - 12 },
  { x: WALL_T + 12, y: H / 2 }, { x: W - WALL_T - 12, y: H / 2 },
];

/* ============================================================
   游戏状态
   ============================================================ */
const G = {
  state: 'menu',        // menu | countdown | play | paused | over
  mode: 'single',       // single | coop | versus
  mapIdx: 0,
  t: 0,                 // 本局时间
  countdownT: 0,
  players: [],
  zombies: [],
  bullets: [],
  grenades: [],
  mines: [],
  barrels: [],
  pickups: [],
  particles: [],
  decals: [],
  toasts: [],
  delayed: [],          // 连锁爆炸队列 {t, fn}
  score: 0,
  kills: 0,
  combo: 0,
  comboT: 0,
  mult: 1,
  spawnT: 0,
  shake: 0,
  winner: 0,
  demo: false,
  frozen: false,
};
window.__game = G;

/* ---------- 碰撞：圆 vs 矩形集合 ---------- */
function collideWalls(x, y, r) {
  x = clamp(x, WALL_T + r, W - WALL_T - r);
  y = clamp(y, WALL_T + r, H - WALL_T - r);
  const blocks = MAPS[G.mapIdx].blocks;
  for (const b of blocks) {
    const nx = clamp(x, b.x, b.x + b.w);
    const ny = clamp(y, b.y, b.y + b.h);
    const dx = x - nx, dy = y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        x = nx + (dx / d) * r;
        y = ny + (dy / d) * r;
      } else {
        // 圆心在矩形内：往最近边推出
        const l = x - b.x, rr = b.x + b.w - x, tt = y - b.y, bb = b.y + b.h - y;
        const m = Math.min(l, rr, tt, bb);
        if (m === l) x = b.x - r; else if (m === rr) x = b.x + b.w + r;
        else if (m === tt) y = b.y - r; else y = b.y + b.h + r;
      }
    }
  }
  return { x, y };
}
function hitsWall(x, y, r) {
  if (x < WALL_T + r || x > W - WALL_T - r || y < WALL_T + r || y > H - WALL_T - r) return true;
  for (const b of MAPS[G.mapIdx].blocks) {
    if (x > b.x - r && x < b.x + b.w + r && y > b.y - r && y < b.y + b.h + r) return true;
  }
  return false;
}

/* ---------- 实体工厂 ---------- */
function makePlayer(idx, x, y) {
  return {
    isPlayer: true, idx, x, y, r: 13,
    face: idx === 0 ? -Math.PI / 2 : Math.PI / 2,
    hp: 100, alive: true, speed: 155,
    weapons: [0], cur: 0,
    ammo: {},
    cd: 0, hurtT: 0, respawnT: 0, invulnT: 0,
    frags: 0, deaths: 0,
    color: idx === 0 ? C.p1 : C.p2,
    colorDark: idx === 0 ? C.p1dark : C.p2dark,
    label: idx === 0 ? 'P1' : 'P2',
    walkT: 0, muzzle: 0,
  };
}
function makeZombie(x, y, type) {
  const base = { x, y, face: 0, cd: 0, walkT: rand(0, 9), slowT: 0 };
  if (type === 'fast')  return Object.assign(base, { type, r: 11, hp: 42,  maxHp: 42,  speed: rand(92, 104), dmg: 9,  score: 150 });
  if (type === 'brute') return Object.assign(base, { type, r: 19, hp: 300, maxHp: 300, speed: rand(36, 42),  dmg: 22, score: 300 });
  return Object.assign(base, { type: 'normal', r: 13, hp: 62, maxHp: 62, speed: rand(52, 64), dmg: 12, score: 100 });
}

/* ---------- 粒子 / 贴花 / 浮字 ---------- */
function addParticles(x, y, n, color, spd, life, size) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU), s = rand(spd * 0.3, spd);
    G.particles.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      t: 0, life: rand(life * 0.5, life), color, size: rand(size * 0.5, size),
    });
  }
}
function bloodBurst(x, y, big) {
  addParticles(x, y, big ? 26 : 12, '#A61818', big ? 220 : 150, 0.5, big ? 6 : 4);
  G.decals.push({ x: x + rand(-8, 8), y: y + rand(-8, 8), r: rand(6, big ? 18 : 12), color: 'blood', a: 0.55 });
}
function scorch(x, y, r) {
  G.decals.push({ x, y, r: r * 1.05, color: 'scorch', a: 0.4 });
  if (G.decals.length > 420) G.decals.splice(0, G.decals.length - 420);
}
function toast(text, color) {
  G.toasts.push({ text, color: color || '#FFFFFF', t: 0, life: 2.2 });
  if (G.toasts.length > 4) G.toasts.shift();
}

/* ---------- 爆炸 ---------- */
function explode(x, y, r, dmg, owner) {
  scorch(x, y, r);
  G.shake = Math.min(14, G.shake + r * 0.09);
  Sfx.explode();
  addParticles(x, y, 24, '#F7A026', 300, 0.45, 6);
  addParticles(x, y, 16, '#55505A', 180, 0.7, 7);
  addParticles(x, y, 10, '#FFF3D0', 380, 0.2, 4);

  for (const z of G.zombies) {
    const d = Math.sqrt(dist2(x, y, z.x, z.y));
    if (d < r + z.r) {
      hurtZombie(z, dmg * clamp(1 - d / (r + z.r) * 0.7, 0.25, 1), owner);
      const a = Math.atan2(z.y - y, z.x - x);
      z.x += Math.cos(a) * 14; z.y += Math.sin(a) * 14;
      const p = collideWalls(z.x, z.y, z.r); z.x = p.x; z.y = p.y;
    }
  }
  for (const p of G.players) {
    if (!p.alive) continue;
    const d = Math.sqrt(dist2(x, y, p.x, p.y));
    if (d < r + p.r) damagePlayer(p, dmg * 0.6 * clamp(1 - d / (r + p.r) * 0.7, 0.2, 1), owner);
  }
  // 连锁：油桶与地雷
  for (const b of G.barrels) {
    if (!b.dead && dist2(x, y, b.x, b.y) < (r + 14) * (r + 14)) {
      b.dead = true;
      G.delayed.push({ t: G.t + rand(0.04, 0.12), fn: () => explode(b.x, b.y, 95, 110, owner) });
    }
  }
  for (const m of G.mines) {
    if (!m.dead && dist2(x, y, m.x, m.y) < (r + 8) * (r + 8)) {
      m.dead = true;
      G.delayed.push({ t: G.t + rand(0.04, 0.1), fn: () => explode(m.x, m.y, 85, 120, owner) });
    }
  }
}

/* ---------- 伤害结算 ---------- */
function hurtZombie(z, dmg, owner) {
  if (z.hp <= 0) return;
  z.hp -= dmg;
  z.slowT = 0.06;
  addParticles(z.x, z.y, 3, '#A61818', 90, 0.3, 3);
  if (z.hp <= 0) killZombie(z, owner);
}
function killZombie(z, owner) {
  z.dead = true;
  bloodBurst(z.x, z.y, z.type === 'brute');
  Sfx.zdie();
  G.kills++;
  G.combo++;
  G.comboT = 3;
  G.mult = Math.min(16, 1 + Math.floor(G.combo / 4));
  const pts = z.score * G.mult;
  G.score += pts;
  // 掉落
  if (Math.random() < 0.11) {
    G.pickups.push({
      x: clamp(z.x, WALL_T + 16, W - WALL_T - 16),
      y: clamp(z.y, WALL_T + 16, H - WALL_T - 16),
      kind: Math.random() < 0.65 ? 'ammo' : 'med', t: 0, life: 14,
    });
  }
  checkUnlocks();
}
function damagePlayer(p, dmg, owner) {
  if (!p.alive || p.invulnT > 0) return;
  p.hp -= dmg;
  p.hurtT = 0.25;
  Sfx.hurt();
  addParticles(p.x, p.y, 6, '#A61818', 130, 0.35, 4);
  if (p.hp <= 0) {
    p.hp = 0;
    p.alive = false;
    p.deaths++;
    bloodBurst(p.x, p.y, true);
    toast(p.label + ' 阵亡！', '#FF6B5E');
    if (G.mode === 'versus') {
      if (owner && owner.isPlayer && owner !== p) {
        owner.frags++;
        toast(owner.label + ' 击杀 ' + p.label + '！（' + owner.frags + '/10）', owner.idx === 0 ? '#F7A026' : '#7FB2F0');
        if (owner.frags >= 10) { endGame(owner.idx); return; }
      }
      p.respawnT = 2.5;
    }
    checkGameOver();
  }
}

/* ---------- 武器解锁 ---------- */
function checkUnlocks() {
  for (let wi = 0; wi < WEAPONS.length; wi++) {
    if (G.kills >= UNLOCK_AT[wi]) {
      for (const p of G.players) {
        if (!p.weapons.includes(wi)) {
          p.weapons.push(wi);
          const w = WEAPONS[wi];
          if (w.max) p.ammo[w.id] = (p.ammo[w.id] || 0) + w.start;
          toast('新武器解锁：' + w.name + '！', '#F7A026');
          Sfx.newWeap();
        }
      }
    }
  }
}

/* ---------- 僵尸生成 ---------- */
function spawnZombie() {
  const gate = pick(SPAWN_GATES);
  const x = gate.x + rand(-30, 30), y = gate.y + rand(-30, 30);
  let type = 'normal';
  const roll = Math.random();
  if (G.t > 90 && roll < 0.12) type = 'brute';
  else if (G.t > 40 && roll < 0.38) type = 'fast';
  G.zombies.push(makeZombie(x, y, type));
  addParticles(x, y, 8, '#6B7D4C', 100, 0.4, 5);
}

/* ---------- 开局 ---------- */
function startGame(mode, mapIdx) {
  G.mode = mode; G.mapIdx = mapIdx;
  G.t = 0; G.score = 0; G.kills = 0; G.combo = 0; G.comboT = 0; G.mult = 1;
  G.spawnT = 1.2; G.shake = 0; G.winner = -1;
  G.zombies = []; G.bullets = []; G.grenades = []; G.mines = [];
  G.pickups = []; G.particles = []; G.decals = []; G.toasts = []; G.delayed = [];

  const sp = MAPS[mapIdx].spawns;
  if (mode === 'single') {
    G.players = [makePlayer(0, sp.single[0][0], sp.single[0][1])];
  } else if (mode === 'coop') {
    G.players = sp.coop.map((s, i) => makePlayer(i, s[0], s[1]));
  } else {
    const p1 = makePlayer(0, sp.versus[0][0], sp.versus[0][1]); p1.face = 0;
    const p2 = makePlayer(1, sp.versus[1][0], sp.versus[1][1]); p2.face = Math.PI;
    G.players = [p1, p2];
  }
  G.barrels = MAPS[mapIdx].barrels.map(b => ({ x: b.x, y: b.y, r: 14, hp: 16, dead: false }));

  G.state = 'countdown';
  G.countdownT = 2.4;
  document.getElementById('menu').classList.add('hidden');
  toast(MAPS[mapIdx].name, '#FFFFFF');
}

function endGame(winnerIdx) {
  G.state = 'over';
  G.winner = winnerIdx;
  Sfx.over();
}
function checkGameOver() {
  if (G.mode === 'versus') return;
  if (G.players.every(p => !p.alive)) endGame(-1);
}
function backToMenu() {
  G.state = 'menu';
  document.getElementById('menu').classList.remove('hidden');
}

/* ============================================================
   更新逻辑
   ============================================================ */
function curWeapon(p) { return WEAPONS[p.weapons[p.cur]]; }

function switchWeapon(p, dir) {
  p.cur = (p.cur + dir + p.weapons.length) % p.weapons.length;
  Sfx.ui();
}

function tryFire(p, dt) {
  const w = curWeapon(p);
  if (p.cd > 0) return;
  const usesAmmo = !!w.max;
  if (usesAmmo && (p.ammo[w.id] || 0) <= 0) { switchWeapon(p, 1); return; }
  p.cd = w.cd;
  if (usesAmmo) p.ammo[w.id]--;

  const fx = p.x + Math.cos(p.face) * 20, fy = p.y + Math.sin(p.face) * 20;
  p.muzzle = 0.05;

  switch (w.id) {
    case 'pistol': case 'uzi': {
      const a = p.face + rand(-w.spread, w.spread);
      G.bullets.push({ x: fx, y: fy, vx: Math.cos(a) * w.spd, vy: Math.sin(a) * w.spd, dmg: w.dmg, owner: p, life: 1.2, kind: 'bullet' });
      w.id === 'uzi' ? Sfx.uzi() : Sfx.shoot();
      break;
    }
    case 'shotgun': {
      for (let i = 0; i < w.pellets; i++) {
        const a = p.face + rand(-w.spread / 2, w.spread / 2);
        G.bullets.push({ x: fx, y: fy, vx: Math.cos(a) * w.spd * rand(0.85, 1.1), vy: Math.sin(a) * w.spd * rand(0.85, 1.1), dmg: w.dmg, owner: p, life: w.life, kind: 'pellet' });
      }
      G.shake = Math.min(14, G.shake + 2.5);
      Sfx.shotgun();
      break;
    }
    case 'rocket': {
      const a = p.face;
      G.bullets.push({ x: fx, y: fy, vx: Math.cos(a) * w.spd, vy: Math.sin(a) * w.spd, dmg: w.dmg, owner: p, life: 2.2, kind: 'rocket' });
      Sfx.rocket();
      break;
    }
    case 'grenade': {
      G.grenades.push({ x: p.x, y: p.y, vx: Math.cos(p.face) * 400, vy: Math.sin(p.face) * 400, fuse: 0.85, owner: p });
      Sfx.throwG();
      break;
    }
    case 'mine': {
      const mx = p.x - Math.cos(p.face) * 6, my = p.y - Math.sin(p.face) * 6;
      if (!hitsWall(mx, my, 8)) {
        G.mines.push({ x: mx, y: my, armT: 0.5, owner: p, dead: false, blink: 0 });
        Sfx.place();
      } else { p.ammo[w.id]++; p.cd = 0; }
      break;
    }
    case 'barrel': {
      const bx = p.x + Math.cos(p.face) * 34, by = p.y + Math.sin(p.face) * 34;
      if (!hitsWall(bx, by, 14)) {
        G.barrels.push({ x: bx, y: by, r: 14, hp: 16, dead: false });
        Sfx.place();
      } else { p.ammo[w.id]++; p.cd = 0; }
      break;
    }
  }
}

/* ---------- 演示机器人（?demo=1 用） ---------- */
function hasLOS(x1, y1, x2, y2) {
  const d = Math.hypot(x2 - x1, y2 - y1);
  const steps = Math.ceil(d / 14);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (hitsWall(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, 4)) return false;
  }
  return true;
}
function botInput(p) {
  let nz = null, nd = Infinity;
  for (const z of G.zombies) {
    const d = dist2(p.x, p.y, z.x, z.y);
    if (d < nd) { nd = d; nz = z; }
  }
  const inp = { mx: 0, my: 0, fire: false, prev: false, next: false };
  if (!nz) return inp;
  const d = Math.sqrt(nd);
  const az = Math.atan2(nz.y - p.y, nz.x - p.x);
  const los = hasLOS(p.x, p.y, nz.x, nz.y);
  const orbit = az + Math.PI / 2;
  if (!los) {
    // 没视野：绕过去
    inp.mx = Math.cos(az) + Math.cos(orbit) * 0.8;
    inp.my = Math.sin(az) + Math.sin(orbit) * 0.8;
  } else {
    inp.face = az;
    inp.fire = true;
    if (d < 110) { inp.mx = -Math.cos(az) + Math.cos(orbit) * 0.6; inp.my = -Math.sin(az) + Math.sin(orbit) * 0.6; }
    else if (d > 260) { inp.mx = Math.cos(az); inp.my = Math.sin(az); }
    else { inp.mx = Math.cos(orbit) * (Math.sin(G.t * 0.8) > 0 ? 1 : -1); inp.my = Math.sin(orbit) * (Math.sin(G.t * 0.8) > 0 ? 1 : -1); }
  }
  // 有更强的枪就用
  if (p.weapons.length > 1 && p.cur === 0 && (p.ammo.uzi || 0) > 0) inp.next = true;
  return inp;
}

function updatePlayer(p, dt) {
  if (!p.alive) {
    if (G.mode === 'versus') {
      p.respawnT -= dt;
      if (p.respawnT <= 0) {
        p.alive = true; p.hp = 100; p.invulnT = 2;
        const s = MAPS[G.mapIdx].spawns.versus[p.idx];
        p.x = s[0]; p.y = s[1];
        const c = collideWalls(p.x, p.y, p.r); p.x = c.x; p.y = c.y;
      }
    }
    return;
  }
  p.cd = Math.max(0, p.cd - dt);
  p.hurtT = Math.max(0, p.hurtT - dt);
  p.invulnT = Math.max(0, p.invulnT - dt);
  p.muzzle = Math.max(0, p.muzzle - dt);

  let inp;
  if (G.demo && p.idx === 0) inp = botInput(p);
  else if (G.mode === 'single') inp = readInput(CTRL_P1, CTRL_P2);
  else inp = readInput(p.idx === 0 ? CTRL_P1 : CTRL_P2);

  if (inp.prev) switchWeapon(p, -1);
  if (inp.next) switchWeapon(p, 1);

  let mx = inp.mx, my = inp.my;
  if (mx || my) {
    const len = Math.hypot(mx, my);
    mx /= len; my /= len;
    p.walkT += dt * 10;
    p.x += mx * p.speed * dt;
    p.y += my * p.speed * dt;
    const c = collideWalls(p.x, p.y, p.r);
    p.x = c.x; p.y = c.y;
    if (inp.face === undefined) p.face = Math.atan2(my, mx);
  }
  if (inp.face !== undefined) p.face = inp.face;
  if (inp.fire) tryFire(p, dt);
}

function updateZombies(dt) {
  const ps = G.players.filter(p => p.alive);
  for (const z of G.zombies) {
    if (z.dead) continue;
    z.cd = Math.max(0, z.cd - dt);
    z.slowT = Math.max(0, z.slowT - dt);
    if (!ps.length) break;
    // 追最近的活人
    let tp = ps[0], nd = Infinity;
    for (const p of ps) {
      const d = dist2(z.x, z.y, p.x, p.y);
      if (d < nd) { nd = d; tp = p; }
    }
    const d = Math.sqrt(nd);
    const a = Math.atan2(tp.y - z.y, tp.x - z.x);
    z.face = a;
    z.walkT += dt * 8;
    if (d > z.r + tp.r + 4) {
      const sp = z.speed * (z.slowT > 0 ? 0.4 : 1);
      z.x += Math.cos(a) * sp * dt;
      z.y += Math.sin(a) * sp * dt;
      const c = collideWalls(z.x, z.y, z.r);
      z.x = c.x; z.y = c.y;
    } else if (z.cd <= 0) {
      z.cd = 0.6;
      damagePlayer(tp, z.dmg, z);
    }
  }
  // 僵尸间简单挤开
  const zs = G.zombies;
  for (let i = 0; i < zs.length; i++) {
    const a = zs[i]; if (a.dead) continue;
    for (let j = i + 1; j < zs.length; j++) {
      const b = zs[j]; if (b.dead) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const rr = a.r + b.r;
      const d2 = dx * dx + dy * dy;
      if (d2 < rr * rr && d2 > 0.01) {
        const d = Math.sqrt(d2), push = (rr - d) / 2 / d;
        a.x -= dx * push; a.y -= dy * push;
        b.x += dx * push; b.y += dy * push;
      }
    }
  }
  G.zombies = zs.filter(z => !z.dead);
}

function updateBullets(dt) {
  for (const bl of G.bullets) {
    bl.life -= dt;
    bl.x += bl.vx * dt;
    bl.y += bl.vy * dt;
    if (bl.life <= 0) { bl.dead = true; continue; }
    // 撞墙
    if (hitsWall(bl.x, bl.y, 3)) {
      if (bl.kind === 'rocket') explode(bl.x, bl.y, 90, bl.dmg, bl.owner);
      else addParticles(bl.x, bl.y, 3, '#C9C2B2', 80, 0.2, 2);
      bl.dead = true; continue;
    }
    // 撞油桶 / 地雷
    for (const b of G.barrels) {
      if (!b.dead && dist2(bl.x, bl.y, b.x, b.y) < (b.r + 3) * (b.r + 3)) {
        b.hp -= bl.dmg; bl.dead = true;
        if (b.hp <= 0) { b.dead = true; explode(b.x, b.y, 95, 110, bl.owner); }
        break;
      }
    }
    if (bl.dead) continue;
    // 撞僵尸
    for (const z of G.zombies) {
      if (!z.dead && dist2(bl.x, bl.y, z.x, z.y) < (z.r + 3) * (z.r + 3)) {
        if (bl.kind === 'rocket') explode(bl.x, bl.y, 90, bl.dmg, bl.owner);
        else hurtZombie(z, bl.dmg, bl.owner);
        bl.dead = true; break;
      }
    }
    if (bl.dead) continue;
    // 对战：子弹伤敌对方
    if (G.mode === 'versus') {
      for (const p of G.players) {
        if (p.alive && p !== bl.owner && dist2(bl.x, bl.y, p.x, p.y) < (p.r + 3) * (p.r + 3)) {
          if (bl.kind === 'rocket') explode(bl.x, bl.y, 90, bl.dmg, bl.owner);
          else damagePlayer(p, bl.dmg, bl.owner);
          bl.dead = true; break;
        }
      }
    }
  }
  G.bullets = G.bullets.filter(b => !b.dead);
}

function updateGadgets(dt) {
  for (const g of G.grenades) {
    g.fuse -= dt;
    g.x += g.vx * dt; g.y += g.vy * dt;
    g.vx *= 0.9; g.vy *= 0.9;
    if (hitsWall(g.x, g.y, 6)) { g.vx = g.vy = 0; const c = collideWalls(g.x, g.y, 6); g.x = c.x; g.y = c.y; }
    if (g.fuse <= 0) { g.dead = true; explode(g.x, g.y, 80, 95, g.owner); }
  }
  G.grenades = G.grenades.filter(g => !g.dead);

  for (const m of G.mines) {
    if (m.dead) continue;
    m.armT -= dt; m.blink += dt;
    if (m.armT <= 0) {
      let trig = false;
      for (const z of G.zombies) if (!z.dead && dist2(m.x, m.y, z.x, z.y) < 44 * 44) { trig = true; break; }
      if (!trig) for (const p of G.players) {
        if (p.alive && p !== m.owner && dist2(m.x, m.y, p.x, p.y) < 40 * 40) { trig = true; break; }
      }
      if (trig) { m.dead = true; explode(m.x, m.y, 85, 120, m.owner); }
    }
  }
  G.mines = G.mines.filter(m => !m.dead);
  G.barrels = G.barrels.filter(b => !b.dead);
}

function updatePickups(dt) {
  for (const pk of G.pickups) {
    pk.t += dt; pk.life -= dt;
    if (pk.life <= 0) { pk.dead = true; continue; }
    for (const p of G.players) {
      if (!p.alive) continue;
      if (dist2(pk.x, pk.y, p.x, p.y) < 30 * 30) {
        if (pk.kind === 'med') {
          p.hp = Math.min(100, p.hp + 40);
          toast(p.label + ' 恢复生命 +40', '#7BE07B');
        } else {
          // 补当前武器弹药，没有弹药物品就给分
          const w = curWeapon(p);
          if (w.max) { p.ammo[w.id] = Math.min(w.max, (p.ammo[w.id] || 0) + Math.ceil(w.max * 0.35)); toast(p.label + ' ' + w.name + '弹药 +' + Math.ceil(w.max * 0.35), '#F7A026'); }
          else {
            const alt = p.weapons.map(i => WEAPONS[i]).find(w2 => w2.max && (p.ammo[w2.id] || 0) < w2.max);
            if (alt) { p.ammo[alt.id] = Math.min(alt.max, (p.ammo[alt.id] || 0) + Math.ceil(alt.max * 0.35)); toast(p.label + ' ' + alt.name + '弹药 +' + Math.ceil(alt.max * 0.35), '#F7A026'); }
            else { G.score += 200 * G.mult; toast(p.label + ' 得分 +' + 200 * G.mult, '#F7A026'); }
          }
        }
        Sfx.pickup();
        pk.dead = true;
        break;
      }
    }
  }
  G.pickups = G.pickups.filter(p => !p.dead);
}

function update(dt) {
  // 延迟队列（连锁爆炸）
  for (const d of G.delayed) if (G.t >= d.t && !d.done) { d.done = true; d.fn(); }
  G.delayed = G.delayed.filter(d => !d.done);

  // 粒子与浮字
  for (const pt of G.particles) {
    pt.t += dt;
    pt.x += pt.vx * dt; pt.y += pt.vy * dt;
    pt.vx *= 0.92; pt.vy *= 0.92;
  }
  G.particles = G.particles.filter(p => p.t < p.life);
  for (const t of G.toasts) t.t += dt;
  G.toasts = G.toasts.filter(t => t.t < t.life);
  for (const dcl of G.decals) dcl.a = Math.max(0.22, dcl.a - dt * 0.008);

  G.shake = Math.max(0, G.shake - dt * 30);

  if (G.state === 'countdown') {
    G.countdownT -= dt;
    if (G.countdownT <= 0) G.state = 'play';
    return;
  }
  if (G.state !== 'play') return;

  G.t += dt;

  // 连击衰减
  if (G.comboT > 0) {
    G.comboT -= dt;
    if (G.comboT <= 0) { G.combo = 0; G.mult = 1; }
  }

  // 僵尸生成：随时间与击杀加压
  G.spawnT -= dt;
  const target = Math.min(4 + Math.floor(G.t / 11) + Math.floor(G.kills / 16), G.mode === 'versus' ? 14 : 26);
  if (G.spawnT <= 0 && G.zombies.length < target) {
    spawnZombie();
    G.spawnT = Math.max(0.35, 1.3 - G.t * 0.004);
  }

  for (const p of G.players) updatePlayer(p, dt);
  updateZombies(dt);
  updateBullets(dt);
  updateGadgets(dt);
  updatePickups(dt);
}

/* ============================================================
   渲染
   ============================================================ */
const floorLayer = document.createElement('canvas');
floorLayer.width = W; floorLayer.height = H;
const fctx = floorLayer.getContext('2d');

function drawBlock(g, b, sideCol, topCol) {
  g.fillStyle = sideCol;
  g.fillRect(b.x, b.y + 9, b.w, b.h);
  g.fillStyle = topCol;
  g.fillRect(b.x, b.y, b.w, b.h);
  g.strokeStyle = C.wallEdge;
  g.lineWidth = 2;
  g.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
}

function buildFloor(mapIdx) {
  const g = fctx;
  g.fillStyle = C.floor;
  g.fillRect(0, 0, W, H);
  // 地板细格与磨损
  g.strokeStyle = C.floorLine;
  g.lineWidth = 1;
  for (let x = 0; x <= W; x += 40) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  for (let y = 0; y <= H; y += 40) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  let seed = mapIdx * 97 + 13;
  const srand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 26; i++) {
    g.fillStyle = 'rgba(120,105,80,' + (0.03 + srand() * 0.04) + ')';
    g.beginPath();
    g.ellipse(srand() * W, srand() * H, 20 + srand() * 60, 12 + srand() * 30, srand() * 3, 0, TAU);
    g.fill();
  }
  // 外墙
  const t = WALL_T;
  drawBlock(g, { x: 0, y: 0, w: W, h: t }, '#7E7E88', '#D8D3C4');
  drawBlock(g, { x: 0, y: H - t, w: W, h: t }, '#7E7E88', '#D8D3C4');
  drawBlock(g, { x: 0, y: 0, w: t, h: H }, '#7E7E88', '#D8D3C4');
  drawBlock(g, { x: W - t, y: 0, w: t, h: H }, '#7E7E88', '#D8D3C4');
  // 入场口（四边中点开槽）
  g.fillStyle = '#55504A';
  for (const gt of SPAWN_GATES) {
    if (gt.x === W / 2) g.fillRect(gt.x - 34, gt.y < H / 2 ? 2 : H - t - 2, 68, t);
    else g.fillRect(gt.x < W / 2 ? 2 : W - t - 2, gt.y - 34, t, 68);
  }
  g.fillStyle = C.amber;
  for (const gt of SPAWN_GATES) {
    if (gt.x === W / 2) { g.fillRect(gt.x - 30, gt.y < H / 2 ? t - 6 : H - t + 1, 60, 4); }
    else { g.fillRect(gt.x < W / 2 ? t - 6 : W - t + 1, gt.y - 30, 4, 60); }
  }
  // 室内方块
  for (const b of MAPS[mapIdx].blocks) drawBlock(g, b, C.wallSide, C.wallTop);
}

/* ---------- 画小人 ---------- */
function drawHumanoid(x, y, r, face, color, colorDark, skinCol, walkT, opts) {
  opts = opts || {};
  const bob = Math.sin(walkT) * 1.2;
  ctx.fillStyle = 'rgba(0,0,0,.18)';
  ctx.beginPath(); ctx.ellipse(x, y + r * 0.75, r * 0.9, r * 0.38, 0, 0, TAU); ctx.fill();

  ctx.save();
  ctx.translate(x, y + bob * 0.4);
  ctx.rotate(Math.sin(walkT) * 0.05);
  // 手臂（朝面向）
  ctx.save();
  ctx.rotate(face);
  ctx.fillStyle = colorDark;
  ctx.fillRect(r * 0.5, -r * 0.62, r * 0.85, r * 0.34);
  ctx.fillRect(r * 0.5, r * 0.28, r * 0.85, r * 0.34);
  ctx.restore();
  // 身体：侧面 + 顶面（伪 3D 方块）
  ctx.fillStyle = colorDark;
  ctx.fillRect(-r * 0.85, -r * 0.7 + 4, r * 1.7, r * 1.5);
  ctx.fillStyle = color;
  ctx.fillRect(-r * 0.85, -r * 0.7, r * 1.7, r * 1.5);
  ctx.strokeStyle = '#2B2B33';
  ctx.lineWidth = 2;
  ctx.strokeRect(-r * 0.85, -r * 0.7, r * 1.7, r * 1.5);
  // 头（略偏向面向）
  const hx = Math.cos(face) * 2.5, hy = Math.sin(face) * 2.5;
  ctx.fillStyle = skinCol;
  ctx.fillRect(-r * 0.45 + hx, -r * 0.45 + hy, r * 0.9, r * 0.9);
  ctx.strokeRect(-r * 0.45 + hx, -r * 0.45 + hy, r * 0.9, r * 0.9);
  if (opts.band) {
    ctx.fillStyle = opts.band;
    ctx.fillRect(-r * 0.45 + hx, -r * 0.45 + hy, r * 0.9, r * 0.3);
  }
  ctx.restore();
}

function drawPlayer(p) {
  if (!p.alive) return;
  ctx.save();
  if (p.invulnT > 0 && Math.floor(G.t * 12) % 2) ctx.globalAlpha = 0.35;
  drawHumanoid(p.x, p.y, p.r, p.face, p.color, p.colorDark, C.skin, p.walkT, { band: p.colorDark });
  // 枪
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.face);
  ctx.fillStyle = C.gun;
  ctx.fillRect(p.r * 0.6, -3, p.r + 8, 6);
  if (p.muzzle > 0) {
    ctx.fillStyle = '#FFE08A';
    ctx.beginPath();
    ctx.moveTo(p.r * 1.6 + 8, 0);
    ctx.lineTo(p.r * 1.6 + 20, -6);
    ctx.lineTo(p.r * 1.6 + 20, 6);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  if (p.hurtT > 0) {
    ctx.globalAlpha = p.hurtT * 2;
    ctx.fillStyle = '#FF3B30';
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 2, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

function drawZombie(z) {
  const pal = z.type === 'fast' ? [C.fast, C.fastDk] : z.type === 'brute' ? [C.brute, C.bruteDk] : [C.zombie, C.zombieDk];
  drawHumanoid(z.x, z.y, z.r, z.face, pal[0], pal[1], '#D9D3C2', z.walkT, null);
  if (z.hp < z.maxHp) {
    const w = z.r * 2;
    ctx.fillStyle = 'rgba(0,0,0,.5)';
    ctx.fillRect(z.x - w / 2, z.y - z.r - 9, w, 4);
    ctx.fillStyle = '#7BE07B';
    ctx.fillRect(z.x - w / 2, z.y - z.r - 9, w * clamp(z.hp / z.maxHp, 0, 1), 4);
  }
}

/* ---------- 画物件 ---------- */
function drawBarrel(b) {
  ctx.fillStyle = 'rgba(0,0,0,.18)';
  ctx.beginPath(); ctx.ellipse(b.x, b.y + 10, 12, 5, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = '#8C2A1E';
  ctx.fillRect(b.x - 11, b.y - 6, 22, 18);
  ctx.fillStyle = '#C0392B';
  ctx.fillRect(b.x - 11, b.y - 11, 22, 18);
  ctx.fillStyle = '#E05A41';
  ctx.fillRect(b.x - 11, b.y - 11, 22, 5);
  ctx.strokeStyle = '#2B2B33';
  ctx.lineWidth = 2;
  ctx.strokeRect(b.x - 11, b.y - 11, 22, 18);
}
function drawMine(m) {
  ctx.fillStyle = '#3A3A44';
  ctx.beginPath(); ctx.arc(m.x, m.y, 7, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#22222A'; ctx.lineWidth = 2; ctx.stroke();
  if (m.armT <= 0 && Math.floor(m.blink * 4) % 2) {
    ctx.fillStyle = '#FF3B30';
    ctx.beginPath(); ctx.arc(m.x, m.y, 2.5, 0, TAU); ctx.fill();
  }
}
function drawGrenade(g) {
  ctx.fillStyle = '#4A5D3A';
  ctx.beginPath(); ctx.arc(g.x, g.y, 5.5, 0, TAU); ctx.fill();
  ctx.strokeStyle = '#2B2B33'; ctx.lineWidth = 1.5; ctx.stroke();
  if (g.fuse < 0.35 && Math.floor(g.fuse * 20) % 2) {
    ctx.fillStyle = '#FF3B30';
    ctx.beginPath(); ctx.arc(g.x, g.y - 7, 2.5, 0, TAU); ctx.fill();
  }
}
function drawPickup(pk) {
  const bob = Math.sin(pk.t * 4) * 3;
  const fade = pk.life < 3 ? (Math.floor(pk.life * 6) % 2 ? 0.35 : 1) : 1;
  ctx.save();
  ctx.globalAlpha = fade;
  ctx.translate(pk.x, pk.y + bob);
  if (pk.kind === 'med') {
    ctx.fillStyle = '#F4F1E8'; ctx.fillRect(-10, -10, 20, 20);
    ctx.strokeStyle = '#2B2B33'; ctx.lineWidth = 2; ctx.strokeRect(-10, -10, 20, 20);
    ctx.fillStyle = '#D9382B';
    ctx.fillRect(-3, -7, 6, 14); ctx.fillRect(-7, -3, 14, 6);
  } else {
    ctx.fillStyle = '#C97A10'; ctx.fillRect(-10, -6, 20, 16);
    ctx.fillStyle = '#F7A026'; ctx.fillRect(-10, -10, 20, 16);
    ctx.strokeStyle = '#2B2B33'; ctx.lineWidth = 2; ctx.strokeRect(-10, -10, 20, 16);
    ctx.fillStyle = '#2B2B33'; ctx.fillRect(-5, -4, 10, 4);
  }
  ctx.restore();
}

/* ---------- HUD ---------- */
function strokeText(text, x, y, font, fill, lw) {
  ctx.font = font;
  ctx.lineWidth = lw || 4;
  ctx.strokeStyle = 'rgba(20,20,28,.85)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}
function drawHUD() {
  // 记分牌
  strokeText(String(G.score).padStart(13, '0'), W / 2, 46, '20px "Press Start 2P", monospace', '#FFFFFF');
  ctx.beginPath(); ctx.arc(W / 2, 84, 17, 0, TAU);
  ctx.fillStyle = 'rgba(20,20,28,.55)'; ctx.fill();
  ctx.strokeStyle = C.amber; ctx.lineWidth = 2.5; ctx.stroke();
  strokeText('x' + G.mult, W / 2, 85, '11px "Press Start 2P", monospace', C.amber, 3);

  // 玩家头顶状态
  for (const p of G.players) {
    if (!p.alive) continue;
    const w = curWeapon(p);
    const ammoTxt = w.max ? w.name + ' ' + (p.ammo[w.id] || 0) : w.name + ' ∞';
    strokeText(ammoTxt, p.x, p.y - p.r - 22, 'bold 11px "PingFang SC","Microsoft YaHei",sans-serif', '#FFFFFF', 3);
    ctx.fillStyle = 'rgba(0,0,0,.5)';
    ctx.fillRect(p.x - 16, p.y - p.r - 15, 32, 5);
    ctx.fillStyle = p.hp > 35 ? '#7BE07B' : '#FF5A4E';
    ctx.fillRect(p.x - 16, p.y - p.r - 15, 32 * clamp(p.hp / 100, 0, 1), 5);
  }

  // 左下信息
  const mm = Math.floor(G.t / 60), ss = String(Math.floor(G.t % 60)).padStart(2, '0');
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  strokeText('击杀 ' + G.kills + ' · ' + mm + ':' + ss, 40, H - 36, 'bold 13px "PingFang SC","Microsoft YaHei",sans-serif', '#FFFFFF', 3);
  ctx.textAlign = 'center';

  // 对战比分
  if (G.mode === 'versus') {
    strokeText('P1 ⚔ ' + G.players[0].frags + '/10', 90, 46, 'bold 16px "PingFang SC","Microsoft YaHei",sans-serif', C.amber);
    strokeText('P2 ⚔ ' + G.players[1].frags + '/10', W - 90, 46, 'bold 16px "PingFang SC","Microsoft YaHei",sans-serif', '#7FB2F0');
  }

  // 浮字
  let ty = 118;
  for (const t of G.toasts) {
    const a = t.t < 0.15 ? t.t / 0.15 : t.t > t.life - 0.5 ? (t.life - t.t) / 0.5 : 1;
    ctx.save();
    ctx.globalAlpha = clamp(a, 0, 1);
    strokeText(t.text, W / 2, ty, 'bold 17px "PingFang SC","Microsoft YaHei",sans-serif', t.color);
    ctx.restore();
    ty += 26;
  }
}

function drawVeil(alpha) {
  ctx.fillStyle = 'rgba(24,27,56,' + alpha + ')';
  ctx.fillRect(0, 0, W, H);
}
function drawOverlays() {
  if (G.state === 'countdown') {
    drawVeil(0.35);
    const n = Math.ceil(G.countdownT / 0.8);
    const txt = n > 0 ? String(n) : 'GO!';
    strokeText(txt, W / 2, H / 2 - 20, '64px "Press Start 2P", monospace', C.amber, 8);
    const modeName = G.mode === 'single' ? '单人求生' : G.mode === 'coop' ? '双人合作' : '双人对战';
    strokeText(modeName + ' · ' + MAPS[G.mapIdx].name, W / 2, H / 2 + 40, 'bold 20px "PingFang SC","Microsoft YaHei",sans-serif', '#FFFFFF');
  } else if (G.state === 'paused') {
    drawVeil(0.55);
    strokeText('已暂停', W / 2, H / 2 - 16, '900 42px "PingFang SC","Microsoft YaHei",sans-serif', '#FFFFFF', 7);
    strokeText('按 P 继续 · Esc 回菜单', W / 2, H / 2 + 34, 'bold 16px "PingFang SC","Microsoft YaHei",sans-serif', C.amber);
  } else if (G.state === 'over') {
    drawVeil(0.6);
    if (G.mode === 'versus' && G.winner >= 0) {
      strokeText('玩家' + (G.winner === 0 ? '一' : '二') + ' 获胜！', W / 2, H / 2 - 60, '900 46px "PingFang SC","Microsoft YaHei",sans-serif', G.winner === 0 ? C.amber : '#7FB2F0', 8);
      strokeText(G.players[0].frags + ' : ' + G.players[1].frags, W / 2, H / 2 - 6, '28px "Press Start 2P", monospace', '#FFFFFF');
    } else {
      strokeText('游戏结束', W / 2, H / 2 - 60, '900 46px "PingFang SC","Microsoft YaHei",sans-serif', '#FF6B5E', 8);
      strokeText('得分 ' + G.score + ' · 击杀 ' + G.kills, W / 2, H / 2 - 4, 'bold 20px "PingFang SC","Microsoft YaHei",sans-serif', '#FFFFFF');
    }
    const mm = Math.floor(G.t / 60), ss = String(Math.floor(G.t % 60)).padStart(2, '0');
    strokeText('存活时间 ' + mm + ':' + ss, W / 2, H / 2 + 34, 'bold 16px "PingFang SC","Microsoft YaHei",sans-serif', '#D7C6AD');
    strokeText('按 R 再来一局 · Esc 返回菜单', W / 2, H / 2 + 74, 'bold 17px "PingFang SC","Microsoft YaHei",sans-serif', C.amber);
  }
}

/* ---------- 主渲染 ---------- */
function render() {
  ctx.save();
  if (G.shake > 0.3) ctx.translate(rand(-G.shake, G.shake) * 0.5, rand(-G.shake, G.shake) * 0.5);

  ctx.drawImage(floorLayer, 0, 0);

  for (const d of G.decals) {
    ctx.fillStyle = (d.color === 'blood' ? C.blood : C.scorch) + d.a + ')';
    ctx.beginPath(); ctx.ellipse(d.x, d.y, d.r, d.r * 0.7, 0, 0, TAU); ctx.fill();
  }
  for (const pk of G.pickups) drawPickup(pk);
  for (const m of G.mines) drawMine(m);
  for (const b of G.barrels) drawBarrel(b);
  for (const g of G.grenades) drawGrenade(g);
  for (const z of G.zombies) drawZombie(z);
  for (const p of G.players) drawPlayer(p);

  for (const bl of G.bullets) {
    const a = Math.atan2(bl.vy, bl.vx);
    ctx.save();
    ctx.translate(bl.x, bl.y);
    ctx.rotate(a);
    if (bl.kind === 'rocket') {
      ctx.fillStyle = '#3A3A44'; ctx.fillRect(-8, -3.5, 16, 7);
      ctx.fillStyle = '#F7A026'; ctx.fillRect(4, -3.5, 4, 7);
      G.particles.push({ x: bl.x - Math.cos(a) * 10, y: bl.y - Math.sin(a) * 10, vx: rand(-14, 14), vy: rand(-14, 14), t: 0, life: 0.35, color: '#9A9590', size: 4 });
    } else if (bl.kind === 'pellet') {
      ctx.fillStyle = '#4A4A55'; ctx.fillRect(-3, -1.5, 6, 3);
    } else {
      ctx.fillStyle = '#FFE08A'; ctx.fillRect(-5, -1.5, 10, 3);
      ctx.fillStyle = '#2E2E36'; ctx.fillRect(-2, -1.5, 5, 3);
    }
    ctx.restore();
  }

  for (const pt of G.particles) {
    ctx.globalAlpha = clamp(1 - pt.t / pt.life, 0, 1);
    ctx.fillStyle = pt.color;
    ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
  }
  ctx.globalAlpha = 1;

  ctx.restore();
  drawHUD();
  drawOverlays();
}

/* ============================================================
   全局按键 / 主循环
   ============================================================ */
function globalKeys() {
  if (pressed['KeyM']) toast(Sfx.toggleMute() ? '已静音' : '声音开启', '#D7C6AD');
  if (pressed['KeyP']) {
    if (G.state === 'play') G.state = 'paused';
    else if (G.state === 'paused') G.state = 'play';
  }
  if (pressed['Escape'] && ['play', 'paused', 'over'].includes(G.state)) backToMenu();
  if (pressed['KeyR'] && G.state === 'over') startGame(G.mode, G.mapIdx);
  if (pressed['Enter'] && G.state === 'menu') startGame(selMode, selMap);
}

let lastT = 0;
const WARP = (() => {
  const m = location.search.match(/warp=(\d+)/);
  return m ? clamp(+m[1], 1, 30) : 1;   // 测试用：?warp=N 加速 N 倍
})();
function loop(ts) {
  requestAnimationFrame(loop);
  const dt = Math.min((ts - lastT) / 1000 || 0.016, 0.05);
  lastT = ts;
  globalKeys();
  if (G.state !== 'paused' && G.state !== 'menu') {
    for (let i = 0; i < WARP; i++) update(dt);
  }
  if (G.state !== 'menu') render();
  for (const k in pressed) delete pressed[k];
}

/* ============================================================
   菜单与启动
   ============================================================ */
let selMode = 'single', selMap = 0;
const MODE_NOTES = {
  single: '独自顶住一波波僵尸，活得越久越强。',
  coop:   '两人挤一个键盘背靠背守房间，一人倒下，另一人孤军奋战。',
  versus: '互相开火 + 僵尸搅局，先拿 10 个人头获胜（阵亡 2.5 秒后复活）。',
};
document.querySelectorAll('.mbtn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mbtn').forEach(b => b.classList.remove('sel'));
    btn.classList.add('sel');
    selMode = btn.dataset.mode;
    document.getElementById('modeNote').textContent = MODE_NOTES[selMode];
    Sfx.unlock(); Sfx.ui();
  });
});
document.querySelectorAll('.mapbtn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mapbtn').forEach(b => b.classList.remove('sel'));
    btn.classList.add('sel');
    selMap = +btn.dataset.map;
    Sfx.unlock(); Sfx.ui();
  });
});
document.getElementById('startBtn').addEventListener('click', () => {
  Sfx.unlock(); Sfx.ui();
  startGame(selMode, selMap);
});
document.getElementById('screenWrap').addEventListener('dblclick', () => {
  const el = document.getElementById('screenWrap');
  if (document.fullscreenElement) document.exitFullscreen();
  else if (el.requestFullscreen) el.requestFullscreen();
});

/* ---------- 启动 ---------- */
buildFloor(0);
if (location.search.includes('demo=1')) {
  G.demo = true;
  startGame('single', 0);
  G.countdownT = 0.01;
}
requestAnimationFrame(loop);
