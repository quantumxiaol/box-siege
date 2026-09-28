import * as Phaser from 'phaser';
import { W, H, WALL_T, C, css, TAU, rand, clamp, dist2, pick, GameMode, Difficulty } from '../config';
import { MAPS, SPAWN_GATES, MapDef } from '../data/maps';
import { WEAPONS, UNLOCK_AT } from '../data/weapons';
import { TEX, BLOOD_VARIANTS, drawBlockSide, drawBlockTop, ensureBlockTopTexture } from '../textures';
import { collideWalls, hitsWall } from '../collision';
import { Input, CTRL_P1, CTRL_P2, bindInputLifecycle, InputFrame } from '../input';
import { Sfx } from '../sfx';
import { Player, Zombie, Bullet, Grenade, Mine, Barrel, Pickup, ZombieType, ZOMBIE_WINDUP, Devil, Fireball, DEVIL_WINDUP } from '../objects/entities';
import { ParticlePool, Toasts } from '../objects/fx';
import { NavGrid } from '../ai/navgrid';
import { Bot, Persona } from '../ai/bot';

export interface GameSceneData {
  mode?: GameMode;
  mapIdx?: number;
  difficulty?: Difficulty;
}

type State = 'countdown' | 'play' | 'paused' | 'over';

export class Game extends Phaser.Scene {
  /** 以下字段对 bot 可见（GameAccess 结构化接口） */
  mode: GameMode = 'single';
  t = 0;
  players: Player[] = [];
  zombies: Zombie[] = [];
  devils: Devil[] = [];
  fireballs: Fireball[] = [];
  mines: Mine[] = [];
  barrels: Barrel[] = [];
  pickups: Pickup[] = [];
  grenades: Grenade[] = [];
  bullets: Bullet[] = [];
  nav!: NavGrid;

  private diff: Difficulty = 'hard';
  private mapIdx = 0;
  private map!: MapDef;
  get blocks() { return this.map.blocks; }
  private state: State = 'countdown';
  private countdownT = 2.4;
  private lastCount = 0;

  private delayed: { t: number; done: boolean; fn: () => void }[] = [];

  private score = 0;
  private kills = 0;
  private combo = 0;
  private comboT = 0;
  private mult = 1;
  private spawnT = 1.2;
  private wave = 1;
  private crateT = 8;
  private spotT = 0.1;
  private winner = -1;
  private overT = 0;
  private seenFast = false;
  private seenBrute = false;
  private seenDevil = false;
  private flowT = 0;
  private speedMul = 1;

  private keyInput!: Input;
  private particles!: ParticlePool;
  private toasts!: Toasts;
  /** 地面贴花（血迹/焦痕），环形复用 420 个 Image，不销毁不新建 */
  private decals: Phaser.GameObjects.Image[] = [];
  private decalPtr = 0;
  private static readonly DECAL_MAX = 420;

  private scoreText!: Phaser.GameObjects.Text;
  private multText!: Phaser.GameObjects.Text;
  private waveText!: Phaser.GameObjects.Text;
  private veil!: Phaser.GameObjects.Rectangle;
  private centerText!: Phaser.GameObjects.Text;
  private subText!: Phaser.GameObjects.Text;
  private hud: { p: Player; label: Phaser.GameObjects.Text; hpBack: Phaser.GameObjects.Rectangle; hpFill: Phaser.GameObjects.Rectangle; lastLabel: string; lastW: number; lastBand: number }[] = [];

  constructor() {
    super('Game');
  }

  create(data: GameSceneData) {
    this.mode = data.mode ?? 'single';
    this.diff = data.difficulty ?? 'hard';
    this.mapIdx = data.mapIdx ?? 0;
    this.map = MAPS[this.mapIdx];
    this.state = 'countdown';
    this.countdownT = 2.4;
    this.lastCount = 0;
    this.t = 0;
    this.score = 0; this.kills = 0; this.combo = 0; this.comboT = 0; this.mult = 1;
    this.spawnT = 1.2;
    this.wave = 1;
    this.crateT = 8;
    this.spotT = 0.1;
    this.winner = -1;
    this.seenFast = false;
    this.seenBrute = false;
    this.seenDevil = false;
    this.players = []; this.zombies = []; this.bullets = [];
    this.devils = []; this.fireballs = [];
    this.grenades = []; this.mines = []; this.barrels = []; this.pickups = [];
    this.delayed = [];

    this.buildStaticLayers();

    this.decals = [];
    this.decalPtr = 0;
    this.nav = new NavGrid(this.map.blocks);

    this.particles = new ParticlePool(this);
    this.toasts = new Toasts(this);

    // 玩家
    const sp = this.map.spawns;
    if (this.mode === 'single') {
      this.players = [new Player(this, 0, sp.single[0][0], sp.single[0][1])];
    } else if (this.mode === 'coop' || this.mode === 'aiMate' || this.mode === 'spectate') {
      this.players = sp.coop.map((s, i) => new Player(this, i, s[0], s[1]));
    } else {
      const p1 = new Player(this, 0, sp.versus[0][0], sp.versus[0][1]); p1.face = 0;
      const p2 = new Player(this, 1, sp.versus[1][0], sp.versus[1][1]); p2.face = Math.PI;
      this.players = [p1, p2];
    }
    if (this.diff === 'easy') {
      for (const p of this.players) p.speed = 185;
    }
    // AI 接管
    const aggressive: Persona = { engage: 190, safe: 120, hunger: 0.5, jitter: 0.04, orbitDir: 1 };
    const cautious: Persona = { engage: 250, safe: 170, hunger: 0.9, jitter: 0.07, orbitDir: -1 };
    if (this.mode === 'aiMate') this.players[1].bot = new Bot(this, this.players[1], cautious);
    if (this.mode === 'aiVersus') this.players[1].bot = new Bot(this, this.players[1], aggressive);
    if (this.mode === 'spectate') {
      this.players[0].bot = new Bot(this, this.players[0], aggressive);
      this.players[1].bot = new Bot(this, this.players[1], cautious);
    }
    this.barrels = this.map.barrels.map(b => new Barrel(this, b.x, b.y));

    this.buildHUD();

    // 输入
    this.keyInput = new Input();
    bindInputLifecycle(this, this.keyInput);
    this.keyInput.onPause = () => this.togglePause();
    this.keyInput.onMute = () => {
      const muted = Sfx.toggleMute();
      this.toasts.show(muted ? '已静音（M 恢复）' : '声音开启', '#F7A026');
    };
    this.keyInput.onFullscreen = () => this.scale.toggleFullscreen();
    this.keyInput.onEscape = () => this.scene.start('MainMenu');
    // 单人模式：空格暂停（不再兼任射击）
    this.keyInput.onSpace = () => {
      // 仅 AI 演示：空格切换 2 倍速（其他模式空格是 P2 开火/无功能）
      if (this.isSpectate()) {
        this.speedMul = this.speedMul === 1 ? 2 : 1;
        this.toasts.show(this.speedMul === 2 ? '2 倍速' : '1 倍速', '#F7A026');
      }
    };

    this.toasts.show(`${this.map.name} · ${this.diff === 'easy' ? '简单' : '困难'}`, '#FFFFFF');

    // 调试句柄（方便排查/二开）
    (window as unknown as { __scene: Game }).__scene = this;
  }

  private isVersus() { return this.mode === 'versus' || this.mode === 'aiVersus'; }

  private isSpectate() { return this.mode === 'spectate'; }

  /* ---------------- 静态层：地面 + 外墙 + 方块 ---------------- */

  private buildStaticLayers() {
    const g = this.add.graphics().setDepth(0);
    // 地面
    g.fillStyle(C.floor, 1);
    g.fillRect(0, 0, W, H);
    g.fillStyle(C.floorDark, 0.35);
    for (let i = 0; i < 420; i++) {
      g.fillRect(rand(WALL_T, W - WALL_T), rand(WALL_T, H - WALL_T), rand(1, 3), rand(1, 3));
    }
    // 外墙（顶面 + 内侧厚度带）
    const walls = [
      { x: 0, y: 0, w: W, h: WALL_T },
      { x: 0, y: H - WALL_T, w: W, h: WALL_T },
      { x: 0, y: 0, w: WALL_T, h: H },
      { x: W - WALL_T, y: 0, w: WALL_T, h: H },
    ];
    for (const wl of walls) drawBlockSide(g, wl, 10);
    for (const wl of walls) drawBlockTop(g, wl.x, wl.y, wl.w, wl.h);
    // 场内边界细线
    g.lineStyle(2, C.floorDark, 0.7);
    g.strokeRect(WALL_T + 1, WALL_T + 1, W - WALL_T * 2 - 2, H - WALL_T * 2 - 2);
    // 生成门标记（四边中点暗门 + 警示箭头）
    for (const gate of SPAWN_GATES) {
      const horiz = gate.y < H / 2 ? 1 : gate.y > H / 2 ? -1 : 0;
      const gx = horiz !== 0 ? gate.x - 26 : gate.x - 6;
      const gy = horiz !== 0 ? (horiz > 0 ? 3 : H - WALL_T + 3) : gate.y - 26;
      const gw = horiz !== 0 ? 52 : WALL_T - 6;
      const gh = horiz !== 0 ? WALL_T - 6 : 52;
      g.fillStyle(0x3a2c24, 1);
      g.fillRoundedRect(gx, gy, gw, gh, 4);
      g.fillStyle(0xc23a1e, 0.75);
      if (horiz !== 0) {
        const ay = horiz > 0 ? gy + gh - 6 : gy + 6;
        for (let i = -1; i <= 1; i++) {
          g.fillTriangle(gate.x + i * 14 - 5, ay, gate.x + i * 14 + 5, ay, gate.x + i * 14, ay + horiz * 7);
        }
      } else {
        const ax = gate.x < W / 2 ? gx + gw - 6 : gx + 6;
        const dir = gate.x < W / 2 ? 1 : -1;
        for (let i = -1; i <= 1; i++) {
          g.fillTriangle(ax, gate.y + i * 14 - 5, ax, gate.y + i * 14 + 5, ax + dir * 7, gate.y + i * 14);
        }
      }
    }
    // 内部方块：侧立面进静态层，顶面独立贴图按 y 排序（遮挡）
    for (const b of this.map.blocks) {
      drawBlockSide(g, b);
      const key = ensureBlockTopTexture(this, b.w, b.h);
      this.add.image(b.x - 2, b.y - 2, key).setOrigin(0, 0).setDepth(b.y + b.h);
    }
  }

  /* ---------------- HUD ---------------- */

  private buildHUD() {
    this.scoreText = this.add.text(W / 2, 14, '0'.repeat(13), {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '20px',
      color: '#FFFFFF',
      stroke: '#1a1a1a',
      strokeThickness: 5,
    }).setOrigin(0.5, 0).setDepth(1000);
    this.multText = this.add.text(W / 2, 44, '', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '14px',
      color: css(C.amber),
      stroke: '#1a1a1a',
      strokeThickness: 4,
    }).setOrigin(0.5, 0).setDepth(1000);
    this.waveText = this.add.text(WALL_T + 10, 12, '第 1 波', {
      fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif',
      fontSize: '15px',
      fontStyle: 'bold',
      color: css(C.amber),
      stroke: '#1a1a1a',
      strokeThickness: 4,
    }).setOrigin(0, 0).setDepth(1000);

    this.hud = this.players.map(p => {
      const label = this.add.text(p.x, p.y - 40, '', {
        fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif',
        fontSize: '12px',
        fontStyle: 'bold',
        color: '#FFFFFF',
        stroke: '#000000',
        strokeThickness: 3,
      }).setOrigin(0.5, 1).setDepth(950);
      const hpBack = this.add.rectangle(p.x, p.y - 32, 32, 5, 0x1a1a1a, 0.85).setDepth(950);
      const hpFill = this.add.rectangle(p.x - 15, p.y - 32, 30, 3, 0x6dd35f).setOrigin(0, 0.5).setDepth(951);
      return { p, label, hpBack, hpFill, lastLabel: '', lastW: -1, lastBand: -1 };
    });

    this.veil = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0).setDepth(998);
    this.centerText = this.add.text(W / 2, H / 2 - 30, '', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '42px',
      color: '#FFFFFF',
      stroke: '#1a1a1a',
      strokeThickness: 8,
    }).setOrigin(0.5).setDepth(999).setVisible(false);
    this.subText = this.add.text(W / 2, H / 2 + 26, '', {
      fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif',
      fontSize: '18px',
      fontStyle: 'bold',
      color: '#F7A026',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(999).setVisible(false);
    if (this.isSpectate()) {
      this.add.text(W / 2, H - 22, 'AI 演示 · 空格切换 2 倍速 · Esc 回菜单', {
        fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif',
        fontSize: '13px',
        color: '#9a94a8',
        stroke: '#000000',
        strokeThickness: 3,
      }).setOrigin(0.5).setDepth(1000);
    }
  }

  private hudCache = { score: -1, mult: -1, wave: -1 };

  private syncHUD() {
    // Text.setText 会重绘画布纹理，值没变就不动（性能）
    if (this.score !== this.hudCache.score) {
      this.hudCache.score = this.score;
      this.scoreText.setText(String(this.score).padStart(13, '0'));
    }
    if (this.mult !== this.hudCache.mult) {
      this.hudCache.mult = this.mult;
      this.multText.setText(this.mult > 1 ? `x${this.mult}` : '');
      this.multText.setScale(1 + (this.mult - 1) * 0.03);
    }
    if (this.wave !== this.hudCache.wave) {
      this.hudCache.wave = this.wave;
      this.waveText.setText(`第 ${this.wave} 波`);
    }
    for (const h of this.hud) {
      const p = h.p;
      if (!p.alive) {
        const respawning = this.isVersus() && this.state === 'play';
        h.label.setVisible(respawning);
        if (respawning) {
          const txt = `重生 ${Math.max(0, p.respawnT).toFixed(1)}`;
          if (txt !== h.lastLabel) { h.lastLabel = txt; h.label.setText(txt); }
          h.label.setPosition(p.x, p.y - 40);
        }
        h.hpBack.setVisible(false);
        h.hpFill.setVisible(false);
        continue;
      }
      const w = WEAPONS[p.weapons[p.cur]];
      const ammo = w.max ? (p.ammo[w.id] || 0) : -1;
      const txt = ammo >= 0 ? `${w.name}:${ammo}` : w.name;
      if (txt !== h.lastLabel) { h.lastLabel = txt; h.label.setText(txt); }
      h.label.setPosition(p.x, p.y - 40).setVisible(true);
      h.hpBack.setPosition(p.x, p.y - 32).setVisible(true);
      const ratio = clamp(p.hp / 100, 0, 1);
      const wpx = Math.round(30 * ratio);
      const band = ratio > 0.5 ? 0 : ratio > 0.25 ? 1 : 2;
      if (wpx !== h.lastW || band !== h.lastBand) {
        h.lastW = wpx; h.lastBand = band;
        h.hpFill.setSize(wpx, 3)
          .setFillStyle(band === 0 ? 0x6dd35f : band === 1 ? 0xf7a026 : 0xe04a3a);
      }
      h.hpFill.setPosition(p.x - 15, p.y - 32).setVisible(true);
    }
  }

  /* ---------------- 贴花 ---------------- */

  private stampDecal(tex: string, x: number, y: number, scale: number, alpha: number) {
    if (this.decals.length < Game.DECAL_MAX) {
      this.decals.push(
        this.add.image(x, y, tex).setRotation(rand(0, TAU)).setScale(scale).setAlpha(alpha).setDepth(2),
      );
    } else {
      // 复用最旧的一格，避免 destroy/create 搅动
      const img = this.decals[this.decalPtr];
      img.setTexture(tex).setPosition(x, y).setRotation(rand(0, TAU)).setScale(scale).setAlpha(alpha);
      this.decalPtr = (this.decalPtr + 1) % Game.DECAL_MAX;
    }
  }

  private bloodBurst(x: number, y: number, big: boolean) {
    this.particles.spawn(x, y, big ? 26 : 12, C.blood, big ? 220 : 150, 0.5, big ? 6 : 4);
    this.stampDecal(pick([...BLOOD_VARIANTS]), x + rand(-8, 8), y + rand(-8, 8), rand(0.35, big ? 0.8 : 0.55), 0.55);
    if (big) this.stampDecal(TEX.pool, x, y, rand(0.5, 0.75), 0.5);
  }

  /* ---------------- 爆炸 ---------------- */

  private explode(x: number, y: number, r: number, dmg: number, owner: Player | null) {
    this.stampDecal(TEX.scorch, x, y, (r * 2.1) / 96, 0.9);
    this.cameras.main.shake(180, Math.min(0.01, r * 0.00008));
    Sfx.explode();
    this.particles.spawn(x, y, 24, C.amber, 300, 0.45, 6);
    this.particles.spawn(x, y, 16, C.smoke, 180, 0.7, 7);
    this.particles.spawn(x, y, 10, C.cream, 380, 0.2, 4);

    for (const z of this.zombies) {
      if (z.dead) continue;
      const d = Math.sqrt(dist2(x, y, z.x, z.y));
      if (d < r + z.r) {
        this.hurtZombie(z, dmg * clamp(1 - (d / (r + z.r)) * 0.7, 0.25, 1), owner);
        const a = Math.atan2(z.y - y, z.x - x);
        const c = collideWalls(z.x + Math.cos(a) * 14, z.y + Math.sin(a) * 14, z.r, this.map.blocks);
        z.x = c.x; z.y = c.y;
      }
    }
    for (const dv of this.devils) {
      if (dv.dead) continue;
      const d = Math.sqrt(dist2(x, y, dv.x, dv.y));
      if (d < r + dv.r) {
        this.hurtDevil(dv, dmg * clamp(1 - (d / (r + dv.r)) * 0.7, 0.25, 1), owner);
        const a = Math.atan2(dv.y - y, dv.x - x);
        dv.x = clamp(dv.x + Math.cos(a) * 14, WALL_T + dv.r, W - WALL_T - dv.r);
        dv.y = clamp(dv.y + Math.sin(a) * 14, WALL_T + dv.r, H - WALL_T - dv.r);
      }
    }
    for (const p of this.players) {
      if (!p.alive) continue;
      const d = Math.sqrt(dist2(x, y, p.x, p.y));
      if (d < r + p.r) this.damagePlayer(p, dmg * 0.6 * clamp(1 - (d / (r + p.r)) * 0.7, 0.2, 1), owner);
    }
    for (const b of this.barrels) {
      if (!b.dead && dist2(x, y, b.x, b.y) < (r + 14) * (r + 14)) {
        b.dead = true;
        this.delayed.push({ t: this.t + rand(0.04, 0.12), done: false, fn: () => this.explode(b.x, b.y, 95, 110, owner) });
      }
    }
    for (const m of this.mines) {
      if (!m.dead && dist2(x, y, m.x, m.y) < (r + 8) * (r + 8)) {
        m.dead = true;
        this.delayed.push({ t: this.t + rand(0.04, 0.1), done: false, fn: () => this.explode(m.x, m.y, 85, 120, owner) });
      }
    }
  }

  /* ---------------- 伤害结算 ---------------- */

  private hurtZombie(z: Zombie, dmg: number, owner: Player | null) {
    if (z.hp <= 0) return;
    z.hp -= dmg;
    z.slowT = 0.06;
    z.flashT = 0.06;
    this.particles.spawn(z.x, z.y, 3, C.blood, 90, 0.3, 3);
    if (z.hp <= 0) this.killZombie(z, owner);
  }

  private killZombie(z: Zombie, owner: Player | null) {
    void owner;
    z.dead = true;
    this.bloodBurst(z.x, z.y, z.type === 'brute');
    Sfx.zdie();
    this.kills++;
    this.combo++;
    this.comboT = 3;
    this.mult = Math.min(16, 1 + Math.floor(this.combo / 4));
    this.score += z.score * this.mult;
    // 巨汉必掉补给，其余 11% 概率
    if (z.type === 'brute' || Math.random() < 0.11) {
      this.pickups.push(new Pickup(
        this,
        clamp(z.x, WALL_T + 16, W - WALL_T - 16),
        clamp(z.y, WALL_T + 16, H - WALL_T - 16),
        Math.random() < 0.65 ? 'ammo' : 'med',
      ));
    }
    this.checkUnlocks();
  }

  private hurtDevil(d: Devil, dmg: number, owner: Player | null) {
    if (d.hp <= 0) return;
    d.hp -= dmg;
    d.flashT = 0.06;
    this.particles.spawn(d.x, d.y, 3, C.blood, 90, 0.3, 3);
    if (d.hp <= 0) this.killDevil(d, owner);
  }

  private killDevil(d: Devil, owner: Player | null) {
    void owner;
    d.dead = true;
    this.bloodBurst(d.x, d.y, true);
    Sfx.zdie();
    this.kills++;
    this.combo++;
    this.comboT = 3;
    this.mult = Math.min(16, 1 + Math.floor(this.combo / 4));
    this.score += d.score * this.mult;
    // 恶魔必掉补给
    this.pickups.push(new Pickup(
      this,
      clamp(d.x, WALL_T + 16, W - WALL_T - 16),
      clamp(d.y, WALL_T + 16, H - WALL_T - 16),
      Math.random() < 0.65 ? 'ammo' : 'med',
    ));
    this.checkUnlocks();
  }

  private damagePlayer(p: Player, dmg: number, owner: Player | null) {
    if (!p.alive || p.invulnT > 0) return;
    p.hp -= dmg;
    p.hurtT = 0.25;
    p.regenT = 0;
    Sfx.hurt();
    this.particles.spawn(p.x, p.y, 6, C.blood, 130, 0.35, 4);
    if (p.hp <= 0) {
      p.hp = 0;
      p.alive = false;
      p.deaths++;
      this.bloodBurst(p.x, p.y, true);
      this.toasts.show(`${p.label} 阵亡！`, '#FF6B5E');
      if (this.isVersus()) {
        if (owner && owner !== p) {
          owner.frags++;
          this.toasts.show(`${owner.label} 击杀 ${p.label}！（${owner.frags}/10）`, owner.idx === 0 ? '#F7A026' : '#7FB2F0');
          if (owner.frags >= 10) { this.endGame(owner.idx); return; }
        }
        p.respawnT = 2.5;
      }
      this.checkGameOver();
    }
  }

  private checkUnlocks() {
    for (let wi = 0; wi < WEAPONS.length; wi++) {
      if (this.kills >= UNLOCK_AT[wi]) {
        for (const p of this.players) {
          if (!p.weapons.includes(wi)) {
            p.weapons.push(wi);
            const w = WEAPONS[wi];
            if (w.max) p.ammo[w.id] = (p.ammo[w.id] || 0) + (w.start || 0);
            this.toasts.show(`新武器解锁：${w.name}！`, '#F7A026');
            Sfx.newWeap();
          }
        }
      }
    }
  }

  private checkGameOver() {
    if (this.isVersus()) return;
    if (this.players.every(p => !p.alive)) this.endGame(-1);
  }

  private endGame(winnerIdx: number) {
    if (this.state === 'over') return;
    this.state = 'over';
    this.winner = winnerIdx;
    this.overT = 2.2;
    Sfx.over();
    this.veil.setFillStyle(0x000000, 0.45);
    if (this.isVersus() && winnerIdx >= 0) {
      this.centerText.setText(`${this.players[winnerIdx].label} 获胜！`).setVisible(true);
    } else {
      this.centerText.setText('游戏结束').setVisible(true);
    }
    this.subText.setVisible(false);
  }

  /* ---------------- 生成 ---------------- */

  private spawnEnemy() {
    const gate = pick(SPAWN_GATES);
    const x = gate.x + rand(-30, 30), y = gate.y + rand(-30, 30);
    const roll = Math.random();
    if (this.t > 120 && roll < 0.08 && this.devils.length < 3) {
      const d = new Devil(this, x, y);
      this.tweens.add({ targets: d.img, scale: 1, duration: 260, ease: 'Back.easeOut' });
      this.devils.push(d);
      this.particles.spawn(x, y, 10, 0xc23a1e, 120, 0.45, 5);
      if (!this.seenDevil) {
        this.seenDevil = true;
        this.toasts.show('恶魔出现了！飞越障碍、远程吐火球，优先击杀！', '#FF6B5E');
      }
      return;
    }
    let type: ZombieType = 'normal';
    if (this.t > 90 && roll < 0.12) type = 'brute';
    else if (this.t > 40 && roll < 0.38) type = 'fast';
    const z = new Zombie(this, x, y, type);
    this.tweens.add({ targets: z.img, scale: 1, duration: 220, ease: 'Back.easeOut' });
    this.zombies.push(z);
    this.particles.spawn(x, y, 8, C.zombieDk, 100, 0.4, 5);
    if (type === 'fast' && !this.seenFast) {
      this.seenFast = true;
      this.toasts.show('快速僵尸出现了！速度快但血少', '#FF8A5E');
    }
    if (type === 'brute' && !this.seenBrute) {
      this.seenBrute = true;
      this.toasts.show('巨汉僵尸出现了！血厚攻高，优先集火', '#B8E07B');
    }
  }

  /* ---------------- 武器 ---------------- */

  private switchWeapon(p: Player, dir: number) {
    p.cur = (p.cur + dir + p.weapons.length) % p.weapons.length;
    Sfx.ui();
  }

  private tryFire(p: Player) {
    const w = WEAPONS[p.weapons[p.cur]];
    if (p.cd > 0) return;
    const usesAmmo = !!w.max;
    if (usesAmmo && (p.ammo[w.id] || 0) <= 0) { this.switchWeapon(p, 1); return; }
    p.cd = w.cd;
    if (usesAmmo) p.ammo[w.id]--;

    const fx = p.x + Math.cos(p.face) * 20, fy = p.y + Math.sin(p.face) * 20;
    p.muzzle = 0.05;

    switch (w.id) {
      case 'pistol': case 'uzi': {
        const a = p.face + rand(-w.spread!, w.spread!);
        this.bullets.push(new Bullet(this, fx, fy, Math.cos(a) * w.spd!, Math.sin(a) * w.spd!, w.dmg!, p, 1.2, 'bullet'));
        if (w.id === 'uzi') Sfx.uzi(); else Sfx.shoot();
        break;
      }
      case 'shotgun': {
        for (let i = 0; i < w.pellets!; i++) {
          const a = p.face + rand(-w.spread! / 2, w.spread! / 2);
          const s = w.spd! * rand(0.85, 1.1);
          this.bullets.push(new Bullet(this, fx, fy, Math.cos(a) * s, Math.sin(a) * s, w.dmg!, p, w.life!, 'pellet'));
        }
        this.cameras.main.shake(90, 0.0025);
        Sfx.shotgun();
        break;
      }
      case 'rocket': {
        this.bullets.push(new Bullet(this, fx, fy, Math.cos(p.face) * w.spd!, Math.sin(p.face) * w.spd!, w.dmg!, p, 2.2, 'rocket'));
        Sfx.rocket();
        break;
      }
      case 'grenade': {
        this.grenades.push(new Grenade(this, p.x, p.y, Math.cos(p.face) * 400, Math.sin(p.face) * 400, 0.85, p));
        Sfx.throwG();
        break;
      }
      case 'mine': {
        const mx = p.x - Math.cos(p.face) * 6, my = p.y - Math.sin(p.face) * 6;
        if (!hitsWall(mx, my, 8, this.map.blocks)) {
          this.mines.push(new Mine(this, mx, my, p));
          Sfx.place();
        } else { p.ammo[w.id]++; p.cd = 0; }
        break;
      }
      case 'barrel': {
        const bx = p.x + Math.cos(p.face) * 34, by = p.y + Math.sin(p.face) * 34;
        if (!hitsWall(bx, by, 14, this.map.blocks)) {
          this.barrels.push(new Barrel(this, bx, by));
          Sfx.place();
        } else { p.ammo[w.id]++; p.cd = 0; }
        break;
      }
    }
  }

  /* ---------------- 逐系统更新 ---------------- */

  private updatePlayer(p: Player, dt: number) {
    if (!p.alive) {
      if (this.isVersus()) {
        p.respawnT -= dt;
        if (p.respawnT <= 0) {
          p.alive = true; p.hp = 100; p.invulnT = 2;
          const s = this.map.spawns.versus[p.idx];
          const c = collideWalls(s[0], s[1], p.r, this.map.blocks);
          p.x = c.x; p.y = c.y;
        }
      }
      return;
    }
    p.cd = Math.max(0, p.cd - dt);
    p.hurtT = Math.max(0, p.hurtT - dt);
    p.invulnT = Math.max(0, p.invulnT - dt);
    p.muzzle = Math.max(0, p.muzzle - dt);

    // 简单难度：脱战 3 秒后自动回血
    if (this.diff === 'easy' && p.hp < 100) {
      p.regenT += dt;
      if (p.regenT > 3) p.hp = Math.min(100, p.hp + 8 * dt);
    } else {
      p.regenT = 0;
    }

    let inp: InputFrame;
    if (p.bot) {
      inp = p.bot.update(dt);
    } else if (this.mode === 'single' || this.mode === 'aiMate') {
      // 只有一个人类时两套键位通用（空格 = P2 开火）
      inp = this.keyInput.read(CTRL_P1, CTRL_P2);
    } else {
      inp = this.keyInput.read(p.idx === 0 ? CTRL_P1 : CTRL_P2);
    }

    if (inp.prev) this.switchWeapon(p, -1);
    if (inp.next) this.switchWeapon(p, 1);

    let mx = inp.mx, my = inp.my;
    if (mx || my) {
      const len = Math.hypot(mx, my);
      mx /= len; my /= len;
      p.walkT += dt * 10;
      const c = collideWalls(p.x + mx * p.speed * dt, p.y + my * p.speed * dt, p.r, this.map.blocks);
      p.x = c.x; p.y = c.y;
      if (inp.face === undefined) p.face = Math.atan2(my, mx);
    }
    if (inp.face !== undefined) p.face = inp.face;
    if (inp.fire) this.tryFire(p);
  }

  private updateZombies(dt: number) {
    const ps = this.players.filter(p => p.alive);
    for (const z of this.zombies) {
      if (z.dead) continue;
      z.cd = Math.max(0, z.cd - dt);
      z.slowT = Math.max(0, z.slowT - dt);
      z.flashT = Math.max(0, z.flashT - dt);
      if (!ps.length) break;
      let tp = ps[0], nd = Infinity;
      for (const p of ps) {
        const d = dist2(z.x, z.y, p.x, p.y);
        if (d < nd) { nd = d; tp = p; }
      }
      const d = Math.sqrt(nd);
      const a = Math.atan2(tp.y - z.y, tp.x - z.x);
      z.face = a;
      z.walkT += dt * 8;
      if (z.windT > 0) {
        // 攻击前摇：原地蓄力，结束后向前扑并判定命中
        z.windT -= dt;
        if (z.windT <= 0) {
          z.cd = 0.75;
          const c = collideWalls(z.x + Math.cos(a) * 10, z.y + Math.sin(a) * 10, z.r, this.map.blocks);
          z.x = c.x; z.y = c.y;
          if (tp.alive && dist2(z.x, z.y, tp.x, tp.y) < (z.r + tp.r + 10) * (z.r + tp.r + 10)) {
            this.damagePlayer(tp, z.dmg, null);
          }
        }
      } else if (d > z.r + tp.r + 4) {
        const sp = z.speed * (z.slowT > 0 ? 0.4 : 1);
        // 主寻路：流场（>60px 启用，近身直取精确）；兜底：滞留绕行
        let a2: number | null = null;
        if (d > 60) {
          const fd = this.nav.flowDir(z.x, z.y);
          if (fd) a2 = Math.atan2(fd.y, fd.x);
        }
        if (a2 === null) {
          a2 = a;
          if (z.detourT > 0) {
            z.detourT -= dt;
            a2 = a + z.detourSign * Math.PI / 2;
          }
        }
        const want = sp * dt;
        const c = collideWalls(z.x + Math.cos(a2) * want, z.y + Math.sin(a2) * want, z.r, this.map.blocks);
        const movedSq = dist2(z.x, z.y, c.x, c.y);
        if (movedSq < want * want * 0.04) {
          z.stuckT += dt;
          if (z.stuckT > 0.4) {
            z.stuckT = 0;
            z.detourT = 0.7;
            z.detourSign = Math.random() < 0.5 ? 1 : -1;
          }
        } else {
          z.stuckT = Math.max(0, z.stuckT - dt * 2);
        }
        z.x = c.x; z.y = c.y;
      } else if (z.cd <= 0) {
        z.windT = ZOMBIE_WINDUP;
        Sfx.zattack();
      }
      z.sync();
    }
    // 僵尸间挤开
    const zs = this.zombies;
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
    if (zs.some(z => z.dead)) {
      for (const z of zs) if (z.dead) z.destroy();
      this.zombies = zs.filter(z => !z.dead);
    }
  }

  /** 恶魔 AI：飞越障碍追击玩家，贴近即蓄力吐球（火球不分敌我） */
  private updateDevils(dt: number) {
    const ps = this.players.filter(p => p.alive);
    for (const d of this.devils) {
      if (d.dead) continue;
      d.hoverT += dt;
      d.flashT = Math.max(0, d.flashT - dt);
      if (!ps.length) break;
      let tp = ps[0], nd = Infinity;
      for (const p of ps) {
        const dd = dist2(d.x, d.y, p.x, p.y);
        if (dd < nd) { nd = dd; tp = p; }
      }
      const dist = Math.sqrt(nd);
      const a = Math.atan2(tp.y - d.y, tp.x - d.x);
      d.face = a;
      if (d.windT > 0) {
        d.windT -= dt;
        if (d.windT <= 0) {
          const a2 = Math.atan2(tp.y - d.y, tp.x - d.x);
          this.fireballs.push(new Fireball(
            this,
            d.x + Math.cos(a2) * 22, d.y + Math.sin(a2) * 22,
            Math.cos(a2) * 185, Math.sin(a2) * 185,
          ));
          Sfx.fireball();
          d.shootT = rand(2.2, 3.2);
        }
      } else {
        // 追击（飞越方块，仅受场地边界限制）
        if (dist > 40) {
          const spd = 74;
          d.x = clamp(d.x + Math.cos(a) * spd * dt, WALL_T + d.r, W - WALL_T - d.r);
          d.y = clamp(d.y + Math.sin(a) * spd * dt, WALL_T + d.r, H - WALL_T - d.r);
        }
        d.shootT -= dt;
        if (d.shootT <= 0 && dist < 300) {
          d.windT = DEVIL_WINDUP;
          Sfx.devil();
        }
      }
      d.sync();
    }
    if (this.devils.some(d => d.dead)) {
      for (const d of this.devils) if (d.dead) d.destroy();
      this.devils = this.devils.filter(d => !d.dead);
    }
  }

  /** 火球命中/撞墙的小爆炸：伤僵尸也伤玩家（恶魔免疫），留焦痕 */
  private explodeFireball(x: number, y: number) {
    this.stampDecal('fx_scorch', x, y, 0.5, 0.7);
    this.particles.spawn(x, y, 12, 0xf7a026, 160, 0.35, 5);
    this.particles.spawn(x, y, 6, C.smoke, 90, 0.5, 5);
    Sfx.fhit();
    const r = 55;
    for (const z of this.zombies) {
      if (z.dead) continue;
      const d = Math.sqrt(dist2(x, y, z.x, z.y));
      if (d < r + z.r) {
        this.hurtZombie(z, 45 * clamp(1 - (d / (r + z.r)) * 0.6, 0.3, 1), null);
      }
    }
    for (const p of this.players) {
      if (!p.alive) continue;
      const d = Math.sqrt(dist2(x, y, p.x, p.y));
      if (d < r + p.r) this.damagePlayer(p, 20 * clamp(1 - (d / (r + p.r)) * 0.5, 0.4, 1), null);
    }
  }

  /** 火球：直线飞行 + 尾迹粒子，撞墙/撞僵尸/撞玩家都会爆炸 */
  private updateFireballs(dt: number) {
    for (const fb of this.fireballs) {
      fb.life -= dt;
      fb.x += fb.vx * dt;
      fb.y += fb.vy * dt;
      if (fb.life <= 0) { fb.dead = true; continue; }
      this.particles.spawn(fb.x, fb.y, 1, 0xf7a026, 20, 0.25, 3);
      if (hitsWall(fb.x, fb.y, 4, this.map.blocks)) {
        this.explodeFireball(fb.x, fb.y);
        fb.dead = true; continue;
      }
      for (const z of this.zombies) {
        if (!z.dead && dist2(fb.x, fb.y, z.x, z.y) < (z.r + 5) * (z.r + 5)) {
          this.explodeFireball(fb.x, fb.y);
          fb.dead = true; break;
        }
      }
      if (fb.dead) continue;
      for (const p of this.players) {
        if (p.alive && dist2(fb.x, fb.y, p.x, p.y) < (p.r + 5) * (p.r + 5)) {
          this.explodeFireball(fb.x, fb.y);
          fb.dead = true; break;
        }
      }
      if (!fb.dead) fb.sync();
    }
    if (this.fireballs.some(f => f.dead)) {
      for (const f of this.fireballs) if (f.dead) f.destroy();
      this.fireballs = this.fireballs.filter(f => !f.dead);
    }
  }

  private updateBullets(dt: number) {
    for (const bl of this.bullets) {
      bl.life -= dt;
      bl.x += bl.vx * dt;
      bl.y += bl.vy * dt;
      if (bl.life <= 0) { bl.dead = true; continue; }
      if (hitsWall(bl.x, bl.y, 3, this.map.blocks)) {
        if (bl.kind === 'rocket') this.explode(bl.x, bl.y, 90, bl.dmg, bl.owner);
        else this.particles.spawn(bl.x, bl.y, 3, 0xc9c2b2, 80, 0.2, 2);
        bl.dead = true; continue;
      }
      for (const b of this.barrels) {
        if (!b.dead && dist2(bl.x, bl.y, b.x, b.y) < (b.r + 3) * (b.r + 3)) {
          b.hp -= bl.dmg; bl.dead = true;
          if (b.hp <= 0) { b.dead = true; this.explode(b.x, b.y, 95, 110, bl.owner); }
          break;
        }
      }
      if (bl.dead) continue;
      for (const z of this.zombies) {
        if (!z.dead && dist2(bl.x, bl.y, z.x, z.y) < (z.r + 3) * (z.r + 3)) {
          if (bl.kind === 'rocket') this.explode(bl.x, bl.y, 90, bl.dmg, bl.owner);
          else this.hurtZombie(z, bl.dmg, bl.owner);
          bl.dead = true; break;
        }
      }
      if (bl.dead) continue;
      for (const dv of this.devils) {
        if (!dv.dead && dist2(bl.x, bl.y, dv.x, dv.y) < (dv.r + 3) * (dv.r + 3)) {
          if (bl.kind === 'rocket') this.explode(bl.x, bl.y, 90, bl.dmg, bl.owner);
          else this.hurtDevil(dv, bl.dmg, bl.owner);
          bl.dead = true; break;
        }
      }
      if (bl.dead) continue;
      if (this.isVersus()) {
        for (const p of this.players) {
          if (p.alive && p !== bl.owner && dist2(bl.x, bl.y, p.x, p.y) < (p.r + 3) * (p.r + 3)) {
            if (bl.kind === 'rocket') this.explode(bl.x, bl.y, 90, bl.dmg, bl.owner);
            else this.damagePlayer(p, bl.dmg, bl.owner);
            bl.dead = true; break;
          }
        }
      }
      if (!bl.dead) bl.sync();
    }
    if (this.bullets.some(b => b.dead)) {
      for (const b of this.bullets) if (b.dead) b.destroy();
      this.bullets = this.bullets.filter(b => !b.dead);
    }
  }

  private updateGadgets(dt: number) {
    for (const gr of this.grenades) {
      gr.fuse -= dt;
      gr.x += gr.vx * dt; gr.y += gr.vy * dt;
      gr.vx *= 0.9; gr.vy *= 0.9;
      if (hitsWall(gr.x, gr.y, 6, this.map.blocks)) {
        gr.vx = 0; gr.vy = 0;
        const c = collideWalls(gr.x, gr.y, 6, this.map.blocks);
        gr.x = c.x; gr.y = c.y;
      }
      if (gr.fuse <= 0) { gr.dead = true; this.explode(gr.x, gr.y, 80, 95, gr.owner); }
      else gr.sync();
    }
    if (this.grenades.some(g => g.dead)) {
      for (const g of this.grenades) if (g.dead) g.destroy();
      this.grenades = this.grenades.filter(g => !g.dead);
    }

    for (const m of this.mines) {
      if (m.dead) continue;
      m.armT -= dt; m.blink += dt;
      if (m.armT <= 0) {
        let trig = false;
        for (const z of this.zombies) if (!z.dead && dist2(m.x, m.y, z.x, z.y) < 44 * 44) { trig = true; break; }
        if (!trig) for (const p of this.players) {
          if (p.alive && p !== m.owner && dist2(m.x, m.y, p.x, p.y) < 40 * 40) { trig = true; break; }
        }
        if (trig) { m.dead = true; this.explode(m.x, m.y, 85, 120, m.owner); }
      }
      if (!m.dead) m.sync();
    }
    if (this.mines.some(m => m.dead)) {
      for (const m of this.mines) if (m.dead) m.destroy();
      this.mines = this.mines.filter(m => !m.dead);
    }
    if (this.barrels.some(b => b.dead)) {
      for (const b of this.barrels) if (b.dead) b.destroy();
      this.barrels = this.barrels.filter(b => !b.dead);
    }
  }

  private updatePickups(dt: number) {
    for (const pk of this.pickups) {
      pk.t += dt; pk.life -= dt;
      if (pk.life <= 0) { pk.dead = true; continue; }
      for (const p of this.players) {
        if (!p.alive) continue;
        if (dist2(pk.x, pk.y, p.x, p.y) < 30 * 30) {
          if (pk.kind === 'med') {
            p.hp = Math.min(100, p.hp + 40);
            this.toasts.show(`${p.label} 恢复生命 +40`, '#7BE07B');
          } else {
            // 优先补手上没满的武器；手上满了/手枪则补其他不满的；全满给分
            const cur = WEAPONS[p.weapons[p.cur]];
            let target = cur.max && (p.ammo[cur.id] || 0) < cur.max ? cur : undefined;
            if (!target) {
              target = p.weapons.map(i => WEAPONS[i]).find(w2 => !!w2.max && (p.ammo[w2.id] || 0) < w2.max!);
            }
            if (target) {
              const add = Math.ceil(target.max! * 0.35);
              p.ammo[target.id] = Math.min(target.max!, (p.ammo[target.id] || 0) + add);
              this.toasts.show(`${p.label} ${target.name}弹药 +${add}`, '#F7A026');
            } else {
              this.score += 200 * this.mult;
              this.toasts.show(`${p.label} 得分 +${200 * this.mult}`, '#F7A026');
            }
          }
          Sfx.pickup();
          pk.dead = true;
          break;
        }
      }
      if (!pk.dead) pk.sync();
    }
    if (this.pickups.some(p => p.dead)) {
      for (const p of this.pickups) if (p.dead) p.destroy();
      this.pickups = this.pickups.filter(p => !p.dead);
    }
  }

  /* ---------------- 暂停 ---------------- */

  private togglePause() {
    if (this.state === 'play') {
      this.state = 'paused';
      this.veil.setFillStyle(0x000000, 0.55);
      this.centerText.setText('已暂停').setVisible(true);
      this.subText.setText('P 继续 · Esc 回菜单').setVisible(true);
    } else if (this.state === 'paused') {
      this.state = 'play';
      this.veil.setFillStyle(0x000000, 0);
      this.centerText.setVisible(false);
      this.subText.setVisible(false);
    }
  }

  /* ---------------- 主循环 ---------------- */

  update(_time: number, delta: number) {
    const dt = Math.min(delta / 1000, 0.05) * this.speedMul;

    // 延迟队列（连锁爆炸）
    for (const d of this.delayed) if (this.t >= d.t && !d.done) { d.done = true; d.fn(); }
    this.delayed = this.delayed.filter(d => !d.done);

    this.particles.update(dt);
    this.toasts.update(dt);

    if (this.state === 'countdown') {
      this.countdownT -= dt;
      const n = Math.max(1, Math.ceil(this.countdownT));
      if (this.countdownT > 0) {
        this.centerText.setText(String(n)).setVisible(true);
        if (n !== this.lastCount) { this.lastCount = n; Sfx.count(); }
      } else {
        this.state = 'play';
        Sfx.go();
        this.centerText.setText('开始！');
        this.tweens.add({ targets: this.centerText, alpha: 0, duration: 600, onComplete: () => this.centerText.setVisible(false).setAlpha(1) });
      }
      this.syncHUD();
      this.keyInput.lateUpdate();
      return;
    }

    if (this.state === 'over') {
      this.overT -= dt;
      if (this.overT <= 0) {
        this.scene.start('GameOver', {
          mode: this.mode, mapIdx: this.mapIdx, difficulty: this.diff,
          score: this.score, kills: this.kills, time: this.t, winner: this.winner,
        });
      }
      this.keyInput.lateUpdate();
      return;
    }

    if (this.state !== 'play') {
      this.keyInput.lateUpdate();
      return;
    }

    this.t += dt;

    // 流场寻路：每 0.25s 以存活玩家为源重算（所有僵尸共享）
    this.flowT -= dt;
    if (this.flowT <= 0) {
      this.flowT = 0.25;
      const alive = this.players.filter(p => p.alive);
      if (alive.length) this.nav.computeFlow(alive);
    }

    // 连击衰减
    if (this.comboT > 0) {
      this.comboT -= dt;
      if (this.comboT <= 0) { this.combo = 0; this.mult = 1; }
    }

    // 波次：每 18 杀推进一波，数量与频率递增
    const wave = 1 + Math.floor(this.kills / 18);
    if (wave !== this.wave) {
      this.wave = wave;
      this.toasts.show(`第 ${wave} 波！数量与频率提升`, '#F7A026');
      Sfx.levelup();
    }
    this.spawnT -= dt;
    const target = Math.min(3 + wave * 2 + Math.floor(this.t / 30), this.isVersus() ? 14 : 26);
    if (this.spawnT <= 0 && this.zombies.length + this.devils.length < target) {
      this.spawnEnemy();
      this.spawnT = Math.max(0.3, 1.3 - (wave - 1) * 0.07);
    }

    // 补给箱：固定点空位补货（18s）+ 随机位置刷新（13~18s，场上最多 4 个）
    this.spotT -= dt;
    if (this.spotT <= 0) {
      this.spotT = 18;
      this.map.crates.forEach((c, i) => {
        const occupied = this.pickups.some(pk => dist2(pk.x, pk.y, c.x, c.y) < 24 * 24);
        if (!occupied && !hitsWall(c.x, c.y, 14, this.map.blocks)) {
          this.pickups.push(new Pickup(this, c.x, c.y, i % 2 === 0 ? 'ammo' : 'med'));
        }
      });
    }
    this.crateT -= dt;
    if (this.crateT <= 0) {
      this.crateT = rand(13, 18);
      if (this.pickups.length < 4) {
        for (let i = 0; i < 12; i++) {
          const x = rand(WALL_T + 30, W - WALL_T - 30), y = rand(WALL_T + 30, H - WALL_T - 30);
          if (!hitsWall(x, y, 16, this.map.blocks)) {
            this.pickups.push(new Pickup(this, x, y, Math.random() < 0.65 ? 'ammo' : 'med'));
            break;
          }
        }
      }
    }

    for (const p of this.players) {
      this.updatePlayer(p, dt);
      p.sync();
    }
    this.updateZombies(dt);
    this.updateDevils(dt);
    this.updateFireballs(dt);
    this.updateBullets(dt);
    this.updateGadgets(dt);
    this.updatePickups(dt);
    this.syncHUD();
    this.keyInput.lateUpdate();
  }
}
