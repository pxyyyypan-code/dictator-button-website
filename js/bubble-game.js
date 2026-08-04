/**
 * bubble-game.js —— Canvas 泡泡交互核心
 * V0.5.3：正常删除阶段持续补充泡泡、按概率渐变进入分裂失控、
 *         全部删除改为「原地爆裂」，重现阶段随机延迟重新出现并支持缓慢静止。
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
  let worries = [];
  let callbacks = {};
  let nextId = 1;
  let avoidRects = [];
  let erasure = null;
  let returnTimers = [];

  const bubbles = [];
  const particles = [];
  const ripples = [];

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
    return mode === 'soft' || mode === 'return';
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

  function safeWorries(input) {
    const list = Array.isArray(input)
      ? input.map(function (item) { return String(item || '').trim(); }).filter(Boolean)
      : [];
    return list.length ? list : ['尚未说出口的烦恼'];
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

  function createBubble(text, options) {
    const opts = options || {};
    const minR = CONFIG.BUBBLE_MIN_RADIUS;
    const maxR = CONFIG.BUBBLE_MAX_RADIUS;
    const textBonus = Math.min(24, Math.max(0, text.length - 6) * 2.2);
    const defaultRadius = Math.min(maxR, random(minR, maxR - 8) + textBonus);
    const radius = Number.isFinite(opts.radius)
      ? clamp(opts.radius, CONFIG.SPLIT_CHILD_RADIUS_MIN || 24, maxR)
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

    const bubble = {
      id: 'bubble-' + nextId++,
      text: text,
      x: clamp(requestedX, minX, maxX),
      y: clamp(requestedY, minY, maxY),
      radius: radius,
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
      eraseStartOpacity: 1
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
    pointerHandler = null;
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
    if (mode === 'erasing') return;
    for (let i = 0; i < bubbles.length; i += 1) {
      const a = bubbles[i];
      if (a.state === 'bursting') continue;
      for (let j = i + 1; j < bubbles.length; j += 1) {
        const b = bubbles[j];
        if (b.state === 'bursting') continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distanceSq = dx * dx + dy * dy;
        const minDistance = (a.radius + b.radius) * (isSoftMode() ? 0.68 : 0.78);
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

  function update(dt, time) {
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

  function drawBubble(bubble, time) {
    const r = bubble.radius * bubble.scale;
    if (r <= 0.5) return;
    ctx.save();
    const rejecting = bubble.state === 'rejecting';
    const rejectProgress = rejecting ? clamp(bubble.rejectElapsed / CONFIG.REJECT_ANIMATION_MS, 0, 1) : 0;
    const shakeX = rejecting ? Math.sin(rejectProgress * Math.PI * 10) * (1 - rejectProgress) * 9 : 0;
    const shakeY = rejecting ? Math.cos(rejectProgress * Math.PI * 8) * (1 - rejectProgress) * 4 : 0;
    ctx.translate(bubble.x + shakeX, bubble.y + shakeY);
    ctx.globalAlpha = bubble.opacity;

    const growthPulse = mode === 'growth' ? 1 + Math.sin(time * (2.6 + chaosLevel * 2.5) + bubble.phase) * (0.012 + chaosLevel * 0.025) : 1;
    const rejectScale = rejecting ? 1 + Math.sin(rejectProgress * Math.PI) * 0.16 : 1;
    ctx.scale(growthPulse * rejectScale, growthPulse * rejectScale);

    const red = mode === 'growth' ? chaosLevel : 0;
    const glowColor = isSoftMode()
      ? 'rgba(143, 166, 199, 0.18)'
      : 'rgba(' + Math.round(lerp(91, 210, red)) + ',' + Math.round(lerp(143, 72, red)) + ',' + Math.round(lerp(216, 78, red)) + ',' + (0.20 + red * 0.17).toFixed(3) + ')';
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = isSoftMode() ? 17 : 17 + red * 16;

    const g = ctx.createRadialGradient(-r * 0.28, -r * 0.36, r * 0.08, 0, 0, r);
    if (isSoftMode()) {
      g.addColorStop(0, 'rgba(222, 232, 245, 0.48)');
      g.addColorStop(0.55, 'rgba(133, 157, 194, 0.30)');
      g.addColorStop(1, 'rgba(68, 82, 109, 0.16)');
    } else {
      g.addColorStop(0, 'rgba(' + Math.round(lerp(197, 241, red)) + ',' + Math.round(lerp(220, 140, red)) + ',' + Math.round(lerp(252, 146, red)) + ',' + (0.68 - red * 0.02).toFixed(3) + ')');
      g.addColorStop(0.52, 'rgba(' + Math.round(lerp(82, 168, red)) + ',' + Math.round(lerp(132, 58, red)) + ',' + Math.round(lerp(200, 68, red)) + ',' + (0.46 + red * 0.05).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(' + Math.round(lerp(34, 70, red)) + ',' + Math.round(lerp(57, 19, red)) + ',' + Math.round(lerp(93, 29, red)) + ',0.30)');
    }

    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.strokeStyle = isSoftMode()
      ? 'rgba(221, 235, 255, 0.34)'
      : 'rgba(' + Math.round(lerp(221, 244, red)) + ',' + Math.round(lerp(235, 150, red)) + ',' + Math.round(lerp(255, 156, red)) + ',' + (0.42 + red * 0.10).toFixed(3) + ')';
    ctx.lineWidth = rejecting ? 2.2 : 1.2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(-r * 0.24, -r * 0.28, r * 0.13, Math.PI * 1.05, Math.PI * 1.75);
    ctx.strokeStyle = 'rgba(255,255,255,0.42)';
    ctx.lineWidth = Math.max(1, r * 0.025);
    ctx.stroke();

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
    ctx.font = '400 ' + fontSize + 'px "Microsoft YaHei", "PingFang SC", sans-serif';
    const maxWidth = radius * 1.45;
    const lines = wrapText(text, maxWidth);
    const lineHeight = fontSize * 1.25;
    const startY = -((lines.length - 1) * lineHeight) / 2;
    lines.slice(0, 3).forEach(function (line, index) {
      ctx.fillText(line, 0, startY + index * lineHeight, maxWidth);
    });
    ctx.restore();
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
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
    ctx.fill();
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
      createBubble(bubble.text, {
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
    const text = bubble.text;
    const minDelay = Math.max(180, Number(CONFIG.RETURN_RESPAWN_DELAY_MIN_MS) || 800);
    const maxDelay = Math.max(minDelay, Number(CONFIG.RETURN_RESPAWN_DELAY_MAX_MS) || 1200);
    const delay = Math.round(random(minDelay, maxDelay));
    const id = window.setTimeout(function () {
      returnTimers = returnTimers.filter(function (timer) { return timer !== id; });
      if (mode !== 'return' || !canvas) return;
      createBubble(text, {
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
        if (mode === 'growth') {
          // 是否分裂由 transitionProgress 决定的概率抽取：
          // 前期多数点击仍能正常删除，后期几乎每次都分裂。
          const shouldSplit = Math.random() < currentSplitChance();
          const childrenCreated = shouldSplit ? splitBubble(bubble) : 0;
          if (childrenCreated >= CONFIG.SPLIT_MIN_CHILDREN) {
            bubble.state = 'bursting';
            bubble.burstElapsed = 0;
            bubble.burstKind = 'split';
            spawnParticles(bubble, false);
            if (typeof callbacks.onSplit === 'function') {
              callbacks.onSplit({ bubble: bubble, childrenCreated: childrenCreated });
            }
          } else if (shouldSplit) {
            // 抽中分裂但已到性能上限：保留“删除被拒绝”的抖动反馈。
            bubble.state = 'rejecting';
            bubble.rejectElapsed = 0;
            spawnParticles(bubble, true);
            spawnRipple(bubble, true);
            if (typeof callbacks.onReject === 'function') callbacks.onReject({ bubble: bubble });
          } else {
            // 未抽中分裂：这一次删除仍然生效。
            bubble.state = 'bursting';
            bubble.burstElapsed = 0;
            bubble.burstKind = 'delete';
            spawnParticles(bubble, false);
            if (typeof callbacks.onDelete === 'function') callbacks.onDelete({ bubble: bubble });
          }
        } else if (mode === 'return') {
          bubble.state = 'bursting';
          bubble.burstElapsed = 0;
          bubble.burstKind = 'return';
          spawnParticles(bubble, false);
          respawnReturnBubble(bubble);
          if (typeof callbacks.onReturnDelete === 'function') callbacks.onReturnDelete({ bubble: bubble });
        } else {
          bubble.state = 'bursting';
          bubble.burstElapsed = 0;
          bubble.burstKind = 'delete';
          spawnParticles(bubble, false);
          if (typeof callbacks.onDelete === 'function') callbacks.onDelete({ bubble: bubble });
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
    const sequenceTexts = Array.from({ length: requestedCount }, function (_, index) {
      return worries[index % worries.length];
    });
    sequenceTexts.forEach(function (text, index) {
      const id = window.setTimeout(function () {
        returnTimers = returnTimers.filter(function (timer) { return timer !== id; });
        createBubble(text, {
          entering: true,
          radius: random(CONFIG.BUBBLE_MIN_RADIUS * 0.88, CONFIG.BUBBLE_MAX_RADIUS * 0.96),
          opacity: random(0.34, 0.50)
        });
        if (index === 0 && typeof opts.onFirst === 'function') opts.onFirst();
        if (index === sequenceTexts.length - 1 && typeof opts.onComplete === 'function') opts.onComplete();
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
      return { id: bubble.id, x: bubble.x, y: bubble.y, radius: bubble.radius, state: bubble.state, text: bubble.text };
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
    mode = 'calm';
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
