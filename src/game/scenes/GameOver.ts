import * as Phaser from 'phaser';
import { W, H, C, css, GameMode } from '../config';
import { Sfx } from '../sfx';

export interface GameOverData {
  mode?: GameMode;
  mapIdx?: number;
  score?: number;
  kills?: number;
  time?: number;
  winner?: number;
}

export class GameOver extends Phaser.Scene {
  constructor() {
    super('GameOver');
  }

  create(data: GameOverData) {
    const mode = data.mode ?? 'single';
    const mapIdx = data.mapIdx ?? 0;
    const score = data.score ?? 0;
    const kills = data.kills ?? 0;
    const time = data.time ?? 0;
    const winner = data.winner ?? -1;

    const cx = W / 2;
    this.add.rectangle(cx, H / 2, W, H, 0x0c0b08, 0.92);

    const isVersusWin = mode === 'versus' && winner >= 0;
    this.add.text(cx, 150, isVersusWin ? `P${winner + 1} 获胜！` : '游戏结束', {
      fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif',
      fontSize: '52px',
      fontStyle: 'bold',
      color: isVersusWin ? (winner === 0 ? '#F7A026' : '#7FB2F0') : '#FFFFFF',
      stroke: '#1a1a1a',
      strokeThickness: 8,
    }).setOrigin(0.5);

    const mm = Math.floor(time / 60), ss = Math.floor(time % 60);
    const lines = [
      `得分  ${score}`,
      `击杀  ${kills}`,
      `存活时间  ${mm}:${String(ss).padStart(2, '0')}`,
    ];
    this.add.text(cx, 260, lines, {
      fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif',
      fontSize: '22px',
      color: '#C9C2B2',
      align: 'center',
      lineSpacing: 14,
    }).setOrigin(0.5, 0);
    this.add.text(cx, 236, String(score).padStart(13, '0'), {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '18px',
      color: css(C.amber),
      stroke: '#1a1a1a',
      strokeThickness: 5,
    }).setOrigin(0.5);

    this.makeButton(cx - 120, 430, 200, 52, '再来一局', () => {
      this.scene.start('Game', { mode, mapIdx });
    });
    this.makeButton(cx + 120, 430, 200, 52, '回菜单', () => {
      this.scene.start('MainMenu');
    });

    this.input.keyboard?.on('keydown-ENTER', () => this.scene.start('Game', { mode, mapIdx }));
    this.input.keyboard?.on('keydown-ESC', () => this.scene.start('MainMenu'));
  }

  private makeButton(x: number, y: number, w: number, h: number, label: string, onClick: () => void) {
    const bg = this.add.rectangle(x, y, w, h, 0x2a2733)
      .setStrokeStyle(2, C.amber)
      .setInteractive({ useHandCursor: true });
    this.add.text(x, y, label, {
      fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif',
      fontSize: '20px',
      fontStyle: 'bold',
      color: '#FFFFFF',
    }).setOrigin(0.5);
    bg.on('pointerover', () => bg.setFillStyle(0x3a3646));
    bg.on('pointerout', () => bg.setFillStyle(0x2a2733));
    bg.on('pointerdown', () => { Sfx.ui(); onClick(); });
  }
}
