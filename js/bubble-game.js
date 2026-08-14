/**
 * bubble-game.js —— Canvas 泡泡交互核心
 * V0.7：强化 10 类行为对象的视觉、运动和点击差异；正常阶段即可辨认，失控阶段进一步放大。
 */
'use strict';

const BubbleGame = (function () {
  let canvas = null;
  let ctx = null;
  let dpr = 1;
  let width = 0;
  let height = 0;
  let rafId = 0;
  let lastTime = 0;
  let running = false;
  let loopToken = 0;
  let mode = 'calm';
  let chaosLevel = 0;
  let transitionProgress = 0;
  let interactive = false;
  let growthTimer = 0;
  let growthIntervalMs = 0;
  let growthSpawnCount = 0;
  let normalTimer = 0;
  let settling = false;
  let resizeObserver = null;
  let fallbackResizeHandler = null;
  let pointerHandler = null;
  let pointerMoveHandler = null;
  let pointerLeaveHandler = null;
  let pointer = { x: -9999, y: -9999, active: false };
  let observeFocusId = null;
  let worries = [];
  let callbacks = {};
  let nextId = 1;
  let avoidRects = [];
  let erasure = null;
  let returnTimers = [];

  const bubbles = [];
  const particles = [];
  const ripples = [];

  // ——— 绘制缓存：这些结果在帧与帧之间几乎不变，没必要每帧重算 ———
  const blurSprites = new Map();   // B10_BLUR 的预渲染模糊贴图（见 drawBubble 注释）
  const hexCache = new Map();      // 颜色字符串 → rgb
  const textLineCache = new Map(); // 文本分行结果（measureText 逐字调用，很贵）

  // 泡泡文字与页面同源：站酷仓耳渔阳体，回退链与 CSS 的 --ff 保持一致。
  const CANVAS_FONT_STACK = '"Canger YuYangTi", "Microsoft YaHei", "PingFang SC", sans-serif';

  /* 泡泡里画的是烦恼关键词——规格指定这类短词用千图马克手写体。
     但手写体是按站内用字裁过的子集，自由输入的关键词可能含子集外的字，
     Canvas 和 CSS 一样是**逐字**回退，一个词里两种字形很难看。
     所以交给 FontSupport 按整词判断：整词都在子集里才用手写体。
     font-support.js 没加载时退回主字体栈，不影响渲染。 */
  function fontStackFor(text) {
    if (typeof FontSupport === 'undefined') return CANVAS_FONT_STACK;
    return FontSupport.fontStackFor(text);
  }

  /* 字体是 font-display: swap 异步加载的：先用系统字回退渲染，
     字体到位后字形宽度变化，之前按回退字算出的分行结果会偏。
     这里在字体就绪后清一次缓存，让分行按真实字形重算。 */
  if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () {
      textLineCache.clear();
    });
  }

  function random(min, max) {
    return min + Math.random() * (max - min);
  }

  function randomInt(min, max) {
    return Math.floor(random(min, max + 1));
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function isSoftMode() {
    return mode === 'soft' || mode === 'return' || mode === 'observe-select' || mode === 'observe-focus';
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function pick(array) {
    return array[Math.floor(Math.random() * array.length)];
  }

  function normalizeWorry(item) {
    if (item && typeof item === 'object' && String(item.text || '').trim()) {
      const text = String(item.text).trim();
      return {
        id: item.id || ('profile-' + Math.random().toString(36).slice(2, 8)),
        text: text,
        category: item.category || 'custom',
        behaviorType: item.behaviorType || (typeof WorryData !== 'undefined' ? WorryData.randomBehaviorType() : 'B1_LIGHT')
      };
    }
    const text = String(item || '').trim();
    if (!text) return null;
    if (typeof WorryData !== 'undefined') return WorryData.createProfile(text);
    return { id: 'profile-' + Math.random().toString(36).slice(2, 8), text: text, category: 'custom', behaviorType: 'B1_LIGHT' };
  }

  function safeWorries(input) {
    const list = Array.isArray(input)
      ? input.map(normalizeWorry).filter(Boolean)
      : [];
    return list.length ? list : [normalizeWorry('尚未说出口的烦恼')];
  }

  function behaviorMeta(type) {
    if (typeof WorryData !== 'undefined') return WorryData.behavior(type);
    return { id: type || 'B1_LIGHT', name: '普通', color: '#7F9CC8' };
  }

  function currentBehaviorIntensity() {
    if (mode === 'growth') {
      return lerp(
        Number(CONFIG.TRANSITION_BEHAVIOR_MIN) || 0.2,
        Number(CONFIG.TRANSITION_BEHAVIOR_MAX) || 1,
        clamp(transitionProgress, 0, 1)
      );
    }
    if (mode === 'calm') return Number(CONFIG.CALM_BEHAVIOR_INTENSITY) || 0.16;
    if (mode === 'observe-select' || mode === 'observe-focus') return 0.08;
    return 0.12;
  }

  function hexToRgb(hex) {
    const key = String(hex || '#7F9CC8');
    const cached = hexCache.get(key);
    if (cached) return cached;
    const value = key.replace('#', '');
    const full = value.length === 3 ? value.split('').map(function (c) { return c + c; }).join('') : value;
    const parsed = parseInt(full, 16);
    const rgb = Number.isFinite(parsed)
      ? { r: (parsed >> 16) & 255, g: (parsed >> 8) & 255, b: parsed & 255 }
      : { r: 127, g: 156, b: 200 };
    hexCache.set(key, rgb);
    return rgb;
  }

  function mixRgb(a, b, t) {
    const p = clamp(t, 0, 1);
    return {
      r: Math.round(lerp(a.r, b.r, p)),
      g: Math.round(lerp(a.g, b.g, p)),
      b: Math.round(lerp(a.b, b.b, p))
    };
  }

  /**
   * 泡泡配色：原本每帧每个泡泡都要做 1 次 hexToRgb + 4 次 mixRgb + 6 段字符串拼接。
   * 但结果只取决于（行为色, 模式, 警戒红程度），红度按 1/32 量化后逐帧几乎不变，
   * 因此缓存到泡泡自身即可，视觉无差别。
   */
  function bubblePalette(bubble, red) {
    const redStep = Math.round(clamp(red, 0, 1) * 32);
    const key = mode + '|' + redStep + '|' + bubble.behaviorColor;
    if (bubble.paletteKey === key && bubble.palette) return bubble.palette;

    const soft = isSoftMode();
    const neutralRgb = { r: 92, g: 142, b: 207 };
    const typeWeight = mode === 'growth'
      ? Number(CONFIG.BEHAVIOR_COLOR_GROWTH_WEIGHT) || 0.88
      : soft ? 0.32 : Number(CONFIG.BEHAVIOR_COLOR_CALM_WEIGHT) || 0.58;
    let bubbleRgb = mixRgb(neutralRgb, hexToRgb(bubble.behaviorColor), typeWeight);
    if (mode === 'growth') bubbleRgb = mixRgb(bubbleRgb, { r: 206, g: 72, b: 82 }, clamp(red, 0, 1) * 0.30);
    const lightRgb = mixRgb(bubbleRgb, { r: 244, g: 248, b: 255 }, soft ? 0.54 : 0.62);
    const darkRgb = mixRgb(bubbleRgb, { r: 22, g: 28, b: 43 }, 0.58);
    const rgb = function (c, a) { return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + a + ')'; };

    const palette = {
      bubble: bubbleRgb,
      light: lightRgb,
      dark: darkRgb,
      glow: rgb(bubbleRgb, (soft ? 0.18 : 0.24 + red * 0.12).toFixed(3)),
      glowFade: rgb(bubbleRgb, 0),
      stop0: rgb(lightRgb, soft ? 0.46 : 0.70),
      stop1: rgb(bubbleRgb, soft ? 0.30 : 0.48),
      stop2: rgb(darkRgb, soft ? 0.17 : 0.31),
      outline: rgb(lightRgb, (soft ? 0.34 : 0.46 + red * 0.10).toFixed(3))
    };
    bubble.paletteKey = key;
    bubble.palette = palette;
    return palette;
  }

  /** 是否处于「减少动态效果」偏好：原地爆裂需退化为快速淡出。 */
  function prefersReducedMotion() {
    return Boolean(window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  /**
   * 由 transitionProgress 推出当前的分裂概率。
   * 前期 10%~20%，中期 30%~65%，后期 70%~100%，
   * 因此「删除失效」是从偶尔出现逐渐变成必然发生，而不是突然切换。
   */
  function currentSplitChance() {
    const p = clamp(transitionProgress, 0, 1);
    if (p < 1 / 3) {
      return lerp(CONFIG.SPLIT_CHANCE_EARLY_MIN, CONFIG.SPLIT_CHANCE_EARLY_MAX, p / (1 / 3));
    }
    if (p < 2 / 3) {
      return lerp(CONFIG.SPLIT_CHANCE_MID_MIN, CONFIG.SPLIT_CHANCE_MID_MAX, (p - 1 / 3) / (1 / 3));
    }
    return lerp(CONFIG.SPLIT_CHANCE_LATE_MIN, CONFIG.SPLIT_CHANCE_LATE_MAX, (p - 2 / 3) / (1 / 3));
  }

  function clearReturnTimers() {
    returnTimers.forEach(function (id) { window.clearTimeout(id); });
    returnTimers = [];
  }

  function createBubble(worryItem, options) {
    const profile = normalizeWorry(worryItem) || normalizeWorry('尚未说出口的烦恼');
    const text = profile.text;
    const opts = options || {};
    const minR = CONFIG.BUBBLE_MIN_RADIUS;
    const maxR = CONFIG.BUBBLE_MAX_RADIUS;
    const textBonus = Math.min(24, Math.max(0, text.length - 6) * 2.2);
    const defaultRadius = Math.min(maxR, random(minR, maxR - 8) + textBonus);
    const radius = Number.isFinite(opts.radius)
      ? clamp(opts.radius, CONFIG.SPLIT_CHILD_RADIUS_MIN || 24, maxR * 1.35)
      : defaultRadius;
    const angle = Number.isFinite(opts.angle) ? opts.angle : random(0, Math.PI * 2);
    const defaultSpeed = isSoftMode()
      ? random(CONFIG.BUBBLE_SPEED_MIN * 0.14, CONFIG.BUBBLE_SPEED_MIN * 0.30)
      : random(CONFIG.BUBBLE_SPEED_MIN, CONFIG.BUBBLE_SPEED_MAX);
    const speed = Number.isFinite(opts.speed) ? opts.speed : defaultSpeed;

    const minX = radius + 8;
    const maxX = Math.max(minX + 1, width - radius - 8);
    const minY = radius + 8;
    const maxY = Math.max(minY + 1, height - radius - 8);
    const requestedX = Number.isFinite(opts.x) ? opts.x : random(minX, maxX);
    const requestedY = Number.isFinite(opts.y) ? opts.y : random(minY, maxY);
    const meta = behaviorMeta(profile.behaviorType);

    const bubble = {
      id: 'bubble-' + nextId++,
      profile: profile,
      worryId: profile.id,
      text: text,
      category: profile.category,
      behaviorType: profile.behaviorType,
      behaviorColor: meta.color || '#7F9CC8',
      x: clamp(requestedX, minX, maxX),
      y: clamp(requestedY, minY, maxY),
      radius: radius,
      baseRadius: radius,
      vx: Number.isFinite(opts.vx) ? opts.vx : Math.cos(angle) * speed,
      vy: Number.isFinite(opts.vy) ? opts.vy : Math.sin(angle) * speed,
      opacity: Number.isFinite(opts.opacity)
        ? opts.opacity
        : isSoftMode() ? random(0.32, 0.52) : random(0.72, 0.95),
      scale: Number.isFinite(opts.initialScale)
        ? opts.initialScale
        : opts.entering === false ? 1 : 0.05,
      state: 'normal',
      burstElapsed: 0,
      burstKind: 'delete',
      rejectElapsed: 0,
      phase: random(0, Math.PI * 2),
      isSplitChild: Boolean(opts.isSplitChild),
      textFade: 1,
      eraseDelay: 0,
      eraseDuration: 0,
      eraseBurst: false,
      eraseStartScale: 1,
      eraseStartOpacity: 1,
      age: 0,
      hitCount: 0,
      requiredHits: 1,
      hoverReveal: profile.behaviorType === 'B10_BLUR' ? 0.10 : 0,
      burstCooldown: random(0.4, 1.6),
      behaviorFlash: 0,
      behaviorPulse: random(0, Math.PI * 2),
      selected: false,
      focusRadius: Math.min(maxR * 1.28, Math.max(radius, 94))
    };
    bubbles.push(bubble);
    notifyBubbleCount();
    return bubble;
  }

  function addInitialBubbles(count) {
    const total = Math.max(worries.length, count || CONFIG.INITIAL_BUBBLE_COUNT);
    for (let i = 0; i < total; i += 1) {
      createBubble(worries[i % worries.length], { entering: true });
    }
  }

  function resizeCanvas() {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;
    const oldWidth = width;
    const oldHeight = height;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = rect.width;
    height = rect.height;
    const nextWidth = Math.round(width * dpr);
    const nextHeight = Math.round(height * dpr);
    const sizeChanged = canvas.width !== nextWidth || canvas.height !== nextHeight;

    if (sizeChanged) {
      canvas.width = nextWidth;
      canvas.height = nextHeight;
    }

    // 重新挂载同一个 Canvas 时，像素尺寸可能没有变化，但旧 ctx 已经被清理。
    // 必须重新获取绘图上下文，否则会出现“点击仍有效、泡泡却完全不动”的状态。
    if (!ctx || sizeChanged) ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (sizeChanged) {
      bubbles.forEach(function (bubble) {
        if (oldWidth > 2 && oldHeight > 2) {
          bubble.x = bubble.x / oldWidth * width;
          bubble.y = bubble.y / oldHeight * height;
        }
        bubble.x = clamp(bubble.x, bubble.radius, Math.max(bubble.radius, width - bubble.radius));
        bubble.y = clamp(bubble.y, bubble.radius, Math.max(bubble.radius, height - bubble.radius));
      });
    }
  }

  function detachCanvas() {
    if (canvas && pointerHandler) canvas.removeEventListener('pointerdown', pointerHandler);
    if (canvas && pointerMoveHandler) canvas.removeEventListener('pointermove', pointerMoveHandler);
    if (canvas && pointerLeaveHandler) canvas.removeEventListener('pointerleave', pointerLeaveHandler);
    pointerHandler = null;
    pointerMoveHandler = null;
    pointerLeaveHandler = null;
    pointer.active = false;
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    if (fallbackResizeHandler) {
      window.removeEventListener('resize', fallbackResizeHandler);
      fallbackResizeHandler = null;
    }
    canvas = null;
    ctx = null;
  }

  function mount(nextCanvas, options) {
    if (!(nextCanvas instanceof HTMLCanvasElement)) {
      throw new Error('BubbleGame.mount 需要有效的 canvas 元素。');
    }
    const opts = options || {};

    // 切换或重新挂载 Canvas 时，强制重建唯一动画循环。
    // 这样即使用户中途退出后重新开始，也不会留下“可点击但不移动”的半失活状态。
    stop();
    detachCanvas();
    canvas = nextCanvas;
    settling = false;
    interactive = Boolean(opts.interactive);
    if (opts.mode) mode = opts.mode;
    resizeCanvas();

    pointerHandler = function (event) {
      if (!interactive || mode === 'erasing' || !canvas) return;
      const rect = canvas.getBoundingClientRect();
      handleClick(event.clientX - rect.left, event.clientY - rect.top);
    };
    canvas.addEventListener('pointerdown', pointerHandler);
    pointerMoveHandler = function (event) {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      pointer.x = event.clientX - rect.left;
      pointer.y = event.clientY - rect.top;
      pointer.active = true;
    };
    pointerLeaveHandler = function () { pointer.active = false; };
    canvas.addEventListener('pointermove', pointerMoveHandler, { passive: true });
    canvas.addEventListener('pointerleave', pointerLeaveHandler, { passive: true });

    if ('ResizeObserver' in window) {
      resizeObserver = new ResizeObserver(resizeCanvas);
      resizeObserver.observe(canvas);
    } else {
      fallbackResizeHandler = resizeCanvas;
      window.addEventListener('resize', fallbackResizeHandler, { passive: true });
    }
    start();
  }

  function init(inputWorries, nextCanvas, nextCallbacks) {
    destroy();
    worries = safeWorries(inputWorries);
    callbacks = nextCallbacks || {};
    mode = 'calm';
    observeFocusId = null;
    pointer.active = false;
    chaosLevel = 0;
    if (nextCanvas) mount(nextCanvas, { interactive: false, mode: 'calm' });
    addInitialBubbles(CONFIG.INITIAL_BUBBLE_COUNT);
    start();
  }

  function setMode(nextMode) {
    mode = nextMode || 'calm';
    if (mode !== 'calm') stopNormalPhase();
    if (isSoftMode()) {
      settling = false;
      bubbles.forEach(function (bubble) {
        bubble.opacity = Math.min(bubble.opacity, 0.54);
        bubble.vx *= 0.34;
        bubble.vy *= 0.34;
      });
    }
  }

  function setInteractive(value) {
    interactive = Boolean(value);
  }

  function setChaosLevel(value) {
    chaosLevel = clamp(Number(value) || 0, 0, 1);
  }

  /** 渐变进入失控的统一进度（0~1），由 app.js 按时间推进。 */
  function setTransitionProgress(value) {
    transitionProgress = clamp(Number(value) || 0, 0, 1);
  }

  function getTransitionProgress() {
    return transitionProgress;
  }

  function getSplitChance() {
    return currentSplitChance();
  }

  function setAvoidRects(rects) {
    avoidRects = Array.isArray(rects) ? rects.map(function (rect) {
      return {
        left: Number(rect.left) || 0,
        top: Number(rect.top) || 0,
        right: Number(rect.right) || 0,
        bottom: Number(rect.bottom) || 0,
        padding: Number(rect.padding) || 0
      };
    }) : [];
  }

  function start() {
    if (!canvas || !ctx) return;
    if (running && rafId) return;

    running = true;
    loopToken += 1;
    const activeToken = loopToken;
    lastTime = performance.now();
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(function (now) {
      frame(now, activeToken);
    });
  }

  function stop() {
    running = false;
    loopToken += 1;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }

  function frame(now, activeToken) {
    if (!running || activeToken !== loopToken || !canvas || !ctx) return;
    const dt = Math.min(0.035, Math.max(0.001, (now - lastTime) / 1000));
    lastTime = now;
    update(dt, now / 1000);
    draw(now / 1000);
    rafId = requestAnimationFrame(function (nextNow) {
      frame(nextNow, activeToken);
    });
  }

  function applyAvoidance(bubble, dt) {
    if (!avoidRects.length || mode === 'erasing') return;
    avoidRects.forEach(function (rect) {
      const padding = rect.padding + bubble.radius * 0.30;
      const left = rect.left - padding;
      const right = rect.right + padding;
      const top = rect.top - padding;
      const bottom = rect.bottom + padding;
      if (bubble.x < left || bubble.x > right || bubble.y < top || bubble.y > bottom) return;

      const distances = [
        { side: 'left', value: Math.abs(bubble.x - left) },
        { side: 'right', value: Math.abs(right - bubble.x) },
        { side: 'top', value: Math.abs(bubble.y - top) },
        { side: 'bottom', value: Math.abs(bottom - bubble.y) }
      ].sort(function (a, b) { return a.value - b.value; });
      const force = (mode === 'soft' ? 38 : 86) * dt;
      switch (distances[0].side) {
        case 'left': bubble.vx -= force; bubble.x -= force * 0.35; break;
        case 'right': bubble.vx += force; bubble.x += force * 0.35; break;
        case 'top': bubble.vy -= force; bubble.y -= force * 0.35; break;
        case 'bottom': bubble.vy += force; bubble.y += force * 0.35; break;
        default: break;
      }
    });
  }

  function applyBubbleRepulsion(dt) {
    if (mode === 'erasing' || mode === 'observe-focus') return;
    for (let i = 0; i < bubbles.length; i += 1) {
      const a = bubbles[i];
      if (a.state === 'bursting') continue;
      for (let j = i + 1; j < bubbles.length; j += 1) {
        const b = bubbles[j];
        if (b.state === 'bursting') continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distanceSq = dx * dx + dy * dy;
        const involvesCluster = (a.behaviorType === 'B5_CLUSTER' || b.behaviorType === 'B5_CLUSTER') && (mode === 'calm' || mode === 'growth');
        const minDistance = (a.radius + b.radius) * (isSoftMode() ? 0.68 : involvesCluster ? 0.48 : 0.78);
        if (distanceSq <= 0.001 || distanceSq >= minDistance * minDistance) continue;
        const distance = Math.sqrt(distanceSq);
        const nx = dx / distance;
        const ny = dy / distance;
        const overlap = minDistance - distance;
        const push = Math.min(48, overlap * 1.5) * dt;
        a.vx -= nx * push * 14;
        a.vy -= ny * push * 14;
        b.vx += nx * push * 14;
        b.vy += ny * push * 14;
        a.x -= nx * overlap * 0.04;
        a.y -= ny * overlap * 0.04;
        b.x += nx * overlap * 0.04;
        b.y += ny * overlap * 0.04;
      }
    }
  }

  /**
   * 全部删除：每个泡泡在**自己原来的位置**炸开，绝不向同一点聚集。
   * 单个泡泡的时间线（本地进度 t）：
   *   t < 0.18            原地轻微膨胀
   *   t = 0.18            以自身为圆心生成一圈外扩光环
   *   0.25 < t < 0.55     文字模糊淡出
   *   t = 0.55            炸成若干粒子，粒子向外扩散
   *   t → 1               本体消失
   * 每个泡泡带 0~250ms 随机错峰，因此整屏是「一片一片炸开」而不是同时消失。
   */
  function updateErasure(dt) {
    if (!erasure) return false;
    const step = dt * 1000;
    erasure.elapsed += step;

    if (erasure.reducedMotion) {
      // 减少动态效果：原地快速淡出，不生成粒子与光环。
      const raw = clamp(erasure.elapsed / erasure.durationMs, 0, 1);
      bubbles.forEach(function (bubble) {
        bubble.opacity = Math.max(0, bubble.eraseStartOpacity * (1 - raw));
        bubble.textFade = Math.max(0, 1 - raw * 1.4);
      });
      erasure.fade = raw;
      if (raw >= 1) finishErasure();
      return true;
    }

    bubbles.forEach(function (bubble) {
      // 坐标锁死：删除阶段泡泡不再移动，只在原地形变。
      bubble.vx = 0;
      bubble.vy = 0;
      const local = clamp((erasure.elapsed - bubble.eraseDelay) / bubble.eraseDuration, 0, 1);
      if (local <= 0) return;

      if (local < 0.18) {
        bubble.scale = bubble.eraseStartScale * (1 + easeOutCubic(local / 0.18) * 0.14);
      } else {
        if (!bubble.eraseRing) {
          bubble.eraseRing = true;
          spawnErasureRing(bubble);
        }
        const shrink = (local - 0.18) / 0.82;
        bubble.scale = Math.max(0, bubble.eraseStartScale * 1.14 * (1 - easeInOutCubic(shrink)));
      }

      if (local > 0.25) {
        bubble.textFade = Math.max(0, 1 - (local - 0.25) / 0.30);
      }
      if (local >= 0.55 && !bubble.eraseBurst) {
        bubble.eraseBurst = true;
        spawnErasureParticles(bubble);
      }
      bubble.opacity = local < 0.55
        ? bubble.eraseStartOpacity * (1 - local * 0.35)
        : Math.max(0, bubble.eraseStartOpacity * 0.81 * (1 - (local - 0.55) / 0.45));
    });

    // 背景网格与氛围随爆裂尾声一起淡出，最终留下真正的空白。
    erasure.fade = clamp((erasure.elapsed - erasure.burstEndMs * 0.55) /
      Math.max(1, erasure.burstEndMs * 0.55), 0, 1);

    // 爆裂阶段不走常规物理，但粒子与光环仍要继续衰减，
    // 否则 particles/ripples 永远不为空，清空流程会卡住。
    updateEffects(dt);

    if (erasure.elapsed >= erasure.burstEndMs && particles.length === 0 && ripples.length === 0) {
      finishErasure();
    }
    return true;
  }

  /** 粒子与光环的衰减：常规帧与爆裂帧共用。 */
  function updateEffects(dt) {
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const particle = particles[i];
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= 0.985;
      particle.vy *= 0.985;
      if (particle.life <= 0) particles.splice(i, 1);
    }

    for (let i = ripples.length - 1; i >= 0; i -= 1) {
      const ripple = ripples[i];
      ripple.life -= dt;
      ripple.radius += ripple.speed * dt;
      if (ripple.life <= 0) ripples.splice(i, 1);
    }
  }

  function finishErasure() {
    if (!erasure || erasure.completed) return;
    erasure.completed = true;
    const onComplete = erasure.onComplete;
    bubbles.length = 0;
    particles.length = 0;
    ripples.length = 0;
    notifyBubbleCount();
    erasure = null;
    if (typeof onComplete === 'function') onComplete();
  }

  /** 以泡泡自身位置为圆心的外扩光环。 */
  function spawnErasureRing(bubble) {
    const life = 0.42;
    ripples.push({
      x: bubble.x,
      y: bubble.y,
      radius: Math.max(6, bubble.radius * 0.62),
      speed: Math.max(70, bubble.radius * 1.5),
      life: life,
      maxLife: life,
      color: 'rgba(226, 232, 244, 0.60)'
    });
  }

  /** 原地炸成少量粒子，粒子由泡泡当前位置向外扩散。 */
  function spawnErasureParticles(bubble) {
    const count = randomInt(6, 9);
    for (let i = 0; i < count; i += 1) {
      const angle = (Math.PI * 2 * i) / count + random(-0.3, 0.3);
      const speed = random(70, 165);
      const life = random(0.34, 0.62);
      particles.push({
        x: bubble.x,
        y: bubble.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: random(1.6, 4.0),
        life: life,
        maxLife: life,
        color: 'rgba(214, 224, 240, 0.86)'
      });
    }
  }


  function nearestBubble(source, predicate) {
    let nearest = null;
    let best = Infinity;
    for (let i = 0; i < bubbles.length; i += 1) {
      const candidate = bubbles[i];
      if (candidate === source || candidate.state === 'bursting') continue;
      if (predicate && !predicate(candidate)) continue;
      const dx = candidate.x - source.x;
      const dy = candidate.y - source.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < best) { best = d2; nearest = candidate; }
    }
    return nearest;
  }

  /**
   * 每帧最近邻缓存：B5/B7 的运动、以及 B7 的连线绘制原本各自调用一次
   * nearestBubble（每次 O(n)），同一帧里对同一个泡泡算了两三遍。
   * 这里按帧号复用结果，一帧内每个泡泡只搜一次。
   */
  let nearestFrameId = -1;
  function nearestBubbleThisFrame(source) {
    if (source.nearestFrame === nearestFrameId) return source.nearestCache;
    const nearest = nearestBubble(source);
    source.nearestFrame = nearestFrameId;
    source.nearestCache = nearest;
    return nearest;
  }

  function emitBehavior(kind, bubble, extra) {
    if (typeof callbacks.onBehavior !== 'function') return;
    callbacks.onBehavior(Object.assign({
      kind: kind,
      bubble: bubble,
      behaviorType: bubble.behaviorType,
      behaviorName: behaviorMeta(bubble.behaviorType).name,
      mode: mode
    }, extra || {}));
  }

  function applyBehaviorMotion(bubble, dt, time) {
    const intensity = currentBehaviorIntensity();
    bubble.age += dt;
    bubble.behaviorFlash = Math.max(0, bubble.behaviorFlash - dt * 2.6);

    if (bubble.behaviorType === 'B1_LIGHT' && !isSoftMode()) {
      bubble.vy -= (3.2 + intensity * 4.2) * dt;
      bubble.vx += Math.sin(time * 1.15 + bubble.phase) * dt * (2.0 + intensity * 4.0);
    }

    if (bubble.behaviorType === 'B2_ESCAPE' && pointer.active && mode !== 'return' && mode !== 'observe-select' && mode !== 'observe-focus') {
      const dx = bubble.x - pointer.x;
      const dy = bubble.y - pointer.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const trigger = bubble.radius * (Number(CONFIG.ESCAPE_POINTER_RANGE_FACTOR) || 3.2) + intensity * 150;
      if (distance < trigger) {
        const force = (1 - distance / trigger) * (95 + 300 * intensity) * dt;
        bubble.vx += dx / distance * force;
        bubble.vy += dy / distance * force;
      }
    }

    if (bubble.behaviorType === 'B5_CLUSTER' && (mode === 'calm' || mode === 'growth')) {
      const target = nearestBubbleThisFrame(bubble);
      if (target) {
        const dx = target.x - bubble.x;
        const dy = target.y - bubble.y;
        const distance = Math.max(1, Math.hypot(dx, dy));
        const range = mode === 'growth' ? 390 : 300;
        if (distance < range) {
          const force = (mode === 'growth' ? 50 + 130 * intensity : 30 + 45 * intensity) * dt;
          bubble.vx += dx / distance * force;
          bubble.vy += dy / distance * force;
        }
      }
    }

    if (bubble.behaviorType === 'B7_LINKED' && (mode === 'calm' || mode === 'growth')) {
      const target = nearestBubbleThisFrame(bubble);
      if (target) {
        const dx = target.x - bubble.x;
        const dy = target.y - bubble.y;
        const distance = Math.max(1, Math.hypot(dx, dy));
        if (distance > 120 && distance < 420) {
          const force = (12 + intensity * 24) * dt;
          bubble.vx += dx / distance * force;
          bubble.vy += dy / distance * force;
        }
      }
    }

    if (bubble.behaviorType === 'B8_BURST' && (mode === 'calm' || mode === 'growth')) {
      bubble.burstCooldown -= dt;
      if (bubble.burstCooldown <= 0) {
        const angle = random(0, Math.PI * 2);
        const kick = mode === 'growth' ? random(120, 220) * (0.75 + intensity * 0.65) : random(82, 145);
        bubble.vx += Math.cos(angle) * kick;
        bubble.vy += Math.sin(angle) * kick;
        bubble.behaviorFlash = 1;
        bubble.burstCooldown = mode === 'growth' ? random(0.55, Math.max(0.85, 2.1 - intensity * 1.1)) : random(1.5, 3.0);
      }
    }

    if (bubble.behaviorType === 'B9_PRESSURE' && (mode === 'calm' || mode === 'growth')) {
      const maxRadius = mode === 'growth' ? CONFIG.BUBBLE_MAX_RADIUS * (1.18 + intensity * 0.48) : CONFIG.BUBBLE_MAX_RADIUS * 1.18;
      const growPerSec = mode === 'growth' ? 3.2 + intensity * 8.4 : 1.45;
      bubble.radius = Math.min(maxRadius, bubble.radius + dt * growPerSec);
    }

    if (bubble.behaviorType === 'B6_STUBBORN' && (mode === 'calm' || mode === 'growth')) {
      bubble.vx *= Math.pow(0.72, dt);
      bubble.vy *= Math.pow(0.72, dt);
    }

    if (bubble.behaviorType === 'B10_BLUR') {
      const near = pointer.active && Math.hypot(pointer.x - bubble.x, pointer.y - bubble.y) < bubble.radius * 2.4;
      const targetReveal = near ? 1 : mode === 'growth' ? 0.06 + (1 - intensity) * 0.12 : isSoftMode() ? 0.38 : 0.14;
      bubble.hoverReveal += (targetReveal - bubble.hoverReveal) * Math.min(1, dt * (near ? 7.5 : 3.2));
    } else {
      bubble.hoverReveal += (1 - bubble.hoverReveal) * Math.min(1, dt * 3);
    }

    if (mode === 'observe-focus') {
      if (bubble.id === observeFocusId) {
        bubble.selected = true;
        bubble.vx *= Math.pow(0.12, dt);
        bubble.vy *= Math.pow(0.12, dt);
        bubble.x += (width * 0.5 - bubble.x) * Math.min(1, dt * 2.4);
        bubble.y += (height * 0.52 - bubble.y) * Math.min(1, dt * 2.4);
        bubble.radius += (bubble.focusRadius - bubble.radius) * Math.min(1, dt * 2.2);
        bubble.opacity += (0.96 - bubble.opacity) * Math.min(1, dt * 2.5);
      } else {
        bubble.vx *= Math.pow(0.45, dt);
        bubble.vy *= Math.pow(0.45, dt);
        bubble.opacity += (0.12 - bubble.opacity) * Math.min(1, dt * 1.8);
      }
    }
  }

  function burstDelete(bubble, kind) {
    bubble.state = 'bursting';
    bubble.burstElapsed = 0;
    bubble.burstKind = kind || 'delete';
    spawnParticles(bubble, false);
  }

  function scheduleBehaviorRespawn(bubble, delayMin, delayMax) {
    const profile = bubble.profile;
    const radius = bubble.baseRadius || bubble.radius;
    const id = window.setTimeout(function () {
      returnTimers = returnTimers.filter(function (timer) { return timer !== id; });
      if (!canvas || mode === 'erasing') return;
      createBubble(profile, {
        entering: true,
        radius: random(radius * 0.82, radius * 1.02),
        opacity: random(0.58, 0.84)
      });
    }, Math.round(random(delayMin, delayMax)));
    returnTimers.push(id);
  }

  function spawnSplitEchoes(bubble) {
    const count = Math.max(2, Number(CONFIG.CALM_SPLIT_ECHO_COUNT) || 3);
    const lifeMs = Math.max(300, Number(CONFIG.CALM_SPLIT_ECHO_LIFE_MS) || 760);
    const color = bubble.behaviorColor || '#E06B76';
    const baseAngle = random(0, Math.PI * 2);
    for (let i = 0; i < count; i += 1) {
      const angle = baseAngle + (Math.PI * 2 * i) / count;
      const life = lifeMs / 1000 * random(0.78, 1.08);
      particles.push({ x: bubble.x + Math.cos(angle) * bubble.radius * 0.12, y: bubble.y + Math.sin(angle) * bubble.radius * 0.12, vx: Math.cos(angle) * random(38, 70), vy: Math.sin(angle) * random(38, 70), size: random(8, 14), life: life, maxLife: life, color: color, shape: 'ring' });
    }
    spawnRipple(bubble, false);
  }

  function dashAway(bubble, minSpeed, maxSpeed) {
    const angle = pointer.active ? Math.atan2(bubble.y - pointer.y, bubble.x - pointer.x) : random(0, Math.PI * 2);
    const speed = random(minSpeed, maxSpeed);
    bubble.vx = Math.cos(angle) * speed;
    bubble.vy = Math.sin(angle) * speed;
    bubble.state = 'rejecting';
    bubble.rejectElapsed = 0;
    bubble.behaviorFlash = 1;
    spawnRipple(bubble, true);
  }

  function handleCalmBehaviorHit(bubble) {
    const type = bubble.behaviorType;
    if (type === 'B1_LIGHT') {
      burstDelete(bubble, 'delete');
      if (typeof callbacks.onDelete === 'function') callbacks.onDelete({ bubble: bubble, behaviorEffect: true });
      return true;
    }
    if (type === 'B2_ESCAPE') {
      const dodgeLimit = Math.max(1, Number(CONFIG.ESCAPE_CALM_DODGES) || 1);
      if (bubble.hitCount < dodgeLimit) {
        bubble.hitCount += 1; dashAway(bubble, 170, 245); emitBehavior('escape', bubble, { signature: true, hitCount: bubble.hitCount }); return true;
      }
      burstDelete(bubble, 'delete'); if (typeof callbacks.onDelete === 'function') callbacks.onDelete({ bubble: bubble, behaviorEffect: true }); return true;
    }
    if (type === 'B3_SPLIT') {
      spawnSplitEchoes(bubble); burstDelete(bubble, 'delete');
      if (typeof callbacks.onDelete === 'function') callbacks.onDelete({ bubble: bubble, behaviorEffect: true });
      emitBehavior('split-preview', bubble, { signature: true }); return true;
    }
    if (type === 'B4_RETURN') {
      burstDelete(bubble, 'return');
      scheduleBehaviorRespawn(bubble, Number(CONFIG.RETURN_CALM_DELAY_MIN_MS) || 1050, Number(CONFIG.RETURN_CALM_DELAY_MAX_MS) || 1550);
      emitBehavior('return', bubble, { signature: true }); return true;
    }
    if (type === 'B5_CLUSTER') {
      const neighbors = bubbles.filter(function (item) { return item !== bubble && item.state === 'normal'; }).sort(function (a, b) { return Math.hypot(a.x - bubble.x, a.y - bubble.y) - Math.hypot(b.x - bubble.x, b.y - bubble.y); }).slice(0, 3);
      neighbors.forEach(function (target) { const dx = bubble.x - target.x, dy = bubble.y - target.y, distance = Math.max(1, Math.hypot(dx, dy)); target.vx += dx / distance * 125; target.vy += dy / distance * 125; target.scale = Math.max(target.scale, 1.08); target.behaviorFlash = 0.8; });
      burstDelete(bubble, 'delete'); if (typeof callbacks.onDelete === 'function') callbacks.onDelete({ bubble: bubble, behaviorEffect: true }); emitBehavior('cluster', bubble, { signature: true, affected: neighbors.length }); return true;
    }
    if (type === 'B6_STUBBORN') {
      bubble.requiredHits = Math.max(2, Number(CONFIG.STUBBORN_CALM_HITS) || 2); bubble.hitCount += 1;
      if (bubble.hitCount < bubble.requiredHits) { bubble.state = 'rejecting'; bubble.rejectElapsed = 0; bubble.behaviorFlash = 1; spawnRipple(bubble, true); emitBehavior('stubborn', bubble, { signature: true, hitCount: bubble.hitCount, requiredHits: bubble.requiredHits }); return true; }
      burstDelete(bubble, 'delete'); if (typeof callbacks.onDelete === 'function') callbacks.onDelete({ bubble: bubble, behaviorEffect: true }); return true;
    }
    if (type === 'B7_LINKED') {
      const target = nearestBubble(bubble);
      if (target) { target.radius = Math.min(CONFIG.BUBBLE_MAX_RADIUS * 1.42, target.radius * 1.34); target.scale = Math.max(target.scale, 1.16); target.behaviorFlash = 1; const dx = target.x - bubble.x, dy = target.y - bubble.y, distance = Math.max(1, Math.hypot(dx, dy)); target.vx += dx / distance * 95; target.vy += dy / distance * 95; }
      burstDelete(bubble, 'delete'); if (typeof callbacks.onDelete === 'function') callbacks.onDelete({ bubble: bubble, behaviorEffect: true }); emitBehavior('linked', bubble, { signature: true, target: target }); return true;
    }
    if (type === 'B8_BURST') {
      const dodgeLimit = Math.max(1, Number(CONFIG.BURST_CALM_DODGES) || 1);
      if (bubble.hitCount < dodgeLimit) { bubble.hitCount += 1; dashAway(bubble, 220, 315); emitBehavior('burst', bubble, { signature: true, hitCount: bubble.hitCount }); return true; }
      burstDelete(bubble, 'delete'); if (typeof callbacks.onDelete === 'function') callbacks.onDelete({ bubble: bubble, behaviorEffect: true }); return true;
    }
    if (type === 'B9_PRESSURE') {
      bubble.requiredHits = Math.max(2, Number(CONFIG.PRESSURE_CALM_HITS) || 2); bubble.hitCount += 1; bubble.radius = Math.max(CONFIG.BUBBLE_MIN_RADIUS * 0.72, bubble.radius * 0.72); bubble.scale = 0.90; bubble.behaviorFlash = 1; spawnRipple(bubble, true);
      if (bubble.hitCount < bubble.requiredHits) { emitBehavior('pressure', bubble, { signature: true, hitCount: bubble.hitCount, requiredHits: bubble.requiredHits }); return true; }
      burstDelete(bubble, 'delete'); if (typeof callbacks.onDelete === 'function') callbacks.onDelete({ bubble: bubble, behaviorEffect: true }); return true;
    }
    if (type === 'B10_BLUR') {
      if (bubble.hoverReveal < 0.72 && bubble.hitCount < 1) { bubble.hitCount += 1; bubble.hoverReveal = 1; bubble.state = 'rejecting'; bubble.rejectElapsed = 0; bubble.behaviorFlash = 1; spawnRipple(bubble, true); emitBehavior('blur', bubble, { signature: true, revealed: true }); return true; }
      burstDelete(bubble, 'delete'); if (typeof callbacks.onDelete === 'function') callbacks.onDelete({ bubble: bubble, behaviorEffect: true }); return true;
    }
    burstDelete(bubble, 'delete'); if (typeof callbacks.onDelete === 'function') callbacks.onDelete({ bubble: bubble }); return true;
  }

  function handleGrowthBehaviorHit(bubble) {
    const intensity = currentBehaviorIntensity();
    const type = bubble.behaviorType;

    if (type === 'B2_ESCAPE' && Math.random() < 0.52 + intensity * 0.45) {
      const angle = pointer.active ? Math.atan2(bubble.y - pointer.y, bubble.x - pointer.x) : random(0, Math.PI * 2);
      const speed = random(180, 280) * (0.85 + intensity * 0.55);
      bubble.vx = Math.cos(angle) * speed;
      bubble.vy = Math.sin(angle) * speed;
      bubble.state = 'rejecting';
      bubble.rejectElapsed = 0;
      emitBehavior('escape', bubble);
      return true;
    }

    if (type === 'B3_SPLIT') {
      const chance = Math.max(currentSplitChance(), 0.28 + intensity * 0.68);
      if (Math.random() < chance) {
        const childrenCreated = splitBubble(bubble);
        if (childrenCreated >= CONFIG.SPLIT_MIN_CHILDREN) {
          burstDelete(bubble, 'split');
          if (typeof callbacks.onSplit === 'function') callbacks.onSplit({ bubble: bubble, childrenCreated: childrenCreated });
          return true;
        }
      }
    }

    if (type === 'B4_RETURN' && Math.random() < 0.62 + intensity * 0.36) {
      burstDelete(bubble, 'return');
      scheduleBehaviorRespawn(bubble, 520, 1050);
      emitBehavior('return', bubble);
      return true;
    }

    if (type === 'B5_CLUSTER' && Math.random() < 0.62 + intensity * 0.34) {
      const target = nearestBubble(bubble);
      if (target) {
        const dx = bubble.x - target.x;
        const dy = bubble.y - target.y;
        const distance = Math.max(1, Math.hypot(dx, dy));
        target.vx += dx / distance * 40;
        target.vy += dy / distance * 40;
      }
      burstDelete(bubble, 'delete');
      if (typeof callbacks.onDelete === 'function') callbacks.onDelete({ bubble: bubble, behaviorEffect: true });
      emitBehavior('cluster', bubble);
      return true;
    }

    if (type === 'B6_STUBBORN') {
      bubble.requiredHits = Math.max(2, Number(CONFIG.STUBBORN_GROWTH_HITS) || 3);
      bubble.hitCount += 1;
      if (bubble.hitCount < bubble.requiredHits) {
        bubble.state = 'rejecting';
        bubble.rejectElapsed = 0;
        spawnRipple(bubble, true);
        emitBehavior('stubborn', bubble, { hitCount: bubble.hitCount, requiredHits: bubble.requiredHits });
        return true;
      }
    }

    if (type === 'B7_LINKED' && Math.random() < 0.64 + intensity * 0.32) {
      const target = nearestBubble(bubble);
      if (target) {
        target.radius = Math.min(CONFIG.BUBBLE_MAX_RADIUS * 1.48, target.radius * (1.24 + intensity * 0.24));
        target.scale = Math.max(target.scale, 1.06);
      }
      burstDelete(bubble, 'delete');
      if (typeof callbacks.onDelete === 'function') callbacks.onDelete({ bubble: bubble, behaviorEffect: true });
      emitBehavior('linked', bubble, { target: target });
      return true;
    }

    if (type === 'B8_BURST' && Math.random() < 0.55 + intensity * 0.40) {
      const angle = random(0, Math.PI * 2);
      const speed = random(230, 340);
      bubble.vx = Math.cos(angle) * speed;
      bubble.vy = Math.sin(angle) * speed;
      bubble.state = 'rejecting';
      bubble.rejectElapsed = 0;
      emitBehavior('burst', bubble);
      return true;
    }

    if (type === 'B9_PRESSURE') {
      bubble.hitCount += 1;
      bubble.radius = Math.max(CONFIG.BUBBLE_MIN_RADIUS * 0.72, bubble.radius * 0.82);
      bubble.scale = 0.94;
      spawnRipple(bubble, true);
      if (bubble.hitCount < Math.max(2, Number(CONFIG.PRESSURE_GROWTH_HITS) || 3) && bubble.radius > CONFIG.BUBBLE_MIN_RADIUS * 0.72) {
        emitBehavior('pressure', bubble, { hitCount: bubble.hitCount });
        return true;
      }
    }

    if (type === 'B10_BLUR' && bubble.hoverReveal < 0.72) {
      bubble.hoverReveal = Math.min(1, bubble.hoverReveal + 0.42);
      bubble.state = 'rejecting';
      bubble.rejectElapsed = 0;
      emitBehavior('blur', bubble);
      return true;
    }

    // 轻散型和其他行为没有触发特殊反应时，仍保留少量“系统不稳定”概率，
    // 避免只输入一个普通烦恼时整个失控阶段完全没有变化。
    if (type === 'B1_LIGHT' && transitionProgress > 0.55 && Math.random() < currentSplitChance() * 0.22) {
      const childrenCreated = splitBubble(bubble);
      if (childrenCreated >= CONFIG.SPLIT_MIN_CHILDREN) {
        burstDelete(bubble, 'split');
        if (typeof callbacks.onSplit === 'function') callbacks.onSplit({ bubble: bubble, childrenCreated: childrenCreated });
        return true;
      }
    }

    burstDelete(bubble, 'delete');
    if (typeof callbacks.onDelete === 'function') callbacks.onDelete({ bubble: bubble });
    return true;
  }

  function selectForObservation(bubble) {
    observeFocusId = bubble.id;
    mode = 'observe-focus';
    interactive = false;
    bubbles.forEach(function (item) { item.selected = item.id === bubble.id; });
    if (typeof callbacks.onObserveSelect === 'function') {
      callbacks.onObserveSelect({ bubble: bubble, text: bubble.text, profile: bubble.profile });
    }
  }

  function update(dt, time) {
    nearestFrameId += 1;
    if (mode === 'erasing' && updateErasure(dt)) return;

    for (let i = bubbles.length - 1; i >= 0; i -= 1) {
      const bubble = bubbles[i];
      if (bubble.state === 'bursting') {
        bubble.burstElapsed += dt * 1000;
        const burstMs = bubble.burstKind === 'return'
          ? CONFIG.DELETE_ANIMATION_MAX_MS * 1.8
          : CONFIG.DELETE_ANIMATION_MAX_MS;
        const t = clamp(bubble.burstElapsed / burstMs, 0, 1);
        if (bubble.burstKind === 'split') {
          // 分裂时母泡泡先轻微膨胀，再让位给子泡泡。
          bubble.scale = t < 0.4
            ? 1 + easeOutCubic(t / 0.4) * 0.15
            : Math.max(0, 1.15 * (1 - (t - 0.4) / 0.6));
        } else if (bubble.burstKind === 'return') {
          // 重现阶段：温和的原地消散，不炸开。
          bubble.scale = Math.max(0, 1 - easeInOutCubic(t) * 0.42);
        } else {
          bubble.scale = Math.max(0, 1 - t);
        }
        bubble.opacity = Math.max(0, bubble.opacity - dt * (bubble.burstKind === 'return' ? 1.9 : 3.8));
        if (bubble.burstElapsed >= burstMs) {
          bubbles.splice(i, 1);
          notifyBubbleCount();
        }
        continue;
      }

      if (bubble.state === 'rejecting') {
        bubble.rejectElapsed += dt * 1000;
        if (bubble.rejectElapsed >= CONFIG.REJECT_ANIMATION_MS) {
          bubble.rejectElapsed = 0;
          bubble.state = 'normal';
        }
      }

      applyBehaviorMotion(bubble, dt, time);
      bubble.scale += (1 - bubble.scale) * Math.min(1, dt * 7);
      if (settling) {
        // 「停下来看看」：泡泡逐渐减速，最终几乎静止。
        bubble.vx *= Math.pow(0.28, dt);
        bubble.vy *= Math.pow(0.28, dt);
      }
      const speedFactor = mode === 'growth' ? 1 + chaosLevel * 0.36 : isSoftMode() ? 0.52 : 1;
      bubble.x += bubble.vx * dt * speedFactor;
      bubble.y += bubble.vy * dt * speedFactor;
      bubble.y += Math.sin(time * 0.8 + bubble.phase) * dt * (isSoftMode() ? 1.1 : 3.0 + chaosLevel * 2.4);

      applyAvoidance(bubble, dt);

      const maxSpeed = mode === 'growth' ? CONFIG.SPLIT_SPEED_MAX * 0.90 : CONFIG.BUBBLE_SPEED_MAX * 1.55;
      const speed = Math.hypot(bubble.vx, bubble.vy);
      if (speed > maxSpeed) {
        bubble.vx = bubble.vx / speed * maxSpeed;
        bubble.vy = bubble.vy / speed * maxSpeed;
      }

      if (bubble.x - bubble.radius < 0) {
        bubble.x = bubble.radius;
        bubble.vx = Math.abs(bubble.vx);
      } else if (bubble.x + bubble.radius > width) {
        bubble.x = width - bubble.radius;
        bubble.vx = -Math.abs(bubble.vx);
      }
      if (bubble.y - bubble.radius < 0) {
        bubble.y = bubble.radius;
        bubble.vy = Math.abs(bubble.vy);
      } else if (bubble.y + bubble.radius > height) {
        bubble.y = height - bubble.radius;
        bubble.vy = -Math.abs(bubble.vy);
      }
    }

    applyBubbleRepulsion(dt);
    updateEffects(dt);
  }

  function draw(time) {
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, width, height);
    drawAmbient(time);
    drawBehaviorLinks();
    ripples.forEach(drawRipple);
    bubbles.forEach(function (bubble) { drawBubble(bubble, time); });
    particles.forEach(drawParticle);
  }

  function drawAmbient(time) {
    const red = mode === 'growth' ? chaosLevel : 0;
    const soft = isSoftMode() ? 1 : 0;
    const erasing = mode === 'erasing' ? 1 : 0;
    // 清空尾声：背景网格与氛围一起退场，最终留下空白。
    const erasureFade = erasure ? clamp(1 - erasure.fade, 0, 1) : 1;
    const gradient = ctx.createRadialGradient(width * 0.5, height * 0.48, 0, width * 0.5, height * 0.48, Math.max(width, height) * 0.78);
    if (soft) {
      gradient.addColorStop(0, 'rgba(130, 155, 190, 0.10)');
      gradient.addColorStop(1, 'rgba(22, 30, 43, 0)');
    } else if (erasing) {
      gradient.addColorStop(0, 'rgba(215, 220, 228, 0.10)');
      gradient.addColorStop(1, 'rgba(10, 8, 14, 0)');
    } else {
      gradient.addColorStop(0, 'rgba(' + Math.round(lerp(80, 150, red)) + ',' + Math.round(lerp(120, 52, red)) + ',' + Math.round(lerp(185, 58, red)) + ',' + (0.08 + red * 0.09).toFixed(3) + ')');
      gradient.addColorStop(1, 'rgba(8, 10, 18, 0)');
    }
    ctx.fillStyle = gradient;
    ctx.globalAlpha = erasureFade;
    ctx.fillRect(0, 0, width, height);
    ctx.globalAlpha = 1;

    ctx.save();
    const gridAlpha = soft ? 0.045 : mode === 'growth' ? 0.055 + chaosLevel * 0.13 : mode === 'erasing' ? 0.025 : 0.065;
    ctx.globalAlpha = gridAlpha * erasureFade;
    ctx.strokeStyle = mode === 'growth' ? '#b96f72' : mode === 'soft' ? '#8094b0' : '#7897c4';
    ctx.lineWidth = 1;
    const gap = mode === 'growth' ? lerp(58, 34, chaosLevel) : 58;
    const offset = (time * (mode === 'growth' ? 3 + chaosLevel * 7 : 2)) % gap;
    for (let x = -gap + offset; x < width + gap; x += gap) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
    }
    for (let y = -gap + offset; y < height + gap; y += gap) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
    }
    ctx.restore();
  }

  function drawBehaviorLinks() {
    if (!ctx || mode === 'erasing' || mode === 'blank' || mode === 'return') return;
    const linked = bubbles.filter(function (bubble) { return bubble.behaviorType === 'B7_LINKED' && bubble.state !== 'bursting' && bubble.opacity > 0.16; });
    if (!linked.length) return;
    ctx.save(); ctx.lineWidth = mode === 'growth' ? 1.8 : 1.35;
    linked.forEach(function (bubble) {
      const nearest = nearestBubbleThisFrame(bubble); if (!nearest) return;
      const d = Math.hypot(nearest.x - bubble.x, nearest.y - bubble.y); if (d > 430) return;
      const alpha = mode === 'growth' ? 0.32 + currentBehaviorIntensity() * 0.34 : 0.28;
      const gradient = ctx.createLinearGradient(bubble.x, bubble.y, nearest.x, nearest.y);
      gradient.addColorStop(0, 'rgba(226,108,174,' + alpha.toFixed(3) + ')');
      gradient.addColorStop(0.5, 'rgba(238,174,211,' + (alpha * 0.75).toFixed(3) + ')');
      gradient.addColorStop(1, 'rgba(190,139,177,' + (alpha * 0.45).toFixed(3) + ')');
      ctx.strokeStyle = gradient; ctx.setLineDash([7, 7]); ctx.beginPath(); ctx.moveTo(bubble.x, bubble.y); ctx.lineTo(nearest.x, nearest.y); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(245,205,229,' + Math.min(0.7, alpha + 0.16).toFixed(3) + ')'; ctx.beginPath(); ctx.arc((bubble.x + nearest.x) / 2, (bubble.y + nearest.y) / 2, 3.2, 0, Math.PI * 2); ctx.fill();
    }); ctx.restore();
  }

  function drawBehaviorSignature(bubble, r, time) {
    if (isSoftMode() || r < 8) return;
    const type = bubble.behaviorType, intensity = mode === 'growth' ? 0.72 + currentBehaviorIntensity() * 0.28 : 0.72;
    const pulse = 0.5 + 0.5 * Math.sin(time * 3.2 + bubble.behaviorPulse), color = bubble.behaviorColor || '#8FA9D2';
    ctx.save(); ctx.globalAlpha = Math.min(0.92, bubble.opacity * intensity); ctx.strokeStyle = color; ctx.fillStyle = color;
    if (type === 'B1_LIGHT') {
      [0.34,0.58,0.82].forEach(function(f,i){ ctx.globalAlpha=0.26+i*0.10; ctx.beginPath(); ctx.arc(-r*0.18+i*r*0.17,-r*(0.65+f*0.28)-pulse*4,Math.max(1.8,r*(0.025+i*0.008)),0,Math.PI*2); ctx.fill(); });
    } else if (type === 'B2_ESCAPE') {
      const angle=Math.atan2(bubble.vy,bubble.vx)+Math.PI; for(let i=0;i<2;i+=1){ const offset=(i-0.5)*r*0.22; ctx.lineWidth=Math.max(1.4,r*0.022); ctx.beginPath(); ctx.moveTo(Math.cos(angle)*r*0.72+Math.cos(angle+Math.PI/2)*offset,Math.sin(angle)*r*0.72+Math.sin(angle+Math.PI/2)*offset); ctx.lineTo(Math.cos(angle)*r*(1.15+pulse*0.12)+Math.cos(angle+Math.PI/2)*offset,Math.sin(angle)*r*(1.15+pulse*0.12)+Math.sin(angle+Math.PI/2)*offset); ctx.stroke(); }
    } else if (type === 'B3_SPLIT') {
      [-1,1].forEach(function(dir){ctx.globalAlpha=0.48+pulse*0.22;ctx.lineWidth=Math.max(1.2,r*0.018);ctx.beginPath();ctx.arc(dir*r*0.68,r*0.10,r*(0.14+pulse*0.025),0,Math.PI*2);ctx.stroke();});
    } else if (type === 'B4_RETURN') {
      ctx.globalAlpha=0.36+pulse*0.22;ctx.lineWidth=Math.max(1.2,r*0.018);ctx.setLineDash([5,7]);ctx.beginPath();ctx.arc(0,0,r*(1.13+pulse*0.04),0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
    } else if (type === 'B5_CLUSTER') {
      for(let i=0;i<3;i+=1){const a=time*0.65+bubble.phase+i*Math.PI*2/3;ctx.globalAlpha=0.50;ctx.beginPath();ctx.arc(Math.cos(a)*r*0.88,Math.sin(a)*r*0.88,Math.max(2,r*0.045),0,Math.PI*2);ctx.fill();}
    } else if (type === 'B6_STUBBORN') {
      ctx.globalAlpha=0.48;ctx.lineWidth=Math.max(2.1,r*0.038);ctx.beginPath();ctx.arc(0,0,r*0.91,0,Math.PI*2);ctx.stroke();
    } else if (type === 'B7_LINKED') {
      ctx.globalAlpha=0.58;ctx.lineWidth=Math.max(1.5,r*0.025);ctx.beginPath();ctx.moveTo(-r*0.32,r*0.48);ctx.quadraticCurveTo(0,r*0.66,r*0.32,r*0.48);ctx.stroke();ctx.beginPath();ctx.arc(-r*0.34,r*0.48,r*0.055,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(r*0.34,r*0.48,r*0.055,0,Math.PI*2);ctx.fill();
    } else if (type === 'B8_BURST') {
      const angle=Math.atan2(bubble.vy,bubble.vx)+Math.PI;ctx.globalAlpha=0.42+bubble.behaviorFlash*0.35;ctx.lineWidth=Math.max(1.4,r*0.022);[-0.22,0,0.22].forEach(function(offset){ctx.beginPath();ctx.moveTo(Math.cos(angle)*r*0.78+Math.cos(angle+Math.PI/2)*r*offset,Math.sin(angle)*r*0.78+Math.sin(angle+Math.PI/2)*r*offset);ctx.lineTo(Math.cos(angle)*r*(1.28+bubble.behaviorFlash*0.35)+Math.cos(angle+Math.PI/2)*r*offset,Math.sin(angle)*r*(1.28+bubble.behaviorFlash*0.35)+Math.sin(angle+Math.PI/2)*r*offset);ctx.stroke();});
    } else if (type === 'B9_PRESSURE') {
      [1.08,1.20].forEach(function(factor,i){ctx.globalAlpha=(0.20+pulse*0.20)*(1-i*0.25);ctx.lineWidth=Math.max(1.4,r*0.02);ctx.beginPath();ctx.arc(0,0,r*(factor+pulse*0.04),0,Math.PI*2);ctx.stroke();});
    } else if (type === 'B10_BLUR') {
      ctx.globalAlpha=0.34;ctx.lineWidth=Math.max(1.2,r*0.018);ctx.setLineDash([2,8]);ctx.beginPath();ctx.arc(0,0,r*1.06,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
    }
    ctx.restore();
  }

  function drawBubble(bubble, time) {
    const r = bubble.radius * bubble.scale;
    if (r <= 0.5) return;

    const blurPx = bubble.behaviorType === 'B10_BLUR'
      ? Math.max(0, (1 - bubble.hoverReveal) * (mode === 'growth' ? 7.2 : isSoftMode() ? 2.8 : 5.4))
      : 0;

    if (blurPx > 0.2) {
      // 模糊到这个程度，泡泡上的文字和行为签名本来就看不清，
      // 逐帧重画毫无意义。按（半径, 模糊量, 配色）量化后缓存成贴图，
      // 参数不变时直接贴回，把每帧的模糊次数降到接近 0。
      const rq = Math.round(r / 3) * 3;
      const bq = Math.round(blurPx * 2) / 2;
      const palette = bubblePalette(bubble, mode === 'growth' ? chaosLevel : 0);
      const key = bubble.behaviorType + '|' + rq + '|' + bq + '|' + palette.stop1 + '|' + Math.round(dpr * 10);
      // 贴图里烘焙的是「静止、未被拒绝」的泡泡，
      // 抖动和放大在贴回主画布时施加，否则被拒绝的一帧会污染缓存。
      const rejecting = bubble.state === 'rejecting';
      const rejectProgress = rejecting ? clamp(bubble.rejectElapsed / CONFIG.REJECT_ANIMATION_MS, 0, 1) : 0;
      let sprite = blurSprites.get(key);
      if (!sprite) {
        // 泡泡本体最大到 r * 1.28（B9 的外圈），再留出模糊扩散的余量。
        const size = Math.ceil((rq * 1.35 + bq * 3 + 6) * 2);
        const surface = document.createElement('canvas');
        surface.width = Math.round(size * dpr);
        surface.height = Math.round(size * dpr);
        const lc = surface.getContext('2d');
        lc.setTransform(dpr, 0, 0, dpr, 0, 0);
        lc.translate(size / 2, size / 2);
        // 关键：模糊设在**离屏层**上。设在主画布上等于让浏览器模糊整个全屏，
        // 那正是原来卡顿的根源；这里模糊面积只有这一小块画布，且只做一次。
        lc.filter = 'blur(' + bq.toFixed(2) + 'px)';
        const previousCtx = ctx;
        ctx = lc;               // 让 paintBubbleBody 及其下游全部画到离屏层
        paintBubbleBody(bubble, rq, 0, true);
        ctx = previousCtx;
        lc.filter = 'none';
        sprite = { canvas: surface, size: size };
        if (blurSprites.size > 160) blurSprites.clear();
        blurSprites.set(key, sprite);
      }

      const shakeX = rejecting ? Math.sin(rejectProgress * Math.PI * 10) * (1 - rejectProgress) * 9 : 0;
      const shakeY = rejecting ? Math.cos(rejectProgress * Math.PI * 8) * (1 - rejectProgress) * 4 : 0;
      const pulse = mode === 'growth' ? 1 + Math.sin(time * (2.6 + chaosLevel * 2.5) + bubble.phase) * (0.012 + chaosLevel * 0.025) : 1;
      const rejectScale = rejecting ? 1 + Math.sin(rejectProgress * Math.PI) * 0.16 : 1;
      const scale = pulse * rejectScale;

      ctx.save();
      ctx.globalAlpha = bubble.opacity;
      ctx.translate(bubble.x + shakeX, bubble.y + shakeY);
      if (scale !== 1) ctx.scale(scale, scale);
      ctx.drawImage(sprite.canvas, -sprite.size / 2, -sprite.size / 2, sprite.size, sprite.size);
      ctx.restore();
      return;
    }

    ctx.save();
    ctx.translate(bubble.x, bubble.y);
    ctx.globalAlpha = bubble.opacity;
    paintBubbleBody(bubble, r, time, false);
    ctx.restore();
  }

  /**
   * 画泡泡本体，坐标原点已经在泡泡中心（主画布或离屏层）。
   * offscreen=true 时目标是离屏层：那里不叠 opacity，贴回主画布时统一乘。
   */
  function paintBubbleBody(bubble, r, time, offscreen) {
    ctx.save();
    // 离屏贴图只烘焙「静止、未被拒绝」的样子：抖动、脉动、拒绝放大都依赖
    // 逐帧变化的时间，烘焙进去会被后续帧复用而卡住，这些改由调用方在贴回时施加。
    const rejecting = !offscreen && bubble.state === 'rejecting';
    const rejectProgress = rejecting ? clamp(bubble.rejectElapsed / CONFIG.REJECT_ANIMATION_MS, 0, 1) : 0;
    if (offscreen) {
      ctx.globalAlpha = 1;
    } else {
      const shakeX = rejecting ? Math.sin(rejectProgress * Math.PI * 10) * (1 - rejectProgress) * 9 : 0;
      const shakeY = rejecting ? Math.cos(rejectProgress * Math.PI * 8) * (1 - rejectProgress) * 4 : 0;
      ctx.translate(shakeX, shakeY);
      const growthPulse = mode === 'growth' ? 1 + Math.sin(time * (2.6 + chaosLevel * 2.5) + bubble.phase) * (0.012 + chaosLevel * 0.025) : 1;
      const rejectScale = rejecting ? 1 + Math.sin(rejectProgress * Math.PI) * 0.16 : 1;
      ctx.scale(growthPulse * rejectScale, growthPulse * rejectScale);
    }

    const red = mode === 'growth' ? chaosLevel : 0;
    const palette = bubblePalette(bubble, red);

    // 外发光：原本靠 shadowBlur 实现，但那会让每次填充都多跑一遍模糊卷积，
    // 几十个泡泡叠加后开销很大。改成先铺一层向外淡出的径向渐变，
    // 观感一致（同样的颜色、同样的扩散范围），成本只是一次普通填充。
    const glowSpan = (isSoftMode() ? 17 : 17 + red * 16) * 0.92;
    const glow = ctx.createRadialGradient(0, 0, Math.max(0.1, r * 0.92), 0, 0, r + glowSpan);
    glow.addColorStop(0, palette.glow);
    glow.addColorStop(1, palette.glowFade);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, r + glowSpan, 0, Math.PI * 2);
    ctx.fill();

    const g = ctx.createRadialGradient(-r * 0.28, -r * 0.36, r * 0.08, 0, 0, r);
    g.addColorStop(0, palette.stop0);
    g.addColorStop(0.55, palette.stop1);
    g.addColorStop(1, palette.stop2);

    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = palette.outline;
    ctx.lineWidth = rejecting ? 2.2 : 1.2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(-r * 0.24, -r * 0.28, r * 0.13, Math.PI * 1.05, Math.PI * 1.75);
    ctx.strokeStyle = 'rgba(255,255,255,0.42)';
    ctx.lineWidth = Math.max(1, r * 0.025);
    ctx.stroke();

    drawBehaviorSignature(bubble, r, time);

    if (bubble.behaviorType === 'B6_STUBBORN' && bubble.hitCount > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(235,240,248,' + Math.min(0.58, 0.18 + bubble.hitCount * 0.16).toFixed(2) + ')';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-r * 0.10, -r * 0.58);
      ctx.lineTo(r * 0.02, -r * 0.18);
      ctx.lineTo(-r * 0.08, r * 0.08);
      ctx.lineTo(r * 0.14, r * 0.48);
      ctx.stroke();
      ctx.restore();
    }

    drawText(bubble.text, r, bubble.textFade);
    ctx.restore();
  }

  function drawText(text, radius, fade) {
    const textAlpha = Number.isFinite(fade) ? clamp(fade, 0, 1) : 1;
    if (textAlpha <= 0.02) return;
    const fontSize = Math.max(11, Math.min(20, radius * 0.26));
    ctx.save();
    // 清空阶段：文字先模糊、再淡出。
    if (textAlpha < 1) {
      ctx.globalAlpha = ctx.globalAlpha * textAlpha;
      ctx.shadowColor = 'rgba(236, 240, 248, 0.55)';
      ctx.shadowBlur = (1 - textAlpha) * 7;
    }
    ctx.fillStyle = isSoftMode() ? 'rgba(232,238,247,0.70)' : 'rgba(250,252,255,0.92)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '400 ' + fontSize + 'px ' + fontStackFor(text);
    const maxWidth = radius * 1.45;
    const lines = wrapTextCached(text, maxWidth, fontSize);
    const lineHeight = fontSize * 1.25;
    const startY = -((lines.length - 1) * lineHeight) / 2;
    lines.slice(0, 3).forEach(function (line, index) {
      ctx.fillText(line, 0, startY + index * lineHeight, maxWidth);
    });
    ctx.restore();
  }

  /**
   * 分行结果只取决于（文本, 字号, 最大宽度）。
   * 逐字 measureText 在几十个泡泡下每帧上百次调用，缓存后每种组合只算一次。
   * 宽度按 4px 分档，避免半径连续变化时缓存永远命中不了。
   */
  function wrapTextCached(text, maxWidth, fontSize) {
    const key = text + '|' + Math.round(fontSize) + '|' + Math.round(maxWidth / 4);
    const cached = textLineCache.get(key);
    if (cached) return cached;
    const lines = wrapText(text, maxWidth);
    if (textLineCache.size > 400) textLineCache.clear();
    textLineCache.set(key, lines);
    return lines;
  }

  function wrapText(text, maxWidth) {
    const chars = Array.from(text);
    const lines = [];
    let line = '';
    chars.forEach(function (char) {
      const test = line + char;
      if (line && ctx.measureText(test).width > maxWidth) {
        lines.push(line);
        line = char;
      } else {
        line = test;
      }
    });
    if (line) lines.push(line);
    if (lines.length > 3) {
      lines.length = 3;
      const last = lines[2];
      lines[2] = last.slice(0, Math.max(1, last.length - 1)) + '…';
    }
    return lines;
  }

  function drawRipple(ripple) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, ripple.life / ripple.maxLife) * 0.72;
    ctx.strokeStyle = ripple.color;
    ctx.lineWidth = Math.max(1, 3 * (ripple.life / ripple.maxLife));
    ctx.beginPath();
    ctx.arc(ripple.x, ripple.y, ripple.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawParticle(particle) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, particle.life / particle.maxLife);
    if (particle.shape === 'ring') {
      ctx.strokeStyle = particle.color; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2); ctx.stroke();
    } else {
      ctx.fillStyle = particle.color; ctx.beginPath(); ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function spawnParticles(bubble, rejected) {
    const red = mode === 'growth';
    const color = rejected ? '#e7a0a3' : red ? '#e2767b' : '#8fb7ef';
    const count = rejected ? 8 : 14;
    for (let i = 0; i < count; i += 1) {
      const angle = random(0, Math.PI * 2);
      const speed = random(45, rejected ? 95 : 150);
      const life = random(0.25, 0.52);
      particles.push({
        x: bubble.x,
        y: bubble.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: random(1.5, 4.2),
        life: life,
        maxLife: life,
        color: color
      });
    }
  }

  function spawnRipple(bubble, rejected) {
    const life = rejected ? 0.34 : 0.48;
    ripples.push({
      x: bubble.x,
      y: bubble.y,
      radius: Math.max(8, bubble.radius * 0.2),
      speed: Math.max(90, bubble.radius * (rejected ? 1.7 : 2.8)),
      life: life,
      maxLife: life,
      color: rejected ? 'rgba(235, 186, 188, 0.70)' : 'rgba(244, 139, 145, 0.92)'
    });
  }

  function splitBubble(bubble) {
    let availableAfterParentLeaves = Math.max(0, CONFIG.MAX_BUBBLES - bubbles.length + 1);

    // 达到性能保护上限时，回收远处最小的旧泡泡，为当前点击腾出分裂空间。
    // 玩家看到的点击对象仍会由 1 个分裂为多个，不会突然变成“删除被拒绝”。
    while (availableAfterParentLeaves < CONFIG.SPLIT_MIN_CHILDREN) {
      let recycleIndex = -1;
      let recycleRadius = Infinity;
      for (let i = 0; i < bubbles.length; i += 1) {
        const candidate = bubbles[i];
        if (candidate === bubble || candidate.state !== 'normal') continue;
        if (candidate.radius < recycleRadius) {
          recycleRadius = candidate.radius;
          recycleIndex = i;
        }
      }
      if (recycleIndex < 0) break;
      bubbles.splice(recycleIndex, 1);
      availableAfterParentLeaves += 1;
    }
    if (availableAfterParentLeaves < CONFIG.SPLIT_MIN_CHILDREN) return 0;

    const desired = randomInt(CONFIG.SPLIT_MIN_CHILDREN, CONFIG.SPLIT_MAX_CHILDREN);
    const childCount = Math.min(desired, availableAfterParentLeaves);
    const baseAngle = random(0, Math.PI * 2);

    for (let i = 0; i < childCount; i += 1) {
      const spread = (Math.PI * 2 * i) / childCount;
      const angle = baseAngle + spread + random(-0.24, 0.24);
      const childRadius = clamp(
        bubble.radius * random(CONFIG.SPLIT_CHILD_RADIUS_FACTOR_MIN, CONFIG.SPLIT_CHILD_RADIUS_FACTOR_MAX),
        CONFIG.SPLIT_CHILD_RADIUS_MIN,
        bubble.radius * 0.72
      );
      const speed = random(CONFIG.SPLIT_SPEED_MIN, CONFIG.SPLIT_SPEED_MAX);
      const offset = Math.max(8, bubble.radius * 0.14);
      createBubble(bubble.profile, {
        x: bubble.x + Math.cos(angle) * offset,
        y: bubble.y + Math.sin(angle) * offset,
        radius: childRadius,
        angle: angle,
        speed: speed,
        initialScale: 0.12,
        opacity: random(0.72, 0.94),
        isSplitChild: true
      });
    }

    spawnRipple(bubble, false);
    return childCount;
  }

  /** 重现阶段：消散后在**别处**重新出现，延迟 800~1200ms 随机。 */
  function respawnReturnBubble(bubble) {
    const profile = bubble.profile;
    const minDelay = Math.max(180, Number(CONFIG.RETURN_RESPAWN_DELAY_MIN_MS) || 800);
    const maxDelay = Math.max(minDelay, Number(CONFIG.RETURN_RESPAWN_DELAY_MAX_MS) || 1200);
    const delay = Math.round(random(minDelay, maxDelay));
    const id = window.setTimeout(function () {
      returnTimers = returnTimers.filter(function (timer) { return timer !== id; });
      if (mode !== 'return' || !canvas) return;
      createBubble(profile, {
        entering: true,
        radius: random(CONFIG.BUBBLE_MIN_RADIUS * 0.86, CONFIG.BUBBLE_MAX_RADIUS * 0.94),
        opacity: random(0.34, 0.50)
      });
    }, delay);
    returnTimers.push(id);
  }

  function handleClick(x, y) {
    if (typeof callbacks.onClick === 'function') callbacks.onClick();
    for (let i = bubbles.length - 1; i >= 0; i -= 1) {
      const bubble = bubbles[i];
      if (bubble.state !== 'normal') continue;
      const dx = x - bubble.x;
      const dy = y - bubble.y;
      const hitRadius = bubble.radius * bubble.scale + 10;
      if (dx * dx + dy * dy <= hitRadius * hitRadius) {
        if (mode === 'observe-select') {
          selectForObservation(bubble);
        } else if (mode === 'growth') {
          handleGrowthBehaviorHit(bubble);
        } else if (mode === 'return') {
          burstDelete(bubble, 'return');
          respawnReturnBubble(bubble);
          if (typeof callbacks.onReturnDelete === 'function') callbacks.onReturnDelete({ bubble: bubble });
        } else {
          handleCalmBehaviorHit(bubble);
        }
        return true;
      }
    }
    if (typeof callbacks.onMiss === 'function') callbacks.onMiss();
    return false;
  }

  function addGrowthBubble() {
    const automaticLimit = Number(CONFIG.AUTO_GROWTH_MAX_BUBBLES) || CONFIG.MAX_BUBBLES;
    if (bubbles.length >= automaticLimit) return false;
    createBubble(pick(worries), { entering: true });
    return true;
  }

  /**
   * 正常删除阶段的补充循环：每秒检查一次，把数量维持在 6~10 个。
   * 目的是让「正常删除」能持续 14 秒以上而不出现「明显不够点」的空场。
   */
  function scheduleNormalRefill() {
    if (mode !== 'calm') return;
    normalTimer = window.setTimeout(function () {
      normalTimer = 0;
      if (mode !== 'calm') return;
      const alive = bubbles.filter(function (b) { return b.state !== 'bursting'; }).length;
      const target = Number(CONFIG.NORMAL_TARGET_BUBBLES) || 9;
      const min = Number(CONFIG.NORMAL_MIN_BUBBLES) || 6;
      const max = Number(CONFIG.NORMAL_MAX_BUBBLES) || 10;
      if (alive < min) {
        // 掉到下限说明用户点得很快：一次补回到目标值，避免出现「没东西可点」的空场。
        for (let i = alive; i < target; i += 1) createBubble(pick(worries), { entering: true });
      } else if (alive < target && bubbles.length < max) {
        createBubble(pick(worries), { entering: true });
      }
      scheduleNormalRefill();
    }, Math.max(200, Number(CONFIG.NORMAL_SPAWN_INTERVAL_MS) || 1000));
  }

  function startNormalPhase() {
    stopNormalPhase();
    mode = 'calm';
    scheduleNormalRefill();
  }

  function stopNormalPhase() {
    if (normalTimer) window.clearTimeout(normalTimer);
    normalTimer = 0;
  }

  function startObserveSelection() {
    stopGrowth();
    stopNormalPhase();
    clearReturnTimers();
    settling = false;
    observeFocusId = null;
    mode = 'observe-select';
    interactive = true;
    bubbles.forEach(function (bubble) {
      bubble.state = 'normal';
      bubble.selected = false;
      bubble.opacity = Math.max(0.30, Math.min(0.58, bubble.opacity));
      bubble.vx *= 0.52;
      bubble.vy *= 0.52;
    });
    start();
  }

  /** 「停下来看看」：逐帧阻尼，让泡泡缓慢静止。 */
  function settle() {
    settling = true;
    interactive = false;
  }

  function scheduleNextGrowth() {
    if (mode !== 'growth') return;
    growthTimer = window.setTimeout(function () {
      growthTimer = 0;
      const added = addGrowthBubble();
      if (added) growthSpawnCount += 1;
      // 生成节奏同时受衰减系数与 transitionProgress 影响：progress 越大越快。
      const rampedInterval = lerp(
        CONFIG.GROWTH_INTERVAL_START_MS,
        CONFIG.GROWTH_INTERVAL_MIN_MS,
        clamp(transitionProgress, 0, 1)
      );
      growthIntervalMs = Math.max(
        CONFIG.GROWTH_INTERVAL_MIN_MS,
        Math.min(growthIntervalMs * CONFIG.GROWTH_ACCELERATION_FACTOR, rampedInterval)
      );
      if (typeof callbacks.onGrowthPace === 'function') {
        callbacks.onGrowthPace({
          intervalMs: Math.round(growthIntervalMs),
          spawnCount: growthSpawnCount,
          bubbleCount: bubbles.length,
          added: added
        });
      }
      scheduleNextGrowth();
    }, growthIntervalMs);
  }

  function startGrowth() {
    stopGrowth();
    stopNormalPhase();
    setMode('growth');
    growthIntervalMs = CONFIG.GROWTH_INTERVAL_START_MS;
    growthSpawnCount = 0;
    const burstCount = Math.max(0, CONFIG.GROWTH_INITIAL_BURST_COUNT || 0);
    for (let i = 0; i < burstCount; i += 1) addGrowthBubble();
    scheduleNextGrowth();
  }

  function stopGrowth() {
    if (growthTimer) window.clearTimeout(growthTimer);
    growthTimer = 0;
    growthIntervalMs = 0;
    growthSpawnCount = 0;
  }

  /**
   * 启动「全部删除」：所有泡泡在原地爆裂，不做任何位移。
   * 每个泡泡获得 0~ERASURE_STAGGER_MAX_MS 的随机错峰，总时长约 1.2~1.8s。
   */
  function startErasure(options) {
    const opts = options || {};
    stopGrowth();
    stopNormalPhase();
    clearReturnTimers();
    settling = false;
    interactive = false;
    mode = 'erasing';
    particles.length = 0;
    ripples.length = 0;

    const reduced = prefersReducedMotion();
    const duration = reduced
      ? Math.max(120, Number(CONFIG.ERASURE_REDUCED_MOTION_MS) || 320)
      : Math.max(600, Number(opts.durationMs) || CONFIG.ERASURE_EXPLOSION_DURATION_MS);
    const staggerMax = reduced ? 0 : Math.max(0, Number(CONFIG.ERASURE_STAGGER_MAX_MS) || 0);
    let burstEndMs = duration;

    bubbles.forEach(function (bubble) {
      bubble.state = 'normal';
      bubble.vx = 0;
      bubble.vy = 0;
      bubble.eraseDelay = staggerMax ? random(0, staggerMax) : 0;
      bubble.eraseDuration = duration;
      bubble.eraseBurst = false;
      bubble.eraseRing = false;
      bubble.eraseStartScale = bubble.scale;
      bubble.eraseStartOpacity = bubble.opacity;
      burstEndMs = Math.max(burstEndMs, bubble.eraseDelay + duration);
    });

    erasure = {
      elapsed: 0,
      durationMs: duration,
      burstEndMs: burstEndMs,
      reducedMotion: reduced,
      fade: 0,
      completed: false,
      onComplete: opts.onComplete
    };
    start();
  }

  function clearAll() {
    stopGrowth();
    stopNormalPhase();
    clearReturnTimers();
    settling = false;
    erasure = null;
    bubbles.length = 0;
    particles.length = 0;
    ripples.length = 0;
    notifyBubbleCount();
    draw(0);
  }

  function respawnSequentially(inputWorries, options) {
    const opts = options || {};
    stopGrowth();
    stopNormalPhase();
    clearReturnTimers();
    settling = false;
    erasure = null;
    transitionProgress = 0;
    bubbles.length = 0;
    particles.length = 0;
    ripples.length = 0;
    worries = safeWorries(inputWorries || worries);
    mode = opts.mode || 'soft';
    chaosLevel = 0;
    interactive = Boolean(opts.interactive);
    notifyBubbleCount();
    start();

    const initialDelay = Math.max(0, Number(opts.initialDelayMs) || 0);
    const interval = Math.max(100, Number(opts.intervalMs) || 700);
    const requestedCount = Math.max(worries.length, Number(opts.count) || worries.length);
    const sequenceProfiles = Array.from({ length: requestedCount }, function (_, index) {
      return worries[index % worries.length];
    });
    sequenceProfiles.forEach(function (profile, index) {
      const id = window.setTimeout(function () {
        returnTimers = returnTimers.filter(function (timer) { return timer !== id; });
        createBubble(profile, {
          entering: true,
          radius: random(CONFIG.BUBBLE_MIN_RADIUS * 0.88, CONFIG.BUBBLE_MAX_RADIUS * 0.96),
          opacity: random(0.34, 0.50)
        });
        if (index === 0 && typeof opts.onFirst === 'function') opts.onFirst();
        if (index === sequenceProfiles.length - 1 && typeof opts.onComplete === 'function') opts.onComplete();
      }, initialDelay + index * interval);
      returnTimers.push(id);
    });
  }

  function respawnSoftly(nextCanvas, inputWorries) {
    if (nextCanvas) mount(nextCanvas, { interactive: false, mode: 'soft' });
    respawnSequentially(inputWorries, { initialDelayMs: 0, intervalMs: 240 });
  }

  function notifyBubbleCount() {
    if (typeof callbacks.onBubbleCount === 'function') callbacks.onBubbleCount(bubbles.length);
  }

  function getBubbleCount() {
    return bubbles.length;
  }

  function getDebugSnapshot() {
    return bubbles.map(function (bubble) {
      return { id: bubble.id, x: bubble.x, y: bubble.y, radius: bubble.radius, vx: bubble.vx, vy: bubble.vy, state: bubble.state, text: bubble.text, behaviorType: bubble.behaviorType, hitCount: bubble.hitCount, requiredHits: bubble.requiredHits, hoverReveal: bubble.hoverReveal, selected: bubble.selected };
    });
  }

  function getGrowthState() {
    return {
      intervalMs: growthIntervalMs,
      spawnCount: growthSpawnCount,
      bubbleCount: bubbles.length,
      chaosLevel: chaosLevel,
      transitionProgress: transitionProgress,
      splitChance: currentSplitChance(),
      settling: settling,
      mode: mode,
      running: running,
      hasAnimationFrame: Boolean(rafId),
      mounted: Boolean(canvas && ctx)
    };
  }

  function destroy() {
    stopGrowth();
    stopNormalPhase();
    clearReturnTimers();
    stop();
    detachCanvas();
    erasure = null;
    settling = false;
    bubbles.length = 0;
    particles.length = 0;
    ripples.length = 0;
    worries = [];
    callbacks = {};
    avoidRects = [];
    blurSprites.clear();
    textLineCache.clear();
    mode = 'calm';
    observeFocusId = null;
    pointer.active = false;
    chaosLevel = 0;
    transitionProgress = 0;
    interactive = false;
  }

  function isImplemented() {
    return true;
  }

  return {
    init: init,
    mount: mount,
    setMode: setMode,
    setInteractive: setInteractive,
    setChaosLevel: setChaosLevel,
    setTransitionProgress: setTransitionProgress,
    getTransitionProgress: getTransitionProgress,
    getSplitChance: getSplitChance,
    setAvoidRects: setAvoidRects,
    start: start,
    stop: stop,
    handleClick: handleClick,
    startNormalPhase: startNormalPhase,
    stopNormalPhase: stopNormalPhase,
    startObserveSelection: startObserveSelection,
    settle: settle,
    startGrowth: startGrowth,
    stopGrowth: stopGrowth,
    startErasure: startErasure,
    clearAll: clearAll,
    respawnSequentially: respawnSequentially,
    respawnSoftly: respawnSoftly,
    destroy: destroy,
    getBubbleCount: getBubbleCount,
    getGrowthState: getGrowthState,
    getDebugSnapshot: getDebugSnapshot,
    isImplemented: isImplemented
  };
})();
