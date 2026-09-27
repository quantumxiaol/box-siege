import * as Phaser from 'phaser';
import { TAU, rand } from '../config';
import { TEX } from '../textures';

export type ZombieType = 'normal' | 'fast' | 'brute';

const DEPTH_SHADOW = 4;

/** 僵尸攻击前摇（秒）：蓄力动作完成后才结算伤害 */
export const ZOMBIE_WINDUP = 0.38;
/** 恶魔吐火球前摇（秒） */
export const DEVIL_WINDUP = 0.5;

/** Phaser 4：填充式染色 = setTint + setTintMode(FILL) */
function flashOn(img: Phaser.GameObjects.Image, color: number) {
  img.setTint(color).setTintMode(Phaser.TintModes.FILL);
}
function flashOff(img: Phaser.GameObjects.Image) {
  img.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
}

type Pose = 'f' | 'b' | 's';

/** 按朝向角选三视图：右=0 下=π/2 左=±π 上=-π/2 */
function poseFor(face: number): { pose: Pose; flip: boolean } {
  const a = ((face % TAU) + TAU) % TAU; // 0..2π
  if (a <= Math.PI / 4 || a >= (Math.PI * 7) / 4) return { pose: 's', flip: false };
  if (a >= (Math.PI * 3) / 4 && a <= (Math.PI * 5) / 4) return { pose: 's', flip: true };
  if (a > Math.PI / 4 && a < (Math.PI * 3) / 4) return { pose: 'f', flip: false };
  return { pose: 'b', flip: false };
}

/** 玩家（显示：阴影 + 本体三视图 + 枪口火光，逻辑字段对齐 app 版 makePlayer） */
export class Player {
  readonly isPlayer = true;
  idx: number;
  label: string;
  x: number; y: number;
  r = 13;
  face: number;
  hp = 100;
  alive = true;
  speed = 155;
  weapons: number[] = [0];
  cur = 0;
  ammo: Record<string, number> = {};
  cd = 0; hurtT = 0; respawnT = 0; invulnT = 0;
  /** 距上次受伤的时间（简单难度回血用） */
  regenT = 0;
  frags = 0; deaths = 0;
  walkT = 0; muzzle = 0;

  private set: string;
  private curTex = '';
  img: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
  muzzleImg: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, idx: number, x: number, y: number) {
    this.idx = idx;
    this.label = idx === 0 ? 'P1' : 'P2';
    this.x = x; this.y = y;
    this.face = idx === 0 ? -Math.PI / 2 : Math.PI / 2;
    this.set = idx === 0 ? 'chr_p1' : 'chr_p2';
    this.shadow = scene.add.image(x, y + 10, TEX.shadow).setDepth(DEPTH_SHADOW).setScale(1.1, 0.9);
    this.img = scene.add.image(x, y, `${this.set}_f`);
    this.muzzleImg = scene.add.image(x, y, TEX.muzzle).setVisible(false);
    this.sync();
  }

  sync() {
    const vis = this.alive;
    this.img.setVisible(vis);
    this.shadow.setVisible(vis);
    this.muzzleImg.setVisible(vis && this.muzzle > 0);
    if (!vis) return;
    const { pose, flip } = poseFor(this.face);
    const tex = `${this.set}_${pose}`;
    if (tex !== this.curTex) {
      this.img.setTexture(tex);
      this.curTex = tex;
    }
    this.img.setFlipX(flip);
    // 走路小步幅弹跳（2.5D 不旋转）
    const bob = this.alive && this.walkT > 0 ? Math.abs(Math.sin(this.walkT)) * -1.6 : 0;
    this.img.setPosition(this.x, this.y + bob).setDepth(this.y);
    // 受伤红闪；无敌时间闪烁
    if (this.hurtT > 0) flashOn(this.img, 0xff8878);
    else flashOff(this.img);
    this.img.setAlpha(this.invulnT > 0 && Math.floor(this.invulnT * 14) % 2 === 0 ? 0.35 : 1);
    this.shadow.setPosition(this.x, this.y + 10).setDepth(DEPTH_SHADOW);
    if (this.muzzle > 0) {
      this.muzzleImg.setPosition(this.x + Math.cos(this.face) * 26, this.y + Math.sin(this.face) * 26)
        .setRotation(this.face).setDepth(this.y + 1);
    }
  }

  destroy() {
    this.img.destroy(); this.shadow.destroy(); this.muzzleImg.destroy();
  }
}

/** 僵尸（字段对齐 app 版 makeZombie；攻击有前摇） */
export class Zombie {
  x: number; y: number;
  face = 0;
  cd = 0;
  walkT = rand(0, 9);
  slowT = 0;
  dead = false;
  type: ZombieType;
  r: number; hp: number; maxHp: number; speed: number; dmg: number; score: number;
  /** 受击白闪 */
  flashT = 0;
  /** 攻击前摇剩余时间，>0 表示正在蓄力 */
  windT = 0;
  /** 卡墙检测：持续位移不足则累计，超过阈值触发绕行 */
  stuckT = 0;
  /** 绕行剩余时间与方向（±90°） */
  detourT = 0;
  detourSign: 1 | -1 = 1;

  private set: string;
  private curTex = '';
  img: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, x: number, y: number, type: ZombieType) {
    this.x = x; this.y = y; this.type = type;
    if (type === 'fast') {
      Object.assign(this, { r: 11, hp: 42, maxHp: 42, speed: rand(92, 104), dmg: 9, score: 150 });
    } else if (type === 'brute') {
      Object.assign(this, { r: 19, hp: 300, maxHp: 300, speed: rand(36, 42), dmg: 22, score: 300 });
    } else {
      Object.assign(this, { r: 13, hp: 62, maxHp: 62, speed: rand(52, 64), dmg: 12, score: 100 });
    }
    this.set = type === 'fast' ? 'chr_fast' : type === 'brute' ? 'chr_brute' : 'chr_zombie';
    this.shadow = scene.add.image(x, y + 9, TEX.shadow).setDepth(DEPTH_SHADOW).setScale(this.r / 12, this.r / 14);
    this.img = scene.add.image(x, y, `${this.set}_f`).setScale(0.2);
    this.sync();
  }

  sync() {
    const { pose, flip } = poseFor(this.face);
    const tex = `${this.set}_${pose}`;
    if (tex !== this.curTex) {
      this.img.setTexture(tex);
      this.curTex = tex;
    }
    this.img.setFlipX(flip);
    const bob = Math.abs(Math.sin(this.walkT)) * -1.4;
    this.img.setPosition(this.x, this.y + bob).setDepth(this.y);
    // 出场放大动画期间不动 scale
    if (this.img.scaleX >= 0.99) {
      if (this.windT > 0) {
        // 前摇：压缩-伸展蓄力 + 变琥珀色警告
        const k = Math.sin((1 - this.windT / ZOMBIE_WINDUP) * Math.PI);
        this.img.setScale(1 + 0.16 * k, 1 - 0.16 * k);
      } else {
        this.img.setScale(1, 1);
      }
    }
    if (this.flashT > 0) flashOn(this.img, 0xffffff);
    else if (this.windT > 0) this.img.setTint(0xffb070);
    else flashOff(this.img);
    this.shadow.setPosition(this.x, this.y + 9).setDepth(DEPTH_SHADOW);
  }

  destroy() {
    this.img.destroy(); this.shadow.destroy();
  }
}

export type BulletKind = 'bullet' | 'pellet' | 'rocket';

/** 恶魔：飞越障碍、远程吐火球（AI 在 Game 场景，字段自理） */
export class Devil {
  x: number; y: number;
  face = 0;
  r = 13;
  hp = 140;
  maxHp = 140;
  dead = false;
  score = 500;
  flashT = 0;
  hoverT = rand(0, 9);
  /** 距离下一次吐火球 */
  shootT = 2;
  /** 吐火球前摇剩余时间 */
  windT = 0;

  private curTex = '';
  img: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.x = x; this.y = y;
    this.shadow = scene.add.image(x, y + 9, TEX.shadow).setDepth(DEPTH_SHADOW).setAlpha(0.7);
    this.img = scene.add.image(x, y, 'chr_devil_f').setScale(0.2);
    this.sync();
  }

  sync() {
    const { pose, flip } = poseFor(this.face);
    const tex = `chr_devil_${pose}`;
    if (tex !== this.curTex) {
      this.img.setTexture(tex);
      this.curTex = tex;
    }
    this.img.setFlipX(flip);
    // 悬浮：贴地阴影不动，身体上下浮动，遮挡层级略高于地面单位
    const hover = Math.sin(this.hoverT * 3) * 2.5 - 7;
    this.img.setPosition(this.x, this.y + hover).setDepth(this.y + 30);
    if (this.img.scaleX >= 0.99) {
      if (this.windT > 0) {
        const k = Math.sin((1 - this.windT / DEVIL_WINDUP) * Math.PI);
        this.img.setScale(1 + 0.14 * k, 1 - 0.14 * k);
      } else {
        this.img.setScale(1, 1);
      }
    }
    if (this.flashT > 0) flashOn(this.img, 0xffffff);
    else if (this.windT > 0) this.img.setTint(0xffe080);
    else flashOff(this.img);
    this.shadow.setPosition(this.x, this.y + 9).setDepth(DEPTH_SHADOW);
  }

  destroy() {
    this.img.destroy(); this.shadow.destroy();
  }
}

/** 恶魔吐出的火球（直线飞行，命中即小范围爆炸，不分敌我） */
export class Fireball {
  dead = false;
  life = 3;
  img: Phaser.GameObjects.Image;
  constructor(
    scene: Phaser.Scene,
    public x: number, public y: number,
    public vx: number, public vy: number,
  ) {
    this.img = scene.add.image(x, y, TEX.fireball).setRotation(Math.atan2(vy, vx));
    this.img.setDepth(y + 20);
  }
  sync() {
    this.img.setPosition(this.x, this.y).setDepth(this.y + 20);
  }
  destroy() { this.img.destroy(); }
}

export class Bullet {
  dead = false;
  img: Phaser.GameObjects.Image;
  constructor(
    scene: Phaser.Scene,
    public x: number, public y: number,
    public vx: number, public vy: number,
    public dmg: number, public owner: Player,
    public life: number, public kind: BulletKind,
  ) {
    const tex = kind === 'rocket' ? TEX.rocket : kind === 'pellet' ? TEX.pellet : TEX.bullet;
    this.img = scene.add.image(x, y, tex).setRotation(Math.atan2(vy, vx));
    this.img.setDepth(y + 1);
  }
  sync() {
    this.img.setPosition(this.x, this.y).setDepth(this.y + 1);
    if (this.kind === 'rocket') this.img.setRotation(Math.atan2(this.vy, this.vx));
  }
  destroy() { this.img.destroy(); }
}

export class Grenade {
  dead = false;
  img: Phaser.GameObjects.Image;
  constructor(
    scene: Phaser.Scene,
    public x: number, public y: number,
    public vx: number, public vy: number,
    public fuse: number, public owner: Player,
  ) {
    this.img = scene.add.image(x, y, TEX.grenade).setDepth(3);
  }
  sync() {
    this.img.setPosition(this.x, this.y).setRotation(this.img.rotation + 0.2);
  }
  destroy() { this.img.destroy(); }
}

export class Mine {
  dead = false;
  armT = 0.5;
  blink = 0;
  img: Phaser.GameObjects.Image;
  constructor(scene: Phaser.Scene, public x: number, public y: number, public owner: Player) {
    this.img = scene.add.image(x, y, TEX.mine).setDepth(3);
  }
  sync() {
    const armed = this.armT <= 0;
    this.img.setTexture(armed && Math.floor(this.blink * 4) % 2 === 0 ? TEX.mineOn : TEX.mine);
  }
  destroy() { this.img.destroy(); }
}

export class Barrel {
  dead = false;
  hp = 16;
  r = 14;
  img: Phaser.GameObjects.Image;
  constructor(scene: Phaser.Scene, public x: number, public y: number) {
    this.img = scene.add.image(x, y, TEX.barrel).setDepth(y - 6);
  }
  destroy() { this.img.destroy(); }
}

export type PickupKind = 'ammo' | 'med';

export class Pickup {
  dead = false;
  t = 0;
  life = 14;
  img: Phaser.GameObjects.Image;
  constructor(scene: Phaser.Scene, public x: number, public y: number, public kind: PickupKind) {
    this.img = scene.add.image(x, y, kind === 'ammo' ? TEX.crateAmmo : TEX.crateMed).setDepth(3);
  }
  sync() {
    // 即将消失时闪烁
    this.img.setAlpha(this.life < 3 && Math.floor(this.life * 6) % 2 === 0 ? 0.35 : 1);
    this.img.setScale(1 + Math.sin(this.t * 4) * 0.08);
  }
  destroy() { this.img.destroy(); }
}
