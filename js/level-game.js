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
      packing: 0,
      pressure: 0,
      peakPressure: 0,
      blockedSpawns: 0,
      growthBlocked: 0,
      peakGrowthBlocked: 0,
      collisionEvents: 0
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
    stats = freshStats();
    profileCursor = 0;
  }

  function frame(now) {
    if (!running || !ctx || !canvas) return;
    const dt = Math.min(0.034, Math.max(0.001, (now - lastTime) / 1000));
    lastTime = now;
    update(dt);
    draw(now / 1000);
    raf = requestAnimationFrame(frame);
  }

  function activeNormalCount() {
    return bubbles.filter(function (bubble) { return bubble.state === 'normal'; }).length;
  }

  function isPhysicalBubble(bubble) {
    return bubble && (bubble.state === 'normal' || bubble.state === 'escaping');
  }

  function safeEllipse(radius) {
    const inset = Math.max(2, Number(radius) || 0) + COLLISION_GAP;
    return {
      rx: Math.max(36, bag.rx - inset),
      ry: Math.max(36, bag.ry - inset)
    };
  }

  function insideBagAt(x, y, radius) {
    if (!bag) return false;
    const safe = safeEllipse(radius);
    const nx = (x - bag.cx) / safe.rx;
    const ny = (y - bag.cy) / safe.ry;
    return nx * nx + ny * ny <= 1;
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
      const radial = Math.sqrt(Math.random()) * 0.82;
      const safe = safeEllipse(radius);
      const x = bag.cx + Math.cos(angle) * safe.rx * radial;
      const y = bag.cy + Math.sin(angle) * safe.ry * radial;
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
    if (gameplay) {
      timeLeftMs = Math.max(0, timeLeftMs - dt * 1000);
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
        bubble.x += bubble.vx * dt;
        bubble.y += bubble.vy * dt;
        bubble.scale += dt * 0.18;
        if (bubble.x < -bubble.r * 3 || bubble.x > width + bubble.r * 3 ||
            bubble.y < -bubble.r * 3 || bubble.y > height + bubble.r * 3) {
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
    const safe = safeEllipse(bubble.r);
    const safeRx = safe.rx;
    const safeRy = safe.ry;
    const nx = (bubble.x - bag.cx) / safeRx;
    const ny = (bubble.y - bag.cy) / safeRy;
    const d = Math.sqrt(nx * nx + ny * ny);
    if (d < 1) return;

    const normalX = nx / Math.max(0.001, d);
    const normalY = ny / Math.max(0.001, d);
    if (bubble.edgeCooldown <= 0) {
      bubble.edgeHits += 1;
      bubble.edgeCooldown = 0.18;
    }
    bubble.edgeGlow = 1;
    const requiredHits = Math.max(1, 5 - Math.round(spec.escape || 1) -
      (Math.round(spec.bag || 1) - 1) - (Math.round(spec.level || 1) - 1));
    const minimumAge = effectiveEscapeMinAge();
    const oldEnough = bubble.age >= minimumAge;
    // 只有上沿缝线是正常游戏中的薄弱区；侧面和袋底只能反弹。
    const weakSeam = normalY < -0.38 && Math.abs(normalX) < 0.94;
    if (weakSeam && bubble.edgeHits >= requiredHits && oldEnough) {
      startEscape(bubble, false);
      return;
    }

    bubble.x = bag.cx + normalX * safeRx * 0.998;
    bubble.y = bag.cy + normalY * safeRy * 0.998;
    const dot = bubble.vx * normalX + bubble.vy * normalY;
    if (dot > 0) {
      bubble.vx -= (1 + BOUNDARY_RESTITUTION) * dot * normalX;
      bubble.vy -= (1 + BOUNDARY_RESTITUTION) * dot * normalY;
    }
    limitBubbleSpeed(bubble);
  }

  function projectInsideBag(bubble) {
    if (!bag || bubble.state !== 'normal') return;
    const safe = safeEllipse(bubble.r);
    const nx = (bubble.x - bag.cx) / safe.rx;
    const ny = (bubble.y - bag.cy) / safe.ry;
    const d = Math.hypot(nx, ny);
    if (d <= 1) return;
    const normalX = nx / Math.max(0.001, d);
    const normalY = ny / Math.max(0.001, d);
    bubble.x = bag.cx + normalX * safe.rx * 0.998;
    bubble.y = bag.cy + normalY * safe.ry * 0.998;
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

  function startEscape(bubble, forced) {
    if (!bubble || bubble.state !== 'normal') return;
    bubble.state = 'escaping';
    bubble.stateTime = 0;
    const dx = bubble.x - bag.cx || random(-1, 1);
    const dy = bubble.y - bag.cy || random(-1, 1);
    const distance = Math.max(1, Math.hypot(dx, dy));
    const range = effectiveSpeedRange();
    const speed = forced ? random(250, 360) : random(range[0] * 1.18, range[1] * 1.42);
    bubble.vx = dx / distance * speed;
    bubble.vy = dy / distance * speed - (forced ? random(30, 80) : 0);
    stats.escaped += 1;
    statusPulse = 1;
    if (typeof callbacks.onEscape === 'function') callbacks.onEscape(getStats());
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
    const inset = Number(padding) || 0;
    const rx = Math.max(1, bag.rx - inset);
    const ry = Math.max(1, bag.ry - inset);
    const nx = (x - bag.cx) / rx;
    const ny = (y - bag.cy) / ry;
    return nx * nx + ny * ny <= 1;
  }

  function triggerButton(options) {
    if (!running || !gameplay) return false;
    const opts = options || {};
    gameplay = false;
    if (opts.failed) {
      const normal = bubbles.filter(function (bubble) { return bubble.state === 'normal'; });
      if (!normal.length) for (let i = 0; i < 7; i += 1) spawnBubble(false, true);
      bubbles.forEach(function (bubble) {
        if (bubble.state === 'normal') startEscape(bubble, true);
      });
      finishDelay = 1900;
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
      bubbles.forEach(function (bubble) {
        if (bubble.state === 'normal') startEscape(bubble, true);
      });
      finishDelay = 1800;
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

  function emitParticles(x, y, color, count) {
    for (let i = 0; i < count; i += 1) {
      const angle = random(0, Math.PI * 2);
      const speed = random(45, 150);
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
    drawSack(time);
    bubbles.forEach(function (bubble) { drawBubble(bubble, time); });
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

  function sackPath(time) {
    const path = new Path2D();
    const tremble = pressure * Math.sin((Number(time) || 0) * 7.5) * 0.008;
    const stretch = pressure * BAG_VISUAL_STRETCH;
    const rx = bag.rx * (1 + stretch + tremble);
    const ry = bag.ry * (1 + stretch * 0.58 - tremble * 0.4);
    const left = bag.cx - rx;
    const right = bag.cx + rx;
    const top = bag.cy - ry;
    const bottom = bag.cy + ry;
    path.moveTo(left + rx * 0.14, top + ry * 0.16);
    path.bezierCurveTo(left - rx * 0.04, top + ry * 0.44, left + rx * 0.02, bottom - ry * 0.20, bag.cx - rx * 0.22, bottom - ry * 0.02);
    path.quadraticCurveTo(bag.cx, bottom + ry * 0.04, bag.cx + rx * 0.22, bottom - ry * 0.02);
    path.bezierCurveTo(right - rx * 0.02, bottom - ry * 0.20, right + rx * 0.04, top + ry * 0.44, right - rx * 0.14, top + ry * 0.16);
    path.quadraticCurveTo(bag.cx, top - ry * (0.08 + pressure * 0.025), left + rx * 0.14, top + ry * 0.16);
    path.closePath();
    return path;
  }

  // 注意：这里只是把袋子从「米白线条压青底」翻成「冷灰线条压米白底」，
  // 让它在新背景上还看得见。真正的软体塑料袋是 5.3 的事，形态逻辑先不动。
  function drawSack(time) {
    if (!bag) return;
    const path = sackPath(time);
    ctx.save();
    ctx.fillStyle = 'rgba(88,116,132,0.055)';
    ctx.fill(path);
    ctx.clip(path);

    ctx.strokeStyle = 'rgba(70,100,118,0.10)';
    ctx.lineWidth = 0.7;
    const mesh = 13;
    const drift = (time * 2.2) % mesh;
    for (let x = bag.cx - bag.rx - bag.ry; x < bag.cx + bag.rx + bag.ry; x += mesh) {
      ctx.beginPath();
      ctx.moveTo(x + drift, bag.top - 20);
      ctx.lineTo(x + bag.ry * 1.5 + drift, bag.bottom + 20);
      ctx.stroke();
    }
    for (let x = bag.cx - bag.rx - bag.ry; x < bag.cx + bag.rx + bag.ry; x += mesh) {
      ctx.beginPath();
      ctx.moveTo(x - drift, bag.bottom + 20);
      ctx.lineTo(x + bag.ry * 1.5 - drift, bag.top - 20);
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = pressureStage >= 2
      ? 'rgba(217,70,54,' + (0.52 + pressure * 0.30) + ')'
      : 'rgba(64,96,114,0.44)';
    ctx.lineWidth = Math.max(1.4, width * 0.0014);
    ctx.stroke(path);
    ctx.setLineDash([7, 7]);
    ctx.strokeStyle = 'rgba(64,96,114,0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(bag.cx, bag.cy, bag.rx * 0.92, bag.ry * 0.90, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    const seamY = bag.top + bag.ry * 0.14;
    ctx.strokeStyle = 'rgba(64,96,114,0.52)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bag.cx - bag.rx * 0.72, seamY);
    ctx.quadraticCurveTo(bag.cx, bag.top - bag.ry * 0.04, bag.cx + bag.rx * 0.72, seamY);
    ctx.stroke();

    ctx.fillStyle = 'rgba(64,96,114,0.56)';
    ctx.beginPath();
    ctx.ellipse(bag.cx, bag.bottom - bag.ry * 0.01, bag.rx * 0.055, bag.ry * 0.035, 0, 0, Math.PI * 2);
    ctx.fill();
    if (pressureStage > 0) {
      ctx.globalAlpha = clamp(pressure * 0.48, 0, 0.48);
      ctx.strokeStyle = '#F5654F';
      ctx.lineWidth = 5 + pressure * 5;
      ctx.shadowColor = 'rgba(217,70,54,0.55)';
      ctx.shadowBlur = 18 + pressure * 24;
      ctx.stroke(path);
    }
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

    if (filmSprites) {
      const drift = prefersReducedMotion() ? 0 : time * FILM.speed;
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
