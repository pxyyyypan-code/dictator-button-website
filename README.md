# 独裁者按钮 · U02 高压无重叠三关版

纯前端单页交互网站，直接打开 `index.html` 即可体验。

## 本版内容

- 保留 U01 首页、U02 引导、U03 烦恼分类、U04 道具匹配与既有视觉体系。
- U05 结果页按视口高度自适应，三件道具和“开始体验”按钮不会被裁切。
- 玩家选择 1～3 条细分烦恼时，各条烦恼在泡泡、结局和体验回信中同等展示。
- 三关改为 36/48/60 个目标泡泡与 36/30/26 秒倒计时，压力逐关提高。
- 泡泡采用圆形刚体碰撞、无重叠生成和透明麻袋边界约束。
- 麻袋大小仍由此前实际使用独裁者按钮的次数决定，不与关卡编号绑定。
- 第一、二关保留成功/失败结果卡；第三关不显示普通结果卡，直接进入相应结局。
- 玩家界面移除内部状态名、分支编号及英文结局编号。
- 结果卡和结局使用完整透明 PNG 哆啦A梦素材。

## 关键文件

- `js/config.js`：关卡与物理参数。
- `js/game-state.js`：三关分支、按钮历史与结局。
- `js/level-game.js`：Canvas 麻袋、泡泡物理、倒计时与演出。
- `js/app.js`：页面流程、玩家文案、结果与体验回信。
- `GAME_REFACTOR_NOTES.md`：参数、分支和维护说明。
- `TEST_REPORT.md`：本版验证记录。

## 本地检查

```bash
node --check js/config.js
node --check js/game-state.js
node --check js/level-game.js
node --check js/app.js
node assets/dev/_game-state-test.js
node assets/dev/_level-physics-test.js
node assets/dev/_check-data.js
```
