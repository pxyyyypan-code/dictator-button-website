/**
 * gadget-data.js —— 生成产物，请勿手改。
 * 生成器：assets/dev/_gen-data.py
 * 数据源：烦恼/烦恼分类.xlsx（经 _dump-source.py）+ assets/dev/_authored.json
 * 要改内容请改数据源后重跑生成器，不要直接编辑本文件。
 */

'use strict';

/* 5 个道具大类，顺序与 xlsx「道具统计」一致。 */
const GADGET_GROUPS = ["时间与未来类道具", "空间、逃离与自由类道具", "沟通、关系与认知类道具", "自我改变、任务与能力类道具", "增殖、欲望与绝对控制类道具"];

/* 20 个未来道具。图片走**显式索引映射**，不靠文件名推断——
   源文件叫「6透明斗篷」，xlsx 里叫「隐身斗篷」，只有索引是可靠的。
   width/height 是压缩后的实际像素，布局时据此限制放大倍数：
   其中 12 个源图只有 200×200，裁边后最小的只有 88×182，放大超过 2 倍会明显发糊。 */
const GADGETS = [
  { id: 1, name: "时间停止器", group: "时间与未来类道具",
    image: "assets/images/gadgets/gadget-01.webp", width: 381, height: 400,
    description: "可以把身边的时间调快或调慢。右侧数字表示“倍速计时”，下方设有倒转开关：调至 S 为慢，调至 C 为快。顶部按钮按下后启动、拉起后停止，旋转可恢复原状。" },
  { id: 2, name: "时光机", group: "时间与未来类道具",
    image: "assets/images/gadgets/gadget-02.webp", width: 168, height: 141,
    description: "是时光机的一种，但只能让灵魂回到过去的自己身上，经过一定时间后便会返回。" },
  { id: 3, name: "时光包袱皮", group: "时间与未来类道具",
    image: "assets/images/gadgets/gadget-03.webp", width: 200, height: 92,
    description: "是一块一面红色、一面蓝色，并绘有许多时钟图案的布。用红色一面包住物品，可以使其变新；用蓝色一面盖住物品，则会使其变旧。它在哆啦A梦最受欢迎道具中排名第4。" },
  { id: 4, name: "如果电话亭", group: "时间与未来类道具",
    image: "assets/images/gadgets/gadget-04.webp", width: 169, height: 166,
    description: "它像一间用于体验假设结果的实验室。进入电话亭后，对着话筒说出“如果……”，世界就会按照这个假设发生变化。在《大雄的魔界大冒险》和《大雄的新魔界大冒险》等作品中也曾登场，并在哆啦A梦最受欢迎道具中排名第8。" },
  { id: 5, name: "任意门", group: "空间、逃离与自由类道具",
    image: "assets/images/gadgets/gadget-05.webp", width: 119, height: 166,
    description: "只要在心中想着目的地，内置电脑就会扭曲出发地与目的地之间的空间，使两地相连，跨过门即可到达。不过，它无法前往距离超过十光年的行星，也不能抵达电脑地图中没有记录的区域。它是使用频率很高的道具，在最受欢迎道具中排名第1。" },
  { id: 6, name: "隐身斗篷", group: "空间、逃离与自由类道具",
    image: "assets/images/gadgets/gadget-06.webp", width: 400, height: 264,
    description: "披上这件斗篷后，身体会变得透明，别人无法看见。该道具只能使被斗篷遮盖的部位透明；另一种“隐形斗篷”则能在穿上后让伸出的手脚也不可见。" },
  { id: 7, name: "石头帽", group: "空间、逃离与自由类道具",
    image: "assets/images/gadgets/gadget-07.webp", width: 400, height: 310,
    description: "虽然其他人仍然看得见使用者，却不会在意其存在，就像对路边的小石子视而不见一样。" },
  { id: 8, name: "穿透环", group: "空间、逃离与自由类道具",
    image: "assets/images/gadgets/gadget-08.webp", width: 369, height: 400,
    description: "把这个圆环贴在墙上，就能直接穿过墙壁。它在哆啦A梦最受欢迎道具中排名第9。" },
  { id: 9, name: "竹蜻蜓", group: "空间、逃离与自由类道具",
    image: "assets/images/gadgets/gadget-09.webp", width: 400, height: 237,
    description: "这是哆啦A梦最常使用的道具之一，在第一篇故事中便已登场。把它戴在身体任何部位，都可以按照自己的意愿在空中飞行。其内置超小型电池，可支持以每小时80公里的速度连续飞行8小时；若间断使用，续航时间会更长。" },
  { id: 10, name: "翻译魔芋", group: "沟通、关系与认知类道具",
    image: "assets/images/gadgets/gadget-10.webp", width: 117, height: 162,
    description: "吃下以后，无论双方使用哪种语言，原本无法用语言沟通的人都能互相交流。它在哆啦A梦最受欢迎道具中排名第7。" },
  { id: 11, name: "人体交换机", group: "沟通、关系与认知类道具",
    image: "assets/images/gadgets/gadget-11.webp", width: 135, height: 180,
    description: "它可以让使用者与别人交换部分身体。不过，如果选择“头部”，实际交换的不是头，而是整个身体，使用时需要注意。" },
  { id: 12, name: "记忆面包", group: "沟通、关系与认知类道具",
    image: "assets/images/gadgets/gadget-12.webp", width: 320, height: 400,
    description: "把面包压在需要记忆的文字或内容上，再把它吃下去，就能轻松记住相应内容。它在哆啦A梦最受欢迎道具中排名第5。" },
  { id: 13, name: "安慰机器人", group: "沟通、关系与认知类道具",
    image: "assets/images/gadgets/gadget-13.webp", width: 88, height: 182,
    description: "这是一个女性机器人。人在难过时找她，她会给予安慰，而且说得似乎很有道理；但如果过度依赖她，可能会带来糟糕的后果。" },
  { id: 14, name: "复制机器人", group: "自我改变、任务与能力类道具",
    image: "assets/images/gadgets/gadget-14.webp", width: 138, height: 189,
    description: "只要按下机器人的鼻子，它就会变成使用者的复制体，外貌和本人几乎完全一样。《小超人帕门》中也经常使用类似机器人。" },
  { id: 15, name: "缩小灯", group: "自我改变、任务与能力类道具",
    image: "assets/images/gadgets/gadget-15.webp", width: 400, height: 317,
    description: "被它的光线照到后，物体就会缩小；功能相反的道具是“放大灯”。它在哆啦A梦最受欢迎道具中排名第6。哆啦美使用的版本带有花朵装饰。" },
  { id: 16, name: "放大灯", group: "自我改变、任务与能力类道具",
    image: "assets/images/gadgets/gadget-16.webp", width: 180, height: 136,
    description: "它的功能与“缩小灯”相反，被光线照到的物品会放大。这件道具直到漫画第21卷才正式出现，漫画中的登场次数不多，但在电影中多次出现，因此具有较高知名度。" },
  { id: 17, name: "进化退化光线枪", group: "自我改变、任务与能力类道具",
    image: "assets/images/gadgets/gadget-17.webp", width: 136, height: 187,
    description: "调整转盘可以设定进化或退化的年数，再用放射线照射目标，目标便会进化或退化。转盘向右是进化，向左是退化。它在哆啦A梦最受欢迎道具中排名第20。" },
  { id: 18, name: "增殖药水", group: "增殖、欲望与绝对控制类道具",
    image: "assets/images/gadgets/gadget-18.webp", width: 389, height: 400,
    description: "可以让物品按照倍数不断增生。" },
  { id: 19, name: "恶魔护照", group: "增殖、欲望与绝对控制类道具",
    image: "assets/images/gadgets/gadget-19.webp", width: 333, height: 400,
    description: "只要让别人看过这本护照，持有者做任何坏事都会被无条件允许，因此是一种非常危险的道具。" },
  { id: 20, name: "桃太郎饭团", group: "增殖、欲望与绝对控制类道具",
    image: "assets/images/gadgets/gadget-20.webp", width: 174, height: 194,
    description: "吃下以后，可以让动物乃至人类变得顺从听话。" }
];

/* 独裁者按钮不在 xlsx 的 20 个道具里（它不是"匹配"得到的道具），
   说明取自 U2 剧情对白。源图仅 131x119，只适合当小图标；
   U8 那个大型红色按钮请用几何色块绘制，不要放大这张图。 */
const DICTATOR_BUTTON = {
  id: 0, name: "独裁者按钮", group: "增殖、欲望与绝对控制类道具",
  image: "assets/images/gadgets/dictator.webp", width: 131, height: 119,
  description: "只要说出想让谁消失并按下它，对方就会从世界以及所有人的记忆中暂时消失。不过，消失不一定等于真正解决——它可能会影响你接下来的每一步。"
};

const GadgetData = (function () {
  const byName = {};
  const byId = {};
  GADGETS.forEach(function (item) { byName[item.name] = item; byId[item.id] = item; });

  function get(name) { return byName[name] || null; }
  function byIndex(id) { return byId[Number(id)] || null; }

  function inGroup(group) {
    return GADGETS.filter(function (item) { return item.group === group; });
  }

  /** 按烦恼取匹配道具。烦恼 → 道具名的映射只存在 worry-data.js 里，这里不复制一份。 */
  function forWorry(worryOrId) {
    if (typeof WorryData === 'undefined') return null;
    const name = typeof worryOrId === 'object'
      ? WorryData.gadgetNameFor(worryOrId)
      : (WorryData.preset(worryOrId) || {}).gadget;
    return name ? get(name) : null;
  }

  /**
   * 老虎机滚轮：20 个道具 + 1 个空位（null）。
   * offset 让三列错开起始位置，因此三列外观不同但不依赖随机数。
   */
  function reelPool(offset) {
    const pool = GADGETS.slice();
    const gap = Math.abs(Number(offset) || 0) % (pool.length + 1);
    pool.splice(gap, 0, null);
    const shift = (Math.abs(Number(offset) || 0) * 7) % pool.length;
    return pool.slice(shift).concat(pool.slice(0, shift));
  }

  return {
    all: GADGETS,
    groups: GADGET_GROUPS,
    dictator: DICTATOR_BUTTON,
    get: get,
    byName: get,
    byIndex: byIndex,
    inGroup: inGroup,
    forWorry: forWorry,
    reelPool: reelPool
  };
})();
