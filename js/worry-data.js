/**
 * worry-data.js —— 100 个烦恼主题 + 10 类强辨识交互行为映射
 * 说明：这些是交互设计分类，不是心理学诊断。自由输入永远可用；预设只用于提供灵感和默认行为。
 */
'use strict';

const BEHAVIOR_TYPES = {
  B1_LIGHT:    { id: 'B1_LIGHT', name: '轻散型',   color: '#78A8E8', description: '体积偏轻、持续上浮；点击后迅速散成细小光点。' },
  B2_ESCAPE:   { id: 'B2_ESCAPE', name: '逃避型',   color: '#47C0C8', description: '鼠标靠近就主动远离；第一次点击会明显冲刺躲开。' },
  B3_SPLIT:    { id: 'B3_SPLIT', name: '增殖型',   color: '#E06B76', description: '平静期删除时会留下分裂残影；失控后真正裂成 2～4 个子泡泡。' },
  B4_RETURN:   { id: 'B4_RETURN', name: '回返型',   color: '#9B82D4', description: '点击后消散，但会在短暂延迟后从另一处重新出现。' },
  B5_CLUSTER:  { id: 'B5_CLUSTER', name: '聚集型',   color: '#657BDB', description: '主动向附近对象靠拢形成团簇；删除一个会牵动整个小群。' },
  B6_STUBBORN: { id: 'B6_STUBBORN', name: '顽固型', color: '#7C8796', description: '边缘更厚、更沉；必须连续点击多次，裂纹才会扩散并最终消失。' },
  B7_LINKED:   { id: 'B7_LINKED', name: '牵连型',   color: '#C26C9B', description: '会与最近的对象形成可见连接；处理它会让被牵连对象突然变大。' },
  B8_BURST:    { id: 'B8_BURST', name: '突发型',   color: '#E2A84E', description: '会周期性高速窜动；第一次点击也会突然冲走。' },
  B9_PRESSURE: { id: 'B9_PRESSURE', name: '压迫型', color: '#B64E5B', description: '持续膨胀并产生压迫脉冲；点击只能先把它压小，多次处理后才消失。' },
  B10_BLUR:    { id: 'B10_BLUR', name: '模糊型',   color: '#A5AAB5', description: '轮廓和文字明显失焦；靠近或先点击“看清”后，第二次才能真正删除。' }
};

const WORRY_CATEGORIES = [
  { id: 'family', label: '家庭' },
  { id: 'school', label: '学校' },
  { id: 'work', label: '职场' },
  { id: 'relationship', label: '人际' },
  { id: 'life', label: '生活' },
  { id: 'money', label: '金钱' },
  { id: 'future', label: '未来' },
  { id: 'inner', label: '说不清' }
];

const WORRY_PRESETS = [
  { id: 1, text: '被父母催促', category: 'family', behaviorType: 'B9_PRESSURE' },
  { id: 2, text: '家人不理解自己的选择', category: 'family', behaviorType: 'B7_LINKED' },
  { id: 3, text: '家庭期待太高', category: 'family', behaviorType: 'B9_PRESSURE' },
  { id: 4, text: '与父母频繁争吵', category: 'family', behaviorType: 'B7_LINKED' },
  { id: 5, text: '总被拿来和兄弟姐妹比较', category: 'family', behaviorType: 'B5_CLUSTER' },
  { id: 6, text: '家庭成员之间越来越少沟通', category: 'family', behaviorType: 'B10_BLUR' },
  { id: 7, text: '家庭经济压力', category: 'family', behaviorType: 'B9_PRESSURE' },
  { id: 8, text: '家务分配不公平', category: 'family', behaviorType: 'B7_LINKED' },
  { id: 9, text: '隐私被家人干涉', category: 'family', behaviorType: 'B9_PRESSURE' },
  { id: 10, text: '被催婚、催恋爱', category: 'family', behaviorType: 'B9_PRESSURE' },
  { id: 11, text: '和伴侣沟通困难', category: 'family', behaviorType: 'B7_LINKED' },
  { id: 12, text: '对亲密关系没有安全感', category: 'family', behaviorType: 'B4_RETURN' },
  { id: 13, text: '异地关系带来的不安', category: 'family', behaviorType: 'B4_RETURN' },
  { id: 14, text: '分手后总会想起过去', category: 'family', behaviorType: 'B4_RETURN' },
  { id: 15, text: '担心家人变老或离开', category: 'family', behaviorType: 'B6_STUBBORN' },

  { id: 16, text: '作业太多', category: 'school', behaviorType: 'B1_LIGHT' },
  { id: 17, text: '总是拖延', category: 'school', behaviorType: 'B2_ESCAPE' },
  { id: 18, text: '考试压力', category: 'school', behaviorType: 'B8_BURST' },
  { id: 19, text: '成绩不理想', category: 'school', behaviorType: 'B4_RETURN' },
  { id: 20, text: '害怕挂科', category: 'school', behaviorType: 'B8_BURST' },
  { id: 21, text: '不知道应该选什么课', category: 'school', behaviorType: 'B10_BLUR' },
  { id: 22, text: '小组作业配合不好', category: 'school', behaviorType: 'B7_LINKED' },
  { id: 23, text: '老师的反馈让我压力很大', category: 'school', behaviorType: 'B4_RETURN' },
  { id: 24, text: '害怕课堂发言', category: 'school', behaviorType: 'B2_ESCAPE' },
  { id: 25, text: '论文 / 毕业设计推进困难', category: 'school', behaviorType: 'B3_SPLIT' },
  { id: 26, text: '截止日期全部堆在一起', category: 'school', behaviorType: 'B5_CLUSTER' },
  { id: 27, text: '学习效率很低', category: 'school', behaviorType: 'B6_STUBBORN' },
  { id: 28, text: '忍不住和同学比较', category: 'school', behaviorType: 'B5_CLUSTER' },
  { id: 29, text: '不确定自己是否适合这个专业', category: 'school', behaviorType: 'B10_BLUR' },
  { id: 30, text: '考研、留学、就业不知道怎么选', category: 'school', behaviorType: 'B10_BLUR' },

  { id: 31, text: '工作越做越多', category: 'work', behaviorType: 'B3_SPLIT' },
  { id: 32, text: '经常加班', category: 'work', behaviorType: 'B6_STUBBORN' },
  { id: 33, text: 'Deadline 快到了', category: 'work', behaviorType: 'B8_BURST' },
  { id: 34, text: '方案被反复要求修改', category: 'work', behaviorType: 'B4_RETURN' },
  { id: 35, text: '和同事沟通不顺', category: 'work', behaviorType: 'B7_LINKED' },
  { id: 36, text: '害怕工作中犯错', category: 'work', behaviorType: 'B8_BURST' },
  { id: 37, text: '绩效考核压力', category: 'work', behaviorType: 'B9_PRESSURE' },
  { id: 38, text: '找工作越来越焦虑', category: 'work', behaviorType: 'B3_SPLIT' },
  { id: 39, text: '面试紧张', category: 'work', behaviorType: 'B8_BURST' },
  { id: 40, text: '不知道未来做什么工作', category: 'work', behaviorType: 'B10_BLUR' },
  { id: 41, text: '对薪资不满意', category: 'work', behaviorType: 'B6_STUBBORN' },
  { id: 42, text: '晋升一直没有进展', category: 'work', behaviorType: 'B6_STUBBORN' },
  { id: 43, text: '下班后仍不断收到工作消息', category: 'work', behaviorType: 'B8_BURST' },
  { id: 44, text: '工作没有成就感', category: 'work', behaviorType: 'B10_BLUR' },
  { id: 45, text: '害怕自己跟不上变化', category: 'work', behaviorType: 'B8_BURST' },

  { id: 46, text: '害怕被别人忽视', category: 'relationship', behaviorType: 'B4_RETURN' },
  { id: 47, text: '社交时很尴尬', category: 'relationship', behaviorType: 'B2_ESCAPE' },
  { id: 48, text: '不知道怎么拒绝别人', category: 'relationship', behaviorType: 'B9_PRESSURE' },
  { id: 49, text: '很在意别人怎么看自己', category: 'relationship', behaviorType: 'B2_ESCAPE' },
  { id: 50, text: '和朋友关系逐渐变淡', category: 'relationship', behaviorType: 'B4_RETURN' },
  { id: 51, text: '和朋友产生误会', category: 'relationship', behaviorType: 'B7_LINKED' },
  { id: 52, text: '群聊里不敢说话', category: 'relationship', behaviorType: 'B2_ESCAPE' },
  { id: 53, text: '社交结束后反复回想自己的表现', category: 'relationship', behaviorType: 'B3_SPLIT' },
  { id: 54, text: '总是被别人比较', category: 'relationship', behaviorType: 'B5_CLUSTER' },
  { id: 55, text: '感觉自己被冷落', category: 'relationship', behaviorType: 'B4_RETURN' },
  { id: 56, text: '很难与别人建立亲密关系', category: 'relationship', behaviorType: 'B10_BLUR' },
  { id: 57, text: '朋友之间产生嫉妒', category: 'relationship', behaviorType: 'B5_CLUSTER' },
  { id: 58, text: '别人总是越过自己的边界', category: 'relationship', behaviorType: 'B9_PRESSURE' },
  { id: 59, text: '吵架后不知道怎么重新开口', category: 'relationship', behaviorType: 'B7_LINKED' },
  { id: 60, text: '总是在迁就别人', category: 'relationship', behaviorType: 'B9_PRESSURE' },

  { id: 61, text: '房间一直很乱', category: 'life', behaviorType: 'B1_LIGHT' },
  { id: 62, text: '早起困难', category: 'life', behaviorType: 'B6_STUBBORN' },
  { id: 63, text: '作息不规律', category: 'life', behaviorType: 'B8_BURST' },
  { id: 64, text: '手机刷太久停不下来', category: 'life', behaviorType: 'B4_RETURN' },
  { id: 65, text: '总是不运动', category: 'life', behaviorType: 'B1_LIGHT' },
  { id: 66, text: '饮食不规律', category: 'life', behaviorType: 'B1_LIGHT' },
  { id: 67, text: '待办事项越来越多', category: 'life', behaviorType: 'B5_CLUSTER' },
  { id: 68, text: '总忘记事情', category: 'life', behaviorType: 'B1_LIGHT' },
  { id: 69, text: '总觉得时间不够', category: 'life', behaviorType: 'B9_PRESSURE' },
  { id: 70, text: '无法坚持自己的计划', category: 'life', behaviorType: 'B4_RETURN' },
  { id: 71, text: '生活没有节奏', category: 'life', behaviorType: 'B10_BLUR' },
  { id: 72, text: '搬家或换环境后不适应', category: 'life', behaviorType: 'B10_BLUR' },
  { id: 73, text: '通勤让我很疲惫', category: 'life', behaviorType: 'B1_LIGHT' },
  { id: 74, text: '害怕一个人待着', category: 'life', behaviorType: 'B4_RETURN' },
  { id: 75, text: '明明休息却无法真正放松', category: 'life', behaviorType: 'B9_PRESSURE' },

  { id: 76, text: '月底钱不够用', category: 'money', behaviorType: 'B9_PRESSURE' },
  { id: 77, text: '经常冲动消费', category: 'money', behaviorType: 'B8_BURST' },
  { id: 78, text: '总是存不下钱', category: 'money', behaviorType: 'B6_STUBBORN' },
  { id: 79, text: '房租和生活费压力', category: 'money', behaviorType: 'B9_PRESSURE' },
  { id: 80, text: '想买东西又害怕花钱', category: 'money', behaviorType: 'B10_BLUR' },
  { id: 81, text: '不确定未来能赚多少钱', category: 'money', behaviorType: 'B10_BLUR' },
  { id: 82, text: '忍不住和别人比较经济状况', category: 'money', behaviorType: 'B5_CLUSTER' },

  { id: 83, text: '不知道未来要做什么', category: 'future', behaviorType: 'B10_BLUR' },
  { id: 84, text: '害怕选错方向', category: 'future', behaviorType: 'B10_BLUR' },
  { id: 85, text: '总是在几个选择之间摇摆', category: 'future', behaviorType: 'B10_BLUR' },
  { id: 86, text: '害怕错过机会', category: 'future', behaviorType: 'B8_BURST' },
  { id: 87, text: '害怕改变', category: 'future', behaviorType: 'B6_STUBBORN' },
  { id: 88, text: '不确定毕业后的生活会怎样', category: 'future', behaviorType: 'B10_BLUR' },
  { id: 89, text: '想离开现在的环境却又不敢', category: 'future', behaviorType: 'B6_STUBBORN' },
  { id: 90, text: '对年龄增长感到压力', category: 'future', behaviorType: 'B9_PRESSURE' },

  { id: 91, text: '总觉得自己不够好', category: 'inner', behaviorType: 'B4_RETURN' },
  { id: 92, text: '什么事情都想做到完美', category: 'inner', behaviorType: 'B6_STUBBORN' },
  { id: 93, text: '总是在反复内耗', category: 'inner', behaviorType: 'B3_SPLIT' },
  { id: 94, text: '害怕失败', category: 'inner', behaviorType: 'B8_BURST' },
  { id: 95, text: '害怕失去控制', category: 'inner', behaviorType: 'B9_PRESSURE' },
  { id: 96, text: '害怕被别人留下', category: 'inner', behaviorType: 'B4_RETURN' },
  { id: 97, text: '对未知感到不安', category: 'inner', behaviorType: 'B10_BLUR' },
  { id: 98, text: '总是在想过去发生的事情', category: 'inner', behaviorType: 'B4_RETURN' },
  { id: 99, text: '无法停止和别人比较', category: 'inner', behaviorType: 'B5_CLUSTER' },
  { id: 100, text: '说不清哪里不对，但就是不舒服', category: 'inner', behaviorType: 'B10_BLUR' }
];

const WorryData = (function () {
  const weightedTypes = [
    ['B1_LIGHT', 10], ['B2_ESCAPE', 10], ['B3_SPLIT', 12], ['B4_RETURN', 15], ['B5_CLUSTER', 10],
    ['B6_STUBBORN', 12], ['B7_LINKED', 8], ['B8_BURST', 8], ['B9_PRESSURE', 8], ['B10_BLUR', 7]
  ];

  function normalize(text) {
    return String(text || '').trim().toLowerCase().replace(/[\s，。！？、,.!?/\\_-]+/g, '');
  }

  function presetForText(text) {
    const needle = normalize(text);
    if (!needle) return null;
    let exact = WORRY_PRESETS.find(function (item) { return normalize(item.text) === needle; });
    if (exact) return exact;
    return WORRY_PRESETS.find(function (item) {
      const itemText = normalize(item.text);
      return itemText.length >= 4 && (needle.includes(itemText) || itemText.includes(needle));
    }) || null;
  }

  function randomBehaviorType() {
    const total = weightedTypes.reduce(function (sum, pair) { return sum + pair[1]; }, 0);
    let roll = Math.random() * total;
    for (let i = 0; i < weightedTypes.length; i += 1) {
      roll -= weightedTypes[i][1];
      if (roll <= 0) return weightedTypes[i][0];
    }
    return 'B1_LIGHT';
  }

  function createProfile(text, options) {
    const opts = options || {};
    const preset = opts.presetId
      ? WORRY_PRESETS.find(function (item) { return item.id === Number(opts.presetId); })
      : presetForText(text);
    const behaviorType = opts.behaviorType || (preset && preset.behaviorType) || randomBehaviorType();
    const category = opts.category || (preset && preset.category) || 'custom';
    return {
      id: 'worry-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
      text: String(text || '').trim(),
      category: category,
      presetId: preset ? preset.id : null,
      behaviorType: behaviorType
    };
  }

  function examples(category, count) {
    const pool = category && category !== 'all'
      ? WORRY_PRESETS.filter(function (item) { return item.category === category; })
      : WORRY_PRESETS.slice();
    const copy = pool.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = copy[i]; copy[i] = copy[j]; copy[j] = temp;
    }
    return copy.slice(0, Math.max(1, Number(count) || 6));
  }

  function behavior(type) {
    return BEHAVIOR_TYPES[type] || BEHAVIOR_TYPES.B1_LIGHT;
  }

  return {
    categories: WORRY_CATEGORIES,
    presets: WORRY_PRESETS,
    behaviorTypes: BEHAVIOR_TYPES,
    createProfile: createProfile,
    examples: examples,
    behavior: behavior,
    presetForText: presetForText,
    randomBehaviorType: randomBehaviorType
  };
})();
