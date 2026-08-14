/**
 * font-support.js —— 生成产物，请勿手改。
 * 生成器：assets/dev/_build-fonts.py
 *
 * 千图马克手写体按站内实际用字裁过（原始 9.5MB → 见下方体积注释），所以
 * 自由输入的烦恼关键词可能含子集外的字。浏览器的字体回退是**逐字**的，
 * 一个词里半手写半黑体很难看，所以这里提供整词判断：
 * 只有整词都在子集里才加手写体，否则整词用主字体。
 */
'use strict';

/* 子集里的字符，共 1173 个。 */
const FONT_HAND_CHARSET = " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~·—‘’“”…→、。《》「」【】一三上下不与专且世业东丢两个中临为主乃久么义之乎九也习买乱了予争事二于互五些交产享亭亲人什今仍从仓他付代令以们件价任份休优会伤伴伸似但位低住体何余作你使依侣侧便促保信修倍倒候借倦债值假偏做停储催像允元兄充先光入全公共关兴其具兼内再冒写冲决况冷准减几出击分切划列则删判别到制刷刺刻剁前剧剩力办功加务动助努勤包化匹区十升半协卑单卖卡危即却卷历压厚原去参又及友双反发取受变叠口句另叨只可台右号司吃各合同名后向吓吗否吧听启吵吸告呗员呢周呼命和品哆响哪唠唯啊啦善喏喘喜嗨器四回因团困围固图圆在地场坏坐块坚型城域堂堆塞填境墙增壁声处备复外多夜够大天太央失头奏契套女她好如妈妒妹始姐委婆婚嫉子字存学它安完定宜实审客室害家容宽密察对寻导射将尊小少尚尝尬就尴尺层屈屏展属岸崩工左差己已市布师希帕带帮常帽干平年并床序应底废度庭廓延建开异弄式弟张弱当录形彩影彻彼往径待很律得循心必忆忍志忘忙忧快念忽怀态怎怕思怠急性怪怯总恋恐恢息恰恶恼悉悔悬情惜惩惫惯想意感愿慌慎慢慰懒成我或戚截戴户房所扇手才扎打托扛执扩扫扭扰找承抉把投抗护报披抵抹担拆拉拒拖招拢拨择拯拼拿持挂指按挑挤挫挺换据授掉掌排探接控推描提握搬摆摇摸撤播撰操攒支收改攻放故效救敢散数整文斗断新方旋无既日旦旧早时明易星昧是昼显晋晚普景晰暂暗暧曲更曾替最月有朋服望期木未末本朵机权杆材束条来松板果枪架查标校样核根格桃框案梦检楚榜槽模欠次欢欲款止正此步死残殖段母每比毕气水永求汇汉池沉沟没法泡波注洗活流测济浏浮消涉涨涩淡混清渐渴溃源滚滞满漫澄澡激灯灵点烂烦焦然照熟熬燥爱父爸版物牵犯状犹独猜献率玩环现珍班理生用由电男画界留略疏疑疲疼登白的皮监盖盘目直相省看真眠眼着睡知短石码研破硬确碌示礼社祖禁离私种科秒租秩积移程稳稿空穿突窘窜立站竹第等筒答筛简算管篇篷簇类粒精糊糕糟系素索紧累繁红约级纪纯纳纹线练组细织终经结绘给绝统继绩绪续缓缘缩缺罚置美群翻老考者而耐耗聊职联聚胀能脉脑脚脱腾膨自至致舍舒航色节芋花若范茫药获落蓄蓝薄薪藏虎虑虚虽蜓蜻行衡补表袋被袱裁裂装裹西要见观规视览觉角解触言警计订认讨让训议记许论设证评识诊词译试话该详语误说请读课谁调谨象豫貌负贡财责败账购贴贵贷费资赖赚赛赢走赶起超越趣足跑距跟跨路跳躁身躲躺轨转轮轻载较辈辑输辨辩边达迁迅过迎运近返还这进远连迟迫述迷追退适逃选透逐递途通速逻逼道遮避那郎部都配醋醒释里重量金针钝钟钮钱销错键长门闭问间闷防阶附际降限除险陪随隐障难雄集零需露青静非靠面页顶项顺须顽顾顿预领频颗题额颠风飞食餐饭饮饰饼馆馈首马驻验高魂魔鱼麻默鼠鼻齐龄！（），：；？～";

const FontSupport = (function () {
  const hand = new Set(Array.from(FONT_HAND_CHARSET));

  /* 字体栈只在这里写一次，CSS 那边对应 --ff-hand / --ff，两边要一致。 */
  const HAND_FONT_STACK = '"Qiantu Marker", "Canger YuYangTi", "Microsoft YaHei", sans-serif';
  const MAIN_FONT_STACK = '"Canger YuYangTi", "Microsoft YaHei", "PingFang SC", sans-serif';

  /** 整词能否用手写体渲染。空串返回 false（没内容就别切字体）。 */
  function canRenderHand(text) {
    const s = String(text || '');
    if (!s.trim()) return false;
    for (const ch of s) {
      if (ch === ' ' || ch === '\n' || ch === '\t') continue;
      if (!hand.has(ch)) return false;
    }
    return true;
  }

  /**
   * 给元素挂手写体：能整词渲染就加 .u-hand，不能就什么都不做（保持主字体）。
   * 返回是否用上了手写体，便于调用方做别的补偿。
   */
  function applyHand(el, text) {
    if (!el) return false;
    const s = text === undefined ? el.textContent : text;
    const ok = canRenderHand(s);
    el.classList.toggle('u-hand', ok);
    return ok;
  }

  /** Canvas 里没有 class，直接返回该用哪个字体栈。 */
  function fontStackFor(text) {
    return canRenderHand(text) ? HAND_FONT_STACK : MAIN_FONT_STACK;
  }

  return {
    charset: hand,
    canRenderHand: canRenderHand,
    applyHand: applyHand,
    fontStackFor: fontStackFor,
    HAND_FONT_STACK: HAND_FONT_STACK,
    MAIN_FONT_STACK: MAIN_FONT_STACK
  };
})();
