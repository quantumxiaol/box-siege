import { W, H, WALL_T, clamp } from './config';
import type { BlockDef } from './data/maps';

/** 圆 vs 外墙+矩形集合的推出式碰撞（移植自 app/game.js collideWalls） */
export function collideWalls(x: number, y: number, r: number, blocks: BlockDef[]) {
  x = clamp(x, WALL_T + r, W - WALL_T - r);
  y = clamp(y, WALL_T + r, H - WALL_T - r);
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

/** 圆是否与墙体重叠（移植 hitsWall） */
export function hitsWall(x: number, y: number, r: number, blocks: BlockDef[]) {
  if (x < WALL_T + r || x > W - WALL_T - r || y < WALL_T + r || y > H - WALL_T - r) return true;
  for (const b of blocks) {
    if (x > b.x - r && x < b.x + b.w + r && y > b.y - r && y < b.y + b.h + r) return true;
  }
  return false;
}

/** 两点间是否被墙体挡住（演示/AI 用）。步长 10、半径 4，避免贴角穿缝 */
export function hasLOS(x1: number, y1: number, x2: number, y2: number, blocks: BlockDef[]) {
  const d = Math.hypot(x2 - x1, y2 - y1);
  const steps = Math.ceil(d / 10);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (hitsWall(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, 4, blocks)) return false;
  }
  return true;
}
