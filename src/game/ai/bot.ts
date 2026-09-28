import { rand, dist2, GameMode } from '../config';
import { WEAPONS } from '../data/weapons';
import { hasLOS } from '../collision';
import type { InputFrame } from '../input';
import type { NavGrid } from './navgrid';
import type { Player, Zombie, Devil, Fireball, Pickup, Barrel, Mine, Grenade, Bullet } from '../objects/entities';
import type { BlockDef } from '../data/maps';

/** bot 读取的世界状态（由 Game 场景结构性实现） */
export interface GameAccess {
  players: Player[];
  zombies: Zombie[];
  devils: Devil[];
  fireballs: Fireball[];
  pickups: Pickup[];
  barrels: Barrel[];
  mines: Mine[];
  grenades: Grenade[];
  bullets: Bullet[];
  mode: GameMode;
  nav: NavGrid;
  blocks: BlockDef[];
}

export interface Persona {
  /** 交战偏好距离（大于则靠近） */
  engage: number;
  /** 后退阈值（小于则拉开） */
  safe: number;
  /** 捡箱积极性 0..1 */
  hunger: number;
  /** 瞄准扰动幅度（弧度） */
  jitter: number;
  /** 环绕方向 */
  orbitDir: 1 | -1;
}

interface Unit { x: number; y: number; r?: number }

/**
 * AI 队友/对手控制器：产出与键盘等价的 InputFrame。
 * 决策顺序：闪避火球 → 捡补给 → 风筝输出；无视线时用 A* 摸近。
 */
export class Bot {
  private path: { x: number; y: number }[] = [];
  private repathT = 0;
  private aimJitter = 0;
  private jitterT = 0;
  private orbitFlipT = 0;

  constructor(private g: GameAccess, private p: Player, private persona: Persona) {}

  private nearest<T extends Unit>(list: T[], x: number, y: number): T | null {
    let best: T | null = null, bd = Infinity;
    for (const it of list) {
      const d = dist2(x, y, it.x, it.y);
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }

  update(dt: number): InputFrame {
    const inp: InputFrame = { mx: 0, my: 0, fire: false, prev: false, next: false };
    const p = this.p, g = this.g, per = this.persona;
    if (!p.alive) return inp;
    this.repathT -= dt; this.jitterT -= dt; this.orbitFlipT -= dt;
    if (this.jitterT <= 0) { this.jitterT = 0.25; this.aimJitter = rand(-per.jitter, per.jitter); }
    if (this.orbitFlipT <= 0) { this.orbitFlipT = rand(1.5, 3); per.orbitDir = (per.orbitDir * -1) as 1 | -1; }

    const threats: Unit[] = [
      ...g.zombies.filter(z => !z.dead),
      ...g.devils.filter(d => !d.dead),
    ];
    // 对战：敌对玩家是主目标
    const enemy = (g.mode === 'aiVersus' || g.mode === 'versus')
      ? g.players.find(pl => pl !== p && pl.alive) ?? null
      : null;

    // 1) 军火规避：逃离身边的手雷/地雷，侧移躲迎面火球与火箭
    // 手雷不论谁扔的都会炸到自己，全躲（扔完立刻后撤也是正确操作）；
    // 地雷不会感应自己，只躲别人的
    const gr = this.nearest(g.grenades.filter(gr => !gr.dead), p.x, p.y);
    if (gr && dist2(gr.x, gr.y, p.x, p.y) < 130 * 130) {
      const a = Math.atan2(p.y - gr.y, p.x - gr.x);
      inp.mx = Math.cos(a); inp.my = Math.sin(a);
      return inp;
    }
    const mn = this.nearest(g.mines.filter(m => !m.dead && m.owner !== p), p.x, p.y);
    if (mn && dist2(mn.x, mn.y, p.x, p.y) < 100 * 100) {
      const a = Math.atan2(p.y - mn.y, p.x - mn.x);
      inp.mx = Math.cos(a); inp.my = Math.sin(a);
      return inp;
    }
    const projectiles: { x: number; y: number; vx: number; vy: number }[] = [
      ...g.fireballs.filter(f => !f.dead),
      ...g.bullets.filter(b => !b.dead && b.kind === 'rocket' && b.owner !== p),
    ];
    for (const fb of projectiles) {
      const d = Math.hypot(fb.x - p.x, fb.y - p.y);
      if (d > 140) continue;
      const toMe = Math.atan2(p.y - fb.y, p.x - fb.x);
      const vA = Math.atan2(fb.vy, fb.vx);
      let da = Math.abs(toMe - vA) % (Math.PI * 2);
      if (da > Math.PI) da = Math.PI * 2 - da;
      if (da < 0.5) {
        const px = Math.cos(vA + Math.PI / 2), py = Math.sin(vA + Math.PI / 2);
        const side = (p.x - fb.x) * px + (p.y - fb.y) * py >= 0 ? 1 : -1;
        inp.mx = px * side; inp.my = py * side;
        inp.face = Math.atan2(-fb.vy, -fb.vx);
        return inp;
      }
    }

    const threat = this.nearest(threats, p.x, p.y);
    const dThreat = threat ? Math.hypot(threat.x - p.x, threat.y - p.y) : Infinity;

    // 2) 捡补给：需要时主动去（安全距离外）；附近有箱子且怪不贴脸时顺路捡
    const hpNeed = p.hp < 70;
    const ammoNeed = this.ammoLow();
    let wantPk: Pickup | null = null;
    if (g.pickups.length) {
      if ((hpNeed || ammoNeed) && dThreat > per.safe + 30) {
        const needCands = g.pickups.filter(pk => !pk.dead && ((hpNeed && pk.kind === 'med') || (ammoNeed && pk.kind === 'ammo')));
        wantPk = this.nearest(needCands, p.x, p.y);
      }
      if (!wantPk && dThreat > per.engage && Math.random() < per.hunger) {
        // 顺路捡：附近的箱子（满员也会折算得分）
        const near = g.pickups.filter(pk => !pk.dead && dist2(pk.x, pk.y, p.x, p.y) < 180 * 180);
        wantPk = this.nearest(near, p.x, p.y);
      }
    }
    if (wantPk) {
      if (hasLOS(p.x, p.y, wantPk.x, wantPk.y, g.blocks)) {
        this.path = [];
        const a = Math.atan2(wantPk.y - p.y, wantPk.x - p.x);
        inp.mx = Math.cos(a); inp.my = Math.sin(a);
      } else {
        if (this.repathT <= 0 || !this.path.length) { this.repathT = 0.8; this.path = g.nav.astar(p.x, p.y, wantPk.x, wantPk.y); }
        const mv = this.followPath();
        if (mv) { inp.mx = mv.x; inp.my = mv.y; }
      }
      this.aimAndFire(inp, threat, dThreat);
      return inp;
    }

    // 3) 风筝主循环：目标 = 近身僵尸（优先自保）否则敌对玩家
    const target: Unit | null = enemy && dThreat > 100 ? enemy : threat ?? enemy;
    if (!target) { this.path = []; return inp; }
    const dT = Math.hypot(target.x - p.x, target.y - p.y);
    const aT = Math.atan2(target.y - p.y, target.x - p.x);
    const orbit = aT + (Math.PI / 2) * per.orbitDir;

    if (hasLOS(p.x, p.y, target.x, target.y, g.blocks)) {
      this.path = [];
      if (dT < per.safe) {
        inp.mx = -Math.cos(aT) + Math.cos(orbit) * 0.5;
        inp.my = -Math.sin(aT) + Math.sin(orbit) * 0.5;
      } else if (dT > per.engage) {
        inp.mx = Math.cos(aT) * 0.7 + Math.cos(orbit) * 0.4;
        inp.my = Math.sin(aT) * 0.7 + Math.sin(orbit) * 0.4;
      } else {
        inp.mx = Math.cos(orbit); inp.my = Math.sin(orbit);
      }
      this.aimAndFire(inp, target, dT);
      return inp;
    }

    // 无视线：A* 摸过去
    if (this.repathT <= 0 || !this.path.length) { this.repathT = 0.8; this.path = g.nav.astar(p.x, p.y, target.x, target.y); }
    const mv = this.followPath();
    if (mv) {
      inp.mx = mv.x; inp.my = mv.y;
      inp.face = Math.atan2(mv.y, mv.x);
    }
    return inp;
  }

  /** 任一弹药武器余量 < 60% 视为该囤货了 */
  private ammoLow(): boolean {
    const p = this.p;
    const ammoWeapons = p.weapons.map(i => WEAPONS[i]).filter(w => w.max);
    if (!ammoWeapons.length) return false;
    return ammoWeapons.some(w => (p.ammo[w.id] || 0) < w.max! * 0.6);
  }

  private followPath() {
    const p = this.p, g = this.g;
    while (this.path.length && dist2(p.x, p.y, this.path[0].x, this.path[0].y) < 14 * 14) this.path.shift();
    // 拉直：到第二个点有视线就跳过当前点
    if (this.path.length > 1 && hasLOS(p.x, p.y, this.path[1].x, this.path[1].y, g.blocks)) this.path.shift();
    if (!this.path.length) return null;
    const a = Math.atan2(this.path[0].y - p.y, this.path[0].x - p.x);
    return { x: Math.cos(a), y: Math.sin(a) };
  }

  /** 选枪 + 瞄准 + 开火（含爆炸物自伤保护） */
  private aimAndFire(inp: InputFrame, target: Unit | null, dT: number) {
    const p = this.p, g = this.g;
    if (!target || !isFinite(dT)) return;
    const w = this.chooseWeapon(dT);
    const idx = p.weapons.indexOf(w);
    if (idx >= 0 && idx !== p.cur) p.cur = idx;
    const cw = WEAPONS[p.weapons[p.cur]];
    const unsafe = (cw.id === 'rocket' && dT < 150) || (cw.id === 'grenade' && dT < 120);
    const a = Math.atan2(target.y - p.y, target.x - p.x) + this.aimJitter;
    inp.face = a;
    inp.fire = !unsafe && hasLOS(p.x, p.y, target.x, target.y, g.blocks);
  }

  /** 按距离与弹药选武器（返回 WEAPONS 下标） */
  private chooseWeapon(dT: number): number {
    const p = this.p;
    const has = (id: string) => {
      const i = WEAPONS.findIndex(w => w.id === id);
      return p.weapons.includes(i) && (!WEAPONS[i].max || (p.ammo[id] || 0) > 0) ? i : -1;
    };
    const uzi = has('uzi'), sg = has('shotgun'), rk = has('rocket'), gr = has('grenade');
    if (dT < 110 && sg >= 0) return sg;
    if (dT > 230 && rk >= 0 && this.g.zombies.filter(z => !z.dead).length >= 5) return rk;
    if (dT >= 130 && dT <= 240 && gr >= 0 &&
      this.g.zombies.filter(z => !z.dead && dist2(z.x, z.y, this.p.x, this.p.y) < 240 * 240).length >= 3) return gr;
    if (uzi >= 0) return uzi;
    if (sg >= 0) return sg;
    return 0; // pistol 永远可用
  }
}
