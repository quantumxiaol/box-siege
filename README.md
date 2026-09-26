# 方块围城 BOX SIEGE

方块风俯视角打僵尸小游戏，灵感来自经典 Flash 游戏《Boxhead》（僵尸危机）。
Phaser 4 + TypeScript + Vite，**全部美术与音效均为运行时代码生成，零外部素材**。

## 玩法

- **三种模式**：单人求生 / 同键盘双人合作 / 双人对战（先拿 10 杀获胜）
- **三种房间**：训练场、回廊、十字阵
- **七种武器**：手枪 → 乌兹 → 霰弹枪 → 手雷 → 地雷 → 火箭筒 → 油桶，按总击杀数逐级解锁
- **三种僵尸**：普通 / 快速 / 巨汉，随时间加压
- 击杀攒连击提升得分倍率（最高 x16），爆炸物可连锁，僵尸掉落弹药箱与医疗包

## 键位

| 操作 | 玩家一 | 玩家二 |
|------|--------|--------|
| 移动 | 方向键 | W A S D |
| 射击/使用 | / | 空格 |
| 换武器 | , . | Q E |

全局：`P` 暂停 · `M` 静音 · `F` 全屏 · `Esc` 回菜单（单人模式两套按键通用）

## 本地开发

```bash
npm install
npm run dev        # http://localhost:8080
```

其他命令：

```bash
npm run build      # 产物输出到 dist/
npm run typecheck  # TS 类型检查
```

## 部署到 GitHub Pages

仓库已内置 GitHub Actions 工作流（`.github/workflows/deploy.yml`），推送到 `main` 分支即自动构建发布。

首次使用需一次性开启 Pages：

1. GitHub 仓库 **Settings → Pages**
2. **Source** 选择 **GitHub Actions**
3. 推送 `main` 分支，稍等片刻即可在 `https://<用户名>.github.io/<仓库名>/` 访问

## 旧版

`app/` 目录保留了最初的纯原生 Canvas 单文件版（零依赖，直接用静态服务器打开 `app/index.html` 即可玩），仅作存档参考。
