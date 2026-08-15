/**
 * config.js —— 可配置常量
 * V0.8：流程收敛为 u01~u12 十二节点，改为「选一个烦恼 → 匹配道具 → 生成泡泡」。
 *       V0.7 的常量一律保留（bubble-game.js 里全是裸取、无 fallback，删一个就崩），
 *       新增项集中在文件末尾的 V0.8 区块。
 */
'use strict';

const CONFIG = {
  MAX_WORRIES_MVP: 3,

  BUBBLE_CREATE_DURATION_MS: 2000,
  INITIAL_BUBBLE_COUNT: 8,
  // 自动增殖维持原有 42 个密度；用户点击分裂可继续增长到更高上限。
  AUTO_GROWTH_MAX_BUBBLES: 42,
  MAX_BUBBLES: 96,
  BUBBLE_MIN_RADIUS: 52,
  BUBBLE_MAX_RADIUS: 88,
  BUBBLE_SPEED_MIN: 22,
  BUBBLE_SPEED_MAX: 48,
  CLICK_FEEDBACK_MAX_MS: 200,
  DELETE_ANIMATION_MAX_MS: 300,
  THEME_MIN_READ_MS: 5000,

  // ---- 正常删除阶段（u06）：必须同时满足时长与次数才进入失控 ----
  NORMAL_PHASE_MIN_MS: 14000,
  NORMAL_PHASE_MAX_MS: 22000,
  NORMAL_DELETE_THRESHOLD: 8,
  NORMAL_SPAWN_INTERVAL_MS: 1000,
  NORMAL_MIN_BUBBLES: 6,
  NORMAL_TARGET_BUBBLES: 9,
  NORMAL_MAX_BUBBLES: 10,

  // 正常删除达到该值后，后台进入失控状态；前台不切页、不显示阈值。
  // 兼容旧字段：真正的门控由 NORMAL_PHASE_MIN_MS + NORMAL_DELETE_THRESHOLD 决定。
  GROWTH_START_THRESHOLD: 8,
  // ---- 渐变失控：transitionProgress 0→1 的时长与分裂概率分段 ----
  TRANSITION_RAMP_MS: 9000,
  CALM_BEHAVIOR_INTENSITY: 0.34,
  // V0.7：正常阶段也保留可辨认的“性格”，失控阶段继续放大。
  BEHAVIOR_COLOR_CALM_WEIGHT: 0.58,
  BEHAVIOR_COLOR_GROWTH_WEIGHT: 0.88,
  ESCAPE_POINTER_RANGE_FACTOR: 3.20,
  ESCAPE_CALM_DODGES: 1,
  BURST_CALM_DODGES: 1,
  STUBBORN_CALM_HITS: 2,
  STUBBORN_GROWTH_HITS: 3,
  PRESSURE_CALM_HITS: 2,
  PRESSURE_GROWTH_HITS: 3,
  RETURN_CALM_DELAY_MIN_MS: 1050,
  RETURN_CALM_DELAY_MAX_MS: 1550,
  CALM_SPLIT_ECHO_COUNT: 3,
  CALM_SPLIT_ECHO_LIFE_MS: 760,
  TRANSITION_BEHAVIOR_MIN: 0.30,
  TRANSITION_BEHAVIOR_MAX: 1.00,
  SPLIT_CHANCE_EARLY_MIN: 0.10,
  SPLIT_CHANCE_EARLY_MAX: 0.20,
  SPLIT_CHANCE_MID_MIN: 0.30,
  SPLIT_CHANCE_MID_MAX: 0.65,
  SPLIT_CHANCE_LATE_MIN: 0.70,
  SPLIT_CHANCE_LATE_MAX: 1.00,
  TRANSITION_TITLE_SWITCH: 0.45,
  GROWTH_INTERVAL_START_MS: 1400,
  GROWTH_INTERVAL_MIN_MS: 300,
  GROWTH_ACCELERATION_FACTOR: 0.88,
  GROWTH_INITIAL_BURST_COUNT: 1,

  SPLIT_MIN_CHILDREN: 2,
  SPLIT_MAX_CHILDREN: 4,
  SPLIT_CHILD_RADIUS_MIN: 30,
  SPLIT_CHILD_RADIUS_FACTOR_MIN: 0.44,
  SPLIT_CHILD_RADIUS_FACTOR_MAX: 0.66,
  SPLIT_SPEED_MIN: 86,
  SPLIT_SPEED_MAX: 156,
  REJECT_ANIMATION_MS: 420,

  // 独裁者按钮的后台解锁条件：同时满足，而非单纯累计点击。
  BUTTON_UNLOCK_MIN_DURATION_MS: 10000,
  BUTTON_UNLOCK_MIN_ATTEMPTS: 5,
  BUTTON_UNLOCK_BUBBLE_MIN: 14,
  BUTTON_REVEAL_CHAOS_START: 0.26,

  // chaosLevel 的归一化参考值。
  CHAOS_BUBBLE_FULL: 30,
  CHAOS_ATTEMPT_FULL: 10,
  CHAOS_SPLIT_FULL: 8,
  CHAOS_TIME_FULL_MS: 16000,

  // 连续清空与重现演出。
  // V0.5.3：全部删除改为「原地爆裂」，不再向中心聚集。
  ERASURE_EXPLOSION_DURATION_MS: 1450,
  ERASURE_STAGGER_MAX_MS: 250,
  ERASURE_REDUCED_MOTION_MS: 320,
  EMPTY_PAUSE_MS: 2500,
  ERASURE_PULL_DURATION_MS: 2600,
  BLANK_TITLE_VISIBLE_MS: 900,
  BLANK_HOLD_DURATION_MS: 2600,
  RETURN_INITIAL_DELAY_MS: 850,
  RETURN_INTERVAL_MS: 760,
  RETURN_COPY_DELAY_MS: 900,
  // ---- 烦恼重现阶段：不再几次点击就跳转 ----
  RETURN_INTERACTION_MIN_MS: 14000,
  RETURN_ATTEMPT_THRESHOLD: 6,
  RETURN_RESPAWN_DELAY_MIN_MS: 800,
  RETURN_RESPAWN_DELAY_MAX_MS: 1200,
  RETURN_MIN_BUBBLES: 5,
  RETURN_CHOICE_FADE_MS: 1200,
  RETURN_EXTRA_INTERACTION_MS: 9000,
  MAX_CONTINUE_DELETE_COUNT: 1,
  RETURN_SETTLE_DELAY_MS: 900,
  OBSERVE_SELECT_MIN_MS: 700,
  OBSERVE_FOCUS_MS: 3200,
  // 兼容旧字段（不再用于自动跳转判定）。
  RETURN_INTERACTION_MIN_ATTEMPTS: 6,
  RETURN_RESPAWN_DELAY_MS: 1000,

  // ---- 自由输入分类器（worry-data.js 读取，纯本地词表打分，不调任何外部接口）----
  // 打分：strong 命中 +2、weak +1、exclude −3。
  CLASSIFY_STRONG_WEIGHT: 2,
  CLASSIFY_WEAK_WEIGHT: 1,
  CLASSIFY_EXCLUDE_PENALTY: 3,
  // 最高分低于 MIN_SCORE，或与第二名的差距小于 MIN_MARGIN，就判"认不出"返回 null，
  // 由界面请用户手选大类。宁可多问一次，也不要猜错后发错道具。
  CLASSIFY_MIN_SCORE: 2,
  CLASSIFY_MIN_MARGIN: 2,
  CLASSIFY_HIGH_SCORE: 5,
  // 自由输入没有预设关键词时，从原文截多少字塞进气泡。
  BUBBLE_KEYWORD_MAX_CHARS: 6,

  // ================= V0.8 新增 =================
  // 全部为新增键，不覆盖上面任何一项。上面的键仍被 bubble-game.js 裸取，不可删。

  // u02 对话：逐句推进的最小停留，防止连点跳过全部台词。
  DIALOGUE_LINE_MS: 600,

  // u03 选择烦恼：悬停多久展开细分条目；一个大类展开几条。
  WORRY_HOVER_MS: 260,
  WORRY_SUB_COUNT: 3,
  // 一次最多选几条烦恼（规格：1~3 条）。
  // 老虎机三列的分配规律直接由选中条数派生，不再另存一份：
  //   1 条 → 三列都是同一个道具；2 条 → 前两列 A、第三列 B；3 条 → 三列各一个。
  // 改这个数就得同时改 gadget-match.js 的 planAssignment()（那里按 1/2/3 写死了三种排法）。
  WORRY_MAX_PICK: 3,
  // 沉浸段的泡泡取自同一大类的兄弟烦恼，凑够这么多条。
  WORRY_SIBLING_COUNT: 12,

  // u04 老虎机：三列，每列 20 个道具 + 1 个空位。
  SLOT_REEL_COUNT: 3,
  SLOT_ITEMS_PER_REEL: 21,
  SLOT_SPIN_MS: 2400,
  SLOT_REEL_STAGGER_MS: 320,

  // u06 平静段：泡泡稳定在 12 个；删到第 6 个后开始补生。
  CALM_TARGET_COUNT: 12,
  CALM_SPAWN_AFTER: 6,

  // u07 失控段：边缘警示线宽度。
  CHAOS_EDGE_WIDTH_PX: 2,

  // u08 独裁者按钮：改为「按住」触发，不再是点一下。
  DICTATOR_HOLD_MS: 2000,
  DICTATOR_HOLD_REDUCED_MS: 600,

  // u09 空白：全黑停留多久后进入重现。
  BLANK_HOLD_MS: 3000,

  // u10 重现：只回来 3~5 个，且不可点击。
  RETURN_BUBBLE_MIN: 3,
  RETURN_BUBBLE_MAX: 5,
  // startErasure 的 onComplete 是推进的唯一信号，必须配超时兜底。
  ERASURE_FALLBACK_MS: 6000,

  // u11 / u12 结尾段的文字淡入节奏。
  SUMMARY_LINE_FADE_MS: 520,
  LOG_NODE_FADE_MS: 260,

  // ================= 阶段 4：前半段交互 =================
  // dialogue.js / worry-picker.js / gadget-match.js 三个模块共用，
  // 三者都不许自己写魔数（CLAUDE.md：阈值与时长统一放这里）。

  // u02 对话：上一句降透明度那条过渡归 CSS（.dialogue-prev 走 --t-mid），
  // 这里不再存第二份时长——两个来源迟早会对不上。
  // 独裁者按钮的剧情提示从第几轮浮出（1 起数，对应"拿出独裁者按钮"那句）。
  DIALOGUE_CUE_ROUND: 3,

  // u03 粒子悬浮场：rAF 微幅漂移的振幅与周期。reduced-motion 下整个循环不启动。
  WORRY_DRIFT_PX: 9,
  WORRY_DRIFT_MS: 5200,
  // 指针离开粒子后多久收起预览。给一点缓冲，
  // 否则粒子飞到中央的瞬间指针就"离开"了，会立刻弹回去来回抖。
  WORRY_LEAVE_MS: 180,
  // 点击大类后展开的完整列表最多几条（规格上限 15，最大的三个类正好 15 条）。
  WORRY_LIST_MAX: 15,
  // 超过这个条数就从一行改成紧凑分栏。
  WORRY_LIST_COLUMN_AFTER: 4,
  // 确认后烦恼标签沿弧线飞进四次元口袋的时长。
  WORRY_FLY_MS: 900,
  // 选了多条时，第 2、3 个标签依次晚多少出发。
  // 别调大：总时长是 FLY_MS + (n-1)*STAGGER，三条时已经 1.22s，再长就卡住流程了。
  WORRY_FLY_STAGGER_MS: 160,

  // u04 老虎机：窗口露出几格。初稿是 3 格，正中那格才是停止位。
  // gadget-match.js 靠它把实测的窗口高度换算成一格多高（格高本身只在 CSS 里定义）。
  SLOT_ROW_VISIBLE: 3,
  // 三列全部停稳后，拨杆多久浮出。
  SLOT_LEVER_DELAY_MS: 420,
  // 拨杆拨下后蓝色区上移的时长。上移本身是 CSS 过渡（.slot-stage 用 --t-slow），
  // 这个数只是"什么时候切到 u05"的信号，必须和 --t-slow 一样是 900，改一处要改两处。
  SLOT_LIFT_MS: 900,
  // 道具替身从停止位飞到结果位的时长。
  GADGET_FLY_MS: 720
};

/** 重现阶段的随机点击反馈文案：只描述“又出现了”，不出现“删除成功”。 */
const RETURN_FEEDBACK_LINES = [
  '它消散了，但没有真正离开。',
  '同样的烦恼出现在另一个位置。',
  '删除请求完成，但对象再次出现。',
  '它只是暂时离开了视线。'
];

const APP_STATE = {
  INTRO: 'INTRO',
  DIALOGUE: 'DIALOGUE',
  WORRY_PICK: 'WORRY_PICK',
  GADGET_MATCH: 'GADGET_MATCH',
  GADGET_RESULT: 'GADGET_RESULT',
  ERASE_CALM: 'ERASE_CALM',
  ERASE_CHAOS: 'ERASE_CHAOS',
  DICTATOR_CHOICE: 'DICTATOR_CHOICE',
  BLANK: 'BLANK',
  WORRIES_RETURN: 'WORRIES_RETURN',
  SUMMARY: 'SUMMARY',
  LOG: 'LOG'
};

/**
 * u06~u10 是五个独立的后台节点，但 viewId 全部指向 u06——
 * scene-manager 的 renderVisibility 用的正是 viewId，
 * 所以画面自始至终是同一个 section、同一个 canvas，用户不会感到"翻页"。
 * 逻辑 id 仍写进 body[data-current-scene]，CSS 和测试可以照常区分五个阶段。
 *
 * 与 V0.7 的对照（改名不是整体平移，u07 起错开一位，不能用正则批量替换）：
 *   ux-01→u01  ux-02+ux-03→u02  ux-04+ux-05→u03  （u04/u05 全新）
 *   ux-06+ux-07→u06  ux-08→u07  ux-09→u08  ux-10→u09  ux-11→u10
 *   ux-12→u11  ux-13+ux-14→u12
 */
const SCENE_FLOW = [
  { id: 'u01', state: APP_STATE.INTRO },
  { id: 'u02', state: APP_STATE.DIALOGUE },
  { id: 'u03', state: APP_STATE.WORRY_PICK },
  { id: 'u04', state: APP_STATE.GADGET_MATCH },
  { id: 'u05', state: APP_STATE.GADGET_RESULT },
  { id: 'u06', state: APP_STATE.ERASE_CALM, viewId: 'u06' },
  { id: 'u07', state: APP_STATE.ERASE_CHAOS, viewId: 'u06' },
  { id: 'u08', state: APP_STATE.DICTATOR_CHOICE, viewId: 'u06' },
  { id: 'u09', state: APP_STATE.BLANK, viewId: 'u06' },
  { id: 'u10', state: APP_STATE.WORRIES_RETURN, viewId: 'u06' },
  { id: 'u11', state: APP_STATE.SUMMARY },
  { id: 'u12', state: APP_STATE.LOG }
];
