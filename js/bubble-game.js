/**
 * bubble-game.js —— 占位空壳（本轮不实现）
 *
 * 本轮范围只做「全局可点击薄框架」，因此 M03 / M04 的
 * Canvas、泡泡运动、命中判断、删除、增殖、重现均为空实现（no-op）。
 * 这里只保留将来阶段2 / 阶段3 需要的函数签名与占位说明，
 * 不写任何真实逻辑，避免与后续实现冲突（文档 §9 规则：一次只实施一个阶段）。
 */
'use strict';

const BubbleGame = (function () {
  /** 占位状态：仅用于让框架显示「未实现」而不报错。 */
  const placeholder = { initialized: false };

  /** 阶段2：创建 Canvas 与泡泡数据（FR-03-01）。当前为占位。 */
  function init(/* worries */) {
    placeholder.initialized = true;
  }

  /** 阶段2：启动泡泡运动循环（F03-02）。当前为占位。 */
  function start() {}

  /** 阶段2：暂停运动与输入。当前为占位。 */
  function stop() {}

  /** 阶段2：点击命中判断与删除（FR-04-01）。当前为占位。 */
  function handleClick(/* x, y */) {}

  /** 阶段2：达到阈值后持续增殖（FR-04-03）。当前为占位。 */
  function startGrowth() {}

  function stopGrowth() {}

  /** 阶段3：清空泡泡与背景元素（FR-05-02）。当前为占位。 */
  function clearAll() {}

  /** 阶段3：以柔和状态重现烦恼（FR-06-01）。当前为占位。 */
  function respawnSoftly() {}

  /** 重置：清理 Canvas、动画帧与定时器（文档 §5.3 重置）。当前为占位。 */
  function destroy() {
    placeholder.initialized = false;
  }

  function isImplemented() {
    return false;
  }

  return {
    init: init,
    start: start,
    stop: stop,
    handleClick: handleClick,
    startGrowth: startGrowth,
    stopGrowth: stopGrowth,
    clearAll: clearAll,
    respawnSoftly: respawnSoftly,
    destroy: destroy,
    isImplemented: isImplemented
  };
})();
