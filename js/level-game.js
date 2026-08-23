/**
 * level-game.js —— 三关透明麻袋泡泡游戏。
 *
 * 与旧版 BubbleGame 分离：这里的泡泡只来自玩家实际选中的细分烦恼，
 * 并且生成、移动、膨胀、逃逸与自爆都受同一个透明麻袋边界约束。
 */
'use strict';

const LEVEL_TUNING = typeof CONFIG !== 'undefined'
  ? CONFIG
  : (typeof require === 'function' ? require('./config.js') : {});

const LevelGame = (function () {
  const BAG_WIDTH = { 1: 0.68, 2: 0.82, 3: 0.94 };
  const BAG_HEIGHT = { 1: 0.58, 2: 0.68, 3: 0.76 };
  const SPAWN_INTERVAL = LEVEL_TUNING.LEVEL_GAME_SPAWN_INTERVAL_MS || { 1: 700, 2: 380, 3: 210 };
  const GROWTH_RATE = LEVEL_TUNING.LEVEL_GAME_GROWTH_PX_PER_SEC || { 1: 8, 2: 15, 3: 25 };
  const SPEED_RANGE = LEVEL_TUNING.LEVEL_GAME_SPEED_RANGE || {
    1: [65, 95],
    2: [115, 165],
    3: [185, 255]
  };
  const ESCAPE_MIN_AGE = LEVEL_TUNING.LEVEL_GAME_ESCAPE_MIN_AGE_SEC || { 1: 5.2, 2: 3.2, 3: 1.6 };
  const RADIUS_MIN = Number(LEVEL_TUNING.LEVEL_GAME_RADIUS_MIN) || 42;
  const RADIUS_MAX = Number(LEVEL_TUNING.LEVEL_GAME_RADIUS_MAX) || 56;
  const RADIUS_CAP = Number(LEVEL_TUNING.LEVEL_GAME_RADIUS_CAP) || 82;
  const COLLISION_GAP = Number(LEVEL_TUNING.LEVEL_GAME_COLLISION_GAP_PX) || 1.5;
  const COLLISION_ITERATIONS = Number(LEVEL_TUNING.LEVEL_GAME_COLLISION_ITERATIONS) || 6;
  const COLLISION_RESTITUTION = Number(LEVEL_TUNING.LEVEL_GAME_COLLISION_RESTITUTION) || 0.82;
  const BOUNDARY_RESTITUTION = Number(LEVEL_TUNING.LEVEL_GAME_BOUNDARY_RESTITUTION) || 0.88;
  const SPAWN_SEARCH_ATTEMPTS = Number(LEVEL_TUNING.LEVEL_GAME_SPAWN_SEARCH_ATTEMPTS) || 96;
  const PRESSURE_WARN = Number(LEVEL_TUNING.LEVEL_GAME_PRESSURE_WARN) || 0.65;
  const PRESSURE_DANGER = Number(LEVEL_TUNING.LEVEL_GAME_PRESSURE_DANGER) || 0.75;
  const PRESSURE_CRITICAL = Number(LEVEL_TUNING.LEVEL_GAME_PRESSURE_CRITICAL) || 0.82;
  const BAG_VISUAL_STRETCH = Number(LEVEL_TUNING.LEVEL_GAME_BAG_VISUAL_STRETCH) || 0.055;

  // ---- 5.3 软体袋 ----
  const NODE_COUNT = Math.max(24, Number(LEVEL_TUNING.BAG_NODE_COUNT) || 96);
  const BAG_K = Number(LEVEL_TUNING.BAG_STIFFNESS) || 46;
  const BAG_C = Number(LEVEL_TUNING.BAG_DAMPING) || 5.4;
  const BAG_T = Number(LEVEL_TUNING.BAG_TENSION) || 120;
  const BAG_IMPULSE = Number(LEVEL_TUNING.BAG_IMPULSE_SCALE) || 0.00040;
  const BAG_CONTACT = Number(LEVEL_TUNING.BAG_CONTACT_SCALE) || 2.6;
  const BAG_CONTACT_BAND = Number(LEVEL_TUNING.BAG_CONTACT_BAND) || 0.74;
  const BAG_MAX_BULGE = Number(LEVEL_TUNING.BAG_MAX_BULGE) || 0.20;
  const BAG_MAX_DENT = Number(LEVEL_TUNING.BAG_MAX_DENT) || 0.11;
  const BAG_AREA_KEEP = Number(LEVEL_TUNING.BAG_AREA_KEEP) || 0.72;
  const BAG_SAG = Number(LEVEL_TUNING.BAG_GRAVITY_SAG) || 0.055;
  const BAG_NECK_PINCH = Number(LEVEL_TUNING.BAG_NECK_PINCH) || 0.11;
  const BAG_SUBSTEPS = Math.max(1, Number(LEVEL_TUNING.BAG_SUBSTEPS) || 2);

  // ---- 5.4 扎口与逃逸 ----
  const MOUTH_ANGLE = Number(LEVEL_TUNING.BAG_MOUTH_HALF_ANGLE) || 0.46;
  const MOUTH_ESCAPE_MIN = Number(LEVEL_TUNING.BAG_MOUTH_ESCAPE_MIN) || 0.34;
  const NECK_HEIGHT = Number(LEVEL_TUNING.BAG_NECK_HEIGHT) || 0.26;
  const TIE_WIDTH_MIN = Number(LEVEL_TUNING.BAG_TIE_WIDTH_MIN) || 0.085;
  const TIE_WIDTH_MAX = Number(LEVEL_TUNING.BAG_TIE_WIDTH_MAX) || 0.30;
  const MOUTH_EASE = Number(LEVEL_TUNING.BAG_MOUTH_EASE_PER_SEC) || 3.4;
  const TIE_RECOIL = Number(LEVEL_TUNING.BAG_TIE_RECOIL) || 0.34;
  const TIE_RECOIL_DECAY = Number(LEVEL_TUNING.BAG_TIE_RECOIL_DECAY) || 0.9;
  const SQUEEZE_MS = Number(LEVEL_TUNING.BAG_ESCAPE_SQUEEZE_MS) || 620;
  const RELEASE_MS = Number(LEVEL_TUNING.BAG_ESCAPE_RELEASE_MS) || 420;
  const QUEUE_TOTAL_MS = Number(LEVEL_TUNING.BAG_ESCAPE_QUEUE_TOTAL_MS) || 2400;
  const QUEUE_MIN_MS = Number(LEVEL_TUNING.BAG_ESCAPE_QUEUE_MIN_MS) || 90;
  const QUEUE_MAX_MS = Number(LEVEL_TUNING.BAG_ESCAPE_QUEUE_MAX_MS) || 340;
  const ESCAPE_SQUASH = Number(LEVEL_TUNING.BAG_ESCAPE_SQUASH) || 0.52;
  // 扎口在正上方。归一化空间里 y 向下，所以正上方是 −π/2。
  const MOUTH_PHI = -Math.PI / 2;

  // ---- 5.5 塑料膜 ----
  const FILM_TINT = LEVEL_TUNING.BAG_FILM_TINT || [206, 224, 230];
  const FILM_BODY_A = Number(LEVEL_TUNING.BAG_FILM_BODY_ALPHA) || 0.062;
  const FILM_RIM_A = Number(LEVEL_TUNING.BAG_FILM_RIM_ALPHA) || 0.40;
  const SHEEN_A = Number(LEVEL_TUNING.BAG_SHEEN_ALPHA) || 0.22;
  const WRINKLE_COUNT = Number(LEVEL_TUNING.BAG_WRINKLE_COUNT) || 15;
  const WRINKLE_A = Number(LEVEL_TUNING.BAG_WRINKLE_ALPHA) || 0.15;
  const FILM_RGB = FILM_TINT[0] + ',' + FILM_TINT[1] + ',' + FILM_TINT[2];

  // ── 泡泡材质：薄膜干涉精灵。数值全部来自 config.js，这里只做取值与兜底。──
  const SPRITE = Number(LEVEL_TUNING.BUBBLE_SPRITE_SIZE) || 224;
  const SPRITE_R = Number(LEVEL_TUNING.BUBBLE_SPRITE_RADIUS) || 104;
  const SPRITE_FRAMES = Number(LEVEL_TUNING.BUBBLE_SPRITE_FRAMES) || 20;
  const N_FILM = Number(LEVEL_TUNING.BUBBLE_FILM_IOR) || 1.33;
  const LAMBDA = LEVEL_TUNING.BUBBLE_FILM_LAMBDA || [612, 549, 465];
  const ENV_SKY = LEVEL_TUNING.BUBBLE_ENV_SKY || [251, 245, 234];
  const ENV_GROUND = LEVEL_TUNING.BUBBLE_ENV_GROUND || [237, 224, 205];
  const WARN_TINT = LEVEL_TUNING.BUBBLE_WARN_TINT || [1.30, 0.52, 0.44];
  const BUBBLE_TEXT_COLOR = LEVEL_TUNING.BUBBLE_TEXT_COLOR || 'rgba(39,57,68,0.90)';
  const PARTICLE_COLOR = LEVEL_TUNING.BUBBLE_PARTICLE_COLOR || '#2C89A8';

  /* 结局1「远去」的收尾演出。和 playOutcome('escape') 是两回事：
     那个是「从扎口挤出去」的快动作，这里是「松开手、慢慢飘远」。
     参数全在 config.js 的 ENDING1_*，这里只做取值兜底。 */
  const FAR = {
    sackStart: Number(LEVEL_TUNING.ENDING1_SACK_START_MS) || 700,
    sackMs: Number(LEVEL_TUNING.ENDING1_SACK_MS) || 2500,
    tintStart: Number(LEVEL_TUNING.ENDING1_TINT_START_MS) || 1500,
    tintMs: Number(LEVEL_TUNING.ENDING1_TINT_MS) || 1900,
    veilStart: Number(LEVEL_TUNING.ENDING1_VEIL_START_MS) || 3000,
    veilMs: Number(LEVEL_TUNING.ENDING1_VEIL_MS) || 1200,
    riseMin: Number(LEVEL_TUNING.ENDING1_RISE_SPEED_MIN) || 30,
    riseMax: Number(LEVEL_TUNING.ENDING1_RISE_SPEED_MAX) || 66,
    spread: Number(LEVEL_TUNING.ENDING1_RISE_SPREAD) || 30,
    funnel: Number(LEVEL_TUNING.ENDING1_RISE_FUNNEL) || 0.16,
    drag: Number(LEVEL_TUNING.ENDING1_RISE_DRAG) || 0.55,
    stagger: Number(LEVEL_TUNING.ENDING1_RISE_STAGGER_MS) || 160,
    release: Number(LEVEL_TUNING.ENDING1_RELEASE_DELAY_MS) || 520,
    sway: Number(LEVEL_TUNING.ENDING1_RISE_SWAY) || 7,
    shrink: Number(LEVEL_TUNING.ENDING1_SHRINK_PER_SEC) || 0.10,
    fadeStart: Number(LEVEL_TUNING.ENDING1_FADE_START_MS) || 1700,
    fadeMs: Number(LEVEL_TUNING.ENDING1_FADE_MS) || 2300,
    popAt: Number(LEVEL_TUNING.ENDING1_POP_AT_MS) || 2100,
    popCount: Number(LEVEL_TUNING.ENDING1_POP_PARTICLES) || 6,
    popSpeed: Number(LEVEL_TUNING.ENDING1_POP_SPEED_SCALE) || 0.34
  };
  const FAR_TEAL = LEVEL_TUNING.ENDING1_TEAL_RGB || [4, 156, 191];
  const FAR_TEAL_RGB = FAR_TEAL[0] + ',' + FAR_TEAL[1] + ',' + FAR_TEAL[2];
  // 结局页 .ending-sack 的描边色（style.css: rgba(247,238,225,0.76)）。
  // canvas 上的麻袋最后要变成同一根线，两处必须一致，否则交接时线会跳色。
  const FAR_LINE_RGB = '247,238,225';
  const FAR_LINE_A = 0.76;

  const FILM = {
    light: Number(LEVEL_TUNING.BUBBLE_LIGHT_ANGLE_DEG) || 347,
    env: Number(LEVEL_TUNING.BUBBLE_ENV_STRENGTH) || 1.60,
    spec: Number(LEVEL_TUNING.BUBBLE_SPEC_STRENGTH) || 0.88,
    caustic: Number(LEVEL_TUNING.BUBBLE_CAUSTIC_STRENGTH) || 1.46,
    thick: Number(LEVEL_TUNING.BUBBLE_FILM_THICKNESS_NM) || 155,
    irid: Number(LEVEL_TUNING.BUBBLE_IRIDESCENCE) || 0.54,
    drain: Number(LEVEL_TUNING.BUBBLE_FILM_DRAIN) || 0.68,
    swirl: Number(LEVEL_TUNING.BUBBLE_FILM_SWIRL) || 0.42,
    speed: Number(LEVEL_TUNING.BUBBLE_FILM_SPEED) || 0.21,
    body: Number(LEVEL_TUNING.BUBBLE_BODY_OPACITY) || 0.05
  };

  // 干涉强度 sin²(π·OPD/λ) 对 OPD/λ 的小数部分周期为 1，可以整表打掉。
  // 烘焙一次要算 2 套 × 20 帧 × 3 通道 × 5 万像素，直接调 Math.sin 会明显拖慢入场。
  const LUT_N = 2048;
  const SINSQ = new Float32Array(LUT_N);
  for (let lutIndex = 0; lutIndex < LUT_N; lutIndex += 1) {
    const lutSin = Math.sin(Math.PI * lutIndex / LUT_N);
    SINSQ[lutIndex] = lutSin * lutSin;
  }
  function sinsq01(value) {
    const frac = value - Math.floor(value);
    return SINSQ[(frac * LUT_N) | 0];
  }

  let canvas = null;
  let ctx = null;
  let dpr = 1;
  let width = 0;
  let height = 0;
  let resizeObserver = null;
  let pointerHandler = null;
  let raf = 0;
  let running = false;
  let gameplay = false;
  let lastTime = 0;
  let spec = null;
  let profiles = [];
  let callbacks = {};
  let spawnElapsed = 0;
  let timeLeftMs = 0;
  let finishDelay = 0;
  let finishCallback = null;
  let statusPulse = 0;
  let pressure = 0;
  let pressureStage = 0;
  let collisionEvents = 0;
  let growthBlockedRatio = 0;
  let bag = null;
  // 5.3：袋壁质点。u 是径向位移（无量纲），uv 是它的速度，uf 是本帧累积的外力。
  // 三条都是定长 Float32Array，整局复用，不在帧里分配。
  const wallU = new Float32Array(NODE_COUNT);
  const wallV = new Float32Array(NODE_COUNT);
  const wallF = new Float32Array(NODE_COUNT);
  // 静止形状相对单位圆的偏差（下坠 + 扎口收腰），只跟角度有关，建一次。
  const wallRest = new Float32Array(NODE_COUNT);
  let wallReady = false;
  // 5.4：扎口松紧 0~1，以及每挤出一颗泡泡时的瞬时撑开量。
  let mouthOpen = 0;
  let mouthForced = false;
  let tieRecoil = 0;
  /** 结局1收尾演出的进度包；null = 没在演。见 playFarewell()。 */
  let farewell = null;
  let reducedMotion = false;
  let filmGeometry = null;      // 与膜厚相位无关的那半：法线、菲涅尔、环境反射、高光、焦散
  let filmSprites = null;       // 常规态 SPRITE_FRAMES 张离屏 canvas
  let filmSpritesWarn = null;   // 警戒态同上；edgeGlow 在两套之间做连续交叉淡入
  let filmBakeMs = 0;
  let nextId = 1;
  let profileCursor = 0;
  let stats = freshStats();
  const bubbles = [];
  const particles = [];

  function freshStats() {
    return {
      manualCleared: 0,
      escaped: 0,
      autoBurst: 0,
      totalSpawned: 0,
      remaining: 0,
      secondsLeft: 0,
      // 星级评定要的是含小数的真实用时。secondsLeft 是 Math.ceil 的整秒，
      // 拿它反推会把 21.2 秒和 21.9 秒算成同一档。这里只在 gameplay 期间累加，
      // 所以独裁者按钮把 gameplay 置 false 的那一刻，用时就跟着冻结了。
      elapsedMs: 0,
      packing: 0,
      pressure: 0,
      peakPressure: 0,
      blockedSpawns: 0,
      growthBlocked: 0,
      peakGrowthBlocked: 0,
      collisionEvents: 0,
      // 5.4：扎口松紧。只是后台状态，不在前台展示数值。
      mouthOpen: 0
    };
  }

  function random(min, max) { return min + Math.random() * (max - min); }
  function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }

  function levelIntensity(inputSpec) {
    const source = inputSpec || spec || {};
    const level = clamp(Math.round(source.level || 1), 1, 3);
    return ({ 1: 1, 2: 1.16, 3: 1.34 })[level];
  }

  function effectiveSpeedRange(inputSpec) {
    const source = inputSpec || spec || {};
    const grade = clamp(Math.round(source.escape || 1), 1, 3);
    const base = SPEED_RANGE[grade] || SPEED_RANGE[1];
    const factor = levelIntensity(source);
    return [base[0] * factor, base[1] * factor];
  }

  function effectiveGrowthRate(inputSpec) {
    const source = inputSpec || spec || {};
    const grade = clamp(Math.round(source.expand || 1), 1, 3);
    return (Number(GROWTH_RATE[grade]) || GROWTH_RATE[1]) * levelIntensity(source);
  }

  function effectiveEscapeMinAge(inputSpec) {
    const source = inputSpec || spec || {};
    const escapeLevel = clamp(Math.round(source.escape || 1), 1, 3);
    const level = clamp(Math.round(source.level || 1), 1, 3);
    return (Number(ESCAPE_MIN_AGE[escapeLevel]) || 3.2) /
      ({ 1: 1, 2: 1.18, 3: 1.42 })[level];
  }

  function motionTuningFor(inputSpec) {
    return {
      speed: effectiveSpeedRange(inputSpec),
      growth: effectiveGrowthRate(inputSpec),
      escapeMinAge: effectiveEscapeMinAge(inputSpec)
    };
  }

  function fontStack(text) {
    if (typeof FontSupport !== 'undefined') return FontSupport.fontStackFor(text);
    return '"Canger YuYangTi", "Microsoft YaHei", "PingFang SC", sans-serif';
  }

  function prefersReducedMotion() {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /* ─────────────────────────────────────────────────────────────
     泡泡材质：逐像素烘焙
     拆成两段是因为只有干涉依赖膜厚相位：
       · filmGeometry —— 法线、菲涅尔、环境反射、高光、焦散，与相位无关，整个生命周期算一次；
       · 每帧 —— 只算膜厚 → 光程差 → 三通道干涉，再和几何合成。
     不拆的话 20 帧要把菲涅尔和两个 pow 高光重算 20 遍。
     ───────────────────────────────────────────────────────────── */

  function buildFilmGeometry() {
    const total = SPRITE * SPRITE;
    const geom = {
      ny: new Float32Array(total), cosr: new Float32Array(total), ang: new Float32Array(total),
      fres: new Float32Array(total), spec: new Float32Array(total), caustic: new Float32Array(total),
      envR: new Float32Array(total), envG: new Float32Array(total), envB: new Float32Array(total),
      cover: new Float32Array(total)
    };

    const skyR = ENV_SKY[0] / 255, skyG = ENV_SKY[1] / 255, skyB = ENV_SKY[2] / 255;
    const grR = ENV_GROUND[0] / 255, grG = ENV_GROUND[1] / 255, grB = ENV_GROUND[2] / 255;

    // 光源方向。lz = 0.55：光略偏观察者一侧。纯侧光会让主高光贴在轮廓上，
    // 看着像描边而不像反光。
    const la = FILM.light * Math.PI / 180;
    let lx = Math.cos(la), ly = Math.sin(la), lz = 0.55;
    const ll = Math.sqrt(lx * lx + ly * ly + lz * lz);
    lx /= ll; ly /= ll; lz /= ll;
    // 半程向量 h = normalize(L + V)，V = (0,0,1)。
    let hx = lx, hy = ly, hz = lz + 1;
    const hl = Math.sqrt(hx * hx + hy * hy + hz * hz);
    hx /= hl; hy /= hl; hz /= hl;

    const center = SPRITE / 2;
    const feather = 1.6 / SPRITE_R;     // 轮廓抗锯齿宽度，单位是归一化半径
    const invN2 = 1 / (N_FILM * N_FILM);

    for (let py = 0; py < SPRITE; py += 1) {
      const ny = (py + 0.5 - center) / SPRITE_R;
      for (let px = 0; px < SPRITE; px += 1) {
        const idx = py * SPRITE + px;
        const nx = (px + 0.5 - center) / SPRITE_R;
        const d2 = nx * nx + ny * ny;
        if (d2 >= 1 + feather) { geom.cover[idx] = 0; continue; }

        const dist = Math.sqrt(d2);
        const cov = dist > 1 - feather ? Math.max(0, (1 + feather - dist) / (2 * feather)) : 1;
        const nzs = 1 - Math.min(d2, 0.999999);
        const nz = Math.sqrt(nzs);

        // 菲涅尔：正对我们的地方几乎完全透明（F0≈0.02），越接近轮廓反射率越趋近 1。
        // 肥皂泡「中间空、边缘亮」就是这一条，也是它和实心玻璃球最根本的差别。
        const om = 1 - nz;
        const om2 = om * om;
        const fres = 0.02 + 0.98 * om2 * om2 * om;

        // 膜内折射角：斯涅尔定律。sin²θi = 1 - nz²。
        const cosr = Math.sqrt(1 - (1 - nzs) * invN2);

        // 球面环境反射的竖直分量。屏幕 y 向下，ry<0 表示反射朝上 → 看到天光。
        let t = (1 - 2 * ny * nz) * 0.5;
        if (t < 0) t = 0; else if (t > 1) t = 1;

        // Blinn-Phong 主高光 + 一圈宽柔光晕。关键是所有泡泡共用同一个 h ——
        // 满屏高光朝同一个方向，这是「同一束自然光」唯一的读法。
        let ndh = nx * hx + ny * hy + nz * hz;
        if (ndh < 0) ndh = 0;
        const n2 = ndh * ndh, n4 = n2 * n2, n8 = n4 * n4;
        let specular = n8 * n8 * n8 * n4 * ndh    // ≈ pow(ndh, 221) 紧高光
                     + n8 * n4 * 0.22;            // ≈ pow(ndh, 12)  柔光晕
        // 背面膜的二次反射：位置大致在主高光的镜像点，更暗更散。
        // 有它才读得出「这是个空壳」，没有它就是个实心球。
        let bdh = -(nx * hx + ny * hy) + nz * hz;
        if (bdh < 0) bdh = 0;
        const b2 = bdh * bdh, b4 = b2 * b2, b8 = b4 * b4;
        specular += b8 * b8 * b4 * 0.30;          // ≈ pow(bdh, 40)

        // 焦散：光穿过泡泡后在背光那侧的边缘聚成一道暖亮弧。
        let away = -(nx * lx + ny * ly);
        if (away < 0) away = 0;
        const rimf = om2 * Math.sqrt(om);         // ≈ pow(1-nz, 2.5)

        geom.ny[idx] = ny;
        geom.cosr[idx] = cosr;
        geom.ang[idx] = Math.atan2(ny, nx);
        geom.fres[idx] = fres;
        geom.spec[idx] = specular;
        geom.caustic[idx] = rimf * away * Math.sqrt(away);
        geom.cover[idx] = cov;
        geom.envR[idx] = grR + (skyR - grR) * t;
        geom.envG[idx] = grG + (skyG - grG) * t;
        geom.envB[idx] = grB + (skyB - grB) * t;
      }
    }
    filmGeometry = geom;
  }

  function bakeFilmSet(tintR, tintG, tintB) {
    const total = SPRITE * SPRITE;
    const geom = filmGeometry;
    const frames = [];
    for (let f = 0; f < SPRITE_FRAMES; f += 1) {
      const phase = f / SPRITE_FRAMES * Math.PI * 2;
      const cv = document.createElement('canvas');
      cv.width = SPRITE;
      cv.height = SPRITE;
      const g = cv.getContext('2d');
      const img = g.createImageData(SPRITE, SPRITE);
      const data = img.data;

      for (let i = 0; i < total; i += 1) {
        const cov = geom.cover[i];
        if (cov <= 0) continue;

        // 膜厚：基准值 + 重力排液（上薄下厚）+ 一圈流纹。
        // 流纹随相位转，帧与帧之间的差别主要来自它。
        let th = FILM.thick * (1 + FILM.drain * geom.ny[i] +
          FILM.swirl * Math.sin(3 * geom.ang[i] + phase));
        if (th < 20) th = 20;
        const opd = 2 * N_FILM * th * geom.cosr[i];

        // 三通道各自的干涉强度。均值 0.5，所以 ×2 后再和「无色」按虹彩强度插值，
        // 这样调虹彩强度不会顺带把整体亮度也调走。
        const tr = 1 + FILM.irid * (2 * sinsq01(opd / LAMBDA[0]) - 1);
        const tg = 1 + FILM.irid * (2 * sinsq01(opd / LAMBDA[1]) - 1);
        const tb = 1 + FILM.irid * (2 * sinsq01(opd / LAMBDA[2]) - 1);

        const refl = geom.fres[i] * FILM.env;
        const sp = geom.spec[i] * FILM.spec;
        const ca = geom.caustic[i] * FILM.caustic;

        const lr = geom.envR[i] * tr * refl + sp + ca * 1.00;
        const lg = geom.envG[i] * tg * refl + sp + ca * 0.86;
        const lb = geom.envB[i] * tb * refl + sp + ca * 0.62;

        // 不透明度＝真正挡住背景的那部分。中心 ≈ body，边缘 ≈ 1。
        let a = geom.fres[i] * 0.95 + FILM.body + sp * 1.15 + ca * 0.8;
        if (a > 1) a = 1; else if (a < 0.004) a = 0.004;

        // ImageData 是直通 alpha（非预乘），颜色要除以 alpha，
        // 否则半透明处会整体压暗，泡泡看着像脏。
        const cr = lr / a * tintR, cg = lg / a * tintG, cb = lb / a * tintB;
        const o = i * 4;
        data[o] = cr > 1 ? 255 : cr * 255;
        data[o + 1] = cg > 1 ? 255 : cg * 255;
        data[o + 2] = cb > 1 ? 255 : cb * 255;
        data[o + 3] = a * cov * 255;
      }
      g.putImageData(img, 0, 0);
      frames.push(cv);
    }
    return frames;
  }

  // 精灵与画布分辨率无关，所以只在 mount 时烘一次，resize 不重来。
  function ensureFilmSprites() {
    if (filmSprites) return;
    if (typeof document === 'undefined') return;
    const t0 = (typeof performance !== 'undefined' ? performance.now() : 0);
    buildFilmGeometry();
    filmSprites = bakeFilmSet(1, 1, 1);
    filmSpritesWarn = bakeFilmSet(WARN_TINT[0], WARN_TINT[1], WARN_TINT[2]);
    filmGeometry = null;   // 合成完就没用了，5 万像素 × 10 条 Float32 及时放掉
    filmBakeMs = (typeof performance !== 'undefined' ? performance.now() : 0) - t0;
  }

  function normalizeProfiles(input) {
    const list = Array.isArray(input) ? input.filter(function (item) {
      return item && String(item.text || '').trim();
    }) : [];
    return list.length ? list : [{ text: '尚未说出口的烦恼', behaviorType: 'B1_LIGHT' }];
  }

  function computeBag() {
    if (!spec || width < 2 || height < 2) return null;
    const bagLevel = clamp(Math.round(spec.bag || 1), 1, 3);
    const rx = width * BAG_WIDTH[bagLevel] * 0.5;
    const ry = height * BAG_HEIGHT[bagLevel] * 0.5;
    return {
      level: bagLevel,
      cx: width * 0.5,
      cy: height * 0.56,
      rx: rx,
      ry: ry,
      top: height * 0.56 - ry,
      bottom: height * 0.56 + ry
    };
  }

  /* ─────────────────────────────────────────────────────────────
     5.3 软体袋
     把袋子压成单位圆的归一化空间：p = ((x−cx)/rx, (y−cy)/ry)。
     袋壁在这个空间里是一条极坐标曲线 R(φ) = 1 + rest(φ) + u(φ) + swell，
     其中只有 u 是动力学量。这个表示法有两个好处：
       · 容纳判定仍然是 O(1)——查一次 u 的插值就行，不用做多边形求交；
       · 形变天然是「相对袋子本身」的，换分辨率、换袋子档位都不用重算。
     ───────────────────────────────────────────────────────────── */

  function nodeAngle(index) {
    return -Math.PI + (index / NODE_COUNT) * Math.PI * 2;
  }

  function angleDelta(a, b) {
    let d = a - b;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  /** 静止形状：底部下坠 + 扎口处收腰。只跟角度有关，整个生命周期建一次。 */
  function buildWallRest() {
    if (wallReady) return;
    const denom = 2 * MOUTH_ANGLE * MOUTH_ANGLE;
    for (let i = 0; i < NODE_COUNT; i += 1) {
      const phi = nodeAngle(i);
      const d = angleDelta(phi, MOUTH_PHI);
      wallRest[i] = BAG_SAG * Math.sin(phi) - BAG_NECK_PINCH * Math.exp(-(d * d) / denom);
    }
    wallReady = true;
  }

  function resetWall() {
    wallU.fill(0);
    wallV.fill(0);
    wallF.fill(0);
    mouthOpen = 0;
    mouthForced = false;
    tieRecoil = 0;
  }

  /** 归一化空间里 φ 方向的袋壁半径。swell 是拥挤度带来的整体鼓胀。 */
  function wallRadiusAt(phi) {
    buildWallRest();
    const t = (phi + Math.PI) / (Math.PI * 2) * NODE_COUNT;
    let i0 = Math.floor(t);
    const frac = t - i0;
    i0 = ((i0 % NODE_COUNT) + NODE_COUNT) % NODE_COUNT;
    const i1 = (i0 + 1) % NODE_COUNT;
    const dev = (wallRest[i0] + wallU[i0]) * (1 - frac) + (wallRest[i1] + wallU[i1]) * frac;
    return 1 + dev + pressure * BAG_VISUAL_STRETCH;
  }

  function wallPoint(phi) {
    const rad = wallRadiusAt(phi);
    return {
      x: bag.cx + Math.cos(phi) * rad * bag.rx,
      y: bag.cy + Math.sin(phi) * rad * bag.ry
    };
  }

  // 复用的查询结果。调用方只能立即读取，不得持有——避免每帧上千次小对象分配。
  const wallQuery = { d: 0, ux: 0, uy: -1, phi: MOUTH_PHI, limit: 1, pxPerUnit: 1 };

  /**
   * 查询某点相对袋壁的位置。limit 是该方向上圆心可以到达的最大归一化半径，
   * 已经扣掉泡泡半径与接触间隙。半径要按方向换算：椭圆是各向异性的，
   * 同样的像素长度在不同方向上占的归一化长度不一样。
   */
  function queryWall(px, py, radiusPx) {
    const d = Math.hypot(px, py);
    const ux = d > 1e-6 ? px / d : 0;
    const uy = d > 1e-6 ? py / d : -1;
    const phi = Math.atan2(uy, ux);
    const pxPerUnit = Math.max(1, Math.hypot(ux * bag.rx, uy * bag.ry));
    const inset = ((Number(radiusPx) || 0) + COLLISION_GAP) / pxPerUnit;
    wallQuery.d = d;
    wallQuery.ux = ux;
    wallQuery.uy = uy;
    wallQuery.phi = phi;
    wallQuery.pxPerUnit = pxPerUnit;
    wallQuery.limit = Math.max(0.10, wallRadiusAt(phi) - inset);
    return wallQuery;
  }

  /** 以 φ 为中心把量摊到五个质点上，避免单点尖刺让张力项去救。 */
  const DEPOSIT_KERNEL = [0.10, 0.20, 0.40, 0.20, 0.10];
  function depositWall(target, phi, amount) {
    if (!amount) return;
    const center = Math.round((phi + Math.PI) / (Math.PI * 2) * NODE_COUNT);
    for (let k = 0; k < 5; k += 1) {
      const index = (((center + k - 2) % NODE_COUNT) + NODE_COUNT) % NODE_COUNT;
      target[index] += amount * DEPOSIT_KERNEL[k];
    }
  }

  /** 撞击是冲量（直接改速度，与 dt 无关）；接触是力（进加速度，随 dt 积分）。 */
  function depositWallImpulse(phi, normalSpeed, bubbleRadius) {
    const mass = (bubbleRadius * bubbleRadius) / (RADIUS_MAX * RADIUS_MAX);
    depositWall(wallV, phi, normalSpeed * mass * BAG_IMPULSE);
  }

  function updateWall(dt) {
    if (!bag) return;
    buildWallRest();

    // prefers-reduced-motion：不做形变振荡，让袋壁平滑回到静止形状。
    // 拥挤带来的整体鼓胀由 swell 承担，所以袋子仍然「会随压力变化」，只是不抖。
    if (reducedMotion) {
      const relax = Math.min(1, dt * 4);
      for (let i = 0; i < NODE_COUNT; i += 1) {
        wallU[i] -= wallU[i] * relax;
        wallV[i] = 0;
      }
      wallF.fill(0);
      return;
    }

    // 接触压力：靠在壁上的泡泡持续把壁顶出去。少了这一路，泡泡一安定
    // 袋子就静止了，看着像个硬壳而不是装着东西的软袋。
    for (let i = 0; i < bubbles.length; i += 1) {
      const bubble = bubbles[i];
      if (!isPhysicalBubble(bubble)) continue;
      const px = (bubble.x - bag.cx) / bag.rx;
      const py = (bubble.y - bag.cy) / bag.ry;
      const d = Math.hypot(px, py);
      if (d < BAG_CONTACT_BAND) continue;
      const mass = (bubble.r * bubble.r) / (RADIUS_MAX * RADIUS_MAX);
      const depth = (d - BAG_CONTACT_BAND) / Math.max(0.01, 1 - BAG_CONTACT_BAND);
      depositWall(wallF, Math.atan2(py, px), depth * BAG_CONTACT * mass);
    }

    const h = dt / BAG_SUBSTEPS;
    for (let step = 0; step < BAG_SUBSTEPS; step += 1) {
      for (let i = 0; i < NODE_COUNT; i += 1) {
        const prev = wallU[(i - 1 + NODE_COUNT) % NODE_COUNT];
        const next = wallU[(i + 1) % NODE_COUNT];
        const accel = -BAG_K * wallU[i] - BAG_C * wallV[i] +
          BAG_T * (prev + next - 2 * wallU[i]) + wallF[i];
        wallV[i] += accel * h;
      }
      for (let i = 0; i < NODE_COUNT; i += 1) wallU[i] += wallV[i] * h;
    }

    // 塑料袋几乎不拉伸：压制零阶模，让某处鼓出去必然导致别处瘪进来。
    let mean = 0;
    for (let i = 0; i < NODE_COUNT; i += 1) mean += wallU[i];
    mean /= NODE_COUNT;
    const correction = BAG_AREA_KEEP * mean;
    for (let i = 0; i < NODE_COUNT; i += 1) {
      wallU[i] = clamp(wallU[i] - correction, -BAG_MAX_DENT, BAG_MAX_BULGE);
    }
    wallF.fill(0);
  }

  /* ─────────────────────────────────────────────────────────────
     5.4 扎口
     口子扎在袋子正上方。松紧由拥挤度驱动：packing 越过 PRESSURE_WARN
     开始变松，到 PRESSURE_CRITICAL 基本全松。逃逸档决定它一开始扎得多紧。
     每挤出去一颗泡泡，扎口被瞬时撑开一下（tieRecoil）再回弹——所以
     一旦开始漏，后面就越漏越快，这个正反馈是有意的。
     ───────────────────────────────────────────────────────────── */

  function mouthTarget() {
    if (mouthForced) return 1;
    const escapeGrade = clamp(Math.round((spec && spec.escape) || 1), 1, 3);
    const loose = 0.20 * (escapeGrade - 1);
    const span = Math.max(0.01, PRESSURE_CRITICAL - PRESSURE_WARN);
    const packOpen = clamp((stats.packing - PRESSURE_WARN) / span, 0, 1);
    return clamp(loose + packOpen * (0.86 - loose * 0.5), 0, 1);
  }

  function updateMouth(dt) {
    tieRecoil = Math.max(0, tieRecoil - dt * TIE_RECOIL_DECAY);
    const target = clamp(mouthTarget() + tieRecoil, 0, 1);
    mouthOpen += (target - mouthOpen) * Math.min(1, dt * MOUTH_EASE);
    stats.mouthOpen = mouthOpen;
  }

  /**
   * 扎口的几何：颈根、扎点、口子半宽。
   * tieY 有一条画布顶部的限位：1366×768 上方的烦恼列表能占到三行，
   * 不限位的话扎口和耳朵会顶进那块文字里。限位只在窄屏生效，1920 上不咬。
   */
  function mouthGeometry() {
    const left = wallPoint(MOUTH_PHI - MOUTH_ANGLE);
    const right = wallPoint(MOUTH_PHI + MOUTH_ANGLE);
    const baseY = (left.y + right.y) * 0.5;
    const ceiling = height * 0.24;
    const neck = Math.max(0, Math.min(bag.ry * NECK_HEIGHT, baseY - ceiling));
    return {
      left: left,
      right: right,
      cx: bag.cx,
      baseY: baseY,
      neck: neck,
      tieY: baseY - neck,
      halfW: (TIE_WIDTH_MIN + (TIE_WIDTH_MAX - TIE_WIDTH_MIN) * mouthOpen) * bag.rx
    };
  }

  function resize() {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;
    const old = bag;
    width = rect.width;
    height = rect.height;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    bag = computeBag();
    if (old && bag) {
      bubbles.forEach(function (bubble) {
        bubble.x = bag.cx + (bubble.x - old.cx) / Math.max(1, old.rx) * bag.rx;
        bubble.y = bag.cy + (bubble.y - old.cy) / Math.max(1, old.ry) * bag.ry;
      });
      collisionEvents = 0;
      resolveBubbleCollisions();
    }
  }

  function mount(nextCanvas) {
    if (!(nextCanvas instanceof HTMLCanvasElement)) {
      throw new Error('LevelGame.mount 需要有效的 canvas。');
    }
    detach();
    canvas = nextCanvas;
    resize();
    ensureFilmSprites();
    pointerHandler = function (event) {
      if (!gameplay || !canvas) return;
      const rect = canvas.getBoundingClientRect();
      hitBubble(event.clientX - rect.left, event.clientY - rect.top);
    };
    canvas.addEventListener('pointerdown', pointerHandler);
    if ('ResizeObserver' in window) {
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(canvas);
    }
  }

  function detach() {
    if (canvas && pointerHandler) canvas.removeEventListener('pointerdown', pointerHandler);
    if (resizeObserver) resizeObserver.disconnect();
    resizeObserver = null;
    pointerHandler = null;
    canvas = null;
    ctx = null;
  }

  function start(options) {
    const opts = options || {};
    stop();
    spec = Object.assign({}, opts.spec || {});
    profiles = normalizeProfiles(opts.worries);
    callbacks = opts.callbacks || {};
    stats = freshStats();
    bubbles.length = 0;
    particles.length = 0;
    spawnElapsed = 0;
    timeLeftMs = Math.max(1, Number(spec.duration) || 45) * 1000;
    finishDelay = 0;
    finishCallback = null;
    statusPulse = 0;
    pressure = 0;
    pressureStage = 0;
    collisionEvents = 0;
    growthBlockedRatio = 0;
    nextId = 1;
    profileCursor = 0;
    resetWall();
    farewell = null;
    reducedMotion = prefersReducedMotion();
    mount(opts.canvas || canvas);
    bag = computeBag();
    gameplay = true;
    running = true;

    const initialCounts = LEVEL_TUNING.LEVEL_GAME_INITIAL_COUNT || { 1: 6, 2: 8, 3: 12 };
    const initial = Math.min(Number(spec.target) || 36, Number(initialCounts[spec.level]) || 6);
    for (let i = 0; i < initial; i += 1) spawnBubble(true, true);
    notifyTime();
    notifyStats();
    lastTime = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    gameplay = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  function destroy() {
    stop();
    detach();
    bubbles.length = 0;
    particles.length = 0;
    callbacks = {};
    profiles = [];
    spec = null;
    bag = null;
    // 精灵和分辨率、关卡都无关，重挂载时不用重烘；只在整局销毁时放掉这 8MB。
    filmSprites = null;
    filmSpritesWarn = null;
    filmGeometry = null;
    pressure = 0;
    pressureStage = 0;
    collisionEvents = 0;
    growthBlockedRatio = 0;
    resetWall();
    farewell = null;
    stats = freshStats();
    profileCursor = 0;
  }

  function frame(now) {
    if (!running || !ctx || !canvas) return;
    const dt = Math.min(0.034, Math.max(0.001, (now - lastTime) / 1000));
    lastTime = now;
    // 每帧查一次就够。原来在 drawBubble 里逐颗查 matchMedia，满员时一帧 60 次。
    reducedMotion = prefersReducedMotion();
    update(dt);
    draw(now / 1000);
    raf = requestAnimationFrame(frame);
  }

  function activeNormalCount() {
    return bubbles.filter(function (bubble) { return bubble.state === 'normal'; }).length;
  }

  function isPhysicalBubble(bubble) {
    // 5.4：排队等着挤出去的泡泡仍然是刚体，会在口子底下互相推挤；
    // 一旦开始挤过扎口就交给动画接管，不再参与碰撞，否则会被挤回袋里。
    if (!bubble) return false;
    if (bubble.state === 'normal') return true;
    return bubble.state === 'escaping' && bubble.escapePhase === 'approach';
  }

  function insideBagAt(x, y, radius) {
    if (!bag) return false;
    const query = queryWall((x - bag.cx) / bag.rx, (y - bag.cy) / bag.ry, radius);
    return query.d <= query.limit;
  }

  function clearanceAt(x, y, radius) {
    let clearance = Infinity;
    for (let i = 0; i < bubbles.length; i += 1) {
      const other = bubbles[i];
      if (!isPhysicalBubble(other)) continue;
      const gap = Math.hypot(x - other.x, y - other.y) - radius - other.r - COLLISION_GAP;
      clearance = Math.min(clearance, gap);
      if (clearance < 0) return clearance;
    }
    return clearance;
  }

  /**
   * 在袋内寻找真正空闲的位置。找不到就暂缓生成，绝不把新泡泡叠在旧泡泡上。
   * 已经很挤时，反复失败的生成请求会计入隐藏压力，推动袋壁绷紧的反馈。
   */
  function findSpawnPosition(radius) {
    let best = null;
    let bestClearance = -Infinity;
    for (let attempt = 0; attempt < SPAWN_SEARCH_ATTEMPTS; attempt += 1) {
      const angle = random(0, Math.PI * 2);
      const radial = Math.sqrt(Math.random()) * 0.82 * wallRadiusAt(angle);
      const x = bag.cx + Math.cos(angle) * bag.rx * radial;
      const y = bag.cy + Math.sin(angle) * bag.ry * radial;
      if (!insideBagAt(x, y, radius)) continue;
      const clearance = clearanceAt(x, y, radius);
      if (clearance >= 0) return { x: x, y: y };
      if (clearance > bestClearance) {
        bestClearance = clearance;
        best = { x: x, y: y };
      }
    }
    // best 只用于判断拥挤程度，不作为生成位置；使用它仍会造成穿透。
    return null;
  }

  /**
   * 膨胀也必须遵守刚体规则：没有空间时停止变大并转化为袋内压力，
   * 不能靠把两个圆画到一起制造“拥挤”。
   */
  function growthLimitFor(bubble, desiredRadius) {
    let limit = Math.max(bubble.r, desiredRadius);
    for (let i = 0; i < bubbles.length; i += 1) {
      const other = bubbles[i];
      if (other === bubble || !isPhysicalBubble(other)) continue;
      const available = Math.hypot(bubble.x - other.x, bubble.y - other.y) - other.r - COLLISION_GAP;
      limit = Math.min(limit, Math.max(bubble.r, available));
    }

    if (!insideBagAt(bubble.x, bubble.y, limit)) {
      let low = bubble.r;
      let high = limit;
      for (let pass = 0; pass < 9; pass += 1) {
        const mid = (low + high) * 0.5;
        if (insideBagAt(bubble.x, bubble.y, mid)) low = mid;
        else high = mid;
      }
      limit = low;
    }
    return clamp(limit, bubble.r, desiredRadius);
  }

  function spawnBubble(countTowardTarget, quiet) {
    if (!bag || !spec) return null;
    if (countTowardTarget && stats.totalSpawned >= spec.target) return null;
    const profile = profiles[profileCursor % profiles.length];
    const radius = random(RADIUS_MIN, RADIUS_MAX);
    const position = findSpawnPosition(radius);
    if (!position) {
      stats.blockedSpawns += 1;
      statusPulse = 1;
      notifyStats();
      return null;
    }
    const angle = random(0, Math.PI * 2);
    const speedRange = effectiveSpeedRange();
    const speed = random(speedRange[0], speedRange[1]);
    const bubble = {
      id: nextId++,
      text: String(profile.text || '烦恼'),
      x: position.x,
      y: position.y,
      r: radius,
      baseR: radius,
      vx: Math.cos(angle + random(-1.1, 1.1)) * speed,
      vy: Math.sin(angle + random(-1.1, 1.1)) * speed,
      age: 0,
      edgeHits: 0,
      edgeCooldown: 0,
      edgeGlow: 0,
      state: 'normal',
      stateTime: 0,
      scale: quiet ? 0.64 : 0.42,
      opacity: 0.82,
      counted: Boolean(countTowardTarget),
      phase: random(0, Math.PI * 2)
    };
    bubbles.push(bubble);
    profileCursor += 1;
    if (countTowardTarget) stats.totalSpawned += 1;
    notifyStats();
    return bubble;
  }

  function update(dt) {
    if (!bag) return;
    if (farewell) updateFarewell(dt);
    if (gameplay) {
      timeLeftMs = Math.max(0, timeLeftMs - dt * 1000);
      stats.elapsedMs += dt * 1000;
      spawnElapsed += dt * 1000;
      const interval = SPAWN_INTERVAL[clamp(Math.round(spec.spawn || 1), 1, 3)];
      const finalStop = spec.level === 3 && timeLeftMs <= 4200;
      let spawnPasses = 0;
      while (!finalStop && stats.totalSpawned < spec.target && spawnElapsed >= interval && spawnPasses < 4) {
        spawnElapsed -= interval;
        spawnPasses += 1;
        if (!spawnBubble(true, false)) {
          // 袋内没有无重叠空位时很快重试，但不会一帧内反复堆叠。
          spawnElapsed = Math.min(spawnElapsed, interval * 0.72);
          break;
        }
      }
      notifyTime();
    }

    let growingCount = 0;
    let growthBlockedCount = 0;
    for (let i = bubbles.length - 1; i >= 0; i -= 1) {
      const bubble = bubbles[i];
      bubble.stateTime += dt;
      bubble.edgeCooldown = Math.max(0, (bubble.edgeCooldown || 0) - dt);
      bubble.edgeGlow = Math.max(0, bubble.edgeGlow - dt * 1.8);

      if (bubble.state === 'manual' || bubble.state === 'button-clear') {
        const speed = bubble.state === 'manual' ? 4.8 : 3.2;
        bubble.scale = Math.max(0, bubble.scale - dt * speed);
        bubble.opacity = Math.max(0, bubble.opacity - dt * speed * 0.8);
        if (bubble.scale <= 0.02) bubbles.splice(i, 1);
        continue;
      }

      if (bubble.state === 'escaping') {
        updateEscape(bubble, dt);
        if (bubble.escapePhase === 'gone') bubbles.splice(i, 1);
        continue;
      }

      // 结局1：松开手之后的漂离。不参与碰撞、不再受袋壁约束——
      // 此时袋子本身也已经在缩小让位，两者是同一件事的两面。
      if (bubble.state === 'drifting') {
        updateDrift(bubble, dt);
        if (bubble.opacity <= 0.01 || bubble.y + bubble.r * bubble.scale < -40) {
          bubbles.splice(i, 1);
        }
        continue;
      }

      if (bubble.state === 'bursting') {
        if (bubble.stateTime < (bubble.burstDelay || 0)) continue;
        if (!bubble.burstStarted) {
          bubble.burstStarted = true;
          emitParticles(bubble.x, bubble.y,
            bubble.burstAutomatic ? '#F5654F' : PARTICLE_COLOR, 13);
        }
        bubble.scale += dt * 1.9;
        bubble.opacity = Math.max(0, bubble.opacity - dt * 2.5);
        if (bubble.opacity <= 0.02) bubbles.splice(i, 1);
        continue;
      }

      bubble.age += dt;
      bubble.scale += (1 - bubble.scale) * Math.min(1, dt * 6.5);
      growingCount += 1;
      const wantedRadius = Math.min(RADIUS_CAP, bubble.r + effectiveGrowthRate() * dt);
      const allowedRadius = growthLimitFor(bubble, wantedRadius);
      if (wantedRadius - allowedRadius > 0.04) growthBlockedCount += 1;
      bubble.r = allowedRadius;
      bubble.x += bubble.vx * dt;
      bubble.y += bubble.vy * dt;
      // 轻微浮力让高逃逸档更频繁撞向上沿薄弱区，而不是凭空穿过侧壁。
      bubble.vy -= Number(spec.escape || 1) * levelIntensity() * 2.8 * dt;
      bubble.y += Math.sin(bubble.age * 1.7 + bubble.phase) * dt * 3.2;
      constrainBubble(bubble);
    }

    growthBlockedRatio = growingCount ? growthBlockedCount / growingCount : 0;
    stats.growthBlocked = growthBlockedCount;
    stats.peakGrowthBlocked = Math.max(stats.peakGrowthBlocked, growthBlockedCount);

    collisionEvents = 0;
    resolveBubbleCollisions();
    updatePressure(dt);
    // 顺序有讲究：碰撞解算完，本帧的撞击冲量才齐；扎口松紧要等 packing 更新完。
    updateWall(dt);
    updateMouth(dt);
    updateParticles(dt);
    stats.remaining = activeNormalCount();
    notifyStats();

    if (finishDelay > 0) {
      finishDelay -= dt * 1000;
      if (finishDelay <= 0 && finishCallback) {
        const callback = finishCallback;
        finishCallback = null;
        callback(getStats());
      }
    }

    if (gameplay && stats.totalSpawned >= spec.target &&
        stats.manualCleared >= spec.target && stats.escaped === 0 && stats.autoBurst === 0) {
      gameplay = false;
      if (typeof callbacks.onManualComplete === 'function') callbacks.onManualComplete(getStats());
    } else if (gameplay && timeLeftMs <= 0) {
      gameplay = false;
      if (typeof callbacks.onTimeout === 'function') callbacks.onTimeout(getStats());
    }
  }

  function constrainBubble(bubble) {
    const query = queryWall((bubble.x - bag.cx) / bag.rx, (bubble.y - bag.cy) / bag.ry, bubble.r);
    if (query.d < query.limit) return;

    const normalX = query.ux;
    const normalY = query.uy;
    const phi = query.phi;
    const limit = query.limit;
    if (bubble.edgeCooldown <= 0) {
      bubble.edgeHits += 1;
      bubble.edgeCooldown = 0.18;
    }
    bubble.edgeGlow = 1;
    const dot = bubble.vx * normalX + bubble.vy * normalY;
    // 5.3：撞墙的法向速度就是打给袋壁的冲量。袋子的形变因此跟的是
    // 「泡泡撞得多急」，而不是「袋里有几颗」——后者只通过 swell 起作用。
    if (dot > 0) depositWallImpulse(phi, dot, bubble.r);

    const requiredHits = Math.max(1, 5 - Math.round(spec.escape || 1) -
      (Math.round(spec.bag || 1) - 1) - (Math.round(spec.level || 1) - 1));
    const minimumAge = effectiveEscapeMinAge();
    const oldEnough = bubble.age >= minimumAge;
    // 5.4：唯一的出口是上方的扎口，而且必须先松到 MOUTH_ESCAPE_MIN。
    // 逃逸档越高，同样的松紧就越容易漏。侧壁和袋底永远只能反弹。
    const atMouth = Math.abs(angleDelta(phi, MOUTH_PHI)) < MOUTH_ANGLE;
    const escapeGrade = clamp(Math.round(spec.escape || 1), 1, 3);
    const openEnough = mouthOpen >= MOUTH_ESCAPE_MIN * (1 - 0.22 * (escapeGrade - 1));
    if (atMouth && openEnough && bubble.edgeHits >= requiredHits && oldEnough) {
      startEscape(bubble, false, 0);
      return;
    }

    bubble.x = bag.cx + normalX * limit * 0.998 * bag.rx;
    bubble.y = bag.cy + normalY * limit * 0.998 * bag.ry;
    if (dot > 0) {
      bubble.vx -= (1 + BOUNDARY_RESTITUTION) * dot * normalX;
      bubble.vy -= (1 + BOUNDARY_RESTITUTION) * dot * normalY;
    }
    limitBubbleSpeed(bubble);
  }

  function projectInsideBag(bubble) {
    if (!bag || !isPhysicalBubble(bubble)) return;
    const query = queryWall((bubble.x - bag.cx) / bag.rx, (bubble.y - bag.cy) / bag.ry, bubble.r);
    if (query.d <= query.limit) return;
    bubble.x = bag.cx + query.ux * query.limit * 0.998 * bag.rx;
    bubble.y = bag.cy + query.uy * query.limit * 0.998 * bag.ry;
  }

  function limitBubbleSpeed(bubble) {
    const range = effectiveSpeedRange();
    const maxSpeed = Number(range[1]) * 1.34;
    const speed = Math.hypot(bubble.vx, bubble.vy);
    if (speed <= maxSpeed || speed < 0.001) return;
    bubble.vx = bubble.vx / speed * maxSpeed;
    bubble.vy = bubble.vy / speed * maxSpeed;
  }

  /**
   * 分离一对圆形刚体并交换法向速度。位置修正使用半径平方作为质量，
   * 所以大泡泡不会被小泡泡轻易推飞；返回 true 表示本轮发生接触。
   */
  function resolvePair(a, b) {
    if (!a || !b) return false;
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    let distance = Math.hypot(dx, dy);
    if (distance < 0.0001) {
      const angle = ((a.id || 1) * 2.399 + (b.id || 2) * 0.71) % (Math.PI * 2);
      dx = Math.cos(angle) * 0.001;
      dy = Math.sin(angle) * 0.001;
      distance = 0.001;
    }
    const minDistance = a.r + b.r + COLLISION_GAP;
    if (distance >= minDistance) return false;

    const nx = dx / distance;
    const ny = dy / distance;
    const penetration = minDistance - distance;
    const massA = Math.max(1, a.r * a.r);
    const massB = Math.max(1, b.r * b.r);
    const invA = 1 / massA;
    const invB = 1 / massB;
    const invTotal = invA + invB;
    const moveA = penetration * invA / invTotal;
    const moveB = penetration * invB / invTotal;
    a.x -= nx * moveA;
    a.y -= ny * moveA;
    b.x += nx * moveB;
    b.y += ny * moveB;

    const rvx = b.vx - a.vx;
    const rvy = b.vy - a.vy;
    const velocityAlongNormal = rvx * nx + rvy * ny;
    if (velocityAlongNormal < 0) {
      const impulse = -(1 + COLLISION_RESTITUTION) * velocityAlongNormal / invTotal;
      a.vx -= impulse * invA * nx;
      a.vy -= impulse * invA * ny;
      b.vx += impulse * invB * nx;
      b.vy += impulse * invB * ny;
    }
    return true;
  }

  function resolveBubbleCollisions() {
    for (let pass = 0; pass < COLLISION_ITERATIONS; pass += 1) {
      let touched = false;
      for (let i = 0; i < bubbles.length; i += 1) {
        const a = bubbles[i];
        if (!isPhysicalBubble(a)) continue;
        for (let j = i + 1; j < bubbles.length; j += 1) {
          const b = bubbles[j];
          if (!isPhysicalBubble(b)) continue;
          if (!resolvePair(a, b)) continue;
          touched = true;
          collisionEvents += 1;
          a.edgeGlow = Math.max(a.edgeGlow, 0.16);
          b.edgeGlow = Math.max(b.edgeGlow, 0.16);
        }
      }
      bubbles.forEach(projectInsideBag);
      if (!touched) break;
    }
    bubbles.forEach(function (bubble) {
      if (isPhysicalBubble(bubble)) limitBubbleSpeed(bubble);
    });
  }

  function updatePressure(dt) {
    if (!bag) return;
    let bubbleArea = 0;
    let count = 0;
    bubbles.forEach(function (bubble) {
      if (bubble.state !== 'normal') return;
      bubbleArea += Math.PI * bubble.r * bubble.r;
      count += 1;
    });
    const usableArea = Math.PI * bag.rx * bag.ry * 0.78;
    const packing = usableArea > 0 ? bubbleArea / usableArea : 0;
    const areaPressure = clamp((packing - PRESSURE_WARN) /
      Math.max(0.01, PRESSURE_CRITICAL - PRESSURE_WARN), 0, 1);
    const collisionPressure = count > 1
      ? clamp(collisionEvents / Math.max(6, count * 1.65), 0, 1)
      : 0;
    const blockedPressure = clamp(stats.blockedSpawns / 18, 0, 1);
    const targetPressure = clamp(areaPressure * 0.62 + collisionPressure * 0.16 +
      blockedPressure * 0.14 + growthBlockedRatio * 0.28, 0, 1);
    pressure += (targetPressure - pressure) * Math.min(1, dt * 5.2);

    stats.packing = packing;
    stats.pressure = pressure;
    stats.peakPressure = Math.max(stats.peakPressure, pressure);
    stats.collisionEvents += collisionEvents;

    const nextStage = packing >= PRESSURE_CRITICAL ? 3
      : packing >= PRESSURE_DANGER ? 2
        : packing >= PRESSURE_WARN ? 1 : 0;
    if (nextStage !== pressureStage) {
      pressureStage = nextStage;
      if (typeof callbacks.onPressure === 'function') callbacks.onPressure(nextStage, getStats());
    }
  }

  function startEscape(bubble, forced, waitSec) {
    if (!bubble || bubble.state !== 'normal') return;
    bubble.state = 'escaping';
    bubble.stateTime = 0;
    // 5.4：不再直接甩出去。先游到扎口下方排队，再挤过口子，最后弹回球形飘走。
    bubble.escapePhase = 'approach';
    bubble.escapeT = 0;
    bubble.escapeWait = Math.max(0, Number(waitSec) || 0);
    bubble.escapeForced = Boolean(forced);
    bubble.squeeze = 0;
    bubble.squeezeAngle = 0;
    bubble.vx *= 0.35;
    bubble.vy *= 0.35;
    if (forced) mouthForced = true;
    stats.escaped += 1;
    statusPulse = 1;
    if (typeof callbacks.onEscape === 'function') callbacks.onEscape(getStats());
  }

  /** reduced-motion 下整套逃逸压到 45%，形变也归零，但流程一步不少。 */
  function escapeTiming() {
    const factor = reducedMotion ? 0.45 : 1;
    return { squeeze: SQUEEZE_MS * factor / 1000, release: RELEASE_MS * factor / 1000 };
  }

  /**
   * 逃逸三段。approach 段仍是刚体，会和其他排队的泡泡互相推挤；
   * squeeze 段交给动画，沿颈部直线上行并被扎口压扁；free 段弹回球形，
   * 带一点超调，然后靠浮力飘出画面。
   */
  function updateEscape(bubble, dt) {
    const timing = escapeTiming();
    const mouth = mouthGeometry();
    bubble.escapeT += dt;

    if (bubble.escapePhase === 'approach') {
      const targetX = mouth.cx;
      const targetY = mouth.baseY + bubble.r * 0.35;
      const dx = targetX - bubble.x;
      const dy = targetY - bubble.y;
      const distance = Math.hypot(dx, dy);
      // 向口子的定向牵引：越接近越慢，避免冲过头再被拉回来。
      const pull = 340 * Math.min(1, distance / Math.max(1, bag.ry * 0.5));
      if (distance > 0.001) {
        bubble.vx += (dx / distance * pull - bubble.vx) * Math.min(1, dt * 2.6);
        bubble.vy += (dy / distance * pull - bubble.vy) * Math.min(1, dt * 2.6);
      }
      bubble.x += bubble.vx * dt;
      bubble.y += bubble.vy * dt;
      projectInsideBag(bubble);
      const ready = bubble.escapeT >= bubble.escapeWait;
      if (ready && distance < bubble.r * 1.15) {
        bubble.escapePhase = 'squeeze';
        bubble.escapeT = 0;
        bubble.squeezeFromX = bubble.x;
        bubble.squeezeFromY = bubble.y;
        bubble.vx = 0;
        bubble.vy = 0;
      }
      return;
    }

    if (bubble.escapePhase === 'squeeze') {
      const k = clamp(bubble.escapeT / Math.max(0.001, timing.squeeze), 0, 1);
      const ease = k * k * (3 - 2 * k);
      const exitY = mouth.tieY - bubble.r * 0.85;
      bubble.x = bubble.squeezeFromX + (mouth.cx - bubble.squeezeFromX) * ease;
      bubble.y = bubble.squeezeFromY + (exitY - bubble.squeezeFromY) * ease;
      // 正穿过扎口那一刻压得最狠：横向被口子勒住，纵向被挤长。
      bubble.squeeze = reducedMotion ? 0 : Math.sin(Math.PI * k);
      bubble.squeezeAngle = 0;
      // 泡泡挤过去的同时把扎口撑开，这一下也打进袋壁，口子会跟着抖。
      depositWall(wallV, MOUTH_PHI, bubble.squeeze * 0.06 * dt * 60);
      if (k >= 1) {
        bubble.escapePhase = 'free';
        bubble.escapeT = 0;
        tieRecoil = Math.min(1, tieRecoil + TIE_RECOIL);
        const speed = bubble.escapeForced ? random(120, 190) : random(80, 130);
        bubble.vx = random(-46, 46);
        bubble.vy = -speed;
      }
      return;
    }

    // free
    const k = clamp(bubble.escapeT / Math.max(0.001, timing.release), 0, 1);
    // 回弹带超调：先过冲成横向扁一点，再收敛回圆。
    bubble.squeeze = reducedMotion ? 0 : -Math.sin(Math.PI * k) * (1 - k) * 0.55;
    bubble.x += bubble.vx * dt;
    bubble.y += bubble.vy * dt;
    bubble.vy -= 46 * dt;
    bubble.vx += Math.sin(bubble.escapeT * 3.1 + bubble.phase) * 26 * dt;
    bubble.scale += dt * 0.18;
    if (bubble.x < -bubble.r * 3 || bubble.x > width + bubble.r * 3 ||
        bubble.y < -bubble.r * 3 || bubble.y > height + bubble.r * 3) {
      bubble.escapePhase = 'gone';
    }
  }

  /**
   * 结局时让所有泡泡排队从扎口挤出去，而不是同一帧四散飞开。
   * 总排队时长固定，间隔按只数摊——20 颗泡泡配固定间隔会把结局拖到七八秒。
   * 返回整段动画需要的毫秒数，调用方拿它设 finishDelay。
   */
  function queueEscapeSequence(list) {
    if (!list.length) return 700;
    const gap = clamp(QUEUE_TOTAL_MS / list.length, QUEUE_MIN_MS, QUEUE_MAX_MS);
    const sorted = list.slice().sort(function (a, b) {
      return Math.hypot(a.x - bag.cx, a.y - bag.top) - Math.hypot(b.x - bag.cx, b.y - bag.top);
    });
    sorted.forEach(function (bubble, index) {
      startEscape(bubble, true, index * gap / 1000);
    });
    const timing = escapeTiming();
    return gap * (sorted.length - 1) + (timing.squeeze + timing.release) * 1000 + 520;
  }

  function startBurst(bubble, automatic, delay) {
    if (!bubble || bubble.state !== 'normal') return;
    bubble.state = 'bursting';
    bubble.stateTime = 0;
    bubble.burstDelay = Math.max(0, Number(delay) || 0);
    bubble.burstStarted = false;
    bubble.burstAutomatic = Boolean(automatic);
    if (automatic) stats.autoBurst += 1;
    statusPulse = 1;
    if (automatic && typeof callbacks.onAutoBurst === 'function') callbacks.onAutoBurst(getStats());
  }

  function hitBubble(x, y) {
    for (let i = bubbles.length - 1; i >= 0; i -= 1) {
      const bubble = bubbles[i];
      if (bubble.state !== 'normal') continue;
      if (!pointInsideBag(bubble.x, bubble.y, bubble.r * 0.2)) continue;
      if (Math.hypot(x - bubble.x, y - bubble.y) > bubble.r * bubble.scale) continue;
      bubble.state = 'manual';
      bubble.stateTime = 0;
      stats.manualCleared += 1;
      emitParticles(bubble.x, bubble.y, PARTICLE_COLOR, 10);
      if (typeof callbacks.onManualClear === 'function') callbacks.onManualClear(getStats());
      notifyStats();
      return true;
    }
    return false;
  }

  function pointInsideBag(x, y, padding) {
    if (!bag) return false;
    // padding 为正表示往里缩，语义与旧版一致。
    const query = queryWall((x - bag.cx) / bag.rx, (y - bag.cy) / bag.ry, Number(padding) || 0);
    return query.d <= query.limit;
  }

  function triggerButton(options) {
    if (!running || !gameplay) return false;
    const opts = options || {};
    gameplay = false;
    if (opts.failed) {
      const normal = bubbles.filter(function (bubble) { return bubble.state === 'normal'; });
      if (!normal.length) {
        for (let i = 0; i < 7; i += 1) spawnBubble(false, true);
      }
      // 按钮失灵：扎口整个松开，泡泡排队挤出去。finishDelay 由动画时长决定，
      // 不能写死——写死就会出现「还在挤，结局已经切了」。
      mouthForced = true;
      finishDelay = queueEscapeSequence(bubbles.filter(function (bubble) {
        return bubble.state === 'normal';
      }));
    } else {
      bubbles.forEach(function (bubble) {
        if (bubble.state !== 'manual' && bubble.state !== 'button-clear') {
          bubble.state = 'button-clear';
          bubble.stateTime = 0;
          emitParticles(bubble.x, bubble.y, PARTICLE_COLOR, 7);
        }
      });
      finishDelay = 1050;
    }
    finishCallback = typeof opts.onComplete === 'function' ? opts.onComplete : null;
    return true;
  }

  function playOutcome(kind, onComplete) {
    gameplay = false;
    if (kind === 'escape') {
      if (!bubbles.some(function (bubble) { return bubble.state === 'normal'; })) {
        for (let i = 0; i < 8; i += 1) spawnBubble(false, true);
      }
      mouthForced = true;
      finishDelay = queueEscapeSequence(bubbles.filter(function (bubble) {
        return bubble.state === 'normal';
      }));
    } else if (kind === 'burst') {
      if (!bubbles.some(function (bubble) { return bubble.state === 'normal'; })) {
        for (let i = 0; i < 8; i += 1) spawnBubble(false, true);
      }
      const normal = bubbles.filter(function (bubble) { return bubble.state === 'normal'; });
      normal.sort(function (a, b) {
        return Math.hypot(a.x - bag.cx, a.y - bag.cy) - Math.hypot(b.x - bag.cx, b.y - bag.cy);
      });
      normal.forEach(function (bubble, index) {
        // 从麻袋中央向外扩散的连锁爆裂，比同一帧全部消失更能说明“挤压失控”。
        const delay = normal.length > 1 ? index / (normal.length - 1) * 0.72 : 0;
        startBurst(bubble, false, delay);
      });
      finishDelay = 1900;
    } else {
      finishDelay = 700;
    }
    finishCallback = typeof onComplete === 'function' ? onComplete : null;
  }

  /**
   * 结局1「远去」。和 playOutcome('escape') 刻意分开写：
   * 那条是「扎口松了、泡泡排队挤出去」的失控演出，这条是「不再抓着它」——
   * 泡泡自己慢慢离开麻袋、越飘越慢、彼此拉开，麻袋留在原地缩小成线稿。
   *
   * 只改绘制与泡泡运动，不动 computeBag、不动 stats：
   * 玩法此刻已经停了，结局也已经在 GameState 里判完，这里纯粹是收尾画面。
   *
   * @param {{sackTarget?: {cx:number, cy:number, w:number}}} options
   *        sackTarget 是结局页 .ending-sack 的实测位置与宽度（画布坐标系），
   *        由 ending-transition.js 量出来传进来——写死百分比在三档分辨率上会错位。
   */
  function playFarewell(options) {
    if (!bag) return getStats();
    const opts = options || {};
    gameplay = false;
    if (!bubbles.some(function (bubble) { return bubble.state === 'normal'; })) {
      for (let i = 0; i < 7; i += 1) spawnBubble(false, true);
    }
    // 扎口松开，但**不**调 queueEscapeSequence——不排队、不挤压、不加速。
    mouthForced = true;

    const normal = bubbles.filter(function (bubble) { return bubble.state === 'normal'; });
    // 靠近袋口的先走：由上往下依次松手，读起来才是「一点点放开」。
    normal.sort(function (a, b) { return a.y - b.y; });
    normal.forEach(function (bubble, index) {
      bubble.state = 'drifting';
      bubble.stateTime = 0;
      bubble.driftDelay = (FAR.release + index * FAR.stagger) / 1000;
      // 警戒态的红色反光必须在这里清掉：结局1 不是失败结局，
      // 一颗还泛着红的泡泡飘上去，整段情绪就读反了。
      bubble.edgeGlow = 0;
      bubble.edgeCooldown = 0;
      // 初速里带一点朝袋口中线的收拢，泡泡才像是从口子里出来的，
      // 而不是从袋壁四面穿出去。
      bubble.vx = (bag.cx - bubble.x) * FAR.funnel + random(-FAR.spread, FAR.spread);
      bubble.vy = -random(FAR.riseMin, FAR.riseMax);
      bubble.squeeze = 0;
    });

    const target = opts.sackTarget || null;
    farewell = {
      t: 0,
      sack: 0,          // 麻袋位移/缩放进度 0→1
      material: 1,      // 袋身填充、高光、褶子的存量 1→0
      line: 0,          // 米白线稿的显影 0→1
      tint: 0,          // 米白→青蓝 0→1
      handoff: 0,   // 结局页盖上来的进度：canvas 线稿按这个退让 1→0
      popped: false,
      // 破的那颗挑最靠上的：它最先飘出画面上沿，破在半路才看得见。
      popId: normal.length ? normal[0].id : 0,
      targetX: target ? target.cx : width * 0.78,
      targetY: target ? target.cy : height * 0.62,
      // 缩放由「结局页线稿的宽度 ÷ 当前袋子的宽度」直接算出来，
      // 所以三档分辨率上袋子都正好收进线稿里，不用分别调参。
      targetScale: target && target.w
        ? clamp(target.w / Math.max(1, bag.rx * 2), 0.12, 1)
        : 0.46
    };
    return getStats();
  }

  /** 结局1：单颗泡泡的漂离。速度每秒衰减到 drag 倍，所以是越飘越慢。 */
  function updateDrift(bubble, dt) {
    if (bubble.stateTime < bubble.driftDelay) return;
    const decay = Math.pow(FAR.drag, dt);
    bubble.vx *= decay;
    bubble.vy *= decay;
    bubble.x += bubble.vx * dt + Math.sin(bubble.stateTime * 0.8 + bubble.phase) * FAR.sway * dt;
    bubble.y += bubble.vy * dt;
    bubble.r = Math.max(8, bubble.r * (1 - FAR.shrink * dt));
  }

  /** 结局1：麻袋的绘制期变换。绕袋心缩放，再把袋心送到结局页线稿的位置。 */
  function applyFarewellSack() {
    const p = farewell.sack;
    const k = 1 + (farewell.targetScale - 1) * p;
    const cx = bag.cx + (farewell.targetX - bag.cx) * p;
    const cy = bag.cy + (farewell.targetY - bag.cy) * p;
    ctx.translate(cx, cy);
    ctx.scale(k, k);
    ctx.translate(-bag.cx, -bag.cy);
  }

  function updateFarewell(dt) {
    farewell.t += dt * 1000;
    const t = farewell.t;
    farewell.sack = easeOut(clamp((t - FAR.sackStart) / FAR.sackMs, 0, 1));
    // 填充比位移先走完：袋子还在往右挪的时候，已经只剩一根线了。
    farewell.material = 1 - clamp((t - FAR.sackStart) / (FAR.sackMs * 0.72), 0, 1);
    farewell.line = clamp((t - FAR.sackStart - FAR.sackMs * 0.30) / (FAR.sackMs * 0.70), 0, 1);
    farewell.tint = easeOut(clamp((t - FAR.tintStart) / FAR.tintMs, 0, 1));
    // 结局页的 .ending-sack 是同一根米白线，位置也已经对齐；两边同时全亮
    // 会看出双线（一个是 canvas 极坐标块，一个是 border-radius 块）。
    // 所以结局页淡入的同时，canvas 这根线等量退下去，读起来就是「交接」。
    farewell.handoff = clamp((t - FAR.veilStart) / FAR.veilMs, 0, 1);

    if (!farewell.popped && t >= FAR.popAt) {
      farewell.popped = true;
      const victim = bubbles.filter(function (bubble) {
        return bubble.state === 'drifting' && bubble.id === farewell.popId;
      })[0] || bubbles.filter(function (bubble) { return bubble.state === 'drifting'; })[0];
      if (victim) {
        // 肥皂泡的破法：几粒慢碎屑，不用 startBurst（那是会撑大再炸的）。
        emitParticles(victim.x, victim.y, 'rgba(214,232,238,0.85)', FAR.popCount, FAR.popSpeed);
        victim.opacity = 0;
        victim.scale = 0;
      }
    }

    // 全体一起变淡，和背景转青蓝同步——泡泡先淡下去，米白基底才不会
    // 隔着一层烘焙好的暖色反光跟青蓝打架。
    if (t > FAR.fadeStart) {
      const step = dt * 1000 / FAR.fadeMs;
      bubbles.forEach(function (bubble) {
        if (bubble.state === 'drifting') bubble.opacity = Math.max(0, bubble.opacity - step);
      });
    }
  }

  function easeOut(p) { return 1 - Math.pow(1 - p, 3); }

  function emitParticles(x, y, color, count, speedScale) {
    const scale = speedScale === undefined ? 1 : speedScale;
    for (let i = 0; i < count; i += 1) {
      const angle = random(0, Math.PI * 2);
      const speed = random(45, 150) * scale;
      particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: random(0.28, 0.56),
        maxLife: 0.56,
        size: random(1.8, 4.2),
        color: color
      });
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const particle = particles[i];
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= 0.98;
      particle.vy *= 0.98;
      if (particle.life <= 0) particles.splice(i, 1);
    }
  }

  function notifyTime() {
    const seconds = Math.max(0, Math.ceil(timeLeftMs / 1000));
    if (seconds === stats.secondsLeft) return;
    stats.secondsLeft = seconds;
    if (typeof callbacks.onTime === 'function') callbacks.onTime(seconds);
  }

  function notifyStats() {
    stats.remaining = activeNormalCount();
    if (typeof callbacks.onStats === 'function') callbacks.onStats(getStats());
  }

  function getStats() {
    return Object.assign({}, stats, { remaining: activeNormalCount() });
  }

  function draw(time) {
    ctx.clearRect(0, 0, width, height);
    drawAmbient();
    if (farewell) {
      // 结局1：麻袋和扎口一起做绘制期变换（缩小 → 右移 → 变线稿）。
      // 此时没有泡泡在挤扎口了，所以扎口不必再压在泡泡之后。
      ctx.save();
      applyFarewellSack();
      drawSack();
      drawTie();
      ctx.restore();
      bubbles.forEach(function (bubble) { drawBubble(bubble, time); });
    } else {
      drawSack();
      bubbles.forEach(function (bubble) { drawBubble(bubble, time); });
      // 扎口画在泡泡之后：正在挤出去的泡泡是从口子「底下」穿过的，
      // 这样才看得见扎带勒着它，而不是泡泡盖在扎带上面。
      drawTie();
    }
    particles.forEach(drawParticle);
  }

  // 米白空间里的自然光：一束跟着 BUBBLE_LIGHT_ANGLE_DEG 的斜射窗光，
  // 加一点下沉的暖灰。两层都压得很轻（≤0.05），只给空间一个方向感，
  // 不足以改变泡泡精灵烘焙时假设的那个平底色。
  function drawAmbient() {
    const angle = FILM.light * Math.PI / 180;
    const lightX = width * 0.5 - Math.cos(angle) * width * 0.42;
    const lightY = height * 0.5 - Math.sin(angle) * height * 0.55;
    const pool = ctx.createRadialGradient(lightX, lightY, 0, lightX, lightY, Math.max(width, height) * 0.78);
    pool.addColorStop(0, 'rgba(255,250,232,0.50)');
    pool.addColorStop(1, 'rgba(255,250,232,0)');
    ctx.fillStyle = pool;
    ctx.fillRect(0, 0, width, height);

    const vignette = ctx.createLinearGradient(0, height * 0.55, 0, height);
    vignette.addColorStop(0, 'rgba(150,124,88,0)');
    vignette.addColorStop(1, 'rgba(150,124,88,0.10)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);

    // 结局1：米白 → 哆啦A梦青蓝。画在 canvas 上而不是改 --game-bg——
    // 那个变量是泡泡精灵烘焙时的假定底色（见 style.css .game-scene 的注释），
    // 动它会让球面上那圈环境反光和背景脱节。canvas 是透明底，
    // 这里按 tint 叠一层青蓝，正好等于「米白与青蓝按比例混合」。
    if (farewell && farewell.tint > 0) {
      ctx.fillStyle = 'rgba(' + FAR_TEAL_RGB + ',' + farewell.tint.toFixed(4) + ')';
      ctx.fillRect(0, 0, width, height);
    }
  }


  function wrapBubbleText(text, maxWidth, maxLines) {
    const chars = Array.from(String(text || '烦恼').replace(/\s+/g, ' ').trim());
    const lines = [];
    let line = '';
    let cursor = 0;
    while (cursor < chars.length && lines.length < maxLines) {
      const next = line + chars[cursor];
      if (line && ctx.measureText(next).width > maxWidth) {
        lines.push(line);
        line = '';
        continue;
      }
      line = next;
      cursor += 1;
    }
    if (line && lines.length < maxLines) lines.push(line);
    if (cursor < chars.length && lines.length) {
      let last = lines[lines.length - 1];
      while (last && ctx.measureText(last + '…').width > maxWidth) last = last.slice(0, -1);
      lines[lines.length - 1] = (last || chars.slice(0, 2).join('')) + '…';
    }
    return lines.length ? lines : ['烦恼'];
  }

  /* ─────────────────────────────────────────────────────────────
     5.5 塑料膜
     材质是塑料袋不是麻袋，所以没有编织交叉线。四层：
       膜体（极淡的冷色填充）→ 顺光的高光带 → 松弛处的褶皱 → 一圈明暗边。
     褶皱直接由 5.3 的 u 场驱动：被压缩（u<0）的地方才起褶。
     这是整套里最像塑料的一个信号，而且它本身就是物理的结果，不是画上去的贴图。
     ───────────────────────────────────────────────────────────── */

  // 渲染用的取样步长。u 场本身被张力项磨得很平滑，隔一个点取样看不出差别，
  // 但路径段数直接减半——一帧要 fill/clip/stroke 好几遍，段数是要省的。
  const SACK_STRIDE = 2;

  /** 用 Catmull-Rom 穿过袋壁质点，转成三次贝塞尔的闭合路径。 */
  function sackPath() {
    const path = new Path2D();
    const count = Math.floor(NODE_COUNT / SACK_STRIDE);
    const xs = new Array(count);
    const ys = new Array(count);
    for (let i = 0; i < count; i += 1) {
      const phi = nodeAngle(i * SACK_STRIDE);
      const rad = wallRadiusAt(phi);
      xs[i] = bag.cx + Math.cos(phi) * rad * bag.rx;
      ys[i] = bag.cy + Math.sin(phi) * rad * bag.ry;
    }
    path.moveTo(xs[0], ys[0]);
    for (let i = 0; i < count; i += 1) {
      const p0 = (i - 1 + count) % count;
      const p1 = i;
      const p2 = (i + 1) % count;
      const p3 = (i + 2) % count;
      path.bezierCurveTo(
        xs[p1] + (xs[p2] - xs[p0]) / 6, ys[p1] + (ys[p2] - ys[p0]) / 6,
        xs[p2] - (xs[p3] - xs[p1]) / 6, ys[p2] - (ys[p3] - ys[p1]) / 6,
        xs[p2], ys[p2]
      );
    }
    path.closePath();
    return path;
  }

  /** 颈部：从袋肩两侧收拢到扎点。口子越松，收口越宽。 */
  function neckPath(mouth) {
    const path = new Path2D();
    const tieL = mouth.cx - mouth.halfW;
    const tieR = mouth.cx + mouth.halfW;
    const midY = (mouth.baseY + mouth.tieY) * 0.5;
    path.moveTo(mouth.left.x, mouth.left.y);
    path.bezierCurveTo(mouth.left.x, midY, tieL, midY, tieL, mouth.tieY);
    path.lineTo(tieR, mouth.tieY);
    path.bezierCurveTo(tieR, midY, mouth.right.x, midY, mouth.right.x, mouth.right.y);
    path.closePath();
    return path;
  }

  /** 光的屏幕方向。高光带与明暗边都挂在这个方向上，和泡泡用的是同一束光。 */
  function lightVector() {
    const angle = FILM.light * Math.PI / 180;
    return { x: Math.cos(angle), y: Math.sin(angle) };
  }

  function drawFilmBody(path, extraAlpha) {
    ctx.fillStyle = 'rgba(' + FILM_RGB + ',' + (FILM_BODY_A + (extraAlpha || 0)) + ')';
    ctx.fill(path);
  }

  /**
   * 顺着光走的高光带 + 一道背光侧的冷影。塑料和肥皂泡不同，反射是带状的
   * 而不是一个点。米白底上纯白几乎看不见，所以亮带压一点暖、暗带压一点冷，
   * 靠色相差而不是靠明度差把膜读出来。
   */
  function drawSheen() {
    const light = lightVector();
    const span = Math.max(bag.rx, bag.ry) * 1.6;
    const gradient = ctx.createLinearGradient(
      bag.cx - light.x * span, bag.cy - light.y * span,
      bag.cx + light.x * span, bag.cy + light.y * span
    );
    const alpha = SHEEN_A * (1 - pressure * 0.22);
    const warm = function (a) { return 'rgba(255,252,243,' + a.toFixed(4) + ')'; };
    const cool = function (a) { return 'rgba(150,180,196,' + a.toFixed(4) + ')'; };
    gradient.addColorStop(0.00, cool(alpha * 0.34));
    gradient.addColorStop(0.16, cool(alpha * 0.10));
    gradient.addColorStop(0.28, warm(alpha * 0.42));
    gradient.addColorStop(0.34, warm(alpha));
    gradient.addColorStop(0.41, warm(alpha * 0.16));
    gradient.addColorStop(0.52, cool(alpha * 0.26));
    gradient.addColorStop(0.68, warm(alpha * 0.52));
    gradient.addColorStop(0.76, warm(alpha * 0.06));
    gradient.addColorStop(1.00, cool(alpha * 0.40));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  /**
   * 褶皱。塑料袋在松弛处起褶，绷紧处平整，所以取样点的褶皱强度取
   * 该处的压缩量 −min(0,u)。另外给一层很淡的常驻折痕：真实的塑料袋
   * 从来不是完全光滑的，全靠 u 驱动的话袋子安静时会显得像玻璃。
   */
  function drawWrinkles() {
    ctx.lineCap = 'round';
    for (let i = 0; i < WRINKLE_COUNT; i += 1) {
      // 用序号的三角函数当伪随机：每帧一致，不会闪。
      const seed = i * 2.3999632;
      const phi = -Math.PI + (i / WRINKLE_COUNT) * Math.PI * 2 + Math.sin(seed) * 0.09;
      const node = (((Math.round((phi + Math.PI) / (Math.PI * 2) * NODE_COUNT)) % NODE_COUNT) +
        NODE_COUNT) % NODE_COUNT;
      const compression = Math.max(0, -wallU[node]) / Math.max(0.001, BAG_MAX_DENT);
      // 底数不能太低：塑料袋从来不是完全光滑的，全靠 u 驱动的话
      // 袋子安静时会读成一块玻璃。0.55 是「静止时也看得出是张膜」的下限。
      const strength = 0.55 + compression * 0.65;
      const rad = wallRadiusAt(phi);
      const startR = rad * (0.96 - Math.abs(Math.sin(seed * 1.7)) * 0.03);
      const endR = startR - (0.14 + 0.20 * compression) * (0.7 + Math.abs(Math.cos(seed)) * 0.6);
      const sway = Math.sin(seed * 3.1) * 0.10;
      const x0 = bag.cx + Math.cos(phi) * startR * bag.rx;
      const y0 = bag.cy + Math.sin(phi) * startR * bag.ry;
      const x1 = bag.cx + Math.cos(phi + sway) * endR * bag.rx;
      const y1 = bag.cy + Math.sin(phi + sway) * endR * bag.ry;
      const midR = (startR + endR) * 0.5;
      const cx0 = bag.cx + Math.cos(phi + sway * 1.8) * midR * bag.rx;
      const cy0 = bag.cy + Math.sin(phi + sway * 1.8) * midR * bag.ry;
      ctx.strokeStyle = 'rgba(96,124,140,' + (WRINKLE_A * strength).toFixed(4) + ')';
      ctx.lineWidth = 0.8 + compression * 0.7;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo(cx0, cy0, x1, y1);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
  }

  /** 一圈明暗边：迎光那侧亮、背光那侧沉。单次带渐变的 stroke。 */
  function rimStroke() {
    const light = lightVector();
    const span = Math.max(bag.rx, bag.ry);
    const gradient = ctx.createLinearGradient(
      bag.cx - light.x * span, bag.cy - light.y * span,
      bag.cx + light.x * span, bag.cy + light.y * span
    );
    gradient.addColorStop(0, 'rgba(255,255,255,' + (FILM_RIM_A * 0.95).toFixed(4) + ')');
    gradient.addColorStop(0.42, 'rgba(140,172,188,' + (FILM_RIM_A * 0.72).toFixed(4) + ')');
    gradient.addColorStop(1, 'rgba(58,90,108,' + (FILM_RIM_A * 0.80).toFixed(4) + ')');
    return gradient;
  }

  function drawSack() {
    if (!bag) return;
    const path = sackPath();
    const mouth = mouthGeometry();
    const neck = mouth.neck > 6 ? neckPath(mouth) : null;
    // 结局1：袋身的「材质存量」。1 = 正常塑料袋，0 = 只剩一根线。
    const material = farewell ? farewell.material : 1;

    ctx.save();
    if (material > 0.004) {
      ctx.globalAlpha = material;
      drawFilmBody(path, 0);
      if (neck) drawFilmBody(neck, 0.012);

      ctx.save();
      ctx.clip(path);
      drawSheen();
      drawWrinkles();
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    ctx.lineJoin = 'round';
    if (material > 0.004) {
      ctx.globalAlpha = material;
      ctx.strokeStyle = rimStroke();
      ctx.lineWidth = Math.max(1.8, width * 0.0018);
      ctx.stroke(path);
      if (neck) ctx.stroke(neck);
      ctx.globalAlpha = 1;
    }

    // 结局1：米白线稿接手。颜色和 style.css 的 .ending-sack 描边完全一致，
    // 所以交接的那一帧两根线是重合的，看不出换了实现。
    if (farewell && farewell.line > 0) {
      ctx.globalAlpha = farewell.line * (1 - farewell.handoff) * FAR_LINE_A;
      ctx.strokeStyle = 'rgba(' + FAR_LINE_RGB + ',1)';
      // 线宽要抵消掉外层的缩放，否则袋子缩到 0.46 时线也跟着变细一半。
      ctx.lineWidth = Math.max(1.6, width * 0.0022) /
        Math.max(0.2, 1 + (farewell.targetScale - 1) * farewell.sack);
      ctx.stroke(path);
      ctx.globalAlpha = 1;
    }

    // 警戒：袋壁整体透红。首轮直接挂 pressure，结果压力刚过一半就烧成一圈红环，
    // 把材质本身盖掉了。改成只在 pressureStage 已经进警戒之后、按超出量平方上升。
    // 结局1不是失败结局，收尾演出里一律不出现红色警报，所以 farewell 期间整段跳过。
    if (pressureStage > 0 && !farewell) {
      const heat = clamp(pressure, 0, 1) * clamp(pressure, 0, 1);
      ctx.globalAlpha = heat * 0.40;
      ctx.strokeStyle = '#F5654F';
      ctx.lineWidth = 2.5 + heat * 5;
      ctx.shadowColor = 'rgba(217,70,54,0.45)';
      ctx.shadowBlur = 10 + heat * 26;
      ctx.stroke(path);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  /**
   * 5.4 扎口。画在泡泡之后，所以正在挤出去的泡泡是从扎口「底下」穿过的，
   * 能看见口子勒住它。三部分：向下散开的褶子、扎带本身、扎带以上的松口。
   */
  function drawTie() {
    if (!bag) return;
    const mouth = mouthGeometry();
    if (mouth.neck <= 6) return;
    // 结局1：扎口跟着袋身一起淡出。结局页的扎口由 .ending-sack::after 接手，
    // 两边都留着会看见两个口子。
    const material = farewell ? farewell.material : 1;
    if (material <= 0.004) return;
    const open = clamp(mouthOpen, 0, 1);
    const tieL = mouth.cx - mouth.halfW;
    const tieR = mouth.cx + mouth.halfW;

    ctx.save();
    ctx.globalAlpha = material;
    ctx.lineCap = 'round';

    // 收拢的褶子：口子越松，褶子越向两侧散开、越浅。
    // 底端落在袋肩之间而不是自己外推——外推会跑到袋壁外面去。
    const pleats = 5;
    ctx.strokeStyle = 'rgba(96,124,140,' + (0.26 - open * 0.10).toFixed(4) + ')';
    ctx.lineWidth = 1;
    for (let i = 0; i < pleats; i += 1) {
      const t = pleats > 1 ? i / (pleats - 1) : 0.5;
      const topX = tieL + (tieR - tieL) * t;
      const shoulder = mouth.left.x + (mouth.right.x - mouth.left.x) * t;
      const baseX = topX + (shoulder - topX) * (0.55 + open * 0.35);
      ctx.beginPath();
      ctx.moveTo(topX, mouth.tieY + 1);
      ctx.quadraticCurveTo(topX, (mouth.tieY + mouth.baseY) * 0.5, baseX, mouth.baseY);
      ctx.stroke();
    }

    // 扎带。扎紧时是一道实线；松开后变细、变虚，中间露出缝。
    const bandH = Math.max(3, bag.ry * 0.022) * (1 - open * 0.32);
    const bandGrad = ctx.createLinearGradient(tieL, 0, tieR, 0);
    bandGrad.addColorStop(0, 'rgba(58,90,108,0.30)');
    bandGrad.addColorStop(0.5, 'rgba(58,90,108,' + (0.62 - open * 0.24).toFixed(4) + ')');
    bandGrad.addColorStop(1, 'rgba(58,90,108,0.30)');
    ctx.fillStyle = bandGrad;
    ctx.beginPath();
    ctx.ellipse(mouth.cx, mouth.tieY, mouth.halfW * 1.06, bandH, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.34 - open * 0.14).toFixed(4) + ')';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(mouth.cx, mouth.tieY - bandH * 0.35, mouth.halfW * 0.94, bandH * 0.5, 0,
      Math.PI * 1.06, Math.PI * 1.94);
    ctx.stroke();

    // 扎带以上的松口：两片外翻的塑料。口子越松，翻得越开、垂得越低。
    // 宽度不能只挂 halfW：扎紧时 halfW 只有二十来像素，纯比例算出来的耳朵
    // 会缩成一根天线。给一个相对 rx 的底，扎紧时也还是两片塑料。
    // 形状是「先向上翻过去，再垂到扎带下方」——真实扎口的两端是耷拉着的，
    // 一味向上翘既不像塑料袋，也会顶到窄屏上方的文字。
    const earW = (mouth.halfW + bag.rx * 0.032) * (1.15 + open * 0.95);
    const earH = mouth.neck * (0.26 + open * 0.30);
    const droop = earH * (0.34 + open * 0.52);
    ctx.fillStyle = 'rgba(' + FILM_RGB + ',' + (FILM_BODY_A + 0.026).toFixed(4) + ')';
    ctx.strokeStyle = 'rgba(96,124,140,' + (0.30 + open * 0.06).toFixed(4) + ')';
    ctx.lineWidth = 1;
    for (let side = -1; side <= 1; side += 2) {
      ctx.beginPath();
      ctx.moveTo(mouth.cx + side * mouth.halfW * 0.35, mouth.tieY - bandH * 0.4);
      ctx.bezierCurveTo(
        mouth.cx + side * earW * 0.24, mouth.tieY - earH,
        mouth.cx + side * earW * 0.96, mouth.tieY - earH * 0.42,
        mouth.cx + side * earW * 0.86, mouth.tieY + droop
      );
      ctx.quadraticCurveTo(
        mouth.cx + side * earW * 0.32, mouth.tieY - bandH * 0.1,
        mouth.cx + side * mouth.halfW * 0.35, mouth.tieY - bandH * 0.4
      );
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // 松到能漏泡泡时，口沿透一点警示红——这是玩家唯一能看见的「要漏了」提示。
    const escapeGrade = clamp(Math.round((spec && spec.escape) || 1), 1, 3);
    const threshold = MOUTH_ESCAPE_MIN * (1 - 0.22 * (escapeGrade - 1));
    // 结局1 期间不画：那时扎口是被主动松开的，不是「快撑不住了」，
    // 而且 mouthForced 会把 open 顶到 1，这圈红必然亮，正好和整段情绪相反。
    if (open > threshold && !farewell) {
      const heat = clamp((open - threshold) / Math.max(0.01, 1 - threshold), 0, 1);
      ctx.strokeStyle = 'rgba(217,70,54,' + (heat * 0.46).toFixed(4) + ')';
      ctx.lineWidth = 2 + heat * 2;
      ctx.beginPath();
      ctx.ellipse(mouth.cx, mouth.tieY, mouth.halfW * 1.06, bandH, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.lineCap = 'butt';
    ctx.restore();
  }


  // 泡泡 = 精灵贴图 + 文字。运行时不做任何逐像素计算。
  // 两层交叉淡入：膜相位在相邻两帧之间淡（只取整帧的话 0.21 的流速相当于每 240ms
  // 才换一帧，能看出跳格），警戒态在常规/警戒两套精灵之间按 edgeGlow 淡。
  function drawBubble(bubble, time) {
    const radius = bubble.r * bubble.scale;
    if (radius < 0.4 || bubble.opacity <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = bubble.opacity;

    // 5.4：挤过扎口时的形变。塑料袋口勒住的是横向，泡泡就沿前进方向拉长。
    // 体积守恒 sx·sy = 1，所以只有一个自由度；squeeze 为负是出口后的回弹超调。
    const squeeze = Number(bubble.squeeze) || 0;
    if (squeeze) {
      const sx = clamp(1 - squeeze * ESCAPE_SQUASH, 0.35, 1.9);
      ctx.translate(bubble.x, bubble.y);
      ctx.rotate(Number(bubble.squeezeAngle) || 0);
      ctx.scale(sx, 1 / sx);
      ctx.rotate(-(Number(bubble.squeezeAngle) || 0));
      ctx.translate(-bubble.x, -bubble.y);
    }

    if (filmSprites) {
      const drift = reducedMotion ? 0 : time * FILM.speed;
      const cycle = bubble.phase + drift;
      const pos = (cycle - Math.floor(cycle)) * SPRITE_FRAMES;
      const i0 = Math.floor(pos) % SPRITE_FRAMES;
      const i1 = (i0 + 1) % SPRITE_FRAMES;
      const mix = pos - Math.floor(pos);
      const size = radius * 2 * (SPRITE / (SPRITE_R * 2));
      const dx = bubble.x - size / 2;
      const dy = bubble.y - size / 2;
      const warning = clamp(bubble.edgeGlow, 0, 1);

      ctx.drawImage(filmSprites[i0], dx, dy, size, size);
      if (mix > 0.004) {
        ctx.globalAlpha = bubble.opacity * mix;
        ctx.drawImage(filmSprites[i1], dx, dy, size, size);
        ctx.globalAlpha = bubble.opacity;
      }
      if (warning > 0.004 && filmSpritesWarn) {
        ctx.globalAlpha = bubble.opacity * warning;
        ctx.drawImage(filmSpritesWarn[i0], dx, dy, size, size);
        if (mix > 0.004) {
          ctx.globalAlpha = bubble.opacity * warning * mix;
          ctx.drawImage(filmSpritesWarn[i1], dx, dy, size, size);
        }
        ctx.globalAlpha = bubble.opacity;
      }
    }

    if (bubble.state === 'normal' && radius > 24) {
      const fontMin = Number(LEVEL_TUNING.LEVEL_GAME_FONT_MIN_PX) || 16;
      const fontMax = Number(LEVEL_TUNING.LEVEL_GAME_FONT_MAX_PX) || 24;
      const maxLines = Number(LEVEL_TUNING.LEVEL_GAME_TEXT_MAX_LINES) || 3;
      const fontSize = clamp(radius * 0.34, fontMin, fontMax);
      ctx.fillStyle = BUBBLE_TEXT_COLOR;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '500 ' + fontSize + 'px ' + fontStack(bubble.text);
      const lines = wrapBubbleText(bubble.text, radius * 1.52, maxLines);
      const lineHeight = fontSize * 1.14;
      const originY = bubble.y - (lines.length - 1) * lineHeight * 0.5 +
        Math.sin(time + bubble.phase) * 1.2;
      lines.forEach(function (line, index) {
        ctx.fillText(line, bubble.x, originY + index * lineHeight, radius * 1.52);
      });
    }
    ctx.restore();
  }


  function drawParticle(particle) {
    ctx.save();
    ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1);
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  return {
    start: start,
    stop: stop,
    destroy: destroy,
    triggerButton: triggerButton,
    playOutcome: playOutcome,
    playFarewell: playFarewell,
    getStats: getStats,
    isRunning: function () { return running; },
    isPlaying: function () { return gameplay; },
    _test: Object.freeze({
      resolvePair: resolvePair,
      collisionGap: COLLISION_GAP,
      motionTuningFor: motionTuningFor,
      filmBakeMs: function () { return filmBakeMs; }
    })
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = LevelGame;
