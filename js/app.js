/**
 * app.js —— 初始化、事件绑定、全局数据与 u01~u12 流程协调
 * V0.8：流程改为「选一个烦恼 → 匹配一件道具 → 生成泡泡」。
 *
 * 场景 id 与 V0.7 的对应关系不是整体平移，u07 起错开一位：
 *   ux-06+ux-07→u06   ux-08→u07   ux-09→u08   ux-10→u09   ux-11→u10   ux-12→u11
 * 因此本文件里的 id 全部是手工重定向的，不要用正则批量替换。
 */
'use strict';

const appData = {
  // ---- 选择结果（u03 / u04 / u05）----
  // 玩家一次选 1~3 条（CONFIG.WORRY_MAX_PICK）。下面两个数组**同序等长**：
  // selectedWorries[i] 配到的就是 matchedGadgets[i]，
  // u04 的三列分配、u05 的算式、u11/u12 的记录全靠这层对应关系，别单独重排其中一个。
  pickedCategory: '',
  selectedWorries: [],      // WorryData.createProfile 的返回值，按选中顺序
  matchedGadgets: [],       // GadgetData 记录，和上面一一对应
  worries: [],              // 送进 BubbleGame 的泡泡文案：只包含玩家实际选中的烦恼

  // ---- 沉浸段计数（u06~u10）----
  bubbles: [],
  successfulDeleteCount: 0,
  deleteAttemptCount: 0,
  splitCount: 0,
  returnDeleteAttemptCount: 0,
  clickCount: 0,
  buttonUnlocked: false,
  buttonTriggered: false,
  normalPhaseStartedAt: 0,
  normalTimer: 0,
  growthStarted: false,
  growthStartedAt: 0,
  growthIntervalMs: CONFIG.GROWTH_INTERVAL_START_MS,
  transitionProgress: 0,
  chaosLevel: 0,
  currentScene: SCENE_FLOW[0].id,
  chaosTimer: 0,
  returnChoiceVisible: false,
  returnChoiceResolved: false,
  erasureFallbackTimer: 0,

  // ---- 三关状态机（u06~u10）----
  gameSessionStarted: false,
  gameResolving: false,
  levelResult: null,
  latestGameStats: null,
  levelStars: 0,           // 最近一次结算的星数（0~3），只给结算卡自己看，不参与玩法

  // ---- 结尾段（u11 / u12）----
  dialogueIndex: 0,
  selectedWorryText: '',   // u10 停下来观察时，玩家盯着的那个泡泡的文案（只有一条）
  finalChoice: '',
  observeSelected: false
};

const App = (function () {
  const el = {};

  // 注意：bind 只做正向缓存、永不失效。所有 data-bind 节点必须首屏就在，
  // 且此后不能被 innerHTML/克隆重建，否则这里会一直往脱离文档的旧节点写字。
  function bind(name) {
    if (!el[name]) el[name] = document.querySelector('[data-bind="' + name + '"]');
    return el[name];
  }

  function canvas(name) {
    return document.querySelector('[data-canvas="' + name + '"]');
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function setText(name, value) {
    const node = bind(name);
    if (node) node.textContent = String(value == null ? '' : value);
  }

  function stopChaosTicker() {
    if (appData.chaosTimer) window.clearInterval(appData.chaosTimer);
    appData.chaosTimer = 0;
  }

  /** 正常删除阶段的门控轮询（时长 + 次数双条件）。 */
  function stopNormalTicker() {
    if (appData.normalTimer) window.clearInterval(appData.normalTimer);
    appData.normalTimer = 0;
  }

  function stopErasureFallback() {
    if (appData.erasureFallbackTimer) window.clearTimeout(appData.erasureFallbackTimer);
    appData.erasureFallbackTimer = 0;
  }

  function stopAllTickers() {
    stopChaosTicker();
    stopNormalTicker();
    stopErasureFallback();
  }

  function resetData() {
    stopAllTickers();
    appData.pickedCategory = '';
    appData.selectedWorries.length = 0;
    appData.matchedGadgets.length = 0;
    appData.worries.length = 0;
    appData.bubbles.length = 0;
    appData.successfulDeleteCount = 0;
    appData.deleteAttemptCount = 0;
    appData.splitCount = 0;
    appData.returnDeleteAttemptCount = 0;
    appData.clickCount = 0;
    appData.buttonUnlocked = false;
    appData.buttonTriggered = false;
    appData.normalPhaseStartedAt = 0;
    appData.growthStarted = false;
    appData.growthStartedAt = 0;
    appData.growthIntervalMs = CONFIG.GROWTH_INTERVAL_START_MS;
    appData.transitionProgress = 0;
    appData.chaosLevel = 0;
    appData.returnChoiceVisible = false;
    appData.returnChoiceResolved = false;
    appData.gameSessionStarted = false;
    appData.gameResolving = false;
    appData.levelResult = null;
    appData.latestGameStats = null;
    appData.levelStars = 0;
    appData.dialogueIndex = 0;
    appData.selectedWorryText = '';
    appData.finalChoice = '';
    appData.observeSelected = false;
    BubbleGame.destroy();
    LevelGame.destroy();
    GameState.reset();
  }

  /* ---------------- u03 选择烦恼：留在 app.js 的那一半 ---------------- */

  // 粒子场、悬停预览、展开列表、自由输入分类、飞进四次元口袋——全在 worry-picker.js。
  // 这里只剩两件"选完之后"的事：把烦恼摊成泡泡场、按烦恼配道具。
  // 它们的消费者是 u06 和 u11，不属于选择页，所以没有跟着搬走。

  /**
   * 泡泡文案必须严格来自玩家实际选中的细分烦恼。
   * 泡泡数量由 BubbleGame 重复使用这些已选条目来补足，不能再从所属大类
   * 随机加入“同类兄弟”，否则选中“作业太多”后会混入全部学业烦恼。
   */
  function buildWorryField() {
    appData.worries.length = 0;
    const seen = Object.create(null);
    appData.selectedWorries.forEach(function (worry) {
      if (!worry || !worry.text || seen[worry.text]) return;
      seen[worry.text] = true;
      appData.worries.push(worry);
    });
  }

  /**
   * 自由输入可能没有预设道具，此时按大类退化，而不是永远发 1 号道具。
   * taken 是本轮已经发出去的道具 id：两条烦恼配到同一件时换一件，
   * 否则老虎机会出现"两列显示同一张图却说是两件道具"的自相矛盾。
   */
  function matchGadget(profile, taken) {
    if (!profile) return null;
    const used = taken || Object.create(null);
    const direct = GadgetData.forWorry(profile);
    if (direct && !used[direct.id]) return direct;

    // 同大类里另找一件没被占用的。
    const siblings = WorryData.byCategory(profile.category) || [];
    for (let i = 0; i < siblings.length; i += 1) {
      if (!siblings[i].gadget) continue;
      const found = GadgetData.byName(siblings[i].gadget);
      if (found && !used[found.id]) return found;
    }
    // 同类里全被占了就在全表里兜一件，实在兜不到才允许重复。
    const spare = GadgetData.all.find(function (item) { return !used[item.id]; });
    return spare || direct || GadgetData.all[0] || null;
  }

  /* ---------------- worry-picker.js 的回调 ---------------- */

  /**
   * 加/减一条烦恼。返回值决定 worry-picker 说哪句话：
   *   'added' 加上了 · 'removed' 取消了 · 'full' 已经选满、这次什么都没做。
   * 选满时**不顶替**：替掉哪一条都是替玩家做主，让他自己先取消一条。
   */
  function onWorryToggle(profile) {
    if (!profile) return 'full';
    // 同一条的判定用文案而不是 presetId：自由输入没有 presetId，
    // 而"把预设里那句话原样打一遍"和点那一条，对玩家来说就是同一件事。
    const at = appData.selectedWorries.findIndex(function (item) {
      return item.text === profile.text;
    });
    if (at >= 0) {
      appData.selectedWorries.splice(at, 1);
      appData.pickedCategory = appData.selectedWorries.length
        ? appData.selectedWorries[appData.selectedWorries.length - 1].category
        : '';
      return 'removed';
    }
    if (appData.selectedWorries.length >= CONFIG.WORRY_MAX_PICK) return 'full';
    appData.selectedWorries.push(profile);
    appData.pickedCategory = profile.category;
    return 'added';
  }

  /** 清空全部选择：u03 的「清空重选」、u05 的「重新选择」、restart 都会到这里。 */
  function onWorryClear() {
    appData.selectedWorries.length = 0;
    appData.pickedCategory = '';
    appData.matchedGadgets.length = 0;
    appData.worries.length = 0;
  }

  /**
   * 烦恼已经沿弧线飞进四次元口袋——这时才配道具、翻到老虎机页。
   * 配道具放在动画之后而不是之前：老虎机三列要停在这几枚道具上，
   * 早一步晚一步无所谓，但顺序反了就得在两处各写一遍匹配逻辑。
   */
  function onWorryConfirmed() {
    buildWorryField();
    const taken = Object.create(null);
    appData.matchedGadgets = appData.selectedWorries.map(function (worry) {
      const found = matchGadget(worry, taken);
      if (found) taken[found.id] = true;
      return found;
    }).filter(Boolean);
    SceneManager.goToId('u04');
  }

  /** 清空选择并把选择页复位。restart 与 u05 的「重新选择」共用。 */
  function resetWorryPick() {
    onWorryClear();
    WorryPicker.reset();
  }

  /* ---------------- u04 老虎机 / u05 匹配结果 ---------------- */

  // 滚动、停位、拨杆、跨场景飞行、道具说明弹窗全在 gadget-match.js。
  // app.js 只在结果页兜一个底：拿不到道具说明 u03 被跳过了，退回去重选比空着页面好。
  function enterGadgetResult() {
    if (!GadgetMatch.renderResult()) SceneManager.goToId('u03');
  }

  /* ---------------- 三关透明麻袋游戏（u06~u10） ---------------- */

  function immersiveScene() {
    return document.querySelector('[data-scene="u06"]');
  }

  function selectedWorryLabel() {
    return appData.selectedWorries.map(function (item) { return item.text; }).join('、') || '尚未说出口的烦恼';
  }

  function formatTime(seconds) {
    const value = Math.max(0, Number(seconds) || 0);
    const minutes = Math.floor(value / 60);
    const rest = value % 60;
    return String(minutes).padStart(2, '0') + ':' + String(rest).padStart(2, '0');
  }

  function closeLevelResult() {
    const modal = bind('levelResult');
    LevelRating.reset();
    Collection.close();
    if (!modal) return;
    modal.classList.remove('modal--open');
    modal.setAttribute('aria-hidden', 'true');
  }

  function setLevelCopy(level) {
    const scene = immersiveScene();
    if (scene) {
      scene.dataset.level = String(level.level);
      scene.dataset.bag = String(level.bag);
      scene.dataset.branch = level.key;
    }
    setText('gameLevel', '第' + ['零', '一', '二', '三'][level.level] + '关');
    setText('gameTitle', level.level === 3
      ? '看看这些泡泡最后会去哪里'
      : '在时间结束前，清空麻袋里的泡泡');
    setText('gameWorry', selectedWorryLabel());
    setText('gameBagLabel', '透明束缚袋');
    setText('gameTimer', formatTime(level.duration));
    setText('gameStatus', '');
    setText('gameButtonHint', level.level === 3
      ? '你仍然可以选择按下它'
      : '可以立即清空眼前的泡泡，但之后会发生变化');
  }

  function startCurrentLevel() {
    const level = GameState.current();
    if (!appData.worries.length) {
      SceneManager.goToId('u03');
      return;
    }
    appData.gameResolving = false;
    appData.levelResult = null;
    appData.latestGameStats = null;
    closeLevelResult();
    setLevelCopy(level);

    LevelGame.start({
      canvas: canvas('experience'),
      worries: appData.worries,
      spec: level,
      callbacks: {
        onTime: function (seconds) {
          setText('gameTimer', formatTime(seconds));
          const scene = immersiveScene();
          if (scene) scene.classList.toggle('is-time-low', seconds <= 10);
        },
        onStats: function (stats) {
          appData.latestGameStats = stats;
        },
        onManualClear: function () {
          setText('gameStatus', '这个泡泡被你亲手清除了');
        },
        onEscape: function () {
          setText('gameStatus', '有一个泡泡从麻袋边缘逃了出去');
        },
        onAutoBurst: function () {
          setText('gameStatus', '有一个泡泡膨胀后自行爆裂');
        },
        onPressure: function (stage) {
          if (stage === 1) setText('gameStatus', '泡泡越来越多，麻袋开始绷紧了');
          if (stage === 2) setText('gameStatus', '泡泡正在彼此推挤，留给你的空间不多了');
          if (stage === 3) setText('gameStatus', '麻袋已经快要撑不住了');
        },
        onManualComplete: handleManualComplete,
        onTimeout: handleLevelTimeout
      }
    });
  }

  function resultSceneForLevel(level) {
    return level === 1 ? 'u07' : 'u09';
  }

  function handleManualComplete(stats) {
    if (appData.gameResolving) return;
    appData.gameResolving = true;
    const level = GameState.current();
    appData.latestGameStats = stats;
    if (level.level === 3) {
      GameState.completeManual(stats);
      setText('gameStatus', '最后一个泡泡被你亲手清除了。麻袋安静下来了。');
      SceneManager.addTimer(function () { SceneManager.goToId('u11'); }, 720);
      return;
    }
    const result = GameState.completeManual(stats);
    appData.levelResult = result;
    setText('gameStatus', '全部泡泡已经清空');
    SceneManager.addTimer(function () {
      SceneManager.goToId(resultSceneForLevel(level.level));
    }, 420);
  }

  function playThirdLevelEnding(outcome) {
    const kind = outcome.ending === 1 ? 'escape' : outcome.ending === 4 ? 'burst' : 'hold';
    if (outcome.ending === 1) {
      setText('gameStatus', outcome.trigger === 'button-failed'
        ? '独裁者按钮没有反应。麻袋松开了，泡泡正从缝隙中飘走……'
        : '你没有继续追赶它们。泡泡正慢慢飘向远方……');
    } else if (outcome.ending === 4) {
      setText('gameStatus', '麻袋里的泡泡正在失去稳定，它们挤在一起开始自行爆裂……');
    }
    LevelGame.playOutcome(kind, function () {
      SceneManager.goToId('u11');
    });
  }

  function handleLevelTimeout(stats) {
    if (appData.gameResolving) return;
    appData.gameResolving = true;
    const level = GameState.current();
    appData.latestGameStats = stats;
    if (level.level === 3) {
      playThirdLevelEnding(GameState.resolveLevelThree(stats));
      return;
    }
    appData.levelResult = GameState.fail(stats);
    setText('gameStatus', '倒计时结束');
    SceneManager.addTimer(function () {
      SceneManager.goToId(resultSceneForLevel(level.level));
    }, 360);
  }

  function useDictatorButton() {
    if (appData.gameResolving || !LevelGame.isPlaying()) return;
    const level = GameState.current();
    appData.gameResolving = true;
    if (level.level === 3 && level.key === 'L3A') {
      setText('gameStatus', '独裁者按钮没有反应。');
      LevelGame.triggerButton({
        failed: true,
        onComplete: function (stats) {
          appData.latestGameStats = stats;
          const outcome = GameState.completeWithButton(stats);
          setText('gameStatus', '麻袋松开了，泡泡正从缝隙中慢慢飘走……');
          SceneManager.addTimer(function () { SceneManager.goToId('u11'); }, 520);
          appData.finalChoice = outcome.trigger;
        }
      });
      return;
    }

    setText('gameStatus', '独裁者按钮已启动。泡泡正在消失……');
    LevelGame.triggerButton({
      failed: false,
      onComplete: function (stats) {
        appData.latestGameStats = stats;
        const outcome = GameState.completeWithButton(stats);
        if (level.level === 3) {
          setText('gameStatus', '等等，它们又回来了。');
          SceneManager.addTimer(function () { SceneManager.goToId('u11'); }, 720);
          return;
        }
        appData.levelResult = outcome;
        SceneManager.goToId(resultSceneForLevel(level.level));
      }
    });
  }

  /**
   * 第一、二关的结算卡。星级评定就插在这里：通关/失败已经判完（result 是
   * GameState 给的），进入下一关 / 重试 / 结束体验还没发生。
   *
   * 三档出口和原来的两条分支是对齐的，没有新增流程节点：
   *   0 星 = 原来的失败分支（再来一次 / 结束体验）
   *   1 星 = 原来的通关分支（进入下一关）
   *   2、3 星 = 通关分支再多一颗「抽取未来道具」，一次机会
   * 第三关不走这里：它不判通关与否，三条路径在上面直接跳 u11。
   */
  function showLevelResult() {
    const result = appData.levelResult;
    const modal = bind('levelResult');
    if (!result || !modal) return;
    const passed = result.type === 'pass';
    const rating = LevelRating.render(result, appData.latestGameStats);
    appData.levelStars = rating.stars;

    setText('levelResultTitle', passed
      ? '恭喜你！通关第' + (result.level === 1 ? '一' : '二') + '关'
      : '还差一点就通关了');
    setText('levelResultNote', !passed
      ? '倒计时已经结束。你可以保留当前路线重试，或在这里结束体验。'
      : rating.stars >= 2
        ? '够快了。这一关额外解锁了一次未来道具抽取——抽到的道具只进收藏册，不影响下一关。'
        : (result.method === 'button'
          ? '泡泡瞬间消失了。下一关的麻袋将扩大，泡泡也更容易逃出。'
          : '你在倒计时结束前，亲手清空了麻袋里的全部泡泡。'));
    setText('levelResultPrimary', passed ? '进入下一关' : '再来一次');
    const endButton = bind('levelResultEnd');
    if (endButton) endButton.hidden = passed;
    modal.dataset.result = passed ? 'pass' : 'fail';
    modal.classList.add('modal--open');
    modal.setAttribute('aria-hidden', 'false');
  }

  function handleLevelResultPrimary() {
    const result = appData.levelResult;
    if (!result) return;
    closeLevelResult();
    if (result.type === 'pass') {
      const next = GameState.advance();
      SceneManager.goToId(next.level === 2 ? 'u08' : 'u10');
      return;
    }
    const retry = GameState.retry();
    SceneManager.goToId(retry.level === 1 ? 'u06' : 'u08');
  }

  function endFromLevelResult() {
    const result = appData.levelResult;
    if (!result || result.type !== 'fail') return;
    closeLevelResult();
    LevelGame.stop();
    GameState.endExperience(appData.latestGameStats || {});
    SceneManager.goToId('u11');
  }

  /* ---------------- 四种结局与体验总结（u11 / u12） ---------------- */

  function joinWorryTexts() {
    return appData.selectedWorries.map(function (item) { return item.text; }).join('、');
  }

  function quoteWorryTexts() {
    return appData.selectedWorries.map(function (item) { return '「' + item.text + '」'; }).join('、');
  }

  function joinGadgetNames() {
    return appData.matchedGadgets.map(function (item) { return item.name; }).join('、');
  }

  const ENDING_COPY = {
    1: {
      label: '泡泡飘向远方',
      title: '它没有被消灭，只是飘远了。',
      insight: '不必把每一项任务都紧紧抓住，先放开一部分，也是一种前进。',
      fallback: '不必把每件事都紧紧抓住。先允许它离开视线，也是一种前进。',
      doraemon: '原来，不是所有烦恼都必须马上消失。给它一点距离，也许就能看见新的办法。'
    },
    2: {
      label: '短暂的安静',
      title: '它消失了一会儿，又回来了。',
      insight: '一次清空没有改变任务本身，暂时看不见，不等于真正解决。',
      fallback: '一次清空没有改变烦恼本身。暂时看不见，不等于真正解决。',
      doraemon: '这个按钮可以让烦恼暂时消失，但它没有真正改变烦恼产生的原因。'
    },
    3: {
      label: '一步一步处理',
      title: '这一次，是你亲手完成的。',
      insight: '任务没有凭空消失，但你已经把它们一项项处理下来。',
      fallback: '它没有凭空消失，但你已经把它一步一步处理下来。',
      doraemon: '没有捷径也没关系。你已经证明，慢慢处理，也能让事情发生变化。'
    },
    4: {
      label: '麻袋撑不住了',
      title: '越想控制，它越失去控制。',
      insight: '当所有任务挤在一起，继续用力不一定会更快。',
      fallback: '当所有压力挤在一起，继续用力不一定会更快。',
      doraemon: '先停一下吧。把事情拆开、重新排序，可能比逼自己一次做完更有用。'
    }
  };

  function renderEnding() {
    LevelGame.stop();
    closeLevelResult();
    const snapshot = GameState.snapshot();
    const ending = snapshot.ending || 4;
    const copy = ENDING_COPY[ending];
    const scene = document.querySelector('[data-scene="u11"]');
    if (scene) scene.dataset.ending = String(ending);
    const selected = appData.selectedWorries.map(function (item) { return item.text; });
    const worryText = selected[0] || '尚未说出口的烦恼';
    const worryList = selected.length ? quoteWorryTexts() : '「尚未说出口的烦恼」';

    setText('endingLabel', copy.label);
    setText('endingTitle', copy.title);
    setText('endingWorry', '关于 ' + worryList);
    // 单选时可以回应这一条烦恼；多选时必须同等对待，不能因为其中包含
    // “作业太多”就让整段总结只围绕它展开。
    setText('endingInsight', selected.length === 1 && selected[0] === '作业太多'
      ? copy.insight
      : copy.fallback);
    setText('endingDoraemonCopy', copy.doraemon);
    setText('endingBubbleA', worryText.length > 8 ? worryText.slice(0, 7) + '…' : worryText);
    setText('endingBubbleB', selected[1]
      ? (selected[1].length > 8 ? selected[1].slice(0, 7) + '…' : selected[1])
      : ending === 2 ? '又回来了' : ending === 4 ? '挤在一起' : '慢慢放开');
    setText('endingBubbleC', selected[2]
      ? (selected[2].length > 8 ? selected[2].slice(0, 7) + '…' : selected[2])
      : '');
    appData.finalChoice = copy.label;
  }

  function resultMethodLabel(record) {
    if (!record) return '—';
    if (record.kind === 'manual-pass') return '你选择亲手处理麻袋里的泡泡。';
    if (record.kind === 'button-pass') return '你按下了独裁者按钮，让眼前暂时安静下来。';
    if (record.kind === 'timeout-fail') return '倒计时结束时，麻袋里仍然留着一些泡泡。';
    if (record.kind.indexOf('ending-') === 0) {
      const endingCopy = ENDING_COPY[Number(record.kind.slice(-1))];
      return endingCopy ? endingCopy.title : '泡泡走向了自己的方向。';
    }
    return '你停下来，重新看了看眼前发生的事。';
  }

  function renderLog() {
    LevelGame.stop();
    const snapshot = GameState.snapshot();
    const history = snapshot.history || [];
    setText('logSubtitle', appData.selectedWorries.length
      ? '你带着' + quoteWorryTexts() + '走进体验馆，也留下了自己的处理方式。'
      : '你走进体验馆，也留下了自己的处理方式。');

    const nodes = [
      { label: '你带来的烦恼', value: joinWorryTexts() || '—' },
      { label: '哆啦A梦为你找到的道具', value: joinGadgetNames() || '—' }
    ];

    const visibleKinds = ['manual-pass', 'button-pass', 'timeout-fail'];
    const firstRecord = history.slice().reverse().find(function (item) {
      return item.level === 1 && visibleKinds.includes(item.kind);
    });
    const secondRecord = history.slice().reverse().find(function (item) {
      return item.level === 2 && visibleKinds.includes(item.kind);
    });
    if (firstRecord) nodes.push({ label: '第一次尝试', value: resultMethodLabel(firstRecord) });
    if (secondRecord) nodes.push({ label: '接下来的选择', value: resultMethodLabel(secondRecord) });

    const endingCopy = ENDING_COPY[snapshot.ending || 4];
    nodes.push({
      label: '最后发生的事',
      value: endingCopy.title
    });
    nodes.push({
      label: '哆啦A梦想对你说',
      value: endingCopy.doraemon
    });

    const list = bind('logNodes');
    if (!list) return;
    list.innerHTML = '';
    nodes.slice(0, 6).forEach(function (node, index) {
      const li = document.createElement('li');
      li.className = 'log-node';
      li.style.setProperty('--log-delay', (index * CONFIG.LOG_NODE_FADE_MS) + 'ms');
      const num = document.createElement('span');
      num.className = 'log-node__index';
      num.textContent = String(index + 1);
      const label = document.createElement('span');
      label.className = 'log-node__label';
      label.textContent = node.label;
      const value = document.createElement('span');
      value.className = 'log-node__value';
      value.textContent = node.value;
      li.appendChild(num);
      li.appendChild(label);
      li.appendChild(value);
      list.appendChild(li);
    });
  }

  function openExitModal() {
    const modal = bind('exitModal');
    if (!modal) return;
    modal.classList.add('modal--open');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeExitModal() {
    const modal = bind('exitModal');
    if (!modal) return;
    modal.classList.remove('modal--open');
    modal.setAttribute('aria-hidden', 'true');
  }

  function resetGameUi() {
    const scene = immersiveScene();
    if (scene) {
      scene.dataset.phase = 'level';
      scene.dataset.level = '1';
      scene.dataset.bag = '1';
      scene.dataset.branch = 'L1';
      scene.classList.remove('is-time-low', 'is-resolving');
    }
    setText('gameLevel', '第一关');
    setText('gameTitle', '在时间结束前，清空麻袋里的泡泡');
    setText('gameWorry', '');
    setText('gameBagLabel', '透明束缚袋');
    setText('gameTimer', '00:36');
    setText('gameStatus', '');
    setText('gameButtonHint', '可以立即清空眼前的泡泡，但之后会发生变化');
    closeLevelResult();
  }

  function restart() {
    closeExitModal();
    // 先清除场景级延时任务与所有轮询，再销毁 Canvas 与动画循环，
    // 避免旧流程回调干扰下一轮体验（§八 状态清理）。
    SceneManager.clearTimers();
    stopAllTickers();
    resetData();
    resetWorryPick();
    GadgetMatch.reset();
    // 收藏只活在本次体验里：重新开始就清空 20 格并收起右下角入口。
    LevelRating.reset();
    Collection.reset();
    resetGameUi();
    SceneManager.reset();
  }

  /* ---------------- 场景钩子 ---------------- */

  // 注意：registerHooks 是覆盖写入，同一个 id 注册两次时后者会顶掉前者。
  // 合并后的节点（u02 / u03 / u06 / u12）必须把逻辑写在同一个 onEnter 里。
  function registerSceneHooks() {
    SceneManager.registerHooks('u02', {
      onEnter: Dialogue.enter,
      onExit: Dialogue.exit
    });

    SceneManager.registerHooks('u03', {
      onEnter: WorryPicker.enter,
      onExit: WorryPicker.exit
    });

    SceneManager.registerHooks('u04', {
      onEnter: GadgetMatch.startSpin,
      onExit: GadgetMatch.exitSlot
    });

    SceneManager.registerHooks('u05', {
      onEnter: enterGadgetResult,
      onExit: GadgetMatch.exitResult
    });

    SceneManager.registerHooks('u06', {
      onEnter: function () {
        if (!appData.worries.length) {
          SceneManager.goToId('u03');
          return;
        }
        if (!appData.gameSessionStarted) {
          GameState.reset();
          appData.gameSessionStarted = true;
        }
        startCurrentLevel();
      },
      onExit: LevelGame.stop
    });

    SceneManager.registerHooks('u07', { onEnter: showLevelResult });

    SceneManager.registerHooks('u08', {
      onEnter: startCurrentLevel,
      onExit: LevelGame.stop
    });

    SceneManager.registerHooks('u09', { onEnter: showLevelResult });

    SceneManager.registerHooks('u10', {
      onEnter: startCurrentLevel,
      onExit: LevelGame.stop
    });

    SceneManager.registerHooks('u11', { onEnter: renderEnding });
    SceneManager.registerHooks('u12', { onEnter: renderLog });
  }

  /* ---------------- 事件 ---------------- */

  function handleNext() {
    const current = SceneManager.current();
    if (!current) return;
    // u02 在同一个场景里完成六个引导分镜；最后一屏才放行进入烦恼分类。
    if (current.id === 'u02' && Dialogue.next()) return;
    // u03 的出口是「选好了，去匹配道具」，要先播飞进口袋的动画再翻页。
    if (current.id === 'u03') {
      WorryPicker.confirm();
      return;
    }
    SceneManager.next();
  }

  function handleBack() {
    const current = SceneManager.current();
    if (!current) return;
    // 沉浸段不可回退：中途退出只能走「退出体验」。
    if (['u06', 'u07', 'u08', 'u09', 'u10', 'u11'].includes(current.id)) return;
    // u05 往回是 u04，而 u04 一进就自动前进——会原地打转。直接回选择页。
    if (current.id === 'u05') {
      resetWorryPick();
      SceneManager.goToId('u03');
      return;
    }
    SceneManager.back();
  }

  function handleAction(action, target) {
    switch (action) {
      case 'next': handleNext(); break;
      case 'back': handleBack(); break;
      case 'exit': openExitModal(); break;
      case 'exit-cancel': closeExitModal(); break;
      case 'exit-confirm':
      case 'restart': restart(); break;
      case 'pick-category': WorryPicker.pickCategory(target.dataset.category); break;
      // 从展开的完整列表退回九宫粒子场。展开列表里的「← 返回全部类别」
      // 和推测面板上的「返回继续选」都走这一条：两处都只是收起当前视图，
      // 已经挑好的几条烦恼原样留着，别在这里顺手清空。
      case 'worry-back': WorryPicker.backToCategories(); break;
      case 'pick-worry': WorryPicker.pickWorry(target.dataset.presetId); break;
      case 'classify-worry': WorryPicker.classifyFree(); break;
      case 'confirm-worry': WorryPicker.confirm(); break;
      case 'reset-worry-pick': resetWorryPick(); break;
      // 「跳过」只跳过滚动本身；拨杆是规格里明写的衔接动作，不能一起跳掉。
      case 'skip-slot': GadgetMatch.skipSpin(); break;
      case 'pull-lever': GadgetMatch.pullLever(); break;
      // 三个道具位共用这一个 action，点的是哪一件由 data-gadget-index 说了算。
      case 'show-gadget-tip': GadgetMatch.showTip(target.dataset.gadgetIndex); break;
      case 'hide-gadget-tip': GadgetMatch.hideTip(); break;
      case 'game-dictator': useDictatorButton(); break;
      case 'level-result-primary': handleLevelResultPrimary(); break;
      case 'level-result-end': endFromLevelResult(); break;
      // 2、3 星解锁的那一次抽卡。老虎机本身是 u04 那台（GadgetMatch.spinReward）。
      case 'level-result-draw': LevelRating.startDraw(); break;
      case 'reward-store': LevelRating.storeReward(); break;
      case 'collection-toggle': Collection.toggle(); break;
      case 'collection-close': Collection.close(); break;
      default:
        // handleAction 的 default 会静默吞掉未知 action，
        // 打一条 warn 好过页面「点了没反应」还查不到原因。
        console.warn('[app] 未处理的 data-action：', action);
        break;
    }
  }

  function bindEvents() {
    document.addEventListener('click', function (event) {
      const target = event.target.closest('[data-action]');
      if (!target || target.disabled) return;
      handleAction(target.dataset.action, target);
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' && event.target.id === 'worry-text') {
        event.preventDefault();
        WorryPicker.classifyFree();
      }
      if (event.key !== 'Escape') return;
      if (GadgetMatch.tipOpen()) {
        GadgetMatch.hideTip();
        return;
      }
      if (bind('exitModal') && bind('exitModal').classList.contains('modal--open')) {
        closeExitModal();
      }
    });
  }

  function updateProgress(scene, index) {
    appData.currentScene = scene.id;
    document.body.dataset.currentScene = scene.id;
    const node = bind('progress');
    const isFinal = scene.id === 'u11' || scene.id === 'u12';
    if (node) node.textContent = (isFinal ? SceneManager.total : index + 1) + ' / ' + SceneManager.total;
    document.documentElement.style.setProperty('--progress-x', String(isFinal ? 1 : index / (SceneManager.total - 1)));
  }

  function init() {
    registerSceneHooks();
    SceneManager.onChange(updateProgress);
    bindEvents();

    // 三个前半段模块只在这里挂一次，之后由场景钩子驱动。
    // 它们都不碰 appData，所有状态读写都经这几个回调，
    // 免得同一份"当前烦恼"在两个文件里各存一份、然后对不上。
    Dialogue.mount({
      onFinish: function () { SceneManager.goToId('u03'); }
    });
    // getSelected / getGadget / getWorry 一律返回**数组**（可能是空的），
    // 而且 getGadget 和 getWorry 同序等长——u05 的算式、u04 的三列分配都靠这层对应。
    WorryPicker.mount({
      getSelected: function () { return appData.selectedWorries; },
      onToggle: onWorryToggle,
      onClear: onWorryClear,
      onConfirmed: onWorryConfirmed
    });
    GadgetMatch.mount({
      getGadget: function () { return appData.matchedGadgets; },
      getWorry: function () { return appData.selectedWorries; },
      onLifted: function () { SceneManager.goToId('u05'); }
    });
    // 收藏册的 20 个格子只在这里建一次。飞入动画要量目标格的位置，
    // 格子被重建就量不到了，所以此后只改 class，不动 DOM。
    Collection.mount();

    resetGameUi();
    SceneManager.reset();
  }

  return { init: init, data: appData, restart: restart };
})();

document.addEventListener('DOMContentLoaded', App.init);
