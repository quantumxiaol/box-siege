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

  /** 读取一套键位；mergeAlt 提供时两套按键合并生效（单人模式） */
  read(ctrl: CtrlScheme, mergeAlt?: CtrlScheme): InputFrame {
    const k = (c: string) => !!this.keys[c] || (!!mergeAlt && !!this.keys[mergeAlt[c as keyof CtrlScheme]]);
    const edge = (c: string) =>
      !!this.pressed[c] || (!!mergeAlt && !!this.pressed[mergeAlt[c as keyof CtrlScheme]]);
    return {
      mx: (k(ctrl.right) ? 1 : 0) - (k(ctrl.left) ? 1 : 0),
      my: (k(ctrl.down) ? 1 : 0) - (k(ctrl.up) ? 1 : 0),
      fire: k(ctrl.fire),
      prev: edge(ctrl.prev),
      next: edge(ctrl.next),
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
