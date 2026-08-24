/**
 * audio.js —— 全站音频：7 首 BGM + 17 条音效
 *
 * 素材在 assets/audio/{bgm,sfx}/，由 assets/dev/_build-audio.py 从母带转出，
 * 每条都有 .opus 和 .m4a 两份。母带不进仓库，改素材要改源文件后重跑脚本。
 *
 * 全部阈值、时长、增益、冷却在 config.js 的 AUDIO_* 区块，这里不写裸数字。
 *
 * ── 三件事决定了这个模块的形状 ──────────────────────────
 *
 * 1. 自动播放策略。浏览器在页面收到第一次用户手势之前拒绝有声播放，
 *    这是内核里写死的，没有权限可以申请、也没有提示框可以弹。所以
 *    unlock() 做两手准备：先试着直接放（Chrome/Edge 对常访问的站点会放行，
 *    这时候玩家一打开就有音乐），被拒绝就挂一次性的手势监听，
 *    玩家做的第一个动作（点首页那张卡片、按任意键、滚一下）立刻补上。
 *    u01 本身就是「点击进入」，实际上察觉不到差别。
 *
 * 2. 音效要能叠着响。一个 <audio> 元素同一时刻只能播一遍，
 *    连点泡泡会互相截断。所以每条音效备一个小元素池轮转（POOL_SIZE），
 *    池子转满了就抢最早那个——高频音效本来就允许被后来的盖掉。
 *
 * 3. 混音。母带电平跨度 23dB，转码时已经统一归到 −3dBFS 峰值，
 *    真正的「谁大谁小」在 config 的 AUDIO_SFX_GAIN_TRIM 里按听感配。
 *    最终音量 = 总音量 × 分类音量 × 逐条修正 × 调用点的临时系数。
 *
 * 不用 Web Audio 的 AudioContext：那套要先 fetch + decodeAudioData 把
 * 全部素材解成 PCM 驻留内存，13MB 压缩音频解开是几百 MB。<audio> 元素
 * 是流式的，而且天然支持 loop 和 preload。代价是没法做真正的实时混音，
 * 但这个站不需要——BGM 交叉淡入用两个元素各自调 volume 就够了。
 */
'use strict';

const AudioManager = (function () {
  const T = typeof CONFIG !== 'undefined' ? CONFIG : {};

  function num(key, fallback) {
    const value = Number(T[key]);
    return Number.isFinite(value) ? value : fallback;
  }

  const MASTER = num('AUDIO_MASTER_GAIN', 0.9);
  const BGM_GAIN = num('AUDIO_BGM_GAIN', 0.44);
  const SFX_GAIN = num('AUDIO_SFX_GAIN', 0.85);
  const FADE_MS = num('AUDIO_BGM_FADE_MS', 900);
  const FADE_STEP_MS = num('AUDIO_FADE_STEP_MS', 40);
  const DUCK_RATIO = num('AUDIO_DUCK_RATIO', 0.28);
  const DUCK_MS = num('AUDIO_DUCK_MS', 320);
  const POOL_SIZE = num('AUDIO_SFX_POOL_SIZE', 4);
  const STORAGE_KEY = 'dictator-button:muted';

  const TRIM = T.AUDIO_SFX_GAIN_TRIM || {};
  const COOLDOWN = T.AUDIO_SFX_COOLDOWN_MS || {};

  /** 浏览器支持哪种格式，进来时探一次。两种都不支持就整个模块空转。 */
  let ext = '';
  let supported = false;

  /** key → { pool: HTMLAudioElement[], at: number, lastAt: number } */
  const sfxBank = Object.create(null);
  /** 常驻循环音效（SFX05 转盘滚动、SFX10 泡泡漂浮）：key → element */
  const loops = Object.create(null);
  /** 各循环层调用时的临时系数，静音切回来时要用它重算。 */
  const loopGain = Object.create(null);

  /** BGM 用两个槽轮换，交叉淡入时一个淡出一个淡入。 */
  const bgmSlots = [null, null];
  let bgmActive = 0;
  let bgmKey = '';
  /** duck 期间 BGM 的目标倍率；1 表示没被压。 */
  let duckLevel = 1;
  let duckTimer = 0;

  let unlocked = false;
  let muted = false;
  let pendingBgm = '';
  const fadeTimers = [];

  // ---------------------------------------------------------------- 基础

  function detect() {
    const probe = document.createElement('audio');
    if (typeof probe.canPlayType !== 'function') return;
    // canPlayType 返回 'probably' / 'maybe' / ''，后两者都当作能放：
    // Safari 对 aac 一贯只答 'maybe'，按 'probably' 卡就全站没声音了。
    if (probe.canPlayType('audio/ogg; codecs="opus"')) {
      ext = 'opus';
    } else if (probe.canPlayType('audio/mp4; codecs="mp4a.40.2"')) {
      ext = 'm4a';
    }
    supported = ext !== '';
    if (!supported) console.warn('[audio] 浏览器不支持 opus 与 aac，本次静音运行。');
  }

  function srcFor(key) {
    const dir = key.indexOf('bgm') === 0 ? 'bgm' : 'sfx';
    return 'assets/audio/' + dir + '/' + key + '.' + ext;
  }

  function make(key, loop) {
    const el = new Audio();
    el.src = srcFor(key);
    el.loop = !!loop;
    el.preload = 'auto';
    return el;
  }

  /** play() 返回的 Promise 被拒是常态（没解锁、元素被抢），不能让它冒成未捕获异常。 */
  function safePlay(el) {
    const p = el.play();
    if (p && typeof p.catch === 'function') p.catch(function () {});
    return p;
  }

  function readMuted() {
    try {
      return window.localStorage.getItem(STORAGE_KEY) === '1';
    } catch (e) {
      // 隐私模式下 localStorage 会直接抛，不能让它挡住整个模块初始化。
      return false;
    }
  }

  function writeMuted(value) {
    try {
      window.localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
    } catch (e) { /* 存不下就算了，本次会话内仍然生效 */ }
  }

  // ---------------------------------------------------------------- 淡入淡出

  function clearFades() {
    while (fadeTimers.length) window.clearInterval(fadeTimers.pop());
  }

  /**
   * 用 setInterval 逐步改 volume。不用 CSS 那套 transition，
   * 也不用 Web Audio 的 linearRampToValueAtTime——<audio>.volume 只能手动推。
   * 步长 FADE_STEP_MS 是 40ms，25Hz，人耳听不出台阶。
   */
  function fadeTo(el, target, ms, onDone) {
    if (!el) { if (onDone) onDone(); return; }
    const from = el.volume;
    const span = Math.max(1, Math.round(ms / FADE_STEP_MS));
    let step = 0;
    const id = window.setInterval(function () {
      step += 1;
      const k = Math.min(1, step / span);
      el.volume = Math.max(0, Math.min(1, from + (target - from) * k));
      if (k >= 1) {
        window.clearInterval(id);
        const at = fadeTimers.indexOf(id);
        if (at !== -1) fadeTimers.splice(at, 1);
        if (onDone) onDone();
      }
    }, FADE_STEP_MS);
    fadeTimers.push(id);
  }

  function bgmTargetVolume() {
    return muted ? 0 : MASTER * BGM_GAIN * duckLevel;
  }

  // ---------------------------------------------------------------- 解锁

  /**
   * 首次调用时试着起乐。被自动播放策略挡下就挂一次性手势监听，
   * 玩家的第一个动作会把它补上。
   *
   * pointerdown 而不是 click：click 要等 pointerup，中间差一整个按压时长，
   * 而 handleAction 是在 click 上跑的——不抢在前面的话，
   * 「点进入按钮」这一下的 SFX01 会因为还没解锁而丢掉。
   */
  function unlock() {
    if (!supported || unlocked) return;
    unlocked = true;
    if (pendingBgm) {
      const key = pendingBgm;
      pendingBgm = '';
      playBgm(key);
    }
  }

  function armGesture() {
    if (!supported) return;
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'];
    function once() {
      events.forEach(function (name) {
        document.removeEventListener(name, once, true);
      });
      unlock();
    }
    events.forEach(function (name) {
      // 捕获期：必须早于 app.js 挂在冒泡期的 [data-action] 委托，
      // 否则首页那一下点击的音效会赶不上解锁。
      document.addEventListener(name, once, true);
    });
  }

  // ---------------------------------------------------------------- BGM

  /**
   * 切曲。同曲重复调用是幂等的——场景切换会频繁触发，
   * u06→u07→u08 全是 BGM3，不能每次都重头播。
   */
  function playBgm(key, opts) {
    if (!supported || !key) return;
    const options = opts || {};
    if (key === bgmKey && bgmSlots[bgmActive]) return;

    if (!unlocked) {
      // 还没解锁：记下来，unlock() 时补播。
      pendingBgm = key;
      return;
    }

    const ms = options.fadeMs === undefined ? FADE_MS : Number(options.fadeMs);
    const outgoing = bgmSlots[bgmActive];
    const slot = bgmActive === 0 ? 1 : 0;

    const el = make(key, true);
    el.volume = 0;
    bgmSlots[slot] = el;
    bgmActive = slot;
    bgmKey = key;
    safePlay(el);
    fadeTo(el, bgmTargetVolume(), ms);

    if (outgoing) {
      fadeTo(outgoing, 0, ms, function () {
        outgoing.pause();
        outgoing.src = '';
      });
    }
  }

  function stopBgm(fadeMs) {
    const el = bgmSlots[bgmActive];
    bgmKey = '';
    pendingBgm = '';
    if (!el) return;
    bgmSlots[bgmActive] = null;
    fadeTo(el, 0, fadeMs === undefined ? FADE_MS : fadeMs, function () {
      el.pause();
      el.src = '';
    });
  }

  /**
   * 临时压低 BGM。老虎机滚动、独裁者按钮的 stinger 期间用，
   * 让前景音效站出来而不用把它自己调大——调大会削顶。
   * holdMs 到点自动恢复；不给 holdMs 就得自己调 unduck()。
   */
  function duckBgm(ratio, holdMs) {
    duckLevel = Number.isFinite(Number(ratio)) ? Number(ratio) : DUCK_RATIO;
    if (duckTimer) { window.clearTimeout(duckTimer); duckTimer = 0; }
    fadeTo(bgmSlots[bgmActive], bgmTargetVolume(), DUCK_MS);
    if (holdMs > 0) {
      duckTimer = window.setTimeout(function () {
        duckTimer = 0;
        unduckBgm();
      }, holdMs);
    }
  }

  function unduckBgm() {
    if (duckTimer) { window.clearTimeout(duckTimer); duckTimer = 0; }
    duckLevel = 1;
    fadeTo(bgmSlots[bgmActive], bgmTargetVolume(), DUCK_MS);
  }

  /**
   * 一次性 stinger：独立于 BGM 播一段短乐（BGM5 独裁者按钮 12 秒），
   * 期间把底乐压下去，播完自动恢复。不替换 bgmKey——
   * 演出结束后场景还是原来那个场景，底乐要接着放。
   */
  function playStinger(key, opts) {
    if (!supported || !unlocked || muted) return null;
    const options = opts || {};
    const el = make(key, false);
    el.volume = MASTER * BGM_GAIN * (Number(options.gain) || 1);
    safePlay(el);
    duckBgm(options.duck === undefined ? DUCK_RATIO : options.duck, 0);
    el.addEventListener('ended', function () { unduckBgm(); });
    return el;
  }

  // ---------------------------------------------------------------- SFX

  function bank(key) {
    let entry = sfxBank[key];
    if (!entry) {
      entry = { pool: [], at: 0, lastAt: 0 };
      for (let i = 0; i < POOL_SIZE; i += 1) entry.pool.push(make(key, false));
      sfxBank[key] = entry;
    }
    return entry;
  }

  /**
   * @param {string} key sfx01 ~ sfx17
   * @param {{gain?:number, cooldown?:number, rate?:number}} [opts]
   *   gain     —— 这个调用点的临时系数，叠在 config 的逐条修正之上
   *   cooldown —— 覆盖 config 的冷却窗口；泡泡生成/点击这类高频事件必须有
   *   rate     —— 播放速率，用来给「第几颗星」这种序列做音高变化
   */
  function playSfx(key, opts) {
    if (!supported || !unlocked || muted || !key) return false;
    const options = opts || {};
    const entry = bank(key);
    const now = Date.now();
    const gap = options.cooldown === undefined
      ? (Number(COOLDOWN[key]) || 0)
      : Number(options.cooldown);
    if (gap > 0 && now - entry.lastAt < gap) return false;
    entry.lastAt = now;

    // 轮转取一个元素。池子转满就抢最早那个——
    // 高频音效本来就允许被后来的盖掉，抢比丢掉好。
    const el = entry.pool[entry.at];
    entry.at = (entry.at + 1) % entry.pool.length;

    const trim = Number(TRIM[key]);
    el.volume = Math.max(0, Math.min(1,
      MASTER * SFX_GAIN * (Number.isFinite(trim) ? trim : 1) * (Number(options.gain) || 1)));
    el.playbackRate = Number(options.rate) || 1;
    try { el.currentTime = 0; } catch (e) { /* 还没加载完时会抛，忽略 */ }
    safePlay(el);
    return true;
  }

  /** 从一组 key 里随机挑一条播。SFX11/12 泡泡点击、结局4 共用这个。 */
  function playSfxOneOf(keys, opts) {
    if (!keys || !keys.length) return false;
    return playSfx(keys[Math.floor(Math.random() * keys.length)], opts);
  }

  /** 循环层的目标音量。单拿出来是因为 setMuted 也要算一遍：
      写两份的话那边很容易漏掉逐条修正，一切静音就把声音拉回到未修正的大音量。 */
  function loopVolume(key, gain) {
    const trim = Number(TRIM[key]);
    return Math.max(0, Math.min(1,
      MASTER * SFX_GAIN * (Number.isFinite(trim) ? trim : 1) * (Number(gain) || 1)));
  }

  /** 环境层：循环播放直到 stopLoopSfx。转盘滚动、泡泡漂浮用。 */
  function playLoopSfx(key, opts) {
    if (!supported || !unlocked || !key) return;
    const options = opts || {};
    let el = loops[key];
    if (!el) {
      el = make(key, true);
      loops[key] = el;
    }
    const target = muted ? 0 : loopVolume(key, options.gain);
    loopGain[key] = Number(options.gain) || 1;
    el.volume = options.fadeMs ? 0 : target;
    if (el.paused) safePlay(el);
    if (options.fadeMs) fadeTo(el, target, options.fadeMs);
  }

  function stopLoopSfx(key, fadeMs) {
    const el = loops[key];
    if (!el) return;
    if (fadeMs > 0) {
      fadeTo(el, 0, fadeMs, function () { el.pause(); });
    } else {
      el.pause();
      try { el.currentTime = 0; } catch (e) { /* 同上 */ }
    }
  }

  function stopAllLoops() {
    Object.keys(loops).forEach(function (key) { stopLoopSfx(key, 0); });
  }

  // ---------------------------------------------------------------- 开关

  function setMuted(value) {
    muted = !!value;
    writeMuted(muted);
    document.body.classList.toggle('is-muted', muted);
    const btn = document.querySelector('[data-action="audio-toggle"]');
    if (btn) {
      btn.setAttribute('aria-pressed', muted ? 'true' : 'false');
      btn.setAttribute('aria-label', muted ? '开启声音' : '关闭声音');
    }
    // BGM 走淡入淡出，别硬切；音效下一次触发时自然读到新值。
    fadeTo(bgmSlots[bgmActive], bgmTargetVolume(), DUCK_MS);
    Object.keys(loops).forEach(function (key) {
      const el = loops[key];
      if (!el.paused) fadeTo(el, muted ? 0 : loopVolume(key, loopGain[key]), DUCK_MS);
    });
    return muted;
  }

  function toggleMuted() { return setMuted(!muted); }
  function isMuted() { return muted; }

  // ---------------------------------------------------------------- 生命周期

  /** 重新开始时调用（app.js 的 restart 链）。停掉一切正在响的，BGM 留给场景切换重设。 */
  function reset() {
    clearFades();
    stopAllLoops();
    if (duckTimer) { window.clearTimeout(duckTimer); duckTimer = 0; }
    duckLevel = 1;
    Object.keys(sfxBank).forEach(function (key) {
      sfxBank[key].pool.forEach(function (el) {
        el.pause();
        try { el.currentTime = 0; } catch (e) { /* 同上 */ }
      });
      sfxBank[key].lastAt = 0;
    });
    stopBgm(0);
  }

  function init() {
    detect();
    if (!supported) return;
    muted = readMuted();
    document.body.classList.toggle('is-muted', muted);
    armGesture();
    // 先试直接放：Chrome/Edge 对常访问的站点会放行，这时候玩家一打开就有音乐。
    // 探针用一个真实的 BGM 元素，不是空的——空 src 的 play() 永远失败，测不出策略。
    const probe = make('bgm1', true);
    probe.volume = 0;
    const p = probe.play();
    if (p && typeof p.then === 'function') {
      p.then(function () {
        probe.pause();
        probe.src = '';
        unlock();
      }).catch(function () {
        probe.src = '';
        // 放不了就等手势，armGesture 已经挂好了。
      });
    }
  }

  return {
    init: init,
    unlock: unlock,
    playBgm: playBgm,
    stopBgm: stopBgm,
    duckBgm: duckBgm,
    unduckBgm: unduckBgm,
    playStinger: playStinger,
    playSfx: playSfx,
    playSfxOneOf: playSfxOneOf,
    playLoopSfx: playLoopSfx,
    stopLoopSfx: stopLoopSfx,
    setMuted: setMuted,
    toggleMuted: toggleMuted,
    isMuted: isMuted,
    reset: reset
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = AudioManager;
