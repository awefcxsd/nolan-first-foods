import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const dayMs = 86400000;
const iso = date => new Date(date).toISOString().slice(0, 10);
const plus = (date, days) => iso(Date.parse(date) + days * dayMs);
const weekday = date => ['日', '一', '二', '三', '四', '五', '六'][new Date(date).getUTCDay()];
const monday = date => plus(date, -((new Date(date).getUTCDay() + 6) % 7));
const prepMode = name => {
  if (['含鐵嬰兒燕麥', '花生', '芝麻', '杏仁'].includes(name)) return '現調';
  if (name === '原味優格') return '冷藏成品';
  if (['酪梨', '香蕉'].includes(name)) return '當餐處理';
  if (name === '全熟蛋') return '當日煮熟';
  return '熟製冷凍';
};

export function buildPrepBatches(records) {
  const batches = new Map();
  const firstPrep = plus(records[0].date, -1);
  for (const record of records) {
    const dow = new Date(record.date).getUTCDay();
    const offset = [1, 2, 3].includes(dow) ? dow : (dow - 3 + 7) % 7;
    let prepDate = plus(record.date, -offset);
    if (prepDate < firstPrep) prepDate = firstPrep;
    if (!batches.has(prepDate)) batches.set(prepDate, { prepDate, records: [], items: new Map() });
    const batch = batches.get(prepDate);
    batch.records.push(record);
    record.mealFoods.forEach((ingredients, meal) => {
      for (const name of ingredients) {
        if (!batch.items.has(name)) batch.items.set(name, { name, mode: prepMode(name), uses: [] });
        const isTrial = record.introduction.includes(`候選：${name}`);
        batch.items.get(name).uses.push({ date: record.date, meal: meal + 1, isTrial });
      }
    });
  }
  return [...batches.values()];
}

export function writePrepPlans({ root, records, foods, preparedFood, introductionStart }) {
  const batches = buildPrepBatches(records);
  const foodInfo = new Map(foods.map(food => [food.name, food]));
  const prepDir = path.join(root, 'prep');
  fs.mkdirSync(prepDir, { recursive: true });
  const weeks = new Map();
  const usedSlots = new Set();
  let totalUses = 0;
  for (const batch of batches) {
    assert(batch.records.every(record => batch.prepDate < record.date), '備餐須早於供餐日');
    assert(Date.parse(batch.records.at(-1).date) - Date.parse(batch.prepDate) <= 4 * dayMs, '每批只覆蓋接續三至四天');
    const week = monday(batch.records[0].date);
    if (!weeks.has(week)) weeks.set(week, []);
    weeks.get(week).push(batch);
    for (const item of batch.items.values()) {
      item.trial = item.uses.filter(use => use.isTrial).length;
      item.regular = item.uses.length - item.trial;
      item.estimateMl = item.regular * 10 + item.trial * 5;
      for (const use of item.uses) {
        const key = `${use.date}/${use.meal}/${item.name}`;
        assert(!usedSlots.has(key), `備餐重複覆蓋：${key}`);
        usedSlots.add(key);
        totalUses++;
      }
    }
  }
  const expectedUses = records.reduce((sum, record) => sum + record.mealFoods.flat().length, 0);
  assert.equal(totalUses, expectedUses, '備餐須逐項覆蓋每日菜單，不能漏餐或重複');
  assert.equal(new Set(batches.flatMap(batch => batch.records.map(record => record.date))).size, records.length);

  const usage = item => item.uses.map(use => `${use.date.slice(5)}餐${use.meal}${use.isTrial ? '＊' : ''}`).join('、');
  const status = item => {
    const food = foodInfo.get(item.name);
    const introDate = food ? plus(introductionStart, food.intro) : null;
    return `${food?.allergen ? `【${food.allergen}】` : ''}${item.trial ? `本批含試味／觀察，預定首次${introDate}` : '僅限實際已耐受'}；先核對logs`;
  };
  for (const [week, sessions] of weeks) {
    assert(sessions.length <= 2, '每週最多兩次備餐');
    let doc = `# ${week} 當週：每週兩次備餐\n\n[備餐索引](README.md) · [冷凍與解凍指引](../docs/freezer-prep.md) · [每日菜單](../plans/README.md)\n\n`;
    doc += '> 預設週日晚上備週一～三、週三晚上備週四～日；首週另有起始批。日期是預定製作日，實際製作與冷凍時間請手填。每種食材單獨分裝，取用時才組成兩樣的一餐。＊為試味／觀察候選，未實際引入就順延，不按本表自動判定耐受。一般10mL格、試味5mL格是庫存容器示例，不是每次餵量或過敏原劑量；熟練後按實吃量增加備餐，續添同餐兩樣即可。\n\n';
    for (const batch of sessions) {
      const frozen = [...batch.items.values()].filter(item => item.mode === '熟製冷凍');
      const fresh = [...batch.items.values()].filter(item => item.mode !== '熟製冷凍');
      const begin = batch.records[0].date;
      const end = batch.records.at(-1).date;
      const exceptional = ![0, 3].includes(new Date(batch.prepDate).getUTCDay());
      doc += `## ${batch.prepDate}（${weekday(batch.prepDate)}）${exceptional ? '起始批' : '晚上備餐'}：供${begin}～${end}\n\n`;
      doc += `- [ ] 先看庫存與logs；未耐受、漏試或需延後者，先改菜單再備餐。\n- [ ] 盤點食材、熟食分裝盒、食物溫度計、標籤與冷凍空間；本批需冷凍食材${frozen.length}項。\n- [ ] 生熟分開；先處理蔬果，再處理生肉魚；過敏原使用獨立器具或徹底清洗。\n- [ ] 各項煮熟、依能力處理質地，迅速冷卻後分裝冷凍；米飯粥類一小時內冷卻並入冷藏或冷凍。\n\n`;
      doc += '### 採買／熟製冷凍清單\n\n「一般」與「試味」是供餐用途計數，並非已確認耐受。成品mL是起始庫存估量，不是生料克數；已吃得較多時按近期實吃量放大。每份只能解凍一次，庫存若足夠且標籤／保存合格可扣除。\n\n';
      doc += '| 勾選／食材 | 製作方式（只用本項與水） | 對應供餐次數 | 起始分裝估量 | 取用日期／餐次 | 新食材／過敏原 | 已有可用格／本次實做 |\n| --- | --- | --- | --- | --- | --- | --- |\n';
      if (!frozen.length) doc += '| 本批無需熟製冷凍 | — | — | — | — | — | — |\n';
      for (const item of frozen) {
        doc += `| [ ] ${item.name} | ${preparedFood(item.name)} | 一般${item.regular}次、試味${item.trial}次 | 10mL×${item.regular}＋5mL×${item.trial}＝約${item.estimateMl}mL | ${usage(item)} | ${status(item)} | 庫存＿＿；實做＿＿ |\n`;
      }
      doc += '\n### 現調／冷藏成品／食用當日處理\n\n這些也列入採買，但不把四天份全部做好放冰箱。每次乾淨取用，開封與保存依產品標示；不預先稀釋堅果醬存放。\n\n| 勾選／食材 | 處理方式 | 需要幾次 | 取用日期／餐次 | 注意事項 |\n| --- | --- | --- | --- | --- |\n';
      if (!fresh.length) doc += '| 本批無 | — | — | — | — |\n';
      for (const item of fresh) doc += `| [ ] ${item.name} | ${item.mode}：${preparedFood(item.name)} | ${item.uses.length}次，按實吃／產品標示備料 | ${usage(item)} | ${status(item)} |\n`;
      doc += '\n### 冷凍袋標籤（依實際製作日填寫）\n\n| 食材／過敏原 | 批次編號 | 標籤內容 |\n| --- | --- | --- |\n';
      for (const item of frozen) doc += `| ${item.name}${foodInfo.get(item.name)?.allergen ? `【${foodInfo.get(item.name).allergen}】` : ''} | ${batch.prepDate}-${item.name} | 製作＿＿／冷凍＿＿／每格5或10mL／格數＿＿／試味或一般＿＿／家庭目標冷凍28天內用完（若本日製作：${plus(batch.prepDate, 28)}前）；解凍時另記時間 |\n`;
      doc += '\n### 每日取用核對\n\n| 日期 | 餐次與兩樣食材（＊者少量試味／觀察） | 預定前晚移入冷藏 |\n| --- | --- | --- |\n';
      for (const record of batch.records) {
        const meals = record.mealFoods.map((items, index) => items.length ? `餐${index + 1}：${items.map(name => `${name}${record.introduction.includes(`候選：${name}`) ? '＊' : ''}`).join('＋')}` : '').filter(Boolean).join('；');
        doc += `| ${record.date}（${weekday(record.date)}） | ${meals} | ${plus(record.date, -1)}；只取翌日所需，解凍完成後24小時內用完 |\n`;
      }
      doc += '\n- [ ] 冷凍成型後按單一食材裝袋貼標；記實際格數、體積及冷卻／入庫時間。\n- [ ] 餵食前按每日表取用，勿多解凍整袋；未引入者不在週末補試。\n- [ ] 清點剩餘未解凍庫存供下批扣除；有接觸口水、保存超時或溫度失控者丟棄。\n\n';
    }
    fs.writeFileSync(path.join(prepDir, `${week}.md`), doc.trimEnd() + '\n');
  }
  let index = '# 每週兩次備餐索引\n\n[每日菜單](../plans/README.md) · [100種候選overview](../plans/overview.md) · [冷凍、解凍與復熱指引](../docs/freezer-prep.md)\n\n';
  index += `涵蓋${records[0].date}～${records.at(-1).date}，共${weeks.size}週、${batches.length}批。預設週日晚上備週一～三、週三晚上備週四～日；第一批${batches[0].prepDate}為起始例外。每批清單直接由每日餐點彙整；100種候選庫中尚未排日期的40項不會加入採買。\n\n`;
  index += '每種食材分開凍；一般10mL小格、試味5mL小格是備餐估量工具，並非餵食處方。新食材先做少量，不因已冷凍就視為可照表吃。優格、燕麥糊、醬類、蛋與部分鮮果另外列出現調／現做方式。\n\n| 供餐週 | 備餐日期 | 覆蓋供餐日期 |\n| --- | --- | --- |\n';
  for (const [week, sessions] of weeks) index += `| [${week}當週](${week}.md) | ${sessions.map(batch => `${batch.prepDate}（${weekday(batch.prepDate)}）`).join('、')} | ${sessions[0].records[0].date}～${sessions.at(-1).records.at(-1).date} |\n`;
  fs.writeFileSync(path.join(prepDir, 'README.md'), index);
  return { batches, weeks, totalUses };
}
