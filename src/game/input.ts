import * as Phaser from 'phaser';
import { Sfx } from './sfx';

export interface CtrlScheme {
  up: string; down: string; left: string; right: string;
  fire: string; prev: string; next: string;
}

export const CTRL_P1: CtrlScheme = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', fire: 'Slash', prev: 'Comma', next: 'Period' };
export const CTRL_P2: CtrlScheme = { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', fire: 'Space', prev: 'KeyQ', next: 'KeyE' };

export interface InputFrame {
  mx: number; my: number; fire: boolean; prev: boolean; next: boolean;
  /** bot 专用：显式朝向（实现边退边打），键盘输入不设此字段 */
  face?: number;
}

/** bot 控制器接口（entities 依赖此类型避免循环引用） */
export interface BotLike {
  update(dt: number): InputFrame;
}

/** 键盘状态 + 边沿触发（基于 e.code，与布局无关） */
export class Input {
  private keys: Record<string, boolean> = Object.create(null);
  private pressed: Record<string, boolean> = Object.create(null);

  /** 全局键回调，由场景注册 */
  onPause: (() => void) | null = null;
  onMute: (() => void) | null = null;
  onFullscreen: (() => void) | null = null;
  onEscape: (() => void) | null = null;
  onSpace: (() => void) | null = null;

  private downHandler = (e: KeyboardEvent) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Slash'].includes(e.code)) e.preventDefault();
    if (!e.repeat) {
      if (!this.keys[e.code]) this.pressed[e.code] = true;
      this.keys[e.code] = true;
      Sfx.unlock();
      if (e.code === 'KeyP') this.onPause?.();
      if (e.code === 'KeyM') this.onMute?.();
      if (e.code === 'KeyF') this.onFullscreen?.();
      if (e.code === 'Escape') this.onEscape?.();
      if (e.code === 'Space') this.onSpace?.();
    }
  };
  private upHandler = (e: KeyboardEvent) => { this.keys[e.code] = false; };
  private blurHandler = () => { for (const k in this.keys) this.keys[k] = false; };

  attach() {
    window.addEventListener('keydown', this.downHandler);
    window.addEventListener('keyup', this.upHandler);
    window.addEventListener('blur', this.blurHandler);
  }

  detach() {
    window.removeEventListener('keydown', this.downHandler);
    window.removeEventListener('keyup', this.upHandler);
    window.removeEventListener('blur', this.blurHandler);
    this.keys = Object.create(null);
    this.pressed = Object.create(null);
  }

  /** 读取一套键位；mergeAlt 提供时两套按键按「同一操作」合并生效（单人/AI 队友模式） */
  read(ctrl: CtrlScheme, mergeAlt?: CtrlScheme): InputFrame {
    const get = (prop: keyof CtrlScheme) =>
      !!this.keys[ctrl[prop]] || (!!mergeAlt && !!this.keys[mergeAlt[prop]]);
    const edge = (prop: keyof CtrlScheme) =>
      !!this.pressed[ctrl[prop]] || (!!mergeAlt && !!this.pressed[mergeAlt[prop]]);
    return {
      mx: (get('right') ? 1 : 0) - (get('left') ? 1 : 0),
      my: (get('down') ? 1 : 0) - (get('up') ? 1 : 0),
      fire: get('fire'),
      prev: edge('prev'),
      next: edge('next'),
    };
  }

  /** 每帧末尾调用，清掉边沿标记 */
  lateUpdate() {
    this.pressed = Object.create(null);
  }
}

/** 供场景切换时清理：Phaser 场景 shutdown 时 detach */
export function bindInputLifecycle(scene: Phaser.Scene, input: Input) {
  input.attach();
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => input.detach());
}
