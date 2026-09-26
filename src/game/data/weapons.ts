export interface WeaponDef {
  id: string;
  name: string;
  cd: number;
  dmg?: number;
  spd?: number;
  spread?: number;
  pellets?: number;
  life?: number;
  max?: number;
  start?: number;
}

/** 数值移植自 app/game.js（WEAPONS / UNLOCK_AT） */
export const WEAPONS: WeaponDef[] = [
  { id: 'pistol',  name: '手枪',   cd: 0.26, dmg: 34, spd: 560, spread: 0.02 },
  { id: 'uzi',     name: '乌兹',   cd: 0.085, dmg: 19, spd: 600, spread: 0.06, max: 300, start: 200 },
  { id: 'shotgun', name: '霰弹枪', cd: 0.62, dmg: 15, spd: 640, spread: 0.44, pellets: 6, life: 0.20, max: 60, start: 32 },
  { id: 'grenade', name: '手雷',   cd: 0.70, max: 12, start: 6 },
  { id: 'mine',    name: '地雷',   cd: 0.50, max: 10, start: 5 },
  { id: 'rocket',  name: '火箭筒', cd: 0.95, dmg: 130, spd: 430, max: 10, start: 4 },
  { id: 'barrel',  name: '油桶',   cd: 0.50, max: 6,  start: 3 },
];

/** 按总击杀数逐级解锁 */
export const UNLOCK_AT = [0, 8, 20, 35, 55, 80, 110];
