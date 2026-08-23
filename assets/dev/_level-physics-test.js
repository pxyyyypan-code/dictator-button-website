'use strict';

const assert = require('assert');
const LevelGame = require('../../js/level-game.js');
const GameState = require('../../js/game-state.js');

const physics = LevelGame._test;
const gap = physics.collisionGap;

function body(id, x, y, radius, vx, vy) {
  return { id: id, x: x, y: y, r: radius, vx: vx || 0, vy: vy || 0 };
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// 正面相撞后必须完全分离，并交换法向运动趋势。
const left = body(1, 0, 0, 50, 80, 0);
const right = body(2, 88, 0, 50, -80, 0);
assert.strictEqual(physics.resolvePair(left, right), true);
assert(distance(left, right) >= left.r + right.r + gap - 0.001);
assert(left.vx < 0 && right.vx > 0);

// 多个圆从严重穿透状态开始，迭代求解后仍不能留下可见重叠。
const cluster = [
  body(11, 0, 0, 44),
  body(12, 8, 0, 52),
  body(13, -6, 5, 47),
  body(14, 4, -9, 50),
  body(15, -10, -4, 46)
];
for (let pass = 0; pass < 40; pass += 1) {
  for (let i = 0; i < cluster.length; i += 1) {
    for (let j = i + 1; j < cluster.length; j += 1) {
      physics.resolvePair(cluster[i], cluster[j]);
    }
  }
}
for (let i = 0; i < cluster.length; i += 1) {
  for (let j = i + 1; j < cluster.length; j += 1) {
    assert(distance(cluster[i], cluster[j]) >= cluster[i].r + cluster[j].r + gap - 0.08);
  }
}

// 即便全程没有扩大麻袋，关卡基础强度也必须逐关提高。
const calm1 = physics.motionTuningFor(GameState.stateFor('L1'));
const calm2 = physics.motionTuningFor(GameState.stateFor('L2B'));
const calm3 = physics.motionTuningFor(GameState.stateFor('L3D'));
assert(calm2.speed[0] > calm1.speed[0]);
assert(calm3.speed[0] > calm2.speed[0]);
assert(calm2.growth > calm1.growth);
assert(calm3.growth > calm2.growth);
assert(calm2.escapeMinAge < calm1.escapeMinAge);
assert(calm3.escapeMinAge < calm2.escapeMinAge);

console.log('level-physics: no-overlap and difficulty escalation passed');
