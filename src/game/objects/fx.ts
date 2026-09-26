import * as Phaser from 'phaser';
import { TAU, rand } from '../config';
import { TEX } from '../textures';

interface Particle {
  img: Phaser.GameObjects.Image;
  vx: number; vy: number;
  t: number; life: number;
  active: boolean;
}

const DEPTH_FX = 900;

/** 轻量粒子池（行为移植 app 版 addParticles：摩擦 + 寿命 + 渐隐） */
export class ParticlePool {
  private pool: Particle[] = [];

  constructor(private scene: Phaser.Scene) {}

  spawn(x: number, y: number, n: number, color: number, spd: number, life: number, size: number) {
    for (let i = 0; i < n; i++) {
      let p = this.pool.find(p => !p.active);
      if (!p) {
        if (this.pool.length >= 500) return;
        const img = this.scene.add.image(0, 0, TEX.spark).setDepth(DEPTH_FX).setVisible(false);
        p = { img, vx: 0, vy: 0, t: 0, life: 1, active: false };
        this.pool.push(p);
      }
      const a = rand(0, TAU), s = rand(spd * 0.3, spd);
      p.img.setPosition(x, y)
        .setTint(color)
        .setScale(rand(size * 0.5, size) / 8)
        .setAlpha(1)
        .setVisible(true);
      p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s;
      p.t = 0; p.life = rand(life * 0.5, life);
      p.active = true;
    }
  }

  update(dt: number) {
    for (const p of this.pool) {
      if (!p.active) continue;
      p.t += dt;
      if (p.t >= p.life) {
        p.active = false;
        p.img.setVisible(false);
        continue;
      }
      p.img.x += p.vx * dt;
      p.img.y += p.vy * dt;
      p.vx *= 0.92; p.vy *= 0.92;
      p.img.setAlpha(1 - p.t / p.life);
    }
  }
}

interface Toast {
  text: Phaser.GameObjects.Text;
  t: number; life: number;
  active: boolean;
}

/** 屏幕中上方的浮动提示（移植 app 版 toast） */
export class Toasts {
  private pool: Toast[] = [];
  private static MAX = 4;

  constructor(private scene: Phaser.Scene) {}

  show(msg: string, color = '#FFFFFF') {
    let t = this.pool.find(t => !t.active);
    if (!t) {
      if (this.pool.length >= Toasts.MAX) {
        t = this.pool[0];
        for (let i = 1; i < this.pool.length; i++) this.pool[i - 1] = this.pool[i];
        this.pool[this.pool.length - 1] = t;
      } else {
        const text = this.scene.add.text(0, 0, '', {
          fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif',
          fontSize: '16px',
          fontStyle: 'bold',
          color: '#FFFFFF',
          stroke: '#000000',
          strokeThickness: 4,
        }).setOrigin(0.5).setDepth(1000).setVisible(false);
        t = { text, t: 0, life: 2.2, active: false };
        this.pool.push(t);
      }
    }
    t.text.setText(msg).setColor(color).setAlpha(1).setVisible(true);
    t.t = 0;
    t.active = true;
    this.layout();
  }

  private layout() {
    let i = 0;
    for (const t of this.pool) {
      if (t.active) t.text.setPosition(480, 92 + i++ * 24);
    }
  }

  update(dt: number) {
    for (const t of this.pool) {
      if (!t.active) continue;
      t.t += dt;
      if (t.t >= t.life) {
        t.active = false;
        t.text.setVisible(false);
      } else if (t.t > t.life - 0.5) {
        t.text.setAlpha((t.life - t.t) / 0.5);
      }
    }
  }
}
