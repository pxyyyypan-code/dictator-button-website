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

  // u02 分类前引导：各分镜的最小停留，防止连点跳过全部内容。
  DIALOGUE_LINE_MS: 600,
  // 首屏要等青色扩满、白洞和哆啦A梦出场后才接受推进输入。
  DIALOGUE_ENTRY_LOCK_MS: 1350,
  // Word 指定的两段滚轮过渡要累积到这个 delta 才推进；锁定时间用于吃掉触控板惯性，
  // 避免一次滚动同时跨过「欢迎 → 道具墙 → 玩家提问」两层。
  DIALOGUE_WHEEL_THRESHOLD: 56,
  DIALOGUE_WHEEL_LOCK_MS: 900,

  // u03 选择烦恼：悬停多久展开细分条目；一个大类展开几条。
  WORRY_HOVER_MS: 260,
  WORRY_SUB_COUNT: 3,
  // 一次最多选几条烦恼（规格：1~3 条）。
  // 老虎机三列的分配规律直接由选中条数派生，不再另存一份：
  //   1 条 → 三列都是同一个道具；2 条 → 前两列 A、第三列 B；3 条 → 三列各一个。
  // 改这个数就得同时改 gadget-match.js 的 planAssignment()（那里按 1/2/3 写死了三种排法）。
  WORRY_MAX_PICK: 3,
  // 兼容旧版本保留；当前沉浸段只重复玩家实际选中的细分烦恼，不再加入同类条目。
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

  // ================= 三关透明麻袋游戏：可玩性与物理系统 =================
  // 关卡节奏。第一关让玩家理解规则，第二关形成明显压力，第三关直接形成结局。
  // 麻袋大小仍由 game-state.js 的按钮使用历史决定，不在这里跟随关卡写死。
  LEVEL_GAME_DURATION: Object.freeze({ 1: 36, 2: 30, 3: 26 }),
  LEVEL_GAME_TARGET: Object.freeze({ 1: 36, 2: 48, 3: 60 }),
  LEVEL_GAME_INITIAL_COUNT: Object.freeze({ 1: 6, 2: 8, 3: 12 }),

  // 1.0 / 2.0 / 3.0 三档实际强度。生成间隔越小，强度越高。
  LEVEL_GAME_SPAWN_INTERVAL_MS: Object.freeze({ 1: 700, 2: 380, 3: 210 }),
  LEVEL_GAME_GROWTH_PX_PER_SEC: Object.freeze({ 1: 8, 2: 15, 3: 25 }),
  LEVEL_GAME_SPEED_RANGE: Object.freeze({
    1: Object.freeze([65, 95]),
    2: Object.freeze([115, 165]),
    3: Object.freeze([185, 255])
  }),
  LEVEL_GAME_ESCAPE_MIN_AGE_SEC: Object.freeze({ 1: 5.2, 2: 3.2, 3: 1.6 }),

  // 泡泡放大并允许三行文字；物理半径始终使用完整半径，不随入场缩放缩小。
  LEVEL_GAME_RADIUS_MIN: 42,
  LEVEL_GAME_RADIUS_MAX: 56,
  LEVEL_GAME_RADIUS_CAP: 82,
  LEVEL_GAME_FONT_MIN_PX: 16,
  LEVEL_GAME_FONT_MAX_PX: 24,
  LEVEL_GAME_TEXT_MAX_LINES: 3,

  // 圆形刚体：视觉上允许接触，但不允许彼此穿透。
  LEVEL_GAME_COLLISION_GAP_PX: 1.5,
  LEVEL_GAME_COLLISION_ITERATIONS: 8,
  LEVEL_GAME_COLLISION_RESTITUTION: 0.82,
  LEVEL_GAME_BOUNDARY_RESTITUTION: 0.88,
  LEVEL_GAME_SPAWN_SEARCH_ATTEMPTS: 96,

  // 隐藏的拥挤压力只驱动画面与结局，不向玩家展示数值。
  LEVEL_GAME_PRESSURE_WARN: 0.65,
  LEVEL_GAME_PRESSURE_DANGER: 0.75,
  LEVEL_GAME_PRESSURE_CRITICAL: 0.82,
  LEVEL_GAME_BAG_VISUAL_STRETCH: 0.055,

  // ================= 泡泡材质：薄膜干涉（2026-08 定稿）=================
  // 这一组是在 assets/dev/proto/bubble-look.html 上调出来的，进主站原样搬过来。
  // 渲染方式是「离线烘焙精灵 + 运行时贴图」：逐像素只在 mount/resize 时算一次，
  // 之后每颗泡泡就是两次 drawImage。1920×1080 满员 60 颗实测 0.64ms/帧，
  // 所以不需要 WebGL/three.js。
  //
  // 物理量，不要当成风格滑块随便动：
  //   FILM_IOR / FILM_LAMBDA 是皂液折射率与 R/G/B 代表波长，
  //   干涉强度 = sin²(π·OPD/λ)，OPD = 2·n·t·cosθr。改了就不是肥皂泡了。
  BUBBLE_FILM_IOR: 1.33,
  BUBBLE_FILM_LAMBDA: Object.freeze([612, 549, 465]),

  // 精灵位图：SPRITE 是边长，SPRITE_R 是其中球体的半径。
  // 差出来的 8px 留给边缘菲涅尔亮环做抗锯齿，不留会被切平。
  BUBBLE_SPRITE_SIZE: 224,
  BUBBLE_SPRITE_RADIUS: 104,
  // 膜厚相位帧数。膜在流动，逐帧算不起，离散成 FRAMES 帧循环 + 相邻帧交叉淡入。
  // 常规态与警戒态各烘一套，所以实际是 2×FRAMES 张。
  BUBBLE_SPRITE_FRAMES: 20,

  // 光环境。角度是度数；lz 固定 0.55（光略偏观察者一侧，
  // 纯侧光会让主高光贴在轮廓上，看着像描边而不像反光）。
  BUBBLE_LIGHT_ANGLE_DEG: 347,
  BUBBLE_ENV_STRENGTH: 1.60,
  BUBBLE_SPEC_STRENGTH: 0.88,
  BUBBLE_CAUSTIC_STRENGTH: 1.46,

  // 膜本身。155nm 偏薄，干涉只走一两个色周期，出来是淡色而不是彩虹圈；
  // 配 0.68 的重力排液，读起来是「上缘偏冷、下缘偏暖」。
  BUBBLE_FILM_THICKNESS_NM: 155,
  BUBBLE_IRIDESCENCE: 0.54,
  BUBBLE_FILM_DRAIN: 0.68,
  BUBBLE_FILM_SWIRL: 0.42,
  BUBBLE_FILM_SPEED: 0.21,
  BUBBLE_BODY_OPACITY: 0.05,

  // 球面环境反射取样用的天光/地面色，必须跟 .game-scene 的实际底色一致，
  // 否则那圈 45° 环形反光会和背景对不上。当前是米白自然光空间。
  BUBBLE_ENV_SKY: Object.freeze([251, 245, 234]),
  BUBBLE_ENV_GROUND: Object.freeze([237, 224, 205]),
  // 警戒态：把反射整体推向警示红。这不是物理，是玩法信号，
  // 所以在合成的最后一步乘上去，不去污染前面的干涉计算。
  // 5.3 复核：青底时这组刚好，翻成米白底之后高光会读成一个亮红点，压了一档。
  BUBBLE_WARN_TINT: Object.freeze([1.16, 0.66, 0.58]),
  // 米白底上泡泡文字必须是深墨色，原来的近白字会直接消失。
  BUBBLE_TEXT_COLOR: 'rgba(39,57,68,0.90)',
  // 破裂飞沫同理：原来的 #F7EEE1 正好等于新底色，会整片看不见。
  BUBBLE_PARTICLE_COLOR: '#2C89A8',

  // ================= 阶段 5.3：软体袋 =================
  // 袋壁不再是一条画死的贝塞尔，而是一圈质点。在「把袋子压成单位圆」的
  // 归一化空间里，第 i 个质点只有一个自由度：沿径向的位移 u_i（无量纲，
  // 相对本地半径）。每个质点受四个力：
  //   回弹 −K·u、阻尼 −C·u̇、沿壁张力 T·(u₋₁+u₊₁−2u)、以及泡泡给的外力。
  // 张力项是让它像「一张膜」而不是「一圈各自为政的弹簧」的关键：
  // 某处被顶出去，形变会沿着壁面传播开，而不是只鼓一个点。
  //
  // 外力有两路，对应两种真实受力：
  //   · 撞击冲量 —— 泡泡撞墙那一刻的法向速度。这是「随着泡泡的变换速率
  //     不断改变形态」的来源：撞得越急，袋子鼓得越猛，跟泡泡个数无关。
  //   · 接触压力 —— 靠在壁上的泡泡持续推。没有这一路的话，泡泡一安定
  //     下来袋子就死了，不符合「装着东西的袋子」的样子。
  BAG_NODE_COUNT: 96,
  BAG_STIFFNESS: 28,
  BAG_DAMPING: 4.6,
  BAG_TENSION: 74,
  // 法向速度(px/s) × 质量系数 → 径向速度(1/s)。数量级很小是因为
  // 泡泡速度是几百 px/s，而 u 的合理范围只有 0.2。
  BAG_IMPULSE_SCALE: 0.00085,
  BAG_CONTACT_SCALE: 6.2,
  BAG_CONTACT_BAND: 0.70,
  BAG_MAX_BULGE: 0.17,
  BAG_MAX_DENT: 0.13,
  // 塑料袋几乎不拉伸：某处鼓出来，别处就得瘪回去。做法是压制 u 的
  // 零阶模（平均值），这既是面积守恒的一阶近似，也天然是无条件稳定的。
  // 首轮实测取 0.72 太狠：满员时泡泡是均匀顶住四壁的，扣掉均值之后
  // 净形变几乎归零，袋子看着还是个硬椭圆。留一点整体膨胀才对。
  BAG_AREA_KEEP: 0.52,
  // 底部下坠。没有这一项它就是个气球；有了才是「装着东西挂在那儿」。
  BAG_GRAVITY_SAG: 0.055,
  // 扎口处袋身向内收，读起来才是被扎住的口，同时把泡泡向口子导流。
  BAG_NECK_PINCH: 0.17,
  BAG_SUBSTEPS: 2,

  // ================= 阶段 5.4：扎口与逃逸 =================
  // 扎口在袋子正上方。packing 越过 PRESSURE_WARN 之后口子开始变松，
  // 到 PRESSURE_CRITICAL 基本全松；只有松过 ESCAPE_MIN 泡泡才挤得出去。
  // 逃逸档（spec.escape）决定这个袋子一开始就扎得多紧。
  //
  // 宽度全部相对 rx。袋子本身很扁（rx 接近 ry 的三倍），所以这几个数看着小：
  // 首轮取 0.085/0.30 时，扎带实际有 240px 宽，读出来是个飞碟不是扎口。
  BAG_MOUTH_HALF_ANGLE: 0.30,
  BAG_MOUTH_ESCAPE_MIN: 0.34,
  BAG_NECK_HEIGHT: 0.40,
  BAG_TIE_WIDTH_MIN: 0.026,
  BAG_TIE_WIDTH_MAX: 0.080,
  BAG_MOUTH_EASE_PER_SEC: 3.4,
  // 每挤出去一颗，扎口被撑开这么多，然后按 RECOIL_DECAY 回弹。
  BAG_TIE_RECOIL: 0.34,
  BAG_TIE_RECOIL_DECAY: 0.9,

  // 逃逸三段：靠近口子 → 挤过扎口 → 弹回球形飘走。
  // 挤过去那一段要能看清楚形变，所以不能短。
  BAG_ESCAPE_SQUEEZE_MS: 620,
  BAG_ESCAPE_RELEASE_MS: 420,
  // 结局时所有泡泡排队出口。总排队时长固定，间隔按只数摊，
  // 否则 20 颗泡泡 × 固定间隔会把结局拖到七八秒。
  BAG_ESCAPE_QUEUE_TOTAL_MS: 2400,
  BAG_ESCAPE_QUEUE_MIN_MS: 90,
  BAG_ESCAPE_QUEUE_MAX_MS: 340,
  // 挤压最狠时的形变比例（沿口子方向压扁、沿前进方向拉长）。
  // 0.52 实测拉成了水滴，收到 0.34：既看得出被勒住，又还认得出是个泡泡。
  BAG_ESCAPE_SQUASH: 0.34,

  // ================= 阶段 5.5：塑料膜材质 =================
  // 袋子的材质是塑料袋，不是麻袋：所以没有编织交叉线，
  // 靠的是「极淡的膜体 + 顺着光的高光带 + 松弛处的褶皱 + 一圈明暗边」。
  // 褶皱直接由 5.3 的 u 场驱动——被压缩（u<0）的地方才起褶，
  // 这是整套里最像塑料的一个信号，而且它本身就是物理的结果。
  BAG_FILM_TINT: Object.freeze([206, 224, 230]),
  BAG_FILM_BODY_ALPHA: 0.062,
  BAG_FILM_RIM_ALPHA: 0.60,
  BAG_SHEEN_ALPHA: 0.22,
  BAG_WRINKLE_COUNT: 18,
  BAG_WRINKLE_ALPHA: 0.17,

  // ================= 阶段 4：前半段交互 =================
  // dialogue.js / worry-picker.js / gadget-match.js 三个模块共用，
  // 三者都不许自己写魔数（CLAUDE.md：阈值与时长统一放这里）。

  // u01 首页：独立、不重复的不规则 SVG 圆环连续向外推进；完整道具沿弧线穿行。
  // 描边使用 non-scaling-stroke，放大时不会变成覆盖整屏的米白色块。
  INTRO_TUNNEL_RING_COUNT: 18,
  INTRO_TUNNEL_RING_CYCLE_MS: 7200,
  INTRO_TUNNEL_GADGET_COUNT: 12,
  INTRO_TUNNEL_GADGET_CYCLE_MS: 13200,

  // u03 球形烦恼场：拖拽、滚轮与误触判定全部集中配置。
  // 拖拽灵敏度使用「弧度 / 像素」，滚轮灵敏度使用「弧度 / delta」。
  WORRY_SPHERE_DRAG_RAD_PER_PX: 0.0075,
  WORRY_SPHERE_WHEEL_RAD_PER_DELTA: 0.00135,
  // 移动不足这个距离仍视为点击；超过则只旋转球面，不触发类别选择。
  WORRY_SPHERE_DRAG_THRESHOLD_PX: 7,
  // 键盘方向键每次旋转的角度，给无法拖拽的玩家保留同等浏览能力。
  WORRY_SPHERE_KEY_STEP_RAD: 0.18,
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
  GADGET_FLY_MS: 720,

  // ================= 星级评定与 20 件道具收藏 =================
  // 只作用于第一、二关。第三关不判通关与否、直接导向结局，所以它没有阈值，
  // 也不会出现在这张表里——别顺手补一行 3，level-rating.js 查不到就当没有评定。
  //
  // 评定规则：没通关 = 0 星（三颗灰星）；通关至少 1 星；
  // 通关用时 ≤ three 秒给 3 星，≤ two 秒给 2 星，其余 1 星。
  // 用时取 LevelGame 的 stats.elapsedMs（含小数），不是 secondsLeft 的整秒。
  // 独裁者按钮按下的瞬间 gameplay 就置 false、计时随即冻结，
  // 所以用按钮提前清空拿到的就是真实用时，不额外扣星。
  //
  // 下面两组是暂定值（第一关限时 36 秒、第二关 30 秒），实测后直接改这里。
  LEVEL_STAR_THRESHOLDS: Object.freeze({
    1: Object.freeze({ three: 22, two: 29 }),
    2: Object.freeze({ three: 19, two: 25 })
  }),

  // 结算卡里三颗星依次亮起：第一颗的等待 + 每颗之间的间隔。
  // 不要一次性全亮，所以 STAGGER 不能给 0。
  STAR_REVEAL_DELAY_MS: 260,
  STAR_REVEAL_STAGGER_MS: 360,

  // 奖励老虎机：复用 u04 的三列滚轮（SLOT_SPIN_MS / SLOT_REEL_STAGGER_MS / SLOT_ROW_VISIBLE），
  // 这里只补「停稳之后多久亮出新道具」。
  REWARD_REVEAL_DELAY_MS: 620,

  // 收藏册：4 列 × 5 行共 20 件，视窗一次只露 2 行，其余靠滚轮看。
  COLLECTION_COLUMNS: 4,
  COLLECTION_ROWS: 5,
  COLLECTION_VISIBLE_ROWS: 2,
  // 抽卡后的收藏动画：开册 → 滚到目标行 → 道具飞进槽位 → 停留 → 收回右下角。
  COLLECTION_OPEN_MS: 420,
  COLLECTION_SCROLL_SETTLE_MS: 650,
  COLLECTION_FLY_MS: 820,
  COLLECTION_UNLOCK_HOLD_MS: 3200,
  COLLECTION_CLOSE_MS: 480,

  /* ── 第三关 → 结局1「远去」的连续过渡 ─────────────────────────
     情绪线：拥挤 → 松开 → 漂浮 → 远离 → 安静 → 释然。
     不是失败结局，所以全程没有爆裂、没有红色警报、没有失控逃跑。

     下面的时间点全是**相对起点的绝对毫秒**，不是各段时长依次相加。
     这样改任何一个值都不会把后面的整体推移，调参时不用重算。
       0                 泡泡松开、HUD/收藏夹/独裁者按钮开始淡出
       SACK_START        麻袋开始缩小 → 右移 → 填充淡出成线稿
       TINT_START        米白开始转青蓝（画在 canvas 上，不动 --game-bg）
       VEIL_START        结局1页面在上方铺开，开始淡入
       TOTAL             真正切场景；此刻两屏画面已经一致，切换看不见
     TOTAL 必须 ≥ VEIL_START + VEIL_MS，否则会在淡入没走完时硬切。 */
  ENDING1_HUD_FADE_MS: 900,
  ENDING1_SACK_START_MS: 700,
  ENDING1_SACK_MS: 2500,
  ENDING1_TINT_START_MS: 1500,
  ENDING1_TINT_MS: 1900,
  ENDING1_VEIL_START_MS: 3000,
  ENDING1_VEIL_MS: 1200,
  ENDING1_TOTAL_MS: 4400,

  // 结局页的青蓝。必须和 style.css 的 --c-teal-bright (#049CBF) 是同一个颜色，
  // 否则过渡完成的那一帧会跳色。canvas 这层是 rgba 叠加，所以写成分量。
  ENDING1_TEAL_RGB: Object.freeze([4, 156, 191]),

  // 泡泡离开麻袋：给一个向上的初速，之后每秒衰减到 DRAG 倍——
  // 所以是「越飘越慢、彼此拉开」，而不是加速逃跑。
  ENDING1_RISE_SPEED_MIN: 30,
  ENDING1_RISE_SPEED_MAX: 66,
  ENDING1_RISE_SPREAD: 30,
  ENDING1_RISE_FUNNEL: 0.16,
  ENDING1_RISE_DRAG: 0.55,
  ENDING1_RISE_STAGGER_MS: 160,
  // 触发到「手真的松开」之间留一拍。按钮那条路上这一拍最要紧：
  // 按下去 → 什么也没发生 → 然后泡泡才开始自己走。
  ENDING1_RELEASE_DELAY_MS: 520,
  ENDING1_RISE_SWAY: 7,
  ENDING1_SHRINK_PER_SEC: 0.10,
  ENDING1_FADE_START_MS: 1700,
  ENDING1_FADE_MS: 2300,

  // 其中一颗像肥皂泡一样轻轻破掉：几粒碎屑、慢速、无闪光、无冲击波。
  ENDING1_POP_AT_MS: 2100,
  ENDING1_POP_PARTICLES: 6,
  ENDING1_POP_SPEED_SCALE: 0.34,

  // prefers-reduced-motion：整段退化成一次短交叉淡入，不做任何位移。
  ENDING1_REDUCED_MS: 420
};

/** 重现阶段的随机点击反馈文案：只描述“又出现了”，不出现“删除成功”。 */
const RETURN_FEEDBACK_LINES = [
  '它消散了，但没有真正离开。',
  '同样的烦恼出现在另一个位置。',
  '删除请求完成，但对象再次出现。',
  '它只是暂时离开了视线。'
];

if (typeof module !== 'undefined' && module.exports) module.exports = CONFIG;

const APP_STATE = {
  INTRO: 'INTRO',
  DIALOGUE: 'DIALOGUE',
  WORRY_PICK: 'WORRY_PICK',
  GADGET_MATCH: 'GADGET_MATCH',
  GADGET_RESULT: 'GADGET_RESULT',
  LEVEL_ONE: 'LEVEL_ONE',
  LEVEL_ONE_RESULT: 'LEVEL_ONE_RESULT',
  LEVEL_TWO: 'LEVEL_TWO',
  LEVEL_TWO_RESULT: 'LEVEL_TWO_RESULT',
  LEVEL_THREE: 'LEVEL_THREE',
  ENDING: 'ENDING',
  LOG: 'LOG'
};

/**
 * u06~u10 现在承载三关游戏与第一、二关结果节点。它们仍共享 u06 的
 * Canvas 与透明麻袋容器，因此换关和弹出结果卡时不会出现整页闪烁：
 *   u06 第一关 · u07 第一关结果 · u08 第二关 · u09 第二关结果 · u10 第三关。
 * u11 是四种结局的共用模板，u12 是体验总结。
 */
const SCENE_FLOW = [
  { id: 'u01', state: APP_STATE.INTRO },
  { id: 'u02', state: APP_STATE.DIALOGUE },
  { id: 'u03', state: APP_STATE.WORRY_PICK },
  { id: 'u04', state: APP_STATE.GADGET_MATCH },
  { id: 'u05', state: APP_STATE.GADGET_RESULT },
  { id: 'u06', state: APP_STATE.LEVEL_ONE, viewId: 'u06' },
  { id: 'u07', state: APP_STATE.LEVEL_ONE_RESULT, viewId: 'u06' },
  { id: 'u08', state: APP_STATE.LEVEL_TWO, viewId: 'u06' },
  { id: 'u09', state: APP_STATE.LEVEL_TWO_RESULT, viewId: 'u06' },
  { id: 'u10', state: APP_STATE.LEVEL_THREE, viewId: 'u06' },
  { id: 'u11', state: APP_STATE.ENDING },
  { id: 'u12', state: APP_STATE.LOG }
];
