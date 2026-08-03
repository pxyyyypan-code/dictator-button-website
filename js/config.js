/**
 * config.js —— 可配置常量（文档 §5.4 / §11）
 * 规则：阈值、时长、数量一律集中在此，不散落到其他文件。
 */
'use strict';

const CONFIG = {
  // 输入相关（文档 §2.3 / §5.3）
  MAX_WORRIES_MVP: 3,

  // 时长相关（文档 §5.4 / §6 AC）
  BUBBLE_CREATE_DURATION_MS: 2000,
  INITIAL_BUBBLE_COUNT: 8,
  MAX_BUBBLES: 42,
  BUBBLE_MIN_RADIUS: 52,
  BUBBLE_MAX_RADIUS: 88,
  BUBBLE_SPEED_MIN: 22,
  BUBBLE_SPEED_MAX: 48,
  CLICK_FEEDBACK_MAX_MS: 200,
  DELETE_ANIMATION_MAX_MS: 300,
  CLEAR_ANIMATION_MS: 2000,
  THEME_MIN_READ_MS: 5000,

  // 文档 §5.4 / §11 标注「待视觉测试确认」：以下为临时占位值，非最终规则。
  // TODO(待确认): 增殖起始阈值 —— 需结合试玩调整。
  GROWTH_START_THRESHOLD: 5,
  // 增殖速度会逐步加快：从较慢间隔开始，持续缩短到最小间隔。
  GROWTH_INTERVAL_START_MS: 1500,
  GROWTH_INTERVAL_MIN_MS: 360,
  GROWTH_ACCELERATION_FACTOR: 0.82,
  GROWTH_INITIAL_BURST_COUNT: 4,

  // 增殖阶段点击泡泡时，母泡泡会分裂为多个更小泡泡。
  SPLIT_MIN_CHILDREN: 2,
  SPLIT_MAX_CHILDREN: 4,
  SPLIT_CHILD_RADIUS_MIN: 30,
  SPLIT_CHILD_RADIUS_FACTOR_MIN: 0.44,
  SPLIT_CHILD_RADIUS_FACTOR_MAX: 0.66,
  SPLIT_SPEED_MIN: 86,
  SPLIT_SPEED_MAX: 156,
  // TODO(待确认): 独裁者按钮解锁条件 —— 建议按删除次数或体验时间。
  BUTTON_UNLOCK_THRESHOLD: 10
};

// 场景状态枚举（文档 §5.1）。
// 文档定义 12 个 APP_STATE 覆盖 14 个 UX 节点：
// INPUT_WORRIES 覆盖 UX-04~05，BUBBLE_GAME 覆盖 UX-07~08。
const APP_STATE = {
  INTRO: 'INTRO',
  GADGET_INFO: 'GADGET_INFO',
  START_CONFIRM: 'START_CONFIRM',
  INPUT_WORRIES: 'INPUT_WORRIES',
  BUBBLE_CREATE: 'BUBBLE_CREATE',
  BUBBLE_GAME: 'BUBBLE_GAME',
  BUTTON_READY: 'BUTTON_READY',
  WORLD_CLEAR: 'WORLD_CLEAR',
  WORRIES_RETURN: 'WORRIES_RETURN',
  THEME: 'THEME',
  SUMMARY: 'SUMMARY',
  RESET: 'RESET'
};

/**
 * 场景表：UX-01 ~ UX-14 的线性主流程（文档 §3）。
 * id 与 index.html 中 data-scene 一一对应；state 为文档 §5.1 的 APP_STATE。
 */
const SCENE_FLOW = [
  { id: 'ux-01', state: APP_STATE.INTRO },
  { id: 'ux-02', state: APP_STATE.GADGET_INFO },
  { id: 'ux-03', state: APP_STATE.START_CONFIRM },
  { id: 'ux-04', state: APP_STATE.INPUT_WORRIES },
  { id: 'ux-05', state: APP_STATE.INPUT_WORRIES },
  { id: 'ux-06', state: APP_STATE.BUBBLE_CREATE },
  { id: 'ux-07', state: APP_STATE.BUBBLE_GAME },
  { id: 'ux-08', state: APP_STATE.BUBBLE_GAME },
  { id: 'ux-09', state: APP_STATE.BUTTON_READY },
  { id: 'ux-10', state: APP_STATE.WORLD_CLEAR },
  { id: 'ux-11', state: APP_STATE.WORRIES_RETURN },
  { id: 'ux-12', state: APP_STATE.THEME },
  { id: 'ux-13', state: APP_STATE.SUMMARY },
  { id: 'ux-14', state: APP_STATE.RESET }
];
