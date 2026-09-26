# 方块围城 BOX SIEGE

方块风俯视角生存射击小游戏：单人求生 / 同键盘双人合作 / 双人对战。
纯原生 HTML + Canvas + WebAudio，**零依赖、零素材、零构建**，所有角色与音效均由代码生成。

## 玩法

- 击杀僵尸攒连击（x1 ~ x16 倍分），按总击杀逐级解锁武器：
  手枪 → 乌兹 → 霰弹枪 → 手雷 → 地雷 → 火箭筒 → 油桶
- 僵尸掉落：弹药箱（橙）/ 医疗包（白）
- 红色油桶可以打爆，会连锁引爆，也会炸到自己
- 双人对战：互相开火 + 僵尸搅局，先拿 10 个人头获胜

## 操作

| | 移动 | 射击/使用 | 换武器 |
|---|---|---|---|
| 玩家一 | 方向键 | `/` | `,` `.` |
| 玩家二 | `W A S D` | 空格 | `Q` `E` |

通用：`P` 暂停 · `M` 静音 · `Esc` 回菜单 · `R` 结算后重开 · 双击画面全屏
（单人模式两套按键都可以操作）

## 本地运行

无需任何环境，直接双击 `index.html` 即可；或者：

```bash
python3 -m http.server 8000
# 打开 http://localhost:8000
```

## 部署到 GitHub Pages

```bash
git init
git add .
git commit -m "方块围城"
git branch -M main
git remote add origin https://github.com/<你的用户名>/box-siege.git
git push -u origin main
```

然后到仓库 **Settings → Pages**，Source 选 `main` 分支的 `/(root)`，保存后等 1~2 分钟，
访问 `https://<你的用户名>.github.io/box-siege/` 即可。

## 想改游戏？

都集中在 `game.js` 顶部：

- `WEAPONS`：武器伤害、射速、弹药
- `UNLOCK_AT`：各武器的解锁击杀数
- `MAPS`：房间布局（方块坐标）、油桶位置、出生点 —— 照抄格式就能加新地图
- `C`：全部配色

## 彩蛋

- `?demo=1`：AI 自动演示模式
- `?demo=1&warp=4`：4 倍速演示

---

本作为原创致敬作品：代码与素材均为程序生成，与 Boxhead 原作无任何素材关系，可放心公开部署。
