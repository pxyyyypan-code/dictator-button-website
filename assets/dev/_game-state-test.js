'use strict';

const assert = require('assert');
const GameState = require('../../js/game-state.js');

function stats(overrides) {
  return Object.assign({
    manualCleared: 0,
    escaped: 0,
    autoBurst: 0,
    totalSpawned: 30,
    remaining: 0,
    secondsLeft: 0
  }, overrides || {});
}

function cleared(key) {
  const level = GameState.stateFor(key);
  return stats({ manualCleared: level.target, totalSpawned: level.target });
}

// 操作密度必须逐关显著提高，避免回到“42 秒点 20 个”的低压力节奏。
const l1 = GameState.stateFor('L1');
const l2 = GameState.stateFor('L2B');
const l3 = GameState.stateFor('L3D');
assert(l2.target / l2.duration > l1.target / l1.duration);
assert(l3.target / l3.duration > l2.target / l2.duration);

// 两次连续使用：L1 → L2A → L3A；第三关点击后必须失灵并进入结局1。
GameState.reset();
assert.strictEqual(GameState.current().key, 'L1');
GameState.completeWithButton(stats());
assert.strictEqual(GameState.advance().key, 'L2A');
GameState.completeWithButton(stats());
assert.strictEqual(GameState.advance().key, 'L3A');
assert.strictEqual(GameState.current().bag, 3);
assert.strictEqual(GameState.completeWithButton(stats()).ending, 1);

// 第一关使用、第二关手动：L3B；第三关按钮正常触发结局2。
GameState.reset();
GameState.completeWithButton(stats());
GameState.advance();
GameState.completeManual(cleared('L2A'));
assert.strictEqual(GameState.advance().key, 'L3B');
assert.strictEqual(GameState.completeWithButton(stats()).ending, 2);

// 第一关手动、第二关使用：L3C；实际逃逸占主导进入结局1。
GameState.reset();
GameState.completeManual(cleared('L1'));
GameState.advance();
GameState.completeWithButton(stats());
assert.strictEqual(GameState.advance().key, 'L3C');
assert.strictEqual(GameState.resolveLevelThree(stats({ escaped: 5, autoBurst: 3 })).ending, 1);

// L3C 实际点击按钮必须进入结局2，不能沿用旧版概率分支。
GameState.reset();
GameState.completeManual(cleared('L1'));
GameState.advance();
GameState.completeWithButton(stats());
assert.strictEqual(GameState.advance().key, 'L3C');
assert.strictEqual(GameState.completeWithButton(stats()).ending, 2);

// 全程手动：L3D 的麻袋仍为1.0，不得按关卡编号强制变大。
GameState.reset();
GameState.completeManual(cleared('L1'));
assert.strictEqual(GameState.advance().key, 'L2B');
GameState.completeManual(cleared('L2B'));
assert.strictEqual(GameState.advance().key, 'L3D');
assert.strictEqual(GameState.current().bag, 1);
assert.strictEqual(GameState.resolveLevelThree(stats({ escaped: 1, autoBurst: 4 })).ending, 4);

// L3D 点击按钮仍是短暂消失（结局2）；第三关不弹普通通关卡。
GameState.reset();
GameState.completeManual(cleared('L1'));
GameState.advance();
GameState.completeManual(cleared('L2B'));
assert.strictEqual(GameState.advance().key, 'L3D');
assert.strictEqual(GameState.completeWithButton(stats()).ending, 2);

// 第三关全部亲手清除进入结局3。
GameState.reset();
GameState.completeManual(cleared('L1'));
GameState.advance();
GameState.completeManual(cleared('L2B'));
GameState.advance();
assert.strictEqual(GameState.completeManual(cleared('L3D')).ending, 3);

// 第三关倒计时直接解析实际结果：逃逸占主导为1，自爆占主导为4。
GameState.reset();
GameState.completeWithButton(stats());
GameState.advance();
GameState.completeManual(cleared('L2A'));
GameState.advance();
assert.strictEqual(GameState.fail(stats({ escaped: 4, autoBurst: 4, remaining: 2 })).ending, 1);

GameState.reset();
GameState.completeWithButton(stats());
GameState.advance();
GameState.completeManual(cleared('L2A'));
GameState.advance();
assert.strictEqual(GameState.fail(stats({ escaped: 0, autoBurst: 2, remaining: 3 })).ending, 4);

// 重试必须保留当前分支及参数。
GameState.reset();
GameState.completeWithButton(stats());
GameState.advance();
GameState.fail(stats({ remaining: 6 }));
assert.strictEqual(GameState.retry().key, 'L2A');
assert.strictEqual(GameState.current().bag, 2);

GameState.reset();
GameState.completeManual(cleared('L1'));
GameState.advance();
GameState.fail(stats({ remaining: 5 }));
assert.strictEqual(GameState.retry().key, 'L2B');
assert.strictEqual(GameState.current().bag, 1);

// 第一、二关失败后主动结束体验进入结局4。
GameState.reset();
GameState.fail(stats({ remaining: 6 }));
assert.strictEqual(GameState.endExperience(stats({ remaining: 6 })).ending, 4);

console.log('game-state: all branches passed');
