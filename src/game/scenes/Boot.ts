import * as Phaser from 'phaser';
import { generateTextures } from '../textures';

export class Boot extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create() {
    generateTextures(this);
    // 等像素字体就绪再进菜单（最多等 1.5s，失败也继续）
    let done = false;
    const go = () => {
      if (!done) {
        done = true;
        this.scene.start('MainMenu');
      }
    };
    if (document.fonts?.ready) {
      document.fonts.ready.then(go, go);
      this.time.delayedCall(1500, go);
    } else {
      go();
    }
  }
}
