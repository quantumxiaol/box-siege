import { W, H, WALL_T } from '../config';

export interface BlockDef { x: number; y: number; w: number; h: number }
export interface MapDef {
  name: string;
  blocks: BlockDef[];
  barrels: { x: number; y: number }[];
  /** 补给箱固定刷新点（弹药/医疗交替，空位后定时补货） */
  crates: { x: number; y: number }[];
  spawns: { single: number[][]; coop: number[][]; versus: number[][] };
}

/** 地图移植自 app/game.js（MAPS / SPAWN_GATES） */
export const MAPS: MapDef[] = [
  {
    name: '训练场',
    blocks: [
      { x: 170, y: 110, w: 84, h: 84 }, { x: 706, y: 110, w: 84, h: 84 },
      { x: 170, y: 406, w: 84, h: 84 }, { x: 706, y: 406, w: 84, h: 84 },
      { x: 312, y: 140, w: 84, h: 84 }, { x: 564, y: 376, w: 84, h: 84 },
    ],
    barrels: [{ x: 120, y: 300 }, { x: 826, y: 300 }],
    crates: [{ x: 480, y: 120 }, { x: 260, y: 480 }, { x: 700, y: 480 }],
    spawns: { single: [[480, 300]], coop: [[440, 300], [520, 300]], versus: [[480, 110], [480, 490]] },
  },
  {
    name: '回廊',
    // 断环：四边中部留口，玩家僵尸都能进出
    blocks: [
      { x: 280, y: 170, w: 180, h: 42 }, { x: 500, y: 170, w: 180, h: 42 },
      { x: 280, y: 388, w: 180, h: 42 }, { x: 500, y: 388, w: 180, h: 42 },
      { x: 280, y: 212, w: 42, h: 66 }, { x: 280, y: 322, w: 42, h: 66 },
      { x: 638, y: 212, w: 42, h: 66 }, { x: 638, y: 322, w: 42, h: 66 },
    ],
    barrels: [{ x: 470, y: 268 }, { x: 514, y: 324 }],
    crates: [{ x: 480, y: 110 }, { x: 150, y: 480 }, { x: 810, y: 480 }],
    spawns: { single: [[480, 300]], coop: [[448, 300], [512, 300]], versus: [[480, 110], [480, 490]] },
  },
  {
    name: '十字阵',
    blocks: [
      { x: 438, y: 90,  w: 84, h: 170 }, { x: 438, y: 340, w: 84, h: 170 },
      { x: 190, y: 258, w: 220, h: 84 }, { x: 550, y: 258, w: 220, h: 84 },
    ],
    barrels: [{ x: 110, y: 110 }, { x: 836, y: 110 }, { x: 110, y: 476 }, { x: 836, y: 476 }],
    crates: [{ x: 480, y: 520 }, { x: 140, y: 140 }, { x: 820, y: 140 }],
    spawns: { single: [[480, 300]], coop: [[448, 300], [512, 300]], versus: [[140, 300], [820, 300]] },
  },
];

/** 僵尸入场口（四边中点） */
export const SPAWN_GATES = [
  { x: W / 2, y: WALL_T + 12 }, { x: W / 2, y: H - WALL_T - 12 },
  { x: WALL_T + 12, y: H / 2 }, { x: W - WALL_T - 12, y: H / 2 },
];
