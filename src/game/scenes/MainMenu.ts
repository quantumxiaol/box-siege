import * as Phaser from 'phaser';
import { W, H, C, css, GameMode } from '../config';
import { MAPS } from '../data/maps';
import { drawBlockSide, drawBlockTop, TEX } from '../textures';
import { Sfx } from '../sfx';

const MODES: { id: GameMode; name: string; note: string }[] = [
  { id: 'single', name: '单人求生', note: '独自顶住一波波僵尸，活得越久越强。' },
  { id: 'coop',   name: '双人合作', note: '同键盘并肩作战，共享击杀解锁武器。' },
  { id: 'versus', name: '双人对战', note: '互相射击 + 僵尸搅局，先拿 10 个击杀获胜。' },
];

export class MainMenu extends Phaser.Scene {
  private mode: GameMode = 'single';
  private mapIdx = 0;
  private modeBtns: { id: GameMode; bg: Phaser.GameObjects.Rectangle }[] = [];
  private mapBtns: { idx: number; bg: Phaser.GameObjects.Rectangle }[] = [];
  private noteText!: Phaser.GameObjects.Text;
  private helpLayer: Phaser.GameObjects.Container | null = null;
  private helpOpen = false;

  constructor() {
    super('MainMenu');
  }

  create() {
    this.mode = 'single';
    this.mapIdx = 0;
    this.modeBtns = [];
    this.mapBtns = [];
    this.helpOpen = false;
    this.buildBackdrop();

    const cx = W / 2;
    this.makeButton(W - 92, 36, 148, 34, '图鉴 · 说明', () => this.toggleHelp(true));
    this.add.text(cx, 74, 'BOX SIEGE', {
      fontFamily: '"Press Start 2P", monospace',
      fontSize: '30px',
      color: css(C.amber),
      stroke: '#1a1a1a',
      strokeThickness: 6,
    }).setOrigin(0.5);
    this.add.text(cx, 122, '方块围城', {
      fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif',
      fontSize: '52px',
      fontStyle: 'bold',
      color: '#FFFFFF',
      stroke: '#1a1a1a',
      strokeThickness: 8,
    }).setOrigin(0.5);
    this.add.text(cx, 164, '方块风俯视角打僵尸 · 同键盘双人', {
      fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif',
      fontSize: '15px',
      color: '#C9C2B2',
    }).setOrigin(0.5);

    // 模式选择
    this.add.text(cx, 206, '— 选择模式 —', this.labelStyle()).setOrigin(0.5);
    MODES.forEach((m, i) => {
      const x = cx + (i - 1) * 176;
      const bg = this.makeButton(x, 240, 160, 44, m.name, () => {
        this.mode = m.id;
        this.noteText.setText(m.note);
        this.refreshButtons();
      });
      this.modeBtns.push({ id: m.id, bg });
    });
    this.noteText = this.add.text(cx, 278, MODES[0].note, {
      fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif',
      fontSize: '13px',
      color: '#9a94a8',
    }).setOrigin(0.5);

    // 地图选择
    this.add.text(cx, 314, '— 选择房间 —', this.labelStyle()).setOrigin(0.5);
    MAPS.forEach((m, i) => {
      const x = cx + (i - 1) * 140;
      const bg = this.makeButton(x, 346, 124, 40, m.name, () => {
        this.mapIdx = i;
        this.refreshButtons();
      });
      this.mapBtns.push({ idx: i, bg });
    });

    // 开始
    const startBg = this.add.rectangle(cx, 412, 260, 52, 0xc23a1e)
      .setStrokeStyle(3, 0xf7a026)
      .setInteractive({ useHandCursor: true });
    const startText = this.add.text(cx, 412, '▶ 开 始 游 戏', {
      fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif',
      fontSize: '22px',
      fontStyle: 'bold',
      color: '#FFFFFF',
    }).setOrigin(0.5);
    startBg.on('pointerover', () => startBg.setFillStyle(0xe05a30));
    startBg.on('pointerout', () => startBg.setFillStyle(0xc23a1e));
    startBg.on('pointerdown', () => this.startGame());
    startText.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.startGame());

    // 键位说明
    this.add.text(cx - 200, 470, [
      '玩家一',
      '方向键 移动',
      '/ 射击·使用    , . 换武器',
    ], this.helpStyle());
    this.add.text(cx + 200, 470, [
      '玩家二',
      'W A S D 移动',
      '空格 射击·使用    Q E 换武器',
    ], this.helpStyle()).setAlign('right').setOrigin(1, 0);
    this.add.text(cx, 542, 'P 暂停 · M 静音 · F 全屏 · Esc 回菜单 ｜ 击杀攒连击提升倍率（最高 x16），逐级解锁 7 种武器', {
      fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif',
      fontSize: '12px',
      color: '#8a8494',
    }).setOrigin(0.5);
    this.add.text(cx, 566, '单人模式两套按键通用', {
      fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif',
      fontSize: '12px',
      color: '#8a8494',
    }).setOrigin(0.5);

    this.input.keyboard?.on('keydown-ENTER', () => {
      if (this.helpOpen) this.toggleHelp(false);
      else this.startGame();
    });
    this.input.keyboard?.on('keydown-ESC', () => this.toggleHelp(false));
    this.refreshButtons();
    this.buildHelp();
  }

  /* ---------------- 图鉴说明 ---------------- */

  private toggleHelp(show?: boolean) {
    this.helpOpen = show ?? !this.helpOpen;
    this.helpLayer?.setVisible(this.helpOpen);
    Sfx.ui();
  }

  private buildHelp() {
    const cx = W / 2;
    const c = this.add.container(0, 0).setDepth(2000).setVisible(false);
    const veil = this.add.rectangle(cx, H / 2, W, H, 0x000000, 0.72).setInteractive();
    veil.on('pointerdown', () => this.toggleHelp(false));
    const panel = this.add.rectangle(cx, 300, 820, 512, 0x1e1b26, 1).setStrokeStyle(3, C.amber).setInteractive();
    c.add([veil, panel]);
    const head = (x: number, y: number, t: string) => this.add.text(x, y, t, {
      fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif',
      fontSize: '15px', fontStyle: 'bold', color: css(C.amber),
    });
    const body = (x: number, y: number, t: string | string[], size = 13, color = '#C9C2B2') => this.add.text(x, y, t, {
      fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif',
      fontSize: `${size}px`, color, lineSpacing: 6,
    });
    c.add(this.add.text(cx, 66, '图鉴 · 说明', {
      fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif',
      fontSize: '24px', fontStyle: 'bold', color: '#FFFFFF',
    }).setOrigin(0.5));

    // 武器
    const wx = cx - 378;
    c.add(head(wx, 104, '— 武器（按总击杀解锁，, . 或 Q E 切换）—'));
    const WEAPON_INFO = [
      '手枪 · 初始：无限弹药，稳定可靠',
      '乌兹 · 8 杀：射速极快（200 发）',
      '霰弹枪 · 20 杀：6 弹丸扇面横扫',
      '手雷 · 35 杀：抛掷短延时爆炸',
      '地雷 · 55 杀：感应引爆，守路口',
      '火箭筒 · 80 杀：直线范围爆炸',
      '油桶 · 110 杀：射它引爆，可连锁',
    ];
    WEAPON_INFO.forEach((t, i) => c.add(body(wx, 138 + i * 27, t)));
    c.add(body(wx, 344, ['弹药见底会自动切下一把；', '捡弹药箱补当前武器 35%。'], 12, '#9a94a8'));

    // 怪物
    const mx = cx + 30;
    c.add(head(mx, 104, '— 怪物 —'));
    const MONS: { tex: string; name: string; desc: string }[] = [
      { tex: 'chr_zombie_f', name: '普通僵尸', desc: '成群袭来，速度与血量均衡。' },
      { tex: 'chr_fast_f', name: '快速僵尸', desc: '约 40 秒后出现。快而脆，优先点杀。' },
      { tex: 'chr_brute_f', name: '巨汉僵尸', desc: '约 90 秒后出现。血厚攻高，用爆炸物招呼。' },
    ];
    MONS.forEach((m, i) => {
      const y = 136 + i * 78;
      c.add(this.add.image(mx + 26, y + 24, m.tex).setScale(0.75));
      c.add(body(mx + 60, y, m.name, 15, '#FFFFFF'));
      c.add(body(mx + 60, y + 26, m.desc, 12));
    });
    c.add(body(mx, 366, ['攻击为近身抓挠，有前摇蓄力：', '看到变黄褐色下蹲，立刻拉开距离！'], 12, '#FF8A5E'));

    c.add(body(cx, 506, '连击：每 4 连杀 +1 倍率（最高 x16），3 秒无击杀中断 ｜ 击杀有 11% 概率掉落弹药箱/医疗包', 12, '#8a8494').setOrigin(0.5));
    c.add(body(cx, 530, '点击暗处或按 Esc 关闭', 11, '#6a657a').setOrigin(0.5));

    this.helpLayer = c;
  }

  private labelStyle(): Phaser.Types.GameObjects.Text.TextStyle {
    return {
      fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif',
      fontSize: '14px',
      color: '#9a94a8',
    };
  }

  private helpStyle(): Phaser.Types.GameObjects.Text.TextStyle {
    return {
      fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif',
      fontSize: '13px',
      color: '#C9C2B2',
      lineSpacing: 6,
    };
  }

  private makeButton(x: number, y: number, w: number, h: number, label: string, onClick: () => void) {
    const bg = this.add.rectangle(x, y, w, h, 0x2a2733)
      .setStrokeStyle(2, 0x55505a)
      .setInteractive({ useHandCursor: true });
    this.add.text(x, y, label, {
      fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif',
      fontSize: '16px',
      fontStyle: 'bold',
      color: '#FFFFFF',
    }).setOrigin(0.5);
    bg.on('pointerover', () => bg.setFillStyle(0x3a3646));
    bg.on('pointerout', () => bg.setFillStyle(0x2a2733));
    bg.on('pointerdown', () => { Sfx.ui(); onClick(); });
    return bg;
  }

  private refreshButtons() {
    for (const b of this.modeBtns) {
      b.bg.setStrokeStyle(b.id === this.mode ? 3 : 2, b.id === this.mode ? C.amber : 0x55505a);
    }
    for (const b of this.mapBtns) {
      b.bg.setStrokeStyle(b.idx === this.mapIdx ? 3 : 2, b.idx === this.mapIdx ? C.amber : 0x55505a);
    }
  }

  private startGame() {
    Sfx.unlock();
    Sfx.levelup();
    this.scene.start('Game', { mode: this.mode, mapIdx: this.mapIdx });
  }

  /** 菜单背景：米色场地板 + 立体方块 + 血迹装饰 */
  private buildBackdrop() {
    const g = this.add.graphics().setDepth(0);
    g.fillStyle(C.floor, 0.06);
    g.fillRoundedRect(60, 44, W - 120, H - 88, 12);
    drawBlockSide(g, { x: 92, y: 470, w: 90, h: 90 }, 13);
    drawBlockTop(g, 92, 470, 90, 90);
    drawBlockSide(g, { x: W - 182, y: 60, w: 90, h: 90 }, 13);
    drawBlockTop(g, W - 182, 60, 90, 90);
    g.setDepth(-1);
    for (let i = 0; i < 5; i++) {
      this.add.image(120 + i * 190, 580 - (i % 2) * 540, TEX.blood1)
        .setAlpha(0.18)
        .setRotation(i * 1.3)
        .setScale(0.8)
        .setDepth(-1);
    }
  }
}
