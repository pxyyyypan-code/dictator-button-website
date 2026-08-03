/**
 * bubble-game.js —— M03 / M04 / M06 Canvas 核心交互
 *
 * 实现：烦恼泡泡生成、漂浮、点击命中、删除反馈、持续增殖与柔和重现。
 * 所有阈值与时长均读取 CONFIG，避免规则散落在代码中。
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
  let mode = 'calm';
  let interactive = false;
  let growthTimer = 0;
  let growthIntervalMs = 0;
  let growthSpawnCount = 0;
  let resizeObserver = null;
  let pointerHandler = null;
  let worries = [];
  let callbacks = {};
  let nextId = 1;

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

  function pick(array) {
    return array[Math.floor(Math.random() * array.length)];
  }

  function safeWorries(input) {
    const list = Array.isArray(input)
      ? input.map(function (item) { return String(item || '').trim(); }).filter(Boolean)
      : [];
    return list.length ? list : ['尚未说出口的烦恼'];
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
    const defaultSpeed = mode === 'soft'
      ? random(CONFIG.BUBBLE_SPEED_MIN * 0.18, CONFIG.BUBBLE_SPEED_MIN * 0.36)
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
        : mode === 'soft' ? random(0.35, 0.56) : random(0.72, 0.95),
      scale: Number.isFinite(opts.initialScale)
        ? opts.initialScale
        : opts.entering === false ? 1 : 0.05,
      state: 'normal',
      burstElapsed: 0,
      phase: random(0, Math.PI * 2),
      isSplitChild: Boolean(opts.isSplitChild)
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
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = rect.width;
    height = rect.height;
    const nextWidth = Math.round(width * dpr);
    const nextHeight = Math.round(height * dpr);
    if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
      canvas.width = nextWidth;
      canvas.height = nextHeight;
      ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      bubbles.forEach(function (bubble) {
        bubble.x = Math.min(Math.max(bubble.radius, bubble.x), Math.max(bubble.radius, width - bubble.radius));
        bubble.y = Math.min(Math.max(bubble.radius, bubble.y), Math.max(bubble.radius, height - bubble.radius));
      });
    }
  }

  function detachCanvas() {
    if (canvas && pointerHandler) {
      canvas.removeEventListener('pointerdown', pointerHandler);
    }
    pointerHandler = null;
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    canvas = null;
    ctx = null;
  }

  function mount(nextCanvas, options) {
    if (!(nextCanvas instanceof HTMLCanvasElement)) {
      throw new Error('BubbleGame.mount 需要有效的 canvas 元素。');
    }
    const opts = options || {};
    detachCanvas();
    canvas = nextCanvas;
    interactive = Boolean(opts.interactive);
    if (opts.mode) mode = opts.mode;
    resizeCanvas();

    pointerHandler = function (event) {
      if (!interactive) return;
      const rect = canvas.getBoundingClientRect();
      handleClick(event.clientX - rect.left, event.clientY - rect.top);
    };
    canvas.addEventListener('pointerdown', pointerHandler);

    if ('ResizeObserver' in window) {
      resizeObserver = new ResizeObserver(resizeCanvas);
      resizeObserver.observe(canvas);
    } else {
      window.addEventListener('resize', resizeCanvas, { passive: true });
    }
    start();
  }

  function init(inputWorries, nextCanvas, nextCallbacks) {
    destroy();
    worries = safeWorries(inputWorries);
    callbacks = nextCallbacks || {};
    mode = 'calm';
    if (nextCanvas) mount(nextCanvas, { interactive: false, mode: 'calm' });
    addInitialBubbles(CONFIG.INITIAL_BUBBLE_COUNT);
    start();
  }

  function setMode(nextMode) {
    mode = nextMode || 'calm';
    if (mode === 'soft') {
      bubbles.forEach(function (bubble) {
        bubble.opacity = Math.min(bubble.opacity, 0.56);
        bubble.vx *= 0.32;
        bubble.vy *= 0.32;
      });
    }
  }

  function start() {
    if (running) return;
    running = true;
    lastTime = performance.now();
    rafId = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }

  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.035, Math.max(0.001, (now - lastTime) / 1000));
    lastTime = now;
    update(dt, now / 1000);
    draw(now / 1000);
    rafId = requestAnimationFrame(frame);
  }

  function update(dt, time) {
    for (let i = bubbles.length - 1; i >= 0; i -= 1) {
      const bubble = bubbles[i];
      if (bubble.state === 'bursting') {
        bubble.burstElapsed += dt * 1000;
        bubble.scale = Math.max(0, 1 - bubble.burstElapsed / CONFIG.DELETE_ANIMATION_MAX_MS);
        bubble.opacity = Math.max(0, bubble.opacity - dt * 3.8);
        if (bubble.burstElapsed >= CONFIG.DELETE_ANIMATION_MAX_MS) {
          bubbles.splice(i, 1);
          notifyBubbleCount();
        }
        continue;
      }

      bubble.scale += (1 - bubble.scale) * Math.min(1, dt * 7);
      const speedFactor = mode === 'growth' ? 1.18 : mode === 'soft' ? 0.55 : 1;
      bubble.x += bubble.vx * dt * speedFactor;
      bubble.y += bubble.vy * dt * speedFactor;
      bubble.y += Math.sin(time * 0.8 + bubble.phase) * dt * (mode === 'soft' ? 1.2 : 3.2);

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

  function draw(time) {
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, width, height);
    drawAmbient(time);
    ripples.forEach(drawRipple);
    bubbles.forEach(function (bubble) { drawBubble(bubble, time); });
    particles.forEach(drawParticle);
  }

  function drawAmbient(time) {
    const gradient = ctx.createRadialGradient(width * 0.5, height * 0.5, 0, width * 0.5, height * 0.5, Math.max(width, height) * 0.7);
    if (mode === 'growth') {
      gradient.addColorStop(0, 'rgba(132, 45, 54, 0.12)');
      gradient.addColorStop(1, 'rgba(10, 8, 14, 0)');
    } else if (mode === 'soft') {
      gradient.addColorStop(0, 'rgba(130, 155, 190, 0.10)');
      gradient.addColorStop(1, 'rgba(22, 30, 43, 0)');
    } else {
      gradient.addColorStop(0, 'rgba(80, 120, 185, 0.10)');
      gradient.addColorStop(1, 'rgba(8, 12, 22, 0)');
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.globalAlpha = mode === 'growth' ? 0.16 : 0.08;
    ctx.strokeStyle = mode === 'growth' ? '#b96f72' : '#7897c4';
    ctx.lineWidth = 1;
    const gap = mode === 'growth' ? 38 : 54;
    const offset = (time * (mode === 'growth' ? 7 : 3)) % gap;
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
    ctx.translate(bubble.x, bubble.y);
    ctx.globalAlpha = bubble.opacity;

    const pulse = mode === 'growth' ? 1 + Math.sin(time * 3.4 + bubble.phase) * 0.025 : 1;
    ctx.scale(pulse, pulse);

    const glowColor = mode === 'growth' ? 'rgba(210, 83, 88, 0.28)' : mode === 'soft' ? 'rgba(143, 166, 199, 0.18)' : 'rgba(91, 143, 216, 0.24)';
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = mode === 'growth' ? 26 : 18;

    const g = ctx.createRadialGradient(-r * 0.28, -r * 0.36, r * 0.08, 0, 0, r);
    if (mode === 'growth') {
      g.addColorStop(0, 'rgba(241, 153, 157, 0.66)');
      g.addColorStop(0.52, 'rgba(168, 65, 74, 0.48)');
      g.addColorStop(1, 'rgba(70, 24, 35, 0.30)');
    } else if (mode === 'soft') {
      g.addColorStop(0, 'rgba(222, 232, 245, 0.48)');
      g.addColorStop(0.55, 'rgba(133, 157, 194, 0.30)');
      g.addColorStop(1, 'rgba(68, 82, 109, 0.16)');
    } else {
      g.addColorStop(0, 'rgba(197, 220, 252, 0.70)');
      g.addColorStop(0.52, 'rgba(82, 132, 200, 0.48)');
      g.addColorStop(1, 'rgba(34, 57, 93, 0.28)');
    }

    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.strokeStyle = mode === 'growth' ? 'rgba(244, 163, 166, 0.48)' : 'rgba(221, 235, 255, 0.44)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(-r * 0.24, -r * 0.28, r * 0.13, Math.PI * 1.05, Math.PI * 1.75);
    ctx.strokeStyle = 'rgba(255,255,255,0.42)';
    ctx.lineWidth = Math.max(1, r * 0.025);
    ctx.stroke();

    drawText(bubble.text, r);
    ctx.restore();
  }

  function drawText(text, radius) {
    const fontSize = Math.max(11, Math.min(20, radius * 0.26));
    ctx.fillStyle = mode === 'soft' ? 'rgba(232,238,247,0.70)' : 'rgba(250,252,255,0.92)';
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

  function spawnParticles(bubble) {
    const color = mode === 'growth' ? '#e2767b' : '#8fb7ef';
    for (let i = 0; i < 14; i += 1) {
      const angle = random(0, Math.PI * 2);
      const speed = random(55, 150);
      const life = random(0.28, 0.55);
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

  function spawnSplitRipple(bubble) {
    const life = 0.48;
    ripples.push({
      x: bubble.x,
      y: bubble.y,
      radius: Math.max(8, bubble.radius * 0.2),
      speed: Math.max(90, bubble.radius * 2.8),
      life: life,
      maxLife: life,
      color: 'rgba(244, 139, 145, 0.92)'
    });
  }

  function splitBubble(bubble) {
    const availableAfterParentLeaves = Math.max(0, CONFIG.MAX_BUBBLES - bubbles.length + 1);
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
      const offset = Math.max(4, bubble.radius * 0.08);
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

    spawnSplitRipple(bubble);
    return childCount;
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
        const shouldSplit = mode === 'growth';
        bubble.state = 'bursting';
        bubble.burstElapsed = 0;
        spawnParticles(bubble);
        const childrenCreated = shouldSplit ? splitBubble(bubble) : 0;
        if (typeof callbacks.onDelete === 'function') {
          callbacks.onDelete(bubble, {
            split: shouldSplit && childrenCreated > 0,
            childrenCreated: childrenCreated
          });
        }
        return true;
      }
    }
    if (typeof callbacks.onMiss === 'function') callbacks.onMiss();
    return false;
  }

  function addGrowthBubble() {
    if (bubbles.length >= CONFIG.MAX_BUBBLES) return false;
    createBubble(pick(worries), { entering: true });
    return true;
  }

  function scheduleNextGrowth() {
    if (mode !== 'growth') return;
    growthTimer = window.setTimeout(function () {
      growthTimer = 0;
      const added = addGrowthBubble();
      if (added) growthSpawnCount += 1;

      growthIntervalMs = Math.max(
        CONFIG.GROWTH_INTERVAL_MIN_MS,
        growthIntervalMs * CONFIG.GROWTH_ACCELERATION_FACTOR
      );

      if (typeof callbacks.onGrowthPace === 'function') {
        callbacks.onGrowthPace({
          intervalMs: Math.round(growthIntervalMs),
          spawnCount: growthSpawnCount,
          bubbleCount: bubbles.length
        });
      }
      scheduleNextGrowth();
    }, growthIntervalMs);
  }

  function startGrowth() {
    stopGrowth();
    setMode('growth');
    growthIntervalMs = CONFIG.GROWTH_INTERVAL_START_MS;
    growthSpawnCount = 0;
    const burstCount = Math.max(1, CONFIG.GROWTH_INITIAL_BURST_COUNT || 1);
    for (let i = 0; i < burstCount; i += 1) addGrowthBubble();
    scheduleNextGrowth();
  }

  function stopGrowth() {
    if (growthTimer) window.clearTimeout(growthTimer);
    growthTimer = 0;
    growthIntervalMs = 0;
    growthSpawnCount = 0;
  }

  function clearAll() {
    stopGrowth();
    bubbles.length = 0;
    particles.length = 0;
    ripples.length = 0;
    notifyBubbleCount();
    draw(0);
  }

  function respawnSoftly(nextCanvas, inputWorries) {
    stopGrowth();
    bubbles.length = 0;
    particles.length = 0;
    ripples.length = 0;
    worries = safeWorries(inputWorries || worries);
    mode = 'soft';
    callbacks = {};
    if (nextCanvas) mount(nextCanvas, { interactive: false, mode: 'soft' });
    addInitialBubbles(Math.max(6, worries.length * 2));
    setMode('soft');
    start();
  }

  function notifyBubbleCount() {
    if (typeof callbacks.onBubbleCount === 'function') callbacks.onBubbleCount(bubbles.length);
  }

  function getBubbleCount() {
    return bubbles.length;
  }

  function destroy() {
    stopGrowth();
    stop();
    detachCanvas();
    bubbles.length = 0;
    particles.length = 0;
    ripples.length = 0;
    worries = [];
    callbacks = {};
    mode = 'calm';
    interactive = false;
  }

  function isImplemented() {
    return true;
  }

  return {
    init: init,
    mount: mount,
    setMode: setMode,
    start: start,
    stop: stop,
    handleClick: handleClick,
    startGrowth: startGrowth,
    stopGrowth: stopGrowth,
    clearAll: clearAll,
    respawnSoftly: respawnSoftly,
    destroy: destroy,
    getBubbleCount: getBubbleCount,
    isImplemented: isImplemented
  };
})();
