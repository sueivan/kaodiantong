/* 考点通 —— 种子数据（示例题库，用户可删除后自建）
   说明：本文件仅为演示用样例，覆盖医学/考研/考公等不同科目，证明"导入任意科目文档均可刷题"。 */
(function (global) {
  const uid = (p) => p + '_' + Math.random().toString(36).slice(2, 9);

  // ---------------- 复习库示例题库（演示用，用户可删除后自建） ----------------
  // 首次打开「复习库」且为空时自动载入，供先看样例、再自行导入/上传题目。
  const LIB = [
    { id: 'lib_demo_cat_pharm', type: 'cat', name: '药理学', desc: '作用于各系统的代表药物（医学类样例）', cover: '' },
    { id: 'lib_demo_item_atropine', type: 'item', catId: 'lib_demo_cat_pharm',
      question: '阿托品属于哪一类药？其主要药理作用与典型临床应用有哪些？',
      answer: 'M 胆碱受体阻断药（抗胆碱药）。\n核心作用：抑制腺体分泌、散瞳、松弛内脏平滑肌（解痉）、加快心率、大剂量扩张血管。\n临床：麻醉前给药、缓慢性心律失常、内脏绞痛、有机磷中毒解救、散瞳验光。',
      photos: [], box: 1, due: Date.now(), createdAt: Date.now() },
    { id: 'lib_demo_item_penicillin', type: 'item', catId: 'lib_demo_cat_pharm',
      question: '青霉素最主要的不良反应是什么？过敏性休克应怎样抢救？',
      answer: '最主要且最危险的是变态反应，严重者发生过敏性休克。\n抢救：立即停用，肌注/皮下注射肾上腺素（首选），保持气道通畅、给氧，必要时糖皮质激素与抗组胺药，静脉补液并监测血压心率。用药前须询问过敏史并皮试。',
      photos: [], box: 1, due: Date.now(), createdAt: Date.now() },

    { id: 'lib_demo_cat_organic', type: 'cat', name: '有机化学（考研）', desc: '本校考研自命题科目样例', cover: '' },
    { id: 'lib_demo_item_sn2', type: 'item', catId: 'lib_demo_cat_organic',
      question: 'SN2 亲核取代反应的主要立体化学特征是什么？',
      answer: '亲核试剂从离去基团背面进攻，过渡态五配位，产物发生构型翻转（Walden 翻转）。反应速率受位阻影响大：甲基 > 伯碳 > 仲碳 >> 叔碳（叔碳以 SN1/E 为主）。',
      photos: [], box: 1, due: Date.now(), createdAt: Date.now() },
    { id: 'lib_demo_item_benzene', type: 'item', catId: 'lib_demo_cat_organic',
      question: '苯的亲电取代反应包括哪些典型类型？',
      answer: '卤代、硝化、磺化、Friedel-Crafts 烷基化/酰基化。芳香环电子云密度高，亲电试剂进攻；取代基有定位效应（邻对位定位基/间位定位基）。',
      photos: [], box: 1, due: Date.now(), createdAt: Date.now() },

    { id: 'lib_demo_cat_politics', type: 'cat', name: '考研政治', desc: '公共课样例', cover: '' },
    { id: 'lib_demo_item_materialism', type: 'item', catId: 'lib_demo_cat_politics',
      question: '简述矛盾的普遍性与特殊性的辩证关系及其方法论意义。',
      answer: '普遍性即矛盾存在于一切事物发展过程（共性）；特殊性即具体事物矛盾及其各方面各有特点（个性）。共性寓于个性之中，个性包含共性。\n方法论：坚持具体问题具体分析，把一般原理与具体实际相结合（如马克思主义中国化）。',
      photos: [], box: 1, due: Date.now(), createdAt: Date.now() }
  ];

  global.SEED = { LIB, uid };
})(window);
