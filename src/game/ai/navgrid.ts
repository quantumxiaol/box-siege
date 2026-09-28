import { W, H, WALL_T } from '../config';
import type { BlockDef } from '../data/maps';

const CELL = 30;
const COLS = Math.ceil(W / CELL);
const ROWS = Math.ceil(H / CELL);
/** 障碍膨胀量（≈ 角色半径 + 余量），光栅化时一次性计入 */
const MARGIN = 15;

/** 小顶堆 [代价, 格子] */
class Heap {
  private h: [number, number][] = [];
  get size() { return this.h.length; }
  push(c: number, i: number) {
    this.h.push([c, i]);
    let k = this.h.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (this.h[p][0] <= this.h[k][0]) break;
      [this.h[p], this.h[k]] = [this.h[k], this.h[p]];
      k = p;
    }
  }
  pop(): [number, number] {
    const top = this.h[0];
    const last = this.h.pop()!;
    if (this.h.length) {
      this.h[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1, r = 2 * k + 2;
        let m = k;
        if (l < this.h.length && this.h[l][0] < this.h[m][0]) m = l;
        if (r < this.h.length && this.h[r][0] < this.h[m][0]) m = r;
        if (m === k) break;
        [this.h[m], this.h[k]] = [this.h[k], this.h[m]];
        k = m;
      }
    }
    return top;
  }
}

/**
 * 粗导航栅格（30px，32×20）：
 * - computeFlow：多源 Dijkstra 流场，供尸潮共享寻路（O(1) 查询）
 * - astar：单个体精确路径，供 bot 导航
 */
export class NavGrid {
  readonly cols = COLS;
  readonly rows = ROWS;
  readonly cell = CELL;
  private blocked = new Uint8Array(COLS * ROWS);
  private cost = new Float32Array(COLS * ROWS);

  constructor(blocks: BlockDef[]) {
    for (let cy = 0; cy < ROWS; cy++) {
      for (let cx = 0; cx < COLS; cx++) {
        const x = (cx + 0.5) * CELL, y = (cy + 0.5) * CELL;
        let b = 0;
        if (x < WALL_T + MARGIN || x > W - WALL_T - MARGIN || y < WALL_T + MARGIN || y > H - WALL_T - MARGIN) {
          b = 1;
        } else {
          for (const bl of blocks) {
            if (x > bl.x - MARGIN && x < bl.x + bl.w + MARGIN && y > bl.y - MARGIN && y < bl.y + bl.h + MARGIN) { b = 1; break; }
          }
        }
        this.blocked[cy * COLS + cx] = b;
      }
    }
  }

  idx(cx: number, cy: number) { return cy * COLS + cx; }
  at(x: number, y: number) { return this.idx(Math.floor(x / CELL), Math.floor(y / CELL)); }
  free(cx: number, cy: number) { return cx >= 0 && cy >= 0 && cx < COLS && cy < ROWS && !this.blocked[this.idx(cx, cy)]; }
  center(i: number) { return { x: (i % COLS + 0.5) * CELL, y: (Math.floor(i / COLS) + 0.5) * CELL }; }

  /** 8 邻接（禁止切角），对角代价 √2 */
  private *neighbors(i: number) {
    const cx = i % COLS, cy = Math.floor(i / COLS);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        if (!this.free(cx + dx, cy + dy)) continue;
        if (dx && dy && (!this.free(cx + dx, cy) || !this.free(cx, cy + dy))) continue;
        yield { j: this.idx(cx + dx, cy + dy), w: dx && dy ? 1.4142 : 1 };
      }
    }
  }

  /** 从目标位置反向算全场代价（僵尸寻路：目标=存活玩家） */
  computeFlow(targets: { x: number; y: number }[]) {
    this.cost.fill(Infinity);
    const heap = new Heap();
    for (const t of targets) {
      const i = this.at(t.x, t.y);
      if (this.blocked[i]) continue;
      if (this.cost[i] > 0) { this.cost[i] = 0; heap.push(0, i); }
    }
    while (heap.size) {
      const [c, i] = heap.pop();
      if (c > this.cost[i]) continue;
      for (const { j, w } of this.neighbors(i)) {
        const nc = c + w;
        if (nc < this.cost[j]) { this.cost[j] = nc; heap.push(nc, j); }
      }
    }
  }

  /** 该位置朝目标的方向（归一化）；不可达返回 null。起点在障碍格内也能工作 */
  flowDir(x: number, y: number) {
    const i = this.at(x, y);
    const cx = i % COLS, cy = Math.floor(i / COLS);
    let best = this.cost[i], bx = 0, by = 0, found = false;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        if (!this.free(cx + dx, cy + dy)) continue;
        if (dx && dy && (!this.free(cx + dx, cy) || !this.free(cx, cy + dy))) continue;
        const c = this.cost[this.idx(cx + dx, cy + dy)];
        if (c < best) { best = c; bx = dx; by = dy; found = true; }
      }
    }
    if (!found || !isFinite(best)) return null;
    const l = Math.hypot(bx, by);
    return { x: bx / l, y: by / l };
  }

  /** 最近的可行走格（起点被膨胀量吞掉时兜底） */
  private nearestFree(i: number) {
    if (!this.blocked[i]) return i;
    const cx = i % COLS, cy = Math.floor(i / COLS);
    for (let r = 1; r <= 3; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (this.free(cx + dx, cy + dy)) return this.idx(cx + dx, cy + dy);
        }
      }
    }
    return -1;
  }

  /** A*（8 向，octile 启发），返回世界坐标路径点（不含起点），不可达返回 [] */
  astar(sx: number, sy: number, tx: number, ty: number): { x: number; y: number }[] {
    const start = this.nearestFree(this.at(sx, sy));
    const goal = this.nearestFree(this.at(tx, ty));
    if (start === -1 || goal === -1) return [];
    if (start === goal) return [{ x: tx, y: ty }];
    const gx = goal % COLS, gy = Math.floor(goal / COLS);
    const h = (i: number) => {
      const dx = Math.abs((i % COLS) - gx), dy = Math.abs(Math.floor(i / COLS) - gy);
      return Math.max(dx, dy) + 0.4142 * Math.min(dx, dy);
    };
    const g = new Float32Array(COLS * ROWS).fill(Infinity);
    const from = new Int32Array(COLS * ROWS).fill(-1);
    const closed = new Uint8Array(COLS * ROWS);
    const heap = new Heap();
    g[start] = 0;
    heap.push(h(start), start);
    while (heap.size) {
      const [, i] = heap.pop();
      if (closed[i]) continue;
      closed[i] = 1;
      if (i === goal) break;
      for (const { j, w } of this.neighbors(i)) {
        if (closed[j]) continue;
        const ng = g[i] + w;
        if (ng < g[j]) { g[j] = ng; from[j] = i; heap.push(ng + h(j), j); }
      }
    }
    if (from[goal] === -1) return [];
    const cells: number[] = [];
    for (let i = goal; i !== -1 && i !== start; i = from[i]) cells.push(i);
    cells.reverse();
    return cells.map(i => this.center(i));
  }
}
