/**
 * worry-data.js —— 生成产物，请勿手改。
 * 生成器：assets/dev/_gen-data.py
 * 数据源：烦恼/烦恼分类.xlsx（经 _dump-source.py）+ assets/dev/_authored.json
 * 要改内容请改数据源后重跑生成器，不要直接编辑本文件。
 */

'use strict';

/* 10 类交互行为。这是交互设计分类，不是心理学诊断，前台永远不显示 B1~B10。
   配色被规格限制在「米白 / 浅青」两族（气泡画在 #049DBF 蓝底上），因此 10 类共用
   6 级明度，辨识度主要由运动方式与点击手感承担，不靠色相区分。 */
const BEHAVIOR_TYPES = {
  B1_LIGHT:     { id: "B1_LIGHT", name: "轻散型", color: "#F7F4EC", ink: "#0A3B47", description: "体积偏轻、持续上浮；点击后迅速散成细小光点。" },
  B2_ESCAPE:    { id: "B2_ESCAPE", name: "逃避型", color: "#DCEFF4", ink: "#0A3B47", description: "鼠标靠近就主动远离；第一次点击会明显冲刺躲开。" },
  B3_SPLIT:     { id: "B3_SPLIT", name: "增殖型", color: "#B9E2EA", ink: "#0A3B47", description: "平静期删除时会留下分裂残影；失控后真正裂成 2～4 个子泡泡。" },
  B4_RETURN:    { id: "B4_RETURN", name: "回返型", color: "#F5F0E6", ink: "#0A3B47", description: "点击后消散，但会在短暂延迟后从另一处重新出现。" },
  B5_CLUSTER:   { id: "B5_CLUSTER", name: "聚集型", color: "#DCEFF4", ink: "#0A3B47", description: "主动向附近对象靠拢形成团簇；删除一个会牵动整个小群。" },
  B6_STUBBORN:  { id: "B6_STUBBORN", name: "顽固型", color: "#EBE2CE", ink: "#0A3B47", description: "边缘更厚、更沉；必须连续点击多次，裂纹才会扩散并最终消失。" },
  B7_LINKED:    { id: "B7_LINKED", name: "牵连型", color: "#B9E2EA", ink: "#0A3B47", description: "会与最近的对象形成可见连接；处理它会让被牵连对象突然变大。" },
  B8_BURST:     { id: "B8_BURST", name: "突发型", color: "#F7F4EC", ink: "#0A3B47", description: "会周期性高速窜动；第一次点击也会突然冲走。" },
  B9_PRESSURE:  { id: "B9_PRESSURE", name: "压迫型", color: "#93CFDE", ink: "#0A3B47", description: "持续膨胀并产生压迫脉冲；点击只能先把它压小，多次处理后才消失。" },
  B10_BLUR:     { id: "B10_BLUR", name: "模糊型", color: "#EBE2CE", ink: "#0A3B47", description: "轮廓和文字明显失焦；靠近或先点击\"看清\"后，第二次才能真正删除。" }
};

/* 9 个烦恼大类，与 烦恼分类.xlsx 的分类编号一致。
   hoverPreview 是 U3 悬停时浮出的 3 条代表烦恼（存 id，正文只在 WORRY_PRESETS 里存一份）。
   fallbackSummary 用于自由输入且匹配不到具体烦恼时的结尾总结。 */
const WORRY_CATEGORIES = [
  {
    id: "C01", label: "家庭", fullName: "家庭关系与家庭边界",
    note: "涉及父母期待、家庭沟通、家庭分工、隐私边界及婚恋催促。",
    image: "assets/images/worries/worry-01.webp", imageWidth: 183, imageHeight: 360,
    hoverPreview: [3, 4, 9],
    fallbackSummary: "家里的关心和要求常常裹在一起，同一句话既是担心也是安排。真正为难的地方在于，你没办法只接住其中一半，另一半总会跟着一起进来。"
  },
  {
    id: "C02", label: "亲密关系", fullName: "亲密关系与情感失落",
    note: "涉及伴侣沟通、安全感、异地关系、分手回忆与失去亲人的担忧。",
    image: "assets/images/worries/worry-02.webp", imageWidth: 360, imageHeight: 273,
    hoverPreview: [11, 12, 14],
    fallbackSummary: "在意一个人，就会同时在意失去的可能。距离、沉默、已经过去的和终将到来的，都会被这份在意放得很大，大到看起来像一则预告。"
  },
  {
    id: "C03", label: "学业", fullName: "学业任务与成长选择",
    note: "涉及作业考试、成绩评价、课堂表达、毕业设计、专业与升学选择。",
    image: "assets/images/worries/worry-03.webp", imageWidth: 323, imageHeight: 360,
    hoverPreview: [16, 18, 29],
    fallbackSummary: "学业把很多不同的事压成同一种紧张：分数、进度、要不要开口、往哪边走。它们各有各的时间表，只是恰好堆在同一段日子里，重量才显得整齐。"
  },
  {
    id: "C04", label: "工作", fullName: "工作压力与职业发展",
    note: "涉及工作量、加班、沟通、绩效、求职面试、薪资、晋升和能力更新。",
    image: "assets/images/worries/worry-04.webp", imageWidth: 360, imageHeight: 249,
    hoverPreview: [32, 35, 38],
    fallbackSummary: "工作会不断向外扩张，直到你替它划出一条线为止。绩效、职级和进度是它切分事情的方式，不必让这套尺子一直留在你身上。"
  },
  {
    id: "C05", label: "社交", fullName: "社交关系与人际边界",
    note: "涉及被看见、社交尴尬、拒绝他人、朋友关系、误会、比较与边界。",
    image: "assets/images/worries/worry-05.webp", imageWidth: 271, imageHeight: 360,
    hoverPreview: [47, 48, 50],
    fallbackSummary: "社交里的难受，有的确实来自对方，有的只发生在你这边的复盘里。两种混在一起的时候，就很难分清是关系出了问题，还是你多担了一份。"
  },
  {
    id: "C06", label: "生活", fullName: "日常生活与自我管理",
    note: "涉及收纳、作息、手机使用、运动饮食、待办、记忆、计划和环境适应。",
    image: "assets/images/worries/worry-06.webp", imageWidth: 358, imageHeight: 360,
    hoverPreview: [61, 63, 64],
    fallbackSummary: "日常的失序很少只有一个原因，有时是事情太多，有时只是那件事一直排不到前面。它们看上去都像没做到，实际上是不同的卡点。"
  },
  {
    id: "C07", label: "经济", fullName: "经济压力与消费安全",
    note: "涉及家庭经济、收支不足、冲动消费、储蓄、生活成本与收入不确定。",
    image: "assets/images/worries/worry-07.webp", imageWidth: 350, imageHeight: 360,
    hoverPreview: [76, 77, 81],
    fallbackSummary: "钱的压力有一部分来自数目，另一部分来自比较和想象。这两部分常常被算在一起，于是同样的余额，在不同的日子里显得完全不是一个意思。"
  },
  {
    id: "C08", label: "未来", fullName: "未来选择与人生变化",
    note: "涉及方向选择、错失机会、改变环境、毕业生活与年龄增长的不确定。",
    image: "assets/images/worries/worry-08.webp", imageWidth: 360, imageHeight: 281,
    hoverPreview: [83, 86, 90],
    fallbackSummary: "未来的问题很难在原地被想清楚，因为答案要走过一段才会显形。悬着的不确定不是你判断力不够，而是这类事本来就没法提前验收。"
  },
  {
    id: "C09", label: "情绪", fullName: "情绪状态与自我认同",
    note: "涉及独处、放松、自我评价、完美主义、内耗、失败、失控和未知感受。",
    image: "assets/images/worries/worry-09.webp", imageWidth: 259, imageHeight: 360,
    hoverPreview: [91, 93, 75],
    fallbackSummary: "那些反复出现的感受，通常是在描述你此刻所处的位置。它们可以被听见，也可以被放在一边，位置换了之后，很多说不清的部分会自己变淡。"
  }
];

/* 100 条预设烦恼。text/category/gadget/summary 来自 xlsx；
   behaviorType 按 id 继承自 V0.7；keyword 是画在气泡里的短词。 */
const WORRY_PRESETS = [
  { id: 1, text: "被父母催促", keyword: "总被父母催", category: "C01", behaviorType: "B9_PRESSURE",
    gadget: "石头帽", summary: "催促声不会替你走完人生。把父母的担心与自己的计划分开，你可以按自己的节奏向前。" },
  { id: 2, text: "家人不理解自己的选择", keyword: "选择不被理解", category: "C01", behaviorType: "B7_LINKED",
    gadget: "翻译魔芋", summary: "不被理解，不等于你的选择没有价值。先把理由说清，也给家人一点理解新道路的时间。" },
  { id: 3, text: "家庭期待太高", keyword: "家庭期待", category: "C01", behaviorType: "B9_PRESSURE",
    gadget: "缩小灯", summary: "期待可以被听见，却不必全部扛在你身上。把别人的目标缩小，留下真正属于你的那一份。" },
  { id: 4, text: "与父母频繁争吵", keyword: "和父母争吵", category: "C01", behaviorType: "B7_LINKED",
    gadget: "人体交换机", summary: "争吵常常盖住了双方真正的担心。等情绪落下，再说感受和需要，比继续争输赢更接近答案。" },
  { id: 5, text: "总被拿来和兄弟姐妹比较", keyword: "兄弟姐妹比较", category: "C01", behaviorType: "B5_CLUSTER",
    gadget: "如果电话亭", summary: "你不是比较表中的一个名次。兄弟姐妹的人生无法定义你，你可以建立自己的衡量标准。" },
  { id: 6, text: "家庭成员越来越少沟通", keyword: "家里没话说", category: "C01", behaviorType: "B10_BLUR",
    gadget: "翻译魔芋", summary: "沉默不一定代表疏远，也可能是不知道如何开始。一次不带指责的问候，就能重新打开对话。" },
  { id: 8, text: "家务分配不公平", keyword: "家务不公平", category: "C01", behaviorType: "B7_LINKED",
    gadget: "复制机器人", summary: "不公平不会因忍耐自动消失。把家务列出来、说清可承担的部分，分工才有重新调整的可能。" },
  { id: 9, text: "隐私被家人干涉", keyword: "家人干涉隐私", category: "C01", behaviorType: "B9_PRESSURE",
    gadget: "隐身斗篷", summary: "关心不等于可以越过边界。你有权说明哪些信息愿意分享，哪些空间需要被保留。" },
  { id: 10, text: "被催婚、催恋爱", keyword: "催婚催恋爱", category: "C01", behaviorType: "B9_PRESSURE",
    gadget: "石头帽", summary: "婚恋不是按年龄触发的任务。别人的催促可以停在门外，你的关系选择应由准备程度决定。" },

  { id: 11, text: "和伴侣沟通困难", keyword: "和伴侣沟通难", category: "C02", behaviorType: "B7_LINKED",
    gadget: "翻译魔芋", summary: "沟通困难并不等于关系失败。少猜测，多描述事实、感受和需求，彼此才有机会真正听见。" },
  { id: 12, text: "对亲密关系没有安全感", keyword: "关系没安全感", category: "C02", behaviorType: "B4_RETURN",
    gadget: "如果电话亭", summary: "安全感不是反复确认出来的，而是在稳定回应和清晰边界中慢慢建立。先看关系是否持续让你安心。" },
  { id: 13, text: "异地关系带来的不安", keyword: "异地恋", category: "C02", behaviorType: "B4_RETURN",
    gadget: "任意门", summary: "距离会放大不确定，却不必抹掉连接。把联系频率、见面计划和彼此期待说清，关系会更有着落。" },
  { id: 14, text: "分手后总会想起过去", keyword: "分手后放不下", category: "C02", behaviorType: "B4_RETURN",
    gadget: "时光机", summary: "想起过去，不代表必须回到过去。那些记忆可以留下，但你的生活仍能继续长出新的部分。" },
  { id: 15, text: "担心家人变老或离开", keyword: "怕失去家人", category: "C02", behaviorType: "B6_STUBBORN",
    gadget: "时光包袱皮", summary: "害怕失去，说明你很珍惜他们。与其提前经历告别，不如把担心换成此刻真实的陪伴。" },

  { id: 16, text: "作业太多", keyword: "作业太多", category: "C03", behaviorType: "B1_LIGHT",
    gadget: "复制机器人", summary: "任务很多时，不必同时成为很多个自己。先完成最重要的一小项，堆积感就会开始松动。" },
  { id: 17, text: "总是拖延", keyword: "拖延", category: "C03", behaviorType: "B2_ESCAPE",
    gadget: "时间停止器", summary: "拖延往往不是懒，而是任务太大或太怕做不好。把开始缩小到五分钟，比等待状态更有效。" },
  { id: 18, text: "考试压力", keyword: "考试压力", category: "C03", behaviorType: "B8_BURST",
    gadget: "记忆面包", summary: "考试衡量的是一段时间的掌握程度，不是你的全部价值。把压力拆成今天能复习的一页。" },
  { id: 19, text: "成绩不理想", keyword: "成绩不理想", category: "C03", behaviorType: "B4_RETURN",
    gadget: "时光机", summary: "一次成绩只说明这次方法与结果的距离。找到失分原因，下一步会比反复责怪自己更清楚。" },
  { id: 20, text: "害怕挂科", keyword: "怕挂科", category: "C03", behaviorType: "B8_BURST",
    gadget: "记忆面包", summary: "害怕挂科不会帮助你通过，但确认重点、补齐薄弱项和及时求助会。先做最能提高结果的一件事。" },
  { id: 21, text: "不知道应该选什么课", keyword: "选课犯难", category: "C03", behaviorType: "B10_BLUR",
    gadget: "如果电话亭", summary: "选课不是一次决定整个人生。用兴趣、能力和实际要求做筛选，再允许自己在体验后调整。" },
  { id: 22, text: "小组作业配合不好", keyword: "小组配合不好", category: "C03", behaviorType: "B7_LINKED",
    gadget: "翻译魔芋", summary: "小组失衡时，沉默只会让问题继续。明确任务、负责人和期限，比期待大家自动默契更可靠。" },
  { id: 23, text: "老师反馈让我压力很大", keyword: "老师反馈压力", category: "C03", behaviorType: "B4_RETURN",
    gadget: "缩小灯", summary: "反馈针对的是作品当前的状态，不是对你的整体否定。挑出一条可执行修改，压力就会变成方向。" },
  { id: 24, text: "害怕课堂发言", keyword: "怕课堂发言", category: "C03", behaviorType: "B2_ESCAPE",
    gadget: "隐身斗篷", summary: "紧张说明你在意表达，而不是你没有能力。提前准备一个短句并说出来，就是一次有效发言。" },
  { id: 25, text: "论文 / 毕业设计推进困难", keyword: "毕设推进困难", category: "C03", behaviorType: "B3_SPLIT",
    gadget: "复制机器人", summary: "毕业设计不需要被一次完成。把它拆成今天能交付的一个页面、一次实验或一段文字，进度就会重新出现。" },
  { id: 26, text: "截止日期全部堆在一起", keyword: "截止日扎堆", category: "C03", behaviorType: "B5_CLUSTER",
    gadget: "时间停止器", summary: "所有期限挤在一起时，先按重要性和剩余时间排序。你不必同时拯救全部任务，只需先处理最危险的一项。" },
  { id: 27, text: "学习效率很低", keyword: "学习效率低", category: "C03", behaviorType: "B6_STUBBORN",
    gadget: "记忆面包", summary: "效率低不一定是你不够努力，也可能是方法和精力不匹配。减少切换、设定短时段，会比延长熬夜更有效。" },
  { id: 28, text: "忍不住和同学比较", keyword: "和同学比较", category: "C03", behaviorType: "B5_CLUSTER",
    gadget: "石头帽", summary: "比较会让你只看见别人的结果，忽略自己的过程。把视线收回今天的一个进步，你的节奏才会重新出现。" },
  { id: 29, text: "不确定自己是否适合这个专业", keyword: "专业适不适合", category: "C03", behaviorType: "B10_BLUR",
    gadget: "如果电话亭", summary: "怀疑专业是否适合，是认识自己的信号。先区分是不喜欢内容、环境，还是暂时受挫，再决定是否改变。" },
  { id: 30, text: "考研、留学、就业不知道怎么选", keyword: "升学还是就业", category: "C03", behaviorType: "B10_BLUR",
    gadget: "如果电话亭", summary: "考研、留学和就业没有统一正确答案。比较成本、期待和可承受风险，选最适合当前自己的下一步。" },

  { id: 31, text: "工作越做越多", keyword: "工作越做越多", category: "C04", behaviorType: "B3_SPLIT",
    gadget: "复制机器人", summary: "工作不断增加，不代表你必须无限承接。确认优先级、交付边界和可用时间，才能让责任回到合理范围。" },
  { id: 32, text: "经常加班", keyword: "加班", category: "C04", behaviorType: "B6_STUBBORN",
    gadget: "时间停止器", summary: "加班不该成为默认生活。记录真实工作量并沟通优先级，休息时间也需要被当作明确边界。" },
  { id: 33, text: "Deadline 快到了", keyword: "期限逼近", category: "C04", behaviorType: "B8_BURST",
    gadget: "时间停止器", summary: "临近期限时，完成比完美更重要。删去非必要部分，先交出能用的版本，再争取优化空间。" },
  { id: 34, text: "方案被反复要求修改", keyword: "方案改不完", category: "C04", behaviorType: "B4_RETURN",
    gadget: "时光包袱皮", summary: "反复修改不代表前面的努力都作废。先确认评价标准和本轮目标，让每次修改都有明确终点。" },
  { id: 35, text: "和同事沟通不顺", keyword: "同事沟通不顺", category: "C04", behaviorType: "B7_LINKED",
    gadget: "翻译魔芋", summary: "沟通不顺时，先对齐事实、目标和分工，少用模糊判断。很多冲突不是态度问题，而是理解没有同步。" },
  { id: 36, text: "害怕工作中犯错", keyword: "怕工作出错", category: "C04", behaviorType: "B8_BURST",
    gadget: "时光机", summary: "犯错的可能无法被清零，但可以被管理。提前检查关键点、保留记录和补救方案，会比害怕更能保护你。" },
  { id: 37, text: "绩效考核压力", keyword: "绩效考核压力", category: "C04", behaviorType: "B9_PRESSURE",
    gadget: "隐身斗篷", summary: "绩效只是组织的一种衡量方式，不等于你的全部能力。弄清标准、保留成果，也别把休息交给数字决定。" },
  { id: 38, text: "找工作越来越焦虑", keyword: "求职焦虑", category: "C04", behaviorType: "B3_SPLIT",
    gadget: "如果电话亭", summary: "求职焦虑来自结果不可控。把注意力放回简历、投递和练习这些可控动作，机会会在行动中增加。" },
  { id: 39, text: "面试紧张", keyword: "面试紧张", category: "C04", behaviorType: "B8_BURST",
    gadget: "复制机器人", summary: "面试紧张并不说明你不适合这份工作。准备三个真实经历，放慢呼吸，把面试当作双方了解。" },
  { id: 40, text: "不知道未来做什么工作", keyword: "不知做哪行", category: "C04", behaviorType: "B10_BLUR",
    gadget: "如果电话亭", summary: "未来职业不必一次想清十年。先选择愿意尝试的方向，用一次项目或实习获得真实答案。" },
  { id: 41, text: "对薪资不满意", keyword: "薪资不满意", category: "C04", behaviorType: "B6_STUBBORN",
    gadget: "如果电话亭", summary: "薪资不满是一条需要核对的信号。比较市场、职责和成长空间，再决定沟通、提升还是离开。" },
  { id: 42, text: "晋升一直没有进展", keyword: "晋升没进展", category: "C04", behaviorType: "B6_STUBBORN",
    gadget: "进化退化光线枪", summary: "晋升停滞不一定只是能力不足。主动确认标准、差距和时间表，模糊的等待才会变成可判断的路径。" },
  { id: 43, text: "下班后仍不断收到工作消息", keyword: "下班还有消息", category: "C04", behaviorType: "B8_BURST",
    gadget: "时间停止器", summary: "下班后的消息不必自动成为即时任务。设定回复时段和紧急规则，让工作真正停在工作时间里。" },
  { id: 44, text: "工作没有成就感", keyword: "没有成就感", category: "C04", behaviorType: "B10_BLUR",
    gadget: "安慰机器人", summary: "没有成就感，可能是努力与价值感失去连接。回看哪些工作让你有反馈，再争取更多接近它的任务。" },
  { id: 45, text: "害怕自己跟不上变化", keyword: "跟不上变化", category: "C04", behaviorType: "B8_BURST",
    gadget: "进化退化光线枪", summary: "变化不是一场必须永远领先的比赛。选一项真正需要的能力持续更新，已经足以让你跟上自己的道路。" },

  { id: 46, text: "害怕被别人忽视", keyword: "怕不被看见", category: "C05", behaviorType: "B4_RETURN",
    gadget: "放大灯", summary: "被看见不需要把自己无限放大。清楚表达贡献、主动争取机会，也把认可的一部分交还给自己。" },
  { id: 47, text: "社交时很尴尬", keyword: "社交尴尬", category: "C05", behaviorType: "B2_ESCAPE",
    gadget: "隐身斗篷", summary: "尴尬只是社交中的短暂停顿，不是失败证明。先关注对方说了什么，比监视自己的表现更容易连接。" },
  { id: 48, text: "不知道怎么拒绝别人", keyword: "不会拒绝", category: "C05", behaviorType: "B9_PRESSURE",
    gadget: "恶魔护照", summary: "拒绝不是伤害别人，而是在说明你的能力边界。简短地说“不方便”，不需要用过度解释换取许可。" },
  { id: 49, text: "很在意别人怎么看自己", keyword: "在意别人眼光", category: "C05", behaviorType: "B2_ESCAPE",
    gadget: "石头帽", summary: "别人的目光无法被完全控制。把判断权收回来：你是否认同自己的选择，比所有人的评价更重要。" },
  { id: 50, text: "和朋友关系逐渐变淡", keyword: "和朋友变淡", category: "C05", behaviorType: "B4_RETURN",
    gadget: "时光机", summary: "关系变淡有时是生活节奏改变，并非谁做错了。想珍惜就主动联系，也允许一些关系自然变换距离。" },
  { id: 51, text: "和朋友产生误会", keyword: "朋友误会", category: "C05", behaviorType: "B7_LINKED",
    gadget: "翻译魔芋", summary: "误会需要澄清，而不是靠猜测扩大。说出你看到的事实，也听听对方当时真正的意思。" },
  { id: 52, text: "群聊里不敢说话", keyword: "群聊不敢说话", category: "C05", behaviorType: "B2_ESCAPE",
    gadget: "隐身斗篷", summary: "群聊发言不需要足够精彩才有资格出现。从一个表情或一句回应开始，你已经参与其中。" },
  { id: 53, text: "社交结束后反复回想自己的表现", keyword: "社交后回想", category: "C05", behaviorType: "B3_SPLIT",
    gadget: "时间停止器", summary: "社交结束后的回放不会改变现场。给自己一次复盘就停下，多数人没有像你一样反复审视那些细节。" },
  { id: 54, text: "总是被别人比较", keyword: "被拿来比较", category: "C05", behaviorType: "B5_CLUSTER",
    gadget: "石头帽", summary: "被比较不代表你们可以用同一把尺子衡量。保留自己的目标，别让他人的排序替代你的成长。" },
  { id: 55, text: "感觉自己被冷落", keyword: "被冷落", category: "C05", behaviorType: "B4_RETURN",
    gadget: "放大灯", summary: "被冷落的感受值得重视，但不必立刻解释成不被喜欢。先确认事实，再主动寻找真实的连接。" },
  { id: 56, text: "很难与别人建立亲密关系", keyword: "难与人亲近", category: "C05", behaviorType: "B10_BLUR",
    gadget: "人体交换机", summary: "亲密不是一下子交出全部自己。允许信任经过小事慢慢累积，也允许你在不舒服时后退一步。" },
  { id: 57, text: "朋友之间产生嫉妒", keyword: "朋友间的嫉妒", category: "C05", behaviorType: "B5_CLUSTER",
    gadget: "人体交换机", summary: "嫉妒常在提醒我们害怕失去位置。承认它、说清需要，比用比较或攻击保护关系更有效。" },
  { id: 58, text: "别人总是越过自己的边界", keyword: "边界被越过", category: "C05", behaviorType: "B9_PRESSURE",
    gadget: "穿透环", summary: "边界被越过时，沉默容易被误读为允许。明确说出“这让我不舒服”和你希望对方如何停止。" },
  { id: 59, text: "吵架后不知道怎么重新开口", keyword: "吵架后难开口", category: "C05", behaviorType: "B7_LINKED",
    gadget: "翻译魔芋", summary: "重新开口不需要完美台词。一句“我不想让我们一直停在这里”，就足以给关系留出入口。" },
  { id: 60, text: "总是在迁就别人", keyword: "迁就别人", category: "C05", behaviorType: "B9_PRESSURE",
    gadget: "人体交换机", summary: "迁就并不能保证关系长久，反而会让你逐渐消失。表达一次真实偏好，是对关系也是对自己的尊重。" },

  { id: 61, text: "房间一直很乱", keyword: "房间乱", category: "C06", behaviorType: "B1_LIGHT",
    gadget: "缩小灯", summary: "房间的混乱不必一次清空。只整理一个平面、处理一类物品，秩序会从很小的地方恢复。" },
  { id: 62, text: "早起困难", keyword: "起不来床", category: "C06", behaviorType: "B6_STUBBORN",
    gadget: "时间停止器", summary: "早起困难往往从前一晚开始。固定一个更现实的睡眠时间，并让起床后的第一步足够简单。" },
  { id: 63, text: "作息不规律", keyword: "昼夜颠倒", category: "C06", behaviorType: "B8_BURST",
    gadget: "时间停止器", summary: "作息无需一夜变得完美。先固定起床时间或睡前动作，让身体逐渐找到可以依靠的节奏。" },
  { id: 64, text: "手机刷太久停不下来", keyword: "放不下手机", category: "C06", behaviorType: "B4_RETURN",
    gadget: "时间停止器", summary: "手机让人停不下来，不只是意志力问题。移开入口、设定结束提醒，用环境替你减少一次次抵抗。" },
  { id: 65, text: "总是不运动", keyword: "不运动", category: "C06", behaviorType: "B1_LIGHT",
    gadget: "竹蜻蜓", summary: "运动不必从完整训练开始。走十分钟、伸展一次，只要身体开始移动，就已经不是原地。" },
  { id: 66, text: "饮食不规律", keyword: "饮食不规律", category: "C06", behaviorType: "B1_LIGHT",
    gadget: "桃太郎饭团", summary: "饮食规律不是靠责备建立的。先固定一顿最容易做到的餐，再为忙碌时准备简单可得的选择。" },
  { id: 67, text: "待办事项越来越多", keyword: "待办堆积", category: "C06", behaviorType: "B5_CLUSTER",
    gadget: "复制机器人", summary: "待办越多，越需要停止继续收集。删掉、延后或委托一部分，只保留今天真正需要完成的三件事。" },
  { id: 68, text: "总忘记事情", keyword: "总忘事", category: "C06", behaviorType: "B1_LIGHT",
    gadget: "记忆面包", summary: "忘记事情不等于你不认真。把提醒、日历和固定位置交给外部系统，让大脑不必独自保管一切。" },
  { id: 69, text: "总觉得时间不够", keyword: "时间不够", category: "C06", behaviorType: "B9_PRESSURE",
    gadget: "时间停止器", summary: "时间不够时，问题常常不是速度，而是事情超过容量。决定哪些不做，才能把时间留给重要部分。" },
  { id: 70, text: "无法坚持自己的计划", keyword: "计划总中断", category: "C06", behaviorType: "B4_RETURN",
    gadget: "复制机器人", summary: "计划中断不代表彻底失败。把目标缩到今天可以重新开始的程度，持续来自一次次回到轨道。" },
  { id: 71, text: "生活没有节奏", keyword: "生活没节奏", category: "C06", behaviorType: "B10_BLUR",
    gadget: "时间停止器", summary: "生活节奏不是塞满日程，而是有开始、停顿和结束。先固定一个每天都能重复的小节点。" },
  { id: 72, text: "搬家或换环境后不适应", keyword: "换环境不适应", category: "C06", behaviorType: "B10_BLUR",
    gadget: "任意门", summary: "不适应新环境是建立安全感的过程。保留一个熟悉习惯，再逐步探索新的路线与关系。" },
  { id: 73, text: "通勤让我很疲惫", keyword: "通勤疲惫", category: "C06", behaviorType: "B1_LIGHT",
    gadget: "任意门", summary: "通勤的消耗是真实的。减少不必要往返、调整时间，或把路程变成稳定的休息区间。" },

  { id: 7, text: "家庭经济压力", keyword: "家庭经济", category: "C07", behaviorType: "B9_PRESSURE",
    gadget: "如果电话亭", summary: "经济压力需要共同面对，而不是由一个人默默想象最坏结果。看清收支和可用资源，会比担忧更有力量。" },
  { id: 76, text: "月底钱不够用", keyword: "月底钱不够", category: "C07", behaviorType: "B9_PRESSURE",
    gadget: "增殖药水", summary: "月底钱不够用时，先保障必要支出，再检查可暂停的项目。清楚的数字比模糊的窘迫更容易处理。" },
  { id: 77, text: "经常冲动消费", keyword: "冲动消费", category: "C07", behaviorType: "B8_BURST",
    gadget: "时间停止器", summary: "冲动出现时，先把购买延迟一天。想要不会因此消失，真正需要的东西也经得起等待。" },
  { id: 78, text: "总是存不下钱", keyword: "存不下钱", category: "C07", behaviorType: "B6_STUBBORN",
    gadget: "增殖药水", summary: "存钱不是靠月底剩下多少，而是先为未来留下一小部分。金额可以很小，稳定比一次存很多更重要。" },
  { id: 79, text: "房租和生活费压力", keyword: "房租开销压力", category: "C07", behaviorType: "B9_PRESSURE",
    gadget: "缩小灯", summary: "生活成本压力不是个人失败。拆分固定与可调整支出，同时寻找补贴、合租或增收等现实选项。" },
  { id: 80, text: "想买东西又害怕花钱", keyword: "想买怕花钱", category: "C07", behaviorType: "B10_BLUR",
    gadget: "如果电话亭", summary: "想买又害怕花钱，说明需要的不是禁止，而是标准。确认预算、使用频率和替代方案，再做决定。" },
  { id: 81, text: "不确定未来能赚多少钱", keyword: "未来收入不明", category: "C07", behaviorType: "B10_BLUR",
    gadget: "时光机", summary: "未来收入无法精确预知，但能力、行业信息和储备可以逐步增加。先为不确定性留出缓冲。" },
  { id: 82, text: "忍不住和别人比较经济状况", keyword: "和人比经济", category: "C07", behaviorType: "B5_CLUSTER",
    gadget: "石头帽", summary: "别人的消费与收入只是被展示的一部分。回到自己的现金流和目标，经济安全不需要与他人同款。" },

  { id: 83, text: "不知道未来要做什么", keyword: "未来做什么", category: "C08", behaviorType: "B10_BLUR",
    gadget: "如果电话亭", summary: "不知道未来做什么，并不代表没有方向。先排除不想要的，再用小尝试靠近可能喜欢的生活。" },
  { id: 84, text: "害怕选错方向", keyword: "怕选错方向", category: "C08", behaviorType: "B10_BLUR",
    gadget: "时光机", summary: "方向只有走过一段才知道是否合适。选择可调整的下一步，比等待一个绝不会出错的答案更现实。" },
  { id: 85, text: "总是在几个选择之间摇摆", keyword: "在选项间摇摆", category: "C08", behaviorType: "B10_BLUR",
    gadget: "如果电话亭", summary: "摇摆说明每个选项都有代价。设定最重要的三项标准，接受取舍，决定才会从比较中走出来。" },
  { id: 86, text: "害怕错过机会", keyword: "怕错过机会", category: "C08", behaviorType: "B8_BURST",
    gadget: "任意门", summary: "机会不是只有一扇门。与其害怕错过全部，不如选择一项真正重要的，并为它投入注意力。" },
  { id: 87, text: "害怕改变", keyword: "害怕改变", category: "C08", behaviorType: "B6_STUBBORN",
    gadget: "时光包袱皮", summary: "害怕改变，是因为旧状态至少熟悉。先保留安全底线，再尝试一个可撤回的小变化。" },
  { id: 88, text: "不确定毕业后的生活会怎样", keyword: "毕业后没底", category: "C08", behaviorType: "B10_BLUR",
    gadget: "时光机", summary: "毕业后的生活不会一次定型。你只需要准备好下一阶段的住处、收入和一个愿意尝试的方向。" },
  { id: 89, text: "想离开现在的环境却又不敢", keyword: "想离开又不敢", category: "C08", behaviorType: "B6_STUBBORN",
    gadget: "任意门", summary: "想离开说明环境已经在消耗你，害怕则提醒你需要准备。先收集信息和资源，让离开从冲动变成计划。" },
  { id: 90, text: "对年龄增长感到压力", keyword: "年龄压力", category: "C08", behaviorType: "B9_PRESSURE",
    gadget: "时光包袱皮", summary: "年龄增长带来变化，也带来经验和选择权。你不必追赶统一时间表，只需确认此刻想怎样生活。" },

  { id: 74, text: "害怕一个人待着", keyword: "害怕独处", category: "C09", behaviorType: "B4_RETURN",
    gadget: "复制机器人", summary: "害怕独处不代表你必须随时有人陪。先安排一件能让自己投入的小事，慢慢建立与自己相处的安全感。" },
  { id: 75, text: "明明休息却无法真正放松", keyword: "放松不下来", category: "C09", behaviorType: "B9_PRESSURE",
    gadget: "安慰机器人", summary: "身体停下不等于大脑已经休息。给刺激设一个结束点，用散步、洗澡或安静呼吸让自己真正退场。" },
  { id: 91, text: "总觉得自己不够好", keyword: "不够好", category: "C09", behaviorType: "B4_RETURN",
    gadget: "放大灯", summary: "“不够好”常来自一把不断移动的尺子。具体说出哪里想改善，也别抹掉已经具备的部分。" },
  { id: 92, text: "什么事情都想做到完美", keyword: "事事求完美", category: "C09", behaviorType: "B6_STUBBORN",
    gadget: "复制机器人", summary: "完美会让所有任务都像不能结束。先定义“足够好”的交付线，让完成为下一次进步腾出空间。" },
  { id: 93, text: "总是在反复内耗", keyword: "反复内耗", category: "C09", behaviorType: "B3_SPLIT",
    gadget: "增殖药水", summary: "内耗是在同一个问题里重复消耗，却没有新信息。写下可行动的一步，其余念头暂时不再审判。" },
  { id: 94, text: "害怕失败", keyword: "害怕失败", category: "C09", behaviorType: "B8_BURST",
    gadget: "时光机", summary: "失败不是对能力的终审，而是一次结果反馈。为最坏情况准备补救方案，你就能把力气重新交给尝试。" },
  { id: 95, text: "害怕失去控制", keyword: "怕失去控制", category: "C09", behaviorType: "B9_PRESSURE",
    gadget: "恶魔护照", summary: "控制能带来短暂安全，却无法消除所有意外。分清可控与不可控，为变化留一点余地，反而更稳定。" },
  { id: 96, text: "害怕被别人留下", keyword: "怕被丢下", category: "C09", behaviorType: "B4_RETURN",
    gadget: "任意门", summary: "害怕被留下，说明你渴望稳定连接。表达在意，同时建立自己的生活支点，让安全感不只依赖一个人。" },
  { id: 97, text: "对未知感到不安", keyword: "对未知不安", category: "C09", behaviorType: "B10_BLUR",
    gadget: "如果电话亭", summary: "未知之所以吓人，是因为大脑会自动填入最坏答案。收集下一步需要的信息，而不是一次预测全部未来。" },
  { id: 98, text: "总是在想过去发生的事情", keyword: "回想过去", category: "C09", behaviorType: "B4_RETURN",
    gadget: "时光机", summary: "过去无法重写，但可以被重新理解。带走其中的经验，把今天的注意力留给仍能改变的部分。" },
  { id: 99, text: "无法停止和别人比较", keyword: "总在和人比较", category: "C09", behaviorType: "B5_CLUSTER",
    gadget: "人体交换机", summary: "不断比较会让你借用别人的人生评价自己。确认真正想要的东西，你便不必赢过谁才能前进。" },
  { id: 100, text: "说不清哪里不对，但就是不舒服", keyword: "就是不舒服", category: "C09", behaviorType: "B10_BLUR",
    gadget: "安慰机器人", summary: "说不清的不舒服也是真实信号。先照顾睡眠、身体和情绪，再慢慢观察它在何时出现；不必立刻得出答案。" }
];

/* 自由输入的本地关键词词表。项目禁止调用任何外部 AI / 接口，分类完全靠
   indexOf 子串命中打分。宁可判"置信度不足"让用户手选，也不要猜错后随机发道具。 */
const WORRY_LEXICON = {
  C01: {
    strong: ["父母", "爸", "妈", "家里", "家人", "家庭", "家务", "亲戚", "兄弟姐妹", "催婚", "相亲", "结婚", "隐私", "干涉", "唠叨", "念叨", "婆婆", "彩礼", "重男轻女", "争吵"],
    weak: ["催", "管我", "管着", "期待", "不理解", "偏心", "公平", "分配", "沟通", "回家", "过年", "老家", "长辈", "争执"],
    exclude: ["同事", "上司", "老师", "同学", "加班", "经济", "房租", "钱", "变老", "去世"]
  },
  C02: {
    strong: ["伴侣", "对象", "男朋友", "女朋友", "男友", "女友", "恋爱", "分手", "异地", "暧昧", "复合", "前任", "出轨", "表白", "亲密", "安全感", "吃醋", "亲人", "去世", "变老"],
    weak: ["感情", "关系", "距离", "见面", "信任", "猜疑", "沟通", "想起", "陪伴", "舍不得"],
    exclude: ["父母", "同事", "老师", "作业", "绩效", "群聊", "房租", "别人", "催婚"]
  },
  C03: {
    strong: ["作业", "考试", "成绩", "挂科", "选课", "课", "专业", "课堂", "老师", "同学", "论文", "毕业设计", "学习", "绩点", "考研", "留学", "上岸", "答辩", "拖延", "截止"],
    weak: ["上课", "小组", "学分", "补考", "期末", "复习", "效率", "内卷", "选择", "发言", "学期", "学校"],
    exclude: ["同事", "上司", "加班", "绩效", "薪资", "老板", "工作", "房租"]
  },
  C04: {
    strong: ["工作", "加班", "同事", "上司", "老板", "绩效", "跟不上", "薪资", "晋升", "面试", "求职", "简历", "跳槽", "裁员", "打工", "上班", "下班", "职场", "画饼", "方案", "deadline", "ddl"],
    weak: ["领导", "开会", "汇报", "客户", "项目", "转正", "考核", "成就感", "工资", "犯错", "实习", "摸鱼", "涨薪"],
    exclude: ["作业", "老师", "同学", "考试", "挂科", "选课", "课堂", "毕业设计"]
  },
  C05: {
    strong: ["朋友", "社交", "群聊", "拒绝", "尴尬", "冷落", "误会", "嫉妒", "边界", "迁就", "讨好", "合群", "社恐", "尬聊", "室友", "聚会", "忽视", "已读不回", "吵架", "被别人比较"],
    weak: ["别人", "大家", "关系", "在意", "内向", "冷场", "变淡", "表现", "说话", "打招呼", "尊重", "委屈"],
    exclude: ["父母", "男朋友", "女朋友", "伴侣", "家务", "分手", "作业", "绩效"]
  },
  C06: {
    strong: ["作息", "早起", "熬夜", "房间", "手机", "短视频", "运动", "饮食", "待办", "忘记", "通勤", "搬家", "赖床", "失眠", "很乱", "节奏", "计划", "疲惫", "不适应", "时间不够"],
    weak: ["睡觉", "起床", "外卖", "效率", "坚持", "自律", "懒得", "拖着", "环境", "生活", "整理", "规律", "提醒", "打卡", "三餐"],
    exclude: ["父母", "同事", "考试", "分手", "绩效", "房租", "加班"]
  },
  C07: {
    strong: ["钱", "经济", "经济状况", "消费", "存款", "房租", "生活费", "月底", "月光", "剁手", "账单", "贷款", "花呗", "欠债", "信用卡", "收入", "物价", "预算", "省钱", "支出"],
    weak: ["冲动", "买", "不够用", "工资", "便宜", "太贵", "攒", "理财", "涨价", "兼职", "刷卡", "补贴"],
    exclude: ["作业", "考试", "同学", "伴侣", "分手", "老师", "群聊"]
  },
  C08: {
    strong: ["未来", "方向", "选错", "摇摆", "错过", "改变", "毕业后", "年龄", "迷茫", "人生", "规划", "转行", "前途", "逃离", "重新开始", "换个城市", "长大", "出路", "下一步", "选择困难"],
    weak: ["选择", "以后", "离开", "机会", "生活", "环境", "不敢", "犹豫", "后悔", "长远"],
    exclude: ["工作", "钱", "作业", "考试", "家务", "手机", "作息", "同事", "家人"]
  },
  C09: {
    strong: ["内耗", "完美", "不够好", "失败", "崩溃", "emo", "摆烂", "躺平", "自卑", "情绪", "放松", "独处", "一个人", "不舒服", "说不清", "失控", "控制", "未知", "留下", "被别人留下", "过去", "和别人比较"],
    weak: ["心情", "难过", "低落", "破防", "自责", "好累", "烦躁", "空虚", "麻木", "无法停止"],
    exclude: ["作业", "考试", "家务", "同事", "房租", "钱", "手机", "作息", "分手"]
  }
};

const WorryData = (function () {
  const weightedTypes = [
    ['B1_LIGHT', 10], ['B2_ESCAPE', 10], ['B3_SPLIT', 12], ['B4_RETURN', 15], ['B5_CLUSTER', 10],
    ['B6_STUBBORN', 12], ['B7_LINKED', 8], ['B8_BURST', 8], ['B9_PRESSURE', 8], ['B10_BLUR', 7]
  ];

  const byId = {};
  WORRY_PRESETS.forEach(function (item) { byId[item.id] = item; });

  const categoryById = {};
  WORRY_CATEGORIES.forEach(function (item) { categoryById[item.id] = item; });

  // 阈值都放 config.js；这里只做取值兜底，避免脚本顺序变动时炸掉。
  function cfg(key, fallback) {
    if (typeof CONFIG === 'object' && CONFIG && typeof CONFIG[key] === 'number') return CONFIG[key];
    return fallback;
  }

  function normalize(text) {
    return String(text || '').trim().toLowerCase().replace(/[\s，。！？、,.!?/\\_-]+/g, '');
  }

  function presetForText(text) {
    const needle = normalize(text);
    if (!needle) return null;
    const exact = WORRY_PRESETS.find(function (item) { return normalize(item.text) === needle; });
    if (exact) return exact;
    return WORRY_PRESETS.find(function (item) {
      const itemText = normalize(item.text);
      return itemText.length >= 4 && (needle.includes(itemText) || itemText.includes(needle));
    }) || null;
  }

  function preset(id) { return byId[Number(id)] || null; }
  function category(id) { return categoryById[id] || null; }

  function byCategory(id) {
    return WORRY_PRESETS.filter(function (item) { return item.category === id; });
  }

  function hoverPreview(id) {
    const cat = categoryById[id];
    if (!cat) return [];
    return cat.hoverPreview.map(preset).filter(Boolean);
  }

  /**
   * 自由输入分类：子串命中打分，纯本地，无网络无 AI。
   * 返回 null 表示置信度不足——此时前台必须提示用户手动选类，不得随机分配道具。
   */
  function classifyFreeText(text) {
    const raw = String(text || '').trim();
    if (!raw) return null;

    const hit = presetForText(raw);
    if (hit) {
      return { category: hit.category, confidence: 'exact', score: null, runnerUp: null, presetId: hit.id };
    }

    const strong = cfg('CLASSIFY_STRONG_WEIGHT', 2);
    const weak = cfg('CLASSIFY_WEAK_WEIGHT', 1);
    const penalty = cfg('CLASSIFY_EXCLUDE_PENALTY', 3);

    // 词表里的英文条目（deadline / ddl / emo）一律小写，这里把原文也压成小写再比，
    // 中文不受影响。
    const hay = raw.toLowerCase();

    const scored = WORRY_CATEGORIES.map(function (cat) {
      const lex = WORRY_LEXICON[cat.id] || { strong: [], weak: [], exclude: [] };
      let score = 0;
      lex.strong.forEach(function (w) { if (hay.indexOf(w) >= 0) score += strong; });
      lex.weak.forEach(function (w) { if (hay.indexOf(w) >= 0) score += weak; });
      lex.exclude.forEach(function (w) { if (hay.indexOf(w) >= 0) score -= penalty; });
      return { category: cat.id, score: score };
    }).sort(function (a, b) { return b.score - a.score; });

    const top = scored[0];
    const second = scored[1];
    if (top.score < cfg('CLASSIFY_MIN_SCORE', 2)) return null;
    if ((top.score - second.score) < cfg('CLASSIFY_MIN_MARGIN', 2)) return null;

    return {
      category: top.category,
      confidence: top.score >= cfg('CLASSIFY_HIGH_SCORE', 5) ? 'high' : 'low',
      score: top.score,
      runnerUp: second.category,
      presetId: null
    };
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

  /** 自由输入没有预设关键词时，从原文截一个能塞进气泡的短词。 */
  function deriveKeyword(text) {
    const clean = String(text || '').replace(/[\s，。！？、,.!?]+/g, '');
    return clean.slice(0, cfg('BUBBLE_KEYWORD_MAX_CHARS', 6)) || '烦恼';
  }

  function createProfile(text, options) {
    const opts = options || {};
    const found = opts.presetId ? preset(opts.presetId) : presetForText(text);
    const behaviorType = opts.behaviorType || (found && found.behaviorType) || randomBehaviorType();
    const cat = opts.category || (found && found.category) || null;
    return {
      id: 'worry-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
      text: String(text || '').trim(),
      keyword: (found && found.keyword) || deriveKeyword(text),
      category: cat,
      presetId: found ? found.id : null,
      behaviorType: behaviorType,
      gadget: (found && found.gadget) || (opts.gadget || null),
      isCustom: !found
    };
  }

  /** 结尾页文案：预设烦恼用它自己的总结，自由输入退回大类兜底总结。 */
  function summaryFor(profile) {
    if (!profile) return '';
    const found = profile.presetId ? preset(profile.presetId) : presetForText(profile.text);
    if (found) return found.summary;
    const cat = categoryById[profile.category];
    return cat ? cat.fallbackSummary : '';
  }

  function gadgetNameFor(profile) {
    if (!profile) return null;
    if (profile.gadget) return profile.gadget;
    const found = profile.presetId ? preset(profile.presetId) : presetForText(profile.text);
    return found ? found.gadget : null;
  }

  function examples(categoryId, count) {
    const pool = categoryId && categoryId !== 'all' ? byCategory(categoryId) : WORRY_PRESETS.slice();
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
    lexicon: WORRY_LEXICON,
    preset: preset,
    category: category,
    byCategory: byCategory,
    hoverPreview: hoverPreview,
    classifyFreeText: classifyFreeText,
    summaryFor: summaryFor,
    gadgetNameFor: gadgetNameFor,
    deriveKeyword: deriveKeyword,
    createProfile: createProfile,
    examples: examples,
    behavior: behavior,
    presetForText: presetForText,
    randomBehaviorType: randomBehaviorType
  };
})();
