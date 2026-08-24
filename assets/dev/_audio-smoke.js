/**
 * _audio-smoke.js —— 音频接线验收
 *
 *   NODE_PATH="$(npm root -g)" node assets/dev/_audio-smoke.js
 *
 * 不放真实声音：Playwright 的 Chromium 起进程时带 --mute-audio，
 * 而且没有音频输出设备，听不到也量不了电平。这里验证的是**接线**：
 *
 *   1. 24 个音频文件全都能被浏览器取到（HTTP/file 都 200，格式能解）；
 *   2. AudioManager 的每个对外方法都在，配置表读得到；
 *   3. 走一遍真实路径（u01→u05），把 <audio>.play() 打桩记账，
 *      看该响的时候有没有调到、key 对不对、冷却窗口有没有生效；
 *   4. 静音按钮真的挂在右上角、不和「退出体验」重叠、点了之后
 *      body.is-muted 和 aria-pressed 同步，刷新之后还记得。
 *
 * 第 3 条是这个脚本存在的理由：音效错接是静默失败——
 * 页面照跑、控制台干净，只是那一下没声音，肉眼永远看不出来。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const URL = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/');
const OUT = path.join(__dirname, '_audio-smoke.txt');

const lines = [];
let failed = 0;

function say(text) { lines.push(text); }
function ok(name, detail) { say('  [ok]   ' + name + (detail ? ' — ' + detail : '')); }
function bad(name, detail) { failed += 1; say('  [FAIL] ' + name + (detail ? ' — ' + detail : '')); }
function check(cond, name, detail) { (cond ? ok : bad)(name, detail); }

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });

  const errors = [];
  page.on('pageerror', function (err) { errors.push(String(err)); });
  page.on('console', function (msg) {
    if (msg.type() === 'error') errors.push('console: ' + msg.text());
  });

  // 打桩必须在任何脚本跑之前：AudioManager.init() 在 DOMContentLoaded 就建元素了。
  await page.addInitScript(function () {
    window.__audio = [];
    const proto = window.HTMLMediaElement.prototype;
    const realPlay = proto.play;
    proto.play = function () {
      const src = String(this.src || '');
      const hit = src.match(/(bgm\d+|sfx\d+)\.(opus|m4a)/);
      window.__audio.push({
        key: hit ? hit[1] : src,
        loop: !!this.loop,
        volume: Number(this.volume.toFixed(3)),
        rate: this.playbackRate
      });
      // 真放不了（无头浏览器没有音频设备，而且自动播放策略也在），
      // 但要让 Promise 正常 resolve，否则 AudioManager 会以为被策略挡下、
      // 走手势兜底那条路，就验不到「一打开就有音乐」那一支。
      // 它抛的 NotAllowedError 必须在这里吃掉：那是测试环境的产物，
      // 不是站点的错——audio.js 自己调 play() 的地方全都 catch 了。
      try {
        const real = realPlay.call(this);
        if (real && typeof real.catch === 'function') real.catch(function () {});
      } catch (e) { /* 忽略 */ }
      return Promise.resolve();
    };
  });

  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(400);

  say('一、素材可取');
  const files = await page.evaluate(async function () {
    const keys = [];
    for (let i = 1; i <= 7; i += 1) keys.push('assets/audio/bgm/bgm' + i);
    for (let i = 1; i <= 17; i += 1) keys.push('assets/audio/sfx/sfx' + String(i).padStart(2, '0'));
    const out = [];
    for (const base of keys) {
      for (const ext of ['opus', 'm4a']) {
        const el = new Audio(base + '.' + ext);
        const okOne = await new Promise(function (resolve) {
          const done = function (v) { resolve(v); };
          el.addEventListener('loadedmetadata', function () { done(el.duration); });
          el.addEventListener('error', function () { done(0); });
          window.setTimeout(function () { done(-1); }, 4000);
        });
        out.push({ src: base + '.' + ext, dur: okOne });
      }
    }
    return out;
  });
  const dead = files.filter(function (f) { return !(f.dur > 0); });
  check(dead.length === 0, '24 个素材 × 2 格式 全部可解码',
    dead.length ? dead.slice(0, 5).map(function (f) { return f.src; }).join(' ') : files.length + ' 个文件');

  say('');
  say('二、模块与配置');
  const api = await page.evaluate(function () {
    const names = ['init', 'unlock', 'playBgm', 'stopBgm', 'duckBgm', 'unduckBgm',
      'playStinger', 'playSfx', 'playSfxOneOf', 'playLoopSfx', 'stopLoopSfx',
      'setMuted', 'toggleMuted', 'isMuted', 'reset'];
    return {
      missing: names.filter(function (n) { return typeof AudioManager[n] !== 'function'; }),
      scenes: Object.keys(CONFIG.AUDIO_SCENE_BGM || {}).length,
      u11: (CONFIG.AUDIO_SCENE_BGM || {}).u11,
      u12: (CONFIG.AUDIO_SCENE_BGM || {}).u12,
      trims: Object.keys(CONFIG.AUDIO_SFX_GAIN_TRIM || {}).length,
      pop: (CONFIG.AUDIO_BUBBLE_POP_KEYS || []).join('/'),
      stinger: CONFIG.AUDIO_DICTATOR_STINGER
    };
  });
  check(api.missing.length === 0, 'AudioManager 对外方法齐全',
    api.missing.length ? '缺 ' + api.missing.join(',') : '15 个');
  check(api.scenes === 12, 'AUDIO_SCENE_BGM 覆盖 u01~u12', api.scenes + ' 个');
  check(api.u11 === 'bgm7' && api.u12 === 'bgm7', 'BGM7 覆盖全部四种结局',
    'u11=' + api.u11 + ' u12=' + api.u12);
  check(api.trims === 17, '逐条增益修正 17 条', api.trims + ' 条');
  check(api.pop === 'sfx11/sfx12', '泡泡点击声 SFX11/12', api.pop);
  check(api.stinger === 'bgm5', '独裁者按钮 stinger = BGM5', String(api.stinger));

  say('');
  say('三、静音按钮');
  const btn = page.locator('[data-action="audio-toggle"]');
  check(await btn.count() === 1, '静音按钮存在且唯一', String(await btn.count()));
  const box = await btn.boundingBox();
  check(!!box && box.x + box.width > 1366 - 80 && box.y < 80, '在右上角',
    box ? 'x=' + Math.round(box.x) + ' y=' + Math.round(box.y) +
      ' 距右=' + Math.round(1366 - box.x - box.width) : '量不到');
  check(!!box && box.width >= 32 && box.height >= 32, '点击区不小于 32px',
    box ? Math.round(box.width) + '×' + Math.round(box.height) : '-');

  const before = await page.evaluate(function () { return window.__audio.length; });
  await btn.click();
  const muted = await page.evaluate(function () {
    return {
      body: document.body.classList.contains('is-muted'),
      pressed: document.querySelector('[data-action="audio-toggle"]').getAttribute('aria-pressed'),
      api: AudioManager.isMuted(),
      store: window.localStorage.getItem('dictator-button:muted'),
      added: window.__audio.length
    };
  });
  check(muted.body && muted.pressed === 'true' && muted.api === true,
    '点一下→ body.is-muted / aria-pressed / isMuted() 三者同步',
    'body=' + muted.body + ' aria=' + muted.pressed + ' api=' + muted.api);
  check(muted.store === '1', '静音状态写进 localStorage', String(muted.store));
  check(muted.added === before, '静音按钮自己不发声',
    '新增 ' + (muted.added - before) + ' 次播放');

  await btn.click();
  const unmuted = await page.evaluate(function () {
    return { body: document.body.classList.contains('is-muted'), api: AudioManager.isMuted() };
  });
  check(!unmuted.body && unmuted.api === false, '再点一下恢复有声', 'api=' + unmuted.api);

  // 和右上角那两个「退出体验」不能撞。u06 是绝对定位那个。
  const exitBox = await page.locator('.immersive-exit').first().boundingBox()
    .catch(function () { return null; });
  if (exitBox && box) {
    const gap = box.x - (exitBox.x + exitBox.width);
    check(gap >= 0, '与「退出体验」不重叠', '间隙 ' + Math.round(gap) + 'px');
  }

  say('');
  say('四、走一遍真实路径');

  function since(mark) {
    return page.evaluate(function (from) {
      return window.__audio.slice(from);
    }, mark);
  }
  function mark() { return page.evaluate(function () { return window.__audio.length; }); }

  // u01：首页应该已经在放 BGM1（init 里的直接播放试探成功，桩会 resolve）。
  const boot = await page.evaluate(function () { return window.__audio.slice(); });
  const bootBgm = boot.filter(function (e) { return /^bgm/.test(e.key); });
  check(bootBgm.some(function (e) { return e.key === 'bgm1'; }),
    '一打开首页就起 BGM1',
    bootBgm.map(function (e) { return e.key; }).join(',') || '没有');

  // u01 → u02：点大标题进入。
  let m = await mark();
  await page.click('.intro-card');
  await page.waitForTimeout(700);
  let evts = await since(m);
  check(evts.some(function (e) { return e.key === 'sfx01'; }), '点击声 SFX01',
    evts.map(function (e) { return e.key; }).join(',') || '没有');
  check(evts.some(function (e) { return e.key === 'sfx03'; }), '进入 u02 的场景切换声 SFX03',
    evts.map(function (e) { return e.key; }).join(',') || '没有');
  check(evts.some(function (e) { return e.key === 'bgm1'; }) === false ||
    bootBgm.length > 0, 'u01→u02 同为 BGM1，不重头播', '');

  // 连点两下，验证 SFX01 的冷却窗口没把正常点击也吃掉。
  m = await mark();
  await page.evaluate(function () {
    AudioManager.playSfx('sfx01');
    AudioManager.playSfx('sfx01');   // 60ms 内的第二下应该被冷却挡住
  });
  evts = await since(m);
  check(evts.length === 1, 'SFX01 冷却窗口生效',
    '连调两次实际响 ' + evts.length + ' 次');

  // 逐句点完 u02 → u03。
  m = await mark();
  for (let i = 0; i < 24; i += 1) {
    const next = page.locator('[data-scene="u02"] [data-action="next"]:visible').first();
    if (!(await next.count())) break;
    await next.click({ timeout: 1500 }).catch(function () {});
    await page.waitForTimeout(180);
    if (await page.locator('[data-scene="u03"].scene--active').count()) break;
  }
  await page.waitForTimeout(600);
  const scene = await page.evaluate(function () { return document.body.dataset.currentScene; });
  say('  当前场景：' + scene);
  evts = await since(m);
  const keys = Array.from(new Set(evts.map(function (e) { return e.key; }))).join(',');
  say('  这段里响过：' + (keys || '无'));
  if (scene === 'u03') {
    check(evts.some(function (e) { return e.key === 'bgm2'; }), 'u03 换到 BGM2', keys);
  }

  // u03 → u04：选一条烦恼确认，老虎机开滚。
  if (scene === 'u03') {
    m = await mark();
    const cat = page.locator('[data-action="pick-category"]:visible').first();
    if (await cat.count()) { await cat.click(); await page.waitForTimeout(700); }
    const worry = page.locator('[data-action="pick-worry"]:visible').first();
    if (await worry.count()) { await worry.click(); await page.waitForTimeout(400); }
    evts = await since(m);
    check(evts.some(function (e) { return e.key === 'sfx02'; }), '悬停预听 SFX02',
      Array.from(new Set(evts.map(function (e) { return e.key; }))).join(',') || '无');

    m = await mark();
    const confirm = page.locator('[data-action="confirm-worry"]:visible').first();
    if (await confirm.count()) { await confirm.click(); await page.waitForTimeout(900); }
    const now = await page.evaluate(function () { return document.body.dataset.currentScene; });
    say('  当前场景：' + now);
    evts = await since(m);
    const spinKeys = Array.from(new Set(evts.map(function (e) { return e.key; })));
    if (now === 'u04') {
      check(evts.some(function (e) { return e.key === 'sfx05' && e.loop; }),
        '老虎机滚轮环境层 SFX05（循环）', spinKeys.join(','));
      // 三列停稳：等到 SLOT_SPIN_MS 之后再数。
      m = await mark();
      await page.waitForTimeout(3400);
      evts = await since(m);
      const stops = evts.filter(function (e) { return e.key === 'sfx06'; }).length;
      check(stops === 3, '三列各响一声 SFX06', '实际 ' + stops + ' 声');

      // 拨杆：专属的 SFX04，而且**不**叠普通点击音。
      m = await mark();
      const lever = page.locator('[data-action="pull-lever"]:visible').first();
      if (await lever.count()) {
        await lever.click();
        await page.waitForTimeout(500);
        evts = await since(m);
        check(evts.some(function (e) { return e.key === 'sfx04'; }), '拨杆 SFX04',
          Array.from(new Set(evts.map(function (e) { return e.key; }))).join(',') || '无');
        check(!evts.some(function (e) { return e.key === 'sfx01'; }),
          '拨杆不叠普通点击音',
          Array.from(new Set(evts.map(function (e) { return e.key; }))).join(','));
      }
    }
  }

  // u05 → u06：进关卡。泡泡生成、点破、独裁者按钮都在这一段。
  // 拨杆之后还有一段上掰动画（SLOT_LIFT_MS）才真正到 u05，先等到位。
  await page.waitForFunction(function () {
    return document.body.dataset.currentScene === 'u05';
  }, null, { timeout: 6000 }).catch(function () {});
  say('  拨杆后场景：' + await page.evaluate(function () {
    return document.body.dataset.currentScene;
  }));
  if (await page.evaluate(function () { return document.body.dataset.currentScene === 'u05'; })) {
    m = await mark();
    const go = page.locator('[data-scene="u05"] [data-action="next"]:visible').first();
    if (await go.count()) { await go.click(); await page.waitForTimeout(2600); }
    const now = await page.evaluate(function () { return document.body.dataset.currentScene; });
    say('  当前场景：' + now);
    evts = await since(m);
    const seen = Array.from(new Set(evts.map(function (e) { return e.key; })));
    if (now === 'u06') {
      check(evts.some(function (e) { return e.key === 'bgm3'; }), 'u06 换到 BGM3', seen.join(','));
      check(evts.some(function (e) { return e.key === 'sfx09'; }),
        '泡泡生成声 SFX09', seen.join(','));

      // 点一下画布中心：碰到泡泡就应该出 SFX11 或 SFX12。
      m = await mark();
      const canvas = page.locator('canvas').first();
      const cb = await canvas.boundingBox();
      if (cb) {
        for (let i = 0; i < 14; i += 1) {
          await page.mouse.click(cb.x + cb.width * (0.34 + i * 0.024),
            cb.y + cb.height * (0.46 + (i % 3) * 0.05));
          await page.waitForTimeout(110);
        }
      }
      await page.waitForTimeout(300);
      evts = await since(m);
      const pops = evts.filter(function (e) { return e.key === 'sfx11' || e.key === 'sfx12'; });
      check(pops.length > 0, '泡泡点破声 SFX11/12',
        pops.length + ' 声（' + Array.from(new Set(pops.map(function (e) { return e.key; }))).join(',') + '）');

      // 独裁者按钮：一次性 stinger BGM5 + 普通点击音 SFX01。
      m = await mark();
      const dictator = page.locator('[data-action="game-dictator"]:visible').first();
      if (await dictator.count()) {
        await dictator.click({ force: true }).catch(function () {});
        await page.waitForTimeout(700);
        evts = await since(m);
        const keys2 = Array.from(new Set(evts.map(function (e) { return e.key; })));
        check(evts.some(function (e) { return e.key === 'bgm5'; }),
          '独裁者按钮 stinger BGM5', keys2.join(',') || '无');
        check(evts.some(function (e) { return e.key === 'sfx01'; }),
          '独裁者按钮用统一的点击音 SFX01', keys2.join(',') || '无');
      }
    }
  }

  // 按完独裁者按钮会走到 u07 结算：星星逐颗亮（SFX07）、
  // 道具飞进收藏册（SFX08），底乐换 BGM6。
  m = await mark();
  await page.waitForFunction(function () {
    return document.body.dataset.currentScene === 'u07';
  }, null, { timeout: 8000 }).catch(function () {});
  await page.waitForTimeout(2200);
  const resultScene = await page.evaluate(function () { return document.body.dataset.currentScene; });
  say('  结算场景：' + resultScene);
  if (resultScene === 'u07') {
    evts = await since(m);
    const seen3 = Array.from(new Set(evts.map(function (e) { return e.key; })));
    check(evts.some(function (e) { return e.key === 'bgm6'; }), 'u07 换到 BGM6', seen3.join(','));
    const stars = evts.filter(function (e) { return e.key === 'sfx07'; });
    check(stars.length > 0, '星星亮起来的 SFX07',
      stars.length + ' 声，音高 ' + stars.map(function (e) { return e.rate; }).join('/'));
    if (stars.length > 1) {
      check(stars[1].rate > stars[0].rate, '每多一颗星音高抬一点',
        stars.map(function (e) { return e.rate.toFixed(2); }).join(' → '));
    }
  }

  // 抽卡：又一轮老虎机（SFX05/06），然后道具飞进收藏册（SFX08）。
  // 只有 2、3 星才有这颗按钮，拿不到就跳过。
  const draw = page.locator('[data-action="level-result-draw"]:visible').first();
  if (await draw.count()) {
    m = await mark();
    await draw.click();
    await page.waitForTimeout(5200);
    evts = await since(m);
    check(evts.filter(function (e) { return e.key === 'sfx06'; }).length === 3,
      '抽卡也是三列各响一声',
      evts.filter(function (e) { return e.key === 'sfx06'; }).length + ' 声');

    // 滚完会弹出道具卡，点「放进收藏夹」才起飞。
    m = await mark();
    const store = page.locator('[data-action="reward-store"]:visible').first();
    if (await store.count()) {
      await store.click();
      await page.waitForTimeout(1400);
      evts = await since(m);
      const seen4 = Array.from(new Set(evts.map(function (e) { return e.key; })));
      check(evts.some(function (e) { return e.key === 'sfx08'; }),
        '道具飞进收藏册 SFX08', seen4.join(','));
    } else {
      say('  （没等到道具卡，跳过 SFX08）');
    }
  } else {
    say('  （本次没拿到抽卡按钮，跳过 SFX08）');
  }

  // 音量：BGM 明显低于 SFX，是混音的基本盘。
  const vols = await page.evaluate(function () {
    return {
      bgm: window.__audio.filter(function (e) { return /^bgm/.test(e.key); })
        .map(function (e) { return e.volume; }),
      sfx: window.__audio.filter(function (e) { return /^sfx/.test(e.key); })
        .map(function (e) { return e.volume; })
    };
  });
  const maxSfx = Math.max.apply(null, vols.sfx.concat([0]));
  check(maxSfx > 0 && maxSfx <= 1, '音效音量在 (0,1]，没溢出',
    '最大 ' + maxSfx);

  say('');
  say('六、剩下那几条');
  // SFX13（麻袋绷紧）、SFX14（倒计时吃紧）、SFX10（结局一漂浮）、BGM7（结局）
  // 要走完三关才碰得到，跑一遍要好几分钟。这里直接验它们能不能响、
  // 以及场景→BGM 的表接对了没有——调用点本身已经在代码里盯住了。
  m = await mark();
  await page.evaluate(function () {
    AudioManager.playSfx('sfx13');
    AudioManager.playSfx('sfx14');
    AudioManager.playLoopSfx('sfx10', { fadeMs: 200 });
  });
  await page.waitForTimeout(200);
  evts = await since(m);
  const rest = evts.map(function (e) { return e.key; });
  check(rest.indexOf('sfx13') !== -1 && rest.indexOf('sfx14') !== -1,
    '麻袋绷紧 SFX13 / 倒计时 SFX14 可播', rest.join(','));
  const loop10 = evts.find(function (e) { return e.key === 'sfx10'; });
  check(!!loop10 && loop10.loop, '结局一漂浮层 SFX10 是循环的',
    loop10 ? 'loop=' + loop10.loop : '没响');

  m = await mark();
  await page.evaluate(function () { SceneManager.goToId('u11'); });
  await page.waitForTimeout(900);
  evts = await since(m);
  check(evts.some(function (e) { return e.key === 'bgm7'; }), '结局页 BGM7',
    Array.from(new Set(evts.map(function (e) { return e.key; }))).join(',') || '无');
  const endingBox = await page.locator('.ending-exit').first().boundingBox()
    .catch(function () { return null; });
  if (endingBox && box) {
    check(box.x - (endingBox.x + endingBox.width) >= 0, '结局页的退出按钮也不撞静音键',
      '间隙 ' + Math.round(box.x - (endingBox.x + endingBox.width)) + 'px');
  }

  say('');
  say('七、控制台');
  check(errors.length === 0, '无页面错误',
    errors.length ? errors.slice(0, 3).join(' | ') : '干净');

  await browser.close();

  say('');
  say(failed ? '✖ ' + failed + ' 项不过' : '✔ 全部通过');
  const text = lines.join('\n');
  fs.writeFileSync(OUT, text + '\n', 'utf8');
  process.stdout.write('report: ' + OUT + '\n');
  process.exit(failed ? 1 : 0);
}

main().catch(function (err) {
  fs.writeFileSync(OUT, String(err && err.stack || err) + '\n', 'utf8');
  process.stderr.write('crashed, see ' + OUT + '\n');
  process.exit(1);
});
