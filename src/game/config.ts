export const W = 960;
export const H = 600;
export const WALL_T = 26;

export const TAU = Math.PI * 2;
export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const irand = (a: number, b: number) => Math.floor(rand(a, b + 1));
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const dist2 = (ax: number, ay: number, bx: number, by: number) => {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
};
export const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

/** 调色板：参考原作观感自行取色（非原素材） */
export const C = {
  floor: 0xe9e0cb,
  floorDark: 0xddd2b8,
  wallTop: 0xf7f5ee,
  wallSideA: 0xa9a9b1,
  wallSideB: 0x8e8e96,
  wallEdge: 0x3a3a44,
  blood: 0xa61818,
  bloodDark: 0x7d1010,
  scorch: 0x2a282a,
  amber: 0xf7a026,
  p1: 0xd96c2c,
  p1dark: 0xa84e1b,
  p2: 0x3d6fb4,
  p2dark: 0x2a5288,
  skin: 0xefc9a2,
  zombie: 0x8fa36b,
  zombieDk: 0x6b7d4c,
  fast: 0xb4553c,
  fastDk: 0x8c3e2a,
  brute: 0x5e7350,
  bruteDk: 0x45573a,
  gun: 0x2e2e36,
  white: 0xffffff,
  cream: 0xfff3d0,
  smoke: 0x55505a,
};

export const css = (c: number) => '#' + c.toString(16).padStart(6, '0');

export type GameMode = 'single' | 'coop' | 'versus';
