import * as Phaser from 'phaser';
import { C, rand } from './config';
import type { BlockDef } from './data/maps';

/** 纹理 key 常量（角色为 2.5D 三视图，key 形如 `chr_p1_f/b/s`） */
export const TEX = {
  barrel: 'obj_barrel',
  mine: 'obj_mine',
  mineOn: 'obj_mine_on',
  grenade: 'obj_grenade',
  rocket: 'obj_rocket',
  bullet: 'obj_bullet',
  pellet: 'obj_pellet',
  muzzle: 'fx_muzzle',
  crateAmmo: 'obj_crate_ammo',
  crateMed: 'obj_crate_med',
  blood0: 'fx_blood0',
  blood1: 'fx_blood1',
  blood2: 'fx_blood2',
  blood3: 'fx_blood3',
  pool: 'fx_pool',
  scorch: 'fx_scorch',
  shadow: 'fx_shadow',
  spark: 'fx_spark',
} as const;

export const BLOOD_VARIANTS = [TEX.blood0, TEX.blood1, TEX.blood2, TEX.blood3] as const;

interface CharCols {
  head: number; body: number; face: number; eye: number; outline: number;
}

function RR(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, r: number, fill: number, lw = 0, lc = 0) {
  g.fillStyle(fill, 1);
  g.fillRoundedRect(x, y, w, h, r);
  if (lw > 0) { g.lineStyle(lw, lc, 1); g.strokeRoundedRect(x, y, w, h, r); }
}

type Pose = 'f' | 'b' | 's';

/**
 * 2.5D 三视图方块头角色：正面 / 背面 / 侧面（朝右，向左用 flipX）。
 * 在 64×64 坐标系内设计，按 s 整体缩放（brute 1.45、fast 0.92）。
 */
function drawCharPose(g: Phaser.GameObjects.Graphics, s: number, pose: Pose, cols: CharCols, zombie: boolean) {
  const X = (v: number) => v * s;
  const FEET = 0x2a2a30;
  const lw = 2.2 * s;

  if (pose === 'f') {
    RR(g, X(26), X(49), X(5), X(6), X(1.5), FEET);
    RR(g, X(34), X(49), X(5), X(6), X(1.5), FEET);
    RR(g, X(24), X(33), X(16), X(16), X(4), cols.body, lw, cols.outline);
    if (zombie) {
      RR(g, X(19), X(34), X(7), X(15), X(3), cols.head, lw, cols.outline);
      RR(g, X(38), X(34), X(7), X(15), X(3), cols.head, lw, cols.outline);
    } else {
      RR(g, X(35), X(35), X(7), X(16), X(2), C.gun, lw * 0.85, cols.outline);
      g.fillStyle(0x1c1c22, 1);
      g.fillRect(X(35), X(48), X(7), X(4));
    }
    RR(g, X(19), X(8), X(26), X(24), X(7), cols.head, 3 * s, cols.outline);
    g.fillStyle(0xffffff, 0.22);
    g.fillRoundedRect(X(22), X(10), X(20), X(4), X(2));
    if (!zombie) RR(g, X(23), X(17), X(18), X(13), X(3), cols.face);
    g.fillStyle(zombie ? cols.eye : 0xffffff, 1);
    g.fillRoundedRect(X(24.5), X(19), X(6), X(7), X(2));
    g.fillRoundedRect(X(33.5), X(19), X(6), X(7), X(2));
    g.fillStyle(zombie ? 0x1a0c08 : cols.eye, 1);
    g.fillRect(X(27.5), X(22), X(3), X(3.5));
    g.fillRect(X(35.5), X(22), X(3), X(3.5));
    if (zombie) {
      g.fillStyle(cols.outline, 0.85);
      g.fillRect(X(27), X(28.5), X(10), X(2.2));
    }
  } else if (pose === 'b') {
    RR(g, X(26), X(49), X(5), X(6), X(1.5), FEET);
    RR(g, X(34), X(49), X(5), X(6), X(1.5), FEET);
    RR(g, X(24), X(33), X(16), X(16), X(4), cols.body, lw, cols.outline);
    if (zombie) {
      RR(g, X(19), X(35), X(6), X(12), X(3), cols.head, lw, cols.outline);
      RR(g, X(39), X(35), X(6), X(12), X(3), cols.head, lw, cols.outline);
    } else {
      RR(g, X(29.5), X(2), X(5), X(12), X(2), C.gun, lw * 0.7, cols.outline);
    }
    RR(g, X(19), X(8), X(26), X(24), X(7), cols.head, 3 * s, cols.outline);
    g.fillStyle(0xffffff, 0.18);
    g.fillRoundedRect(X(22), X(10), X(20), X(4), X(2));
    g.fillStyle(cols.face, 0.9);
    g.fillRoundedRect(X(20), X(26), X(24), X(5), X(2));
  } else {
    RR(g, X(23), X(49), X(6), X(6), X(1.5), FEET);
    RR(g, X(34), X(47), X(6), X(6), X(1.5), FEET);
    RR(g, X(25), X(33), X(14), X(16), X(4), cols.body, lw, cols.outline);
    if (zombie) {
      RR(g, X(33), X(34), X(17), X(6), X(3), cols.head, lw, cols.outline);
      RR(g, X(33), X(42), X(17), X(6), X(3), cols.head, lw, cols.outline);
    } else {
      RR(g, X(30), X(35.5), X(8), X(6), X(3), cols.head, lw * 0.7, cols.outline);
      RR(g, X(36), X(35), X(19), X(6.5), X(2), C.gun, lw * 0.85, cols.outline);
      g.fillStyle(0x1c1c22, 1);
      g.fillRect(X(51), X(35), X(4), X(6.5));
    }
    RR(g, X(21), X(8), X(26), X(24), X(7), cols.head, 3 * s, cols.outline);
    g.fillStyle(0xffffff, 0.22);
    g.fillRoundedRect(X(24), X(10), X(19), X(4), X(2));
    if (!zombie) RR(g, X(33), X(17), X(13), X(13), X(3), cols.face);
    g.fillStyle(zombie ? cols.eye : 0xffffff, 1);
    g.fillRoundedRect(X(37), X(19), X(6), X(7), X(2));
    g.fillStyle(zombie ? 0x1a0c08 : cols.eye, 1);
    g.fillRect(X(39.5), X(22), X(3), X(3.5));
    if (zombie) {
      g.fillStyle(cols.outline, 0.85);
      g.fillRect(X(40), X(28.5), X(6), X(2.2));
    }
  }
}

function drawSplat(g: Phaser.GameObjects.Graphics, key: string, n: number, spread: number, rMax: number) {
  g.fillStyle(C.blood, 1);
  g.fillCircle(48, 48, rand(rMax * 0.45, rMax * 0.7));
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), d = rand(4, spread);
    g.fillCircle(48 + Math.cos(a) * d, 48 + Math.sin(a) * d, rand(1.5, rMax * 0.4));
  }
  g.fillStyle(C.bloodDark, 0.85);
  for (let i = 0; i < Math.floor(n / 2); i++) {
    const a = rand(0, Math.PI * 2), d = rand(2, spread * 0.7);
    g.fillCircle(48 + Math.cos(a) * d, 48 + Math.sin(a) * d, rand(1, rMax * 0.25));
  }
  g.generateTexture(key, 96, 96);
  g.clear();
}

function chamfer(w: number, h: number) {
  return Math.max(6, Math.min(14, Math.min(w, h) * 0.16));
}

function octPoints(x: number, y: number, w: number, h: number, cham: number) {
  return [
    new Phaser.Math.Vector2(x + cham, y), new Phaser.Math.Vector2(x + w - cham, y),
    new Phaser.Math.Vector2(x + w, y + cham), new Phaser.Math.Vector2(x + w, y + h - cham),
    new Phaser.Math.Vector2(x + w - cham, y + h), new Phaser.Math.Vector2(x + cham, y + h),
    new Phaser.Math.Vector2(x, y + h - cham), new Phaser.Math.Vector2(x, y + cham),
  ];
}

/** 方块侧立面（画进地面静态层，永远在角色下方） */
export function drawBlockSide(g: Phaser.GameObjects.Graphics, b: BlockDef, side = 13) {
  const cham = chamfer(b.w, b.h);
  g.fillStyle(C.wallSideB, 1);
  g.fillPoints(octPoints(b.x, b.y + side, b.w, b.h, cham), true);
  g.fillStyle(C.wallSideA, 1);
  g.fillPoints([
    new Phaser.Math.Vector2(b.x, b.y + cham + side), new Phaser.Math.Vector2(b.x + cham, b.y + side),
    new Phaser.Math.Vector2(b.x + cham, b.y + b.h + side), new Phaser.Math.Vector2(b.x, b.y + b.h - cham + side),
  ], true);
  g.lineStyle(2, C.wallEdge, 0.55);
  g.strokePoints(octPoints(b.x, b.y + side, b.w, b.h, cham), true);
}

/** 方块顶面（画在 (x,y) 起的 w×h 区域；用于生成贴图做 y 排序遮挡） */
export function drawBlockTop(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number) {
  const cham = chamfer(w, h);
  g.fillStyle(C.wallTop, 1);
  g.fillPoints(octPoints(x, y, w, h, cham), true);
  g.lineStyle(2, 0xffffff, 0.75);
  g.beginPath();
  g.moveTo(x + cham, y + 1.5);
  g.lineTo(x + w - cham, y + 1.5);
  g.strokePath();
  g.lineStyle(2, C.wallEdge, 1);
  g.strokePoints(octPoints(x, y, w, h, cham), true);
}

/** 按尺寸生成/复用方块顶面贴图（带 4px 出血容纳描边） */
export function ensureBlockTopTexture(scene: Phaser.Scene, w: number, h: number): string {
  const key = `block_${w}x${h}`;
  if (!scene.textures.exists(key)) {
    const g = scene.add.graphics();
    drawBlockTop(g, 2, 2, w, h);
    g.generateTexture(key, w + 4, h + 4);
    g.destroy();
  }
  return key;
}

export function generateTextures(scene: Phaser.Scene) {
  const g = scene.add.graphics();

  // ---- 角色（2.5D 三视图） ----
  const CHARS: [string, number, CharCols, boolean][] = [
    ['chr_p1', 1, { head: C.p1, body: C.p1dark, face: C.skin, eye: 0x22222a, outline: 0x2a1c10 }, false],
    ['chr_p2', 1, { head: C.p2, body: C.p2dark, face: C.skin, eye: 0x22222a, outline: 0x14202e }, false],
    ['chr_zombie', 1, { head: C.zombie, body: C.zombieDk, face: C.zombieDk, eye: 0xc23a1e, outline: 0x2e3a1e }, true],
    ['chr_fast', 0.92, { head: C.fast, body: C.fastDk, face: C.fastDk, eye: 0xffd038, outline: 0x3a1c10 }, true],
    ['chr_brute', 1.45, { head: C.brute, body: C.bruteDk, face: C.bruteDk, eye: 0xc23a1e, outline: 0x222e18 }, true],
  ];
  for (const [set, s, cols, zombie] of CHARS) {
    for (const pose of ['f', 'b', 's'] as const) {
      drawCharPose(g, s, pose, cols, zombie);
      g.generateTexture(`${set}_${pose}`, Math.ceil(64 * s), Math.ceil(64 * s));
      g.clear();
    }
  }

  // ---- 油桶（红桶+警示环） ----
  g.fillStyle(0x8c1f14, 1);
  g.fillRoundedRect(2, 6, 28, 28, 6);
  g.fillStyle(0xc23a1e, 1);
  g.fillEllipse(16, 13, 26, 16);
  g.fillStyle(0xe05a30, 1);
  g.fillEllipse(16, 12, 20, 11);
  g.lineStyle(2.4, 0x5a1208, 1);
  g.strokeEllipse(16, 13, 26, 16);
  g.strokeRoundedRect(2, 6, 28, 28, 6);
  g.lineStyle(2, 0xf7d038, 0.9);
  g.lineBetween(4, 24, 28, 24);
  g.generateTexture(TEX.barrel, 32, 36); g.clear();

  // ---- 地雷（灭/亮两帧） ----
  for (const [key, on] of [[TEX.mine, false], [TEX.mineOn, true]] as const) {
    g.fillStyle(0x3a3a42, 1);
    g.fillCircle(10, 10, 8);
    g.fillStyle(0x55555e, 1);
    g.fillCircle(10, 9, 5);
    g.fillStyle(on ? 0xff4040 : 0x7a2020, 1);
    g.fillCircle(10, 9, 2.2);
    g.lineStyle(1.6, 0x1c1c22, 1);
    g.strokeCircle(10, 10, 8);
    g.generateTexture(key, 20, 20); g.clear();
  }

  // ---- 手雷 ----
  g.fillStyle(0x3f5238, 1);
  g.fillCircle(8, 9, 6);
  g.fillStyle(0x5e7350, 1);
  g.fillCircle(7, 7.5, 3);
  g.fillStyle(0x8a8a92, 1);
  g.fillRect(6, 1, 4, 4);
  g.lineStyle(1.4, 0x222e18, 1);
  g.strokeCircle(8, 9, 6);
  g.generateTexture(TEX.grenade, 16, 18); g.clear();

  // ---- 火箭弹（朝 +X） ----
  g.fillStyle(0x6a6a72, 1);
  g.fillRoundedRect(2, 5, 16, 6, 3);
  g.fillStyle(0xe05a30, 1);
  g.fillTriangle(18, 5, 18, 11, 26, 8);
  g.fillStyle(0x3a3a44, 1);
  g.fillTriangle(2, 5, 2, 11, -3, 8);
  g.fillStyle(0xf7d038, 0.95);
  g.fillCircle(0, 8, 2.4);
  g.generateTexture(TEX.rocket, 28, 16); g.clear();

  // ---- 子弹 / 霰弹（朝 +X） ----
  g.fillStyle(0xffe9a8, 1);
  g.fillRoundedRect(0, 1, 10, 4, 2);
  g.fillStyle(0xf7a026, 1);
  g.fillRect(0, 1.5, 3, 3);
  g.generateTexture(TEX.bullet, 12, 6); g.clear();
  g.fillStyle(0xffe9a8, 1);
  g.fillCircle(3, 3, 2.6);
  g.generateTexture(TEX.pellet, 6, 6); g.clear();

  // ---- 枪口火光 ----
  g.fillStyle(0xfff3d0, 1);
  g.fillPoints([
    new Phaser.Math.Vector2(14, 7), new Phaser.Math.Vector2(22, 5), new Phaser.Math.Vector2(17, 10),
    new Phaser.Math.Vector2(22, 15), new Phaser.Math.Vector2(13, 12), new Phaser.Math.Vector2(8, 15),
    new Phaser.Math.Vector2(11, 10), new Phaser.Math.Vector2(6, 5),
  ], true);
  g.fillStyle(0xf7a026, 0.9);
  g.fillCircle(13, 10, 3.4);
  g.generateTexture(TEX.muzzle, 28, 20); g.clear();

  // ---- 补给箱 ----
  g.fillStyle(0x8a6f2e, 1);
  g.fillRoundedRect(1, 6, 22, 17, 3);
  g.fillStyle(0xc9a23a, 1);
  g.fillRoundedRect(1, 1, 22, 12, 3);
  g.lineStyle(2, 0x4a3a14, 1);
  g.strokeRoundedRect(1, 1, 22, 22, 3);
  g.fillStyle(0x4a3a14, 1);
  g.fillRect(6, 8, 12, 4);
  g.generateTexture(TEX.crateAmmo, 24, 24); g.clear();
  g.fillStyle(0xd8d8de, 1);
  g.fillRoundedRect(1, 6, 22, 17, 3);
  g.fillStyle(0xf4f1e8, 1);
  g.fillRoundedRect(1, 1, 22, 12, 3);
  g.lineStyle(2, 0x55555e, 1);
  g.strokeRoundedRect(1, 1, 22, 22, 3);
  g.fillStyle(0xc23a1e, 1);
  g.fillRect(10, 5, 4, 14);
  g.fillRect(5, 10, 14, 4);
  g.generateTexture(TEX.crateMed, 24, 24); g.clear();

  // ---- 血迹 / 血泊 ----
  drawSplat(g, TEX.blood0, 10, 22, 9);
  drawSplat(g, TEX.blood1, 14, 30, 7);
  drawSplat(g, TEX.blood2, 7, 14, 11);
  drawSplat(g, TEX.blood3, 18, 38, 5);
  g.fillStyle(C.blood, 1);
  g.fillCircle(48, 48, 26);
  for (let i = 0; i < 12; i++) {
    const a = rand(0, Math.PI * 2), d = rand(14, 34);
    g.fillCircle(48 + Math.cos(a) * d, 48 + Math.sin(a) * d, rand(4, 12));
  }
  g.fillStyle(C.bloodDark, 0.8);
  g.fillCircle(48, 48, 15);
  g.generateTexture(TEX.pool, 96, 96); g.clear();

  // ---- 火花粒子 ----
  g.fillStyle(0xffffff, 1);
  g.fillCircle(4, 4, 4);
  g.generateTexture(TEX.spark, 8, 8); g.clear();

  g.destroy();

  // ---- 软边纹理（canvas 渐变）：焦痕 / 阴影 ----
  const scorch = scene.textures.createCanvas(TEX.scorch, 96, 96)!;
  const sctx = scorch.getContext();
  const sg = sctx.createRadialGradient(48, 48, 4, 48, 48, 46);
  sg.addColorStop(0, 'rgba(30,28,30,0.62)');
  sg.addColorStop(0.55, 'rgba(40,38,40,0.38)');
  sg.addColorStop(1, 'rgba(40,38,40,0)');
  sctx.fillStyle = sg;
  sctx.fillRect(0, 0, 96, 96);
  // 焦痕边缘噪点
  sctx.fillStyle = 'rgba(30,28,30,0.35)';
  for (let i = 0; i < 26; i++) {
    const a = rand(0, Math.PI * 2), d = rand(24, 44);
    sctx.beginPath();
    sctx.arc(48 + Math.cos(a) * d, 48 + Math.sin(a) * d, rand(1, 4), 0, Math.PI * 2);
    sctx.fill();
  }
  scorch.refresh();

  const shadow = scene.textures.createCanvas(TEX.shadow, 64, 32)!;
  const shc = shadow.getContext();
  shc.translate(32, 16);
  shc.scale(1, 0.5);
  const rg = shc.createRadialGradient(0, 0, 2, 0, 0, 28);
  rg.addColorStop(0, 'rgba(20,18,14,0.34)');
  rg.addColorStop(1, 'rgba(20,18,14,0)');
  shc.fillStyle = rg;
  shc.beginPath();
  shc.arc(0, 0, 28, 0, Math.PI * 2);
  shc.fill();
  shadow.refresh();
}
