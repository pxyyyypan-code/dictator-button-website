# V0.8 重构实施计划 —— 新版 12 页 UI 与流程

> 依据：`哆啦A梦情绪修理站_UI指令.docx`（12 页规格 + 全局规范）、`素材/UI界面初稿/U1..U12.png`、
> `烦恼/烦恼分类.xlsx`（3 表）、`道具/`+`烦恼/烦恼素材/`+`素材/其他素材/` 素材。
> 约束：`CLAUDE.md`（原生 HTML/CSS/JS + Canvas，无后端/框架/外部 API）。

---

## 0. 已核验的事实（不是假设）

| 项 | 结论 |
| --- | --- |
| xlsx 烦恼条数 | **100 条**，C01~C09 九个大类（9/5/15/15/15/13/8/8/12） |
| 烦恼 ↔ 总结 | **100 对，一一对应，零缺失、零多余**（Sheet3 表头在第 4 行） |
| 烦恼 ↔ 道具 | 100 条全部有道具；引用到的道具恰好是 Sheet2 的 **20 个**，无越界、无未用 |
| 现有 `worry-data.js` 100 条预设 | 与 xlsx **98 条文案完全一致**，`id` 与 xlsx「原编号」**98/100 吻合** |
| 2 条文案差异 | js `家庭成员之间越来越少沟通` → xlsx `家庭成员越来越少沟通`；js `老师的反馈让我压力很大` → xlsx `老师反馈让我压力很大` |
| 旧 8 类 → 新 9 类 | 结构性兼容，只有 **3 条**需要移类：`家庭经济压力` family→C07、`害怕一个人待着`/`明明休息却无法真正放松` life→C09 |
| B1~B10 行为分配 | 100 条全部已有，分布均衡（B4/B9 各 15，B10 17…），**可原样保留** |
| 道具图片索引 | 文件名前缀数字 1~20 与 Sheet2 顺序**完全对齐**；唯一例外 `6透明斗篷.png` ↔ xlsx「隐身斗篷」 |
| 烦恼素材图片 | 9 张，文件 `8人生.png` ↔ 规格文案「未来」 |
| 素材总体积 | 道具 4.8MB + 烦恼素材 7.3MB + 对话/提示框 1.9MB = **14MB**，必须压缩 |
| WebP 压缩实测 | `3学业.png` 1002KB → 360px WebP **20KB**（PNG 同尺寸 92KB） |
| `bubble-game.js` 硬编码颜色 | 31 处 hex/rgba + 4 处渐变 + 1 处 shadowBlur，全部是深色系，需重做 |

**两点需要你确认的偏差：**
1. 你说烦恼总结在 `D:\Desktop\独裁者按钮\烦恼\烦恼总结`，实际**没有这个文件夹**；总结是
   `烦恼分类.xlsx` 的第 3 个工作表`烦恼总结`（100 对，已核验完整）。我按这个来。
2. `烦恼分类.xlsx` 和 `哆啦A梦情绪修理站_UI指令.docx` 现在都在 Office 里打开着（有 `~$` 锁文件）。
   我只读不写，不影响，但如果你之后改了内容需要告诉我重新提取。

---

## 1. 场景编号方案：`ux-01..ux-14` → `u01..u12`

旧 14 节点与新 12 页不是简单删减，语义整体位移（旧 `ux-07` 是删除页，新 `u07` 是失控页）。
若沿用 `ux-` 前缀，13 个历史 dev 脚本会**静默测到错误的页面**。因此改用新前缀 `u01`~`u12`，
让旧引用显式失效而不是悄悄跑偏。

| 新 | 页面 | 旧对应 | 关系 |
| --- | --- | --- | --- |
| `u01` | 未来道具探索首页 | `ux-01` | 重做（同心扩散 + 道具隧道 + 只有标题可点） |
| `u02` | 哆啦A梦引导对话页 | `ux-02` + `ux-03` | **两页合一**，改为 5 轮逐句对话 |
| `u03` | 烦恼类别选择页 | `ux-04` + `ux-05` | **两页合一**，自由输入框改为 9 类粒子选择 + 自由输入兜底 |
| `u04` | 道具匹配过场页（老虎机） | — | **全新** |
| `u05` | 匹配道具结果页 | — | **全新** |
| `u06` | 烦恼消除·初始阶段 | `ux-06`+`ux-07` | 沉浸式容器**所有者**（Canvas 挂载点） |
| `u07` | 烦恼消除·失控阶段 | `ux-08` | alias → `u06` |
| `u08` | 独裁者按钮抉择页 | `ux-09` | alias → `u06`（左右分屏由红色竖块推入形成） |
| `u09` | 彻底消失·空白页 | `ux-10` | alias → `u06` |
| `u10` | 烦恼重新出现页 | `ux-11` | alias → `u06` |
| `u11` | 个性化结尾总结页 | `ux-12` | 重做（读取真实烦恼 + xlsx 个性化总结 + 口袋道具） |
| `u12` | 体验记录页 | `ux-13` + `ux-14` | **两页合一**，5 节点时间线 + 保存为图片 |

**共享容器跨度 `u06`→`u07`→`u08`→`u09`→`u10`**：同一个 `<canvas>`，不重建、不整页淡入淡出，
沿用现有 `SCENE_FLOW` 的 `viewId` 间接映射机制（`scene-manager.js` 原样复用，一行不改）。

旧 `APP_STATE` 12 个枚举 → 新 12 个：
`INTRO / DIALOGUE / WORRY_PICK / GADGET_MATCH / GADGET_RESULT / ERASE_CALM / ERASE_CHAOS /
DICTATOR_CHOICE / BLANK / WORRIES_RETURN / SUMMARY / LOG`

---

## 2. 视觉系统：整体反色

`:root` 现在是深色（`--c-void: #070912`），新规范是米白底 + 青蓝主色。颜色原子全部重写：

```
--c-paper:    #F5F0E6   /* 基础米白 */
--c-paper-2:  #EFE8DA   /* 米白次层 */
--c-primary:  #049DBF   /* 主色 */
--c-primary-d:#037A96   /* 压暗 */
--c-ink-1:    #0A3B47   /* 深青蓝正文（不是纯黑，由主色压暗得到） */
--c-ink-2:    #3C6E7C
--c-ink-3:    #7FA3AD
--c-mint:     #B9E2EA   /* 浅青气泡 */
--c-alert:    #C8382F   /* 警示红：仅 u07 边线 + u08 按钮 */
```

语义 token（`--bg / --ink / --accent / --panel / --line / --scene-pad …`）保留同名，
只换取值，这样 1957 行 CSS 里所有引用 token 的规则**自动跟随**，不需要逐条改。

五阶段 `:has()` 主题块重写为按新流程分段：
`u01`（青蓝）/`u02 u03`（米白）/`u04`（青蓝）/`u05`（米白）/`u06 u07`（青蓝，`--alert-edge` 渐显）
/`u08`（分屏）/`u09 u10`（米白）/`u11`（青蓝）/`u12`（米白）。

新增 **16:9 固定画幅**：`.stage { aspect-ratio: 16/9; width: min(100vw, calc(100vh * 16 / 9)); }` 居中，
左右安全边距用同一个 `--safe-x` token，满足"左右安全边距一致"。

新增 `--fs-display`（首屏巨型标题，初稿 U2/U5 的字号明显大于现有 56px），
现有 `--fs-title 56 / --fs-body 35 / --fs-btn 26` 作为下限保留（AC-01 标题≥40pt、正文≥26pt）。

**Canvas 同步反色**：`bubble-game.js` 里 31 处硬编码颜色统一收进文件顶部一个 `PALETTE` 常量表，
并按规范去掉不该有的效果——`createRadialGradient` 球面高光（4 处）、`shadowBlur` 文字发光（1 处）
改为**硬边分面**（亮面/固有色/暗面 2~3 块扁平色块），符合"无渐变、无柔光、硬边分面"的插画硬约束。
`--ff` / `CANVAS_FONT_STACK` 两个字体入口保持不变。

---

## 3. 数据层

### 3.1 `js/worry-data.js` 重新生成（脚本生成，非手改）

保留现有 `BEHAVIOR_TYPES`（B1~B10，含颜色，但颜色改为青蓝色系变体）与 `WorryData` 的公开方法签名，
`WORRY_CATEGORIES` 换成 xlsx 的 9 类，`WORRY_PRESETS` 每条从 4 个字段扩到 6 个：

```js
{ id: 1, text: '被父母催促', category: 'C01',
  behaviorType: 'B9_PRESSURE',      // 沿用现有分配
  gadget: '石头帽',                   // xlsx「对应道具」
  summary: '催促声不会替你走完人生。…' } // xlsx「烦恼总结」
```

2 条文案差异**以 xlsx 为准**修正（xlsx 是新规格的数据源）。3 条跨类移位按 xlsx 归位。
`id` 沿用 xlsx「原编号」，与现有 98/100 吻合，剩 2 条对齐。

新增：
- 每类的 `hoverPreview`：3 条代表性烦恼（供 U3 悬停显示，初稿里的"考试压力/作业太多/专业选择"就是这个）
- 每类的 `fallbackSummary`：**9 条新撰写文案**，用于自由输入且匹配不到具体烦恼时的兜底总结
  （因为 xlsx 只覆盖 100 条预设，自由输入必须有归宿）
- `classifyFreeText(text)` → `{ category, confidence }`：本地关键词词表打分。
  置信度低于阈值返回 `null`，前台提示手动从 9 类选，**绝不随机分配道具**（规格硬要求）。

CLAUDE.md 的"worry-data.js 是唯一数据源"继续成立，100 条内容不复制到别处。

### 3.2 `js/gadget-data.js`（新建）

20 个道具 + 独裁者按钮，每个含：`name / group / description`（xlsx Sheet2 原文）/ `image`。
**图片走显式映射表**，不靠文件名推断——`隐身斗篷 → gadget-06.webp`（源文件叫`透明斗篷`）。
提供 `forWorry(worryId)`、`byName(name)`、`reelPool()`（老虎机每列 20 个 + 1 个空位）。

---

## 4. 素材流水线

新建 `assets/dev/_build-assets.py`（构建脚本，只在素材更新时手动跑一次）：

| 输出 | 内容 | 处理 | 预估体积 |
| --- | --- | --- | --- |
| `assets/images/gadgets/gadget-01..20.webp` + `dictator.webp` | 21 道具 | 裁掉透明边 → 长边 400px → WebP q88 | ~350KB |
| `assets/images/worries/worry-01..09.webp` | 9 烦恼大类 | 长边 360px → WebP q88 | ~180KB |
| `assets/images/ui/dialog-frame.webp` | 对话框 | 长边 1200px | ~90KB |
| `assets/images/ui/tip-frame.webp` | 提示框 | 长边 1000px | ~80KB |

合计约 **0.7MB**（源素材 14MB）。原始 PNG 留在仓库外，不入库。

**哆啦A梦形象**：初稿 U2/U10 画的是**几何色块低多边形哆啦A梦**（无黑描边），
而 `多啦A梦/` 文件夹里是 45 张带黑描边的动画截图，与"无黑色外轮廓"硬约束冲突，
且你这次列出的素材清单里也没有它。所以 **U2/U03/U10 的哆啦A梦用内联 SVG 几何色块绘制**，
照初稿的样子做。若你更想用截图，说一声，换成图片只需改 3 处。

道具与烦恼素材本身是带描边的手绘风，与"无描边"规范不符，但**这是你指定要用的素材，
且初稿 U3/U5 画的就是它们**，所以原样使用；页面其余装饰（口袋、节点图标、气泡、碎片）
一律走几何色块，不再新画描边插画。

---

## 5. 交互逻辑

### 5.1 新建 3 个前半段模块（避免 app.js 从 1034 行膨胀到 2500+ 行）

- **`js/dialogue.js`** — U2 五轮对话引擎：逐句推进（点"继续"或空格）、每次 1~2 句、
  上一句降透明度、对话框用 `dialog-frame.webp`、独裁者按钮此阶段**禁止按下**（只作剧情提示）。
- **`js/worry-picker.js`** — U3：9 个素材粒子悬浮场（rAF 微幅漂移）、悬停位移到中央 + 放大 + 白雾模糊、
  上方浮出 3 条代表烦恼、点击展开完整列表（最多 15 条，紧凑分栏）、选中高亮 + 出「选好了，去匹配道具」
  （常量文案，不带条数指代——带指代会被读成单条确认，玩家选中第一条就按下去了）、
  自由输入 → `classifyFreeText` → 「我们认为它更接近：【X】」+ 确认/重新选择 → 低置信度改手动选类。
  衔接动画：烦恼缩成米白标签沿 `#049DBF` 弧线飞入四次元口袋。
- **`js/gadget-match.js`** — U4 老虎机（3 列 × 每列 20 道具 + 1 空位，自动播 2~3s，可跳过，
  拨杆后蓝色区上移）+ U5 结果页（**道具位置与 U4 停止位置严格一致，不重排**，
  点击道具用 `tip-frame.webp` 弹出 xlsx 道具说明）。

### 5.2 `js/app.js` 改造（保留骨架，重写钩子）

- 沿用：`appData` 状态、三个 ticker、`computeChaosLevel`、`buildBubbleCallbacks`、
  `refreshAvoidRects`、退出模态、`restart` 清理逻辑。
- 改写：`registerSceneHooks` 12 个新节点；HUD 文案从「已删除/当前泡泡/系统状态」
  改为 U6「已处理 0 / 12」→ U7「剩余 23 ↑」；道具图标变暗 + 「道具的效果正在减弱。」。
- **删除**：`addWorry / removeWorry / renderWorries / renderWorrySuggestions` 等旧输入页逻辑
  （功能由 `worry-picker.js` 承接，多选改单选）。
- **新增**：`u08` 长按 2 秒确认——`pointerdown/up/leave` + rAF 圆环进度，
  按住时红色由暗变亮、冻结气泡同步失色，中途松开完全回退；`prefers-reduced-motion` 下缩短到 600ms。
  次级「再看看」回到 `u07`。
- **新增**：`u12` 5 节点时间线（选择的烦恼 / 匹配道具 / 消除次数 / 是否按下按钮 / 最终观察）
  + 「保存记录」用离屏 Canvas 绘制后 `toBlob` 下载（原生，无库）。
- 单选改造：新流程是**一个**烦恼（U10 最大气泡显示"玩家最初选择的完整烦恼"，U11/U12 都是单数），
  `MAX_WORRIES_MVP: 3` → 主选 1 条；泡泡内容由该烦恼 + 同类烦恼扩充填充画面。

### 5.3 `js/bubble-game.js` 改造

- 颜色/绘制反色 + 去渐变去发光（见 §2）。
- 气泡文字：U6/U7 显示**烦恼关键词**（短词），非整句。
- 碎裂：3~4 块**扁平色片**（现有 `spawnParticles` 改形状与配色，去掉粉色系 `rgba(226,108,174…)`）。
- U8 冻结形态：初稿是**思考云朵形**而非正圆，新增一个 `settleAsClouds()` 绘制模式并集中到左半屏。
- U9 空白后"中央极浅青蓝小点扩散出第一个气泡"：复用 `respawnSoftly`，调整起点。
- U10 气泡**不可点击**、鼠标靠近只轻微退让：`setInteractive(false)` + 复用 B2 逃避位移的最弱档。
- 保持 27 个公开 API 签名不变，`destroy()` 清理清单同步新增字段。

### 5.4 `js/config.js`

新增约 25 个常量（全部集中在此，不散落）：
`DIALOGUE_LINE_MS / WORRY_HOVER_MS / SLOT_SPIN_MS / SLOT_REEL_COUNT / SLOT_ITEMS_PER_REEL /
CALM_TARGET_COUNT: 12 / CALM_SPAWN_AFTER: 6 / CHAOS_EDGE_WIDTH_PX: 2 /
DICTATOR_HOLD_MS: 2000 / DICTATOR_HOLD_REDUCED_MS: 600 / BLANK_HOLD_MS: 3000 /
RETURN_BUBBLE_MIN: 3 / RETURN_BUBBLE_MAX: 5 / SUMMARY_LINE_FADE_MS / LOG_NODE_FADE_MS / …`
`SCENE_FLOW` + `APP_STATE` 按 §1 重写。旧常量中仍被引用的保留，纯废弃的删掉并在注释里记明。

---

## 6. 文件清单

### 修改（8 个）
| 文件 | 现状 | 改动幅度 |
| --- | --- | --- |
| `index.html` | 224 行 | 重写 12 个 scene 结构（~380 行） |
| `css/style.css` | 1957 行 | 颜色原子 + 五阶段 + 12 页场景样式，约 70% 重写 |
| `js/config.js` | 158 行 | `SCENE_FLOW`/`APP_STATE` 重写 + 25 个新常量 |
| `js/worry-data.js` | 214 行 | 脚本重新生成（9 类 + 100 条 6 字段 + 分类器 + 9 条兜底总结） |
| `js/app.js` | 1034 行 | 钩子与前半段逻辑重写，沉浸段保留，净增约 300 行 |
| `js/bubble-game.js` | 1888 行 | 配色/绘制反色 + 云朵冻结 + 关键词文字，约 15% 触及 |
| `CLAUDE.md` | 47 行 | 核心闭环、场景编号、共享容器跨度、新增约束 |
| `README.md` / `docs/AI_FLOW_SPEC.md` | 138 / 109 行 | 追加 V0.8 章节，旧版本说明保留为历史 |

### 新建（6 个代码 + 33 个图片）
`js/gadget-data.js`、`js/dialogue.js`、`js/worry-picker.js`、`js/gadget-match.js`、
`assets/dev/_build-assets.py`、`assets/dev/_u-flow-smoke.js`、
`assets/images/{gadgets,worries,ui}/` 共 33 个 webp。

### 删除
**无。** 不删任何生产文件、不删旧 dev 脚本、不删旧 README 内容。
13 个引用 `ux-NN` 的历史 dev 脚本保留原样（它们对应旧版本，新增 `_u-flow-smoke.js` 覆盖新流程）。

---

## 7. 执行顺序（每阶段可单独验收）

1. **数据层** — `_build-assets.py` 出图 + 生成 `worry-data.js`/`gadget-data.js`，跑一致性校验
   （100 条各有道具与总结、20 道具图片齐、9 类图片齐）。
2. **骨架层** — `index.html` 12 节点 + `config.js` 流程表；Playwright 走通 12 页不报错。
3. **视觉层** — `style.css` 反色 + 12 页样式；三档分辨率截图核对初稿。
4. **前半段交互** — `dialogue.js` / `worry-picker.js` / `gadget-match.js`（U1~U5）。
5. **沉浸段** — `bubble-game.js` 反色 + 云朵冻结；`app.js` 长按 2 秒 + HUD 新文案（U6~U10）。
6. **结尾段** — U11 个性化总结（读真实数据）+ U12 时间线与保存图片。
7. **回归** — `_u-flow-smoke.js` 全流程 + `prefers-reduced-motion` + 退出重进清理 + 字体校验。

---

## 8. 我准备好开始了，先确认三件事

1. **场景编号从 `ux-NN` 改为 `u01..u12`** —— 可以吗？（不改的话旧 dev 脚本会静默测错页面）
2. **哆啦A梦用内联 SVG 几何色块**（照初稿），不用 `多啦A梦/` 里的 45 张动画截图 —— 可以吗？
3. **烦恼总结取自 `烦恼分类.xlsx` 第 3 个工作表**（100 对已核验完整），不是你说的独立文件夹 —— 确认吗？
