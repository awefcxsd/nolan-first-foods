import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { expandedFoods } from './expanded-foods.mjs';
import { writePrepPlans } from './freezer-prep.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const profile = JSON.parse(fs.readFileSync(path.join(root, 'profile.json'), 'utf8'));
const dayMs = 86400000;
function parseDate(value) {
  assert.match(value, /^\d{4}-\d{2}-\d{2}$/);
  const date = new Date(`${value}T00:00:00Z`);
  assert.equal(date.toISOString().slice(0, 10), value, '日期必須有效');
  return date;
}
const iso = date => date.toISOString().slice(0, 10);
function addMonths(date, count) {
  const first = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + count, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return first;
}
const birth = parseDate(profile.birthDate);
const start = parseDate(profile.planStartDate);
const sixMonths = addMonths(birth, 6);
const sevenMonths = addMonths(birth, 7);
const introductionStart = parseDate(profile.introductionStartDate ?? iso(sixMonths));
const birthday = addMonths(birth, 12);
assert(start >= birth && start < birthday, '開始日期必須介於出生與一歲生日之間');
assert(introductionStart >= addMonths(birth, 4) && introductionStart < birthday, '新食材起始日須介於滿四個月與一歲生日前；實際開始仍依準備度與兒科建議');
const weekday = ['日', '一', '二', '三', '四', '五', '六'];
function age(date) {
  let months = (date.getUTCFullYear() - birth.getUTCFullYear()) * 12 + date.getUTCMonth() - birth.getUTCMonth();
  if (addMonths(birth, months) > date) months--;
  return `${months}月${Math.round((date - addMonths(birth, months)) / dayMs)}天`;
}

// First introductions are candidates only. Actual tolerance must be checked in logs.
const candidates = [
  ['酪梨', '熟軟去皮去核壓泥', ''],
  ['含鐵嬰兒燕麥', '依標示調製；確認產品未含其他未試成分', ''],
  ['牛肉', '充分煮熟打成細泥', ''],
  ['全熟蛋', '充分煮熟壓成細泥', '蛋'],
  ['花生', '無顆粒純花生醬充分稀釋混入已耐受泥食', '花生'],
  ['原味優格', '巴氏殺菌全脂無糖原味，確認成分', '乳'],
  ['小麥麵', '選成分單純款煮軟壓碎，確認沒有未試過的蛋等配料', '小麥'],
  ['豆腐', '煮熟壓泥', '黃豆'],
  ['鮭魚', '全熟去皮去刺細泥', '魚'],
  ['芝麻', '純芝麻醬充分稀釋混入已耐受泥食', '芝麻'],
  ['杏仁', '無顆粒純杏仁醬充分稀釋混入已耐受泥食', '樹堅果'],
  ['蝦', '充分煮熟去殼細磨', '甲殼類'],
  ['雞肉', '充分煮熟打泥或細碎', ''],
  ['花椰菜', '煮軟壓泥', ''],
  ['香蕉', '熟軟去皮壓泥', ''],
  ['梨', '去皮去籽煮軟壓泥', ''],
  ['胡蘿蔔', '煮至可輕易壓爛後壓泥', ''],
  ['馬鈴薯', '去皮煮熟壓泥', ''],
  ['扁豆', '充分煮熟壓泥，不給整粒', ''],
  ['菠菜', '洗淨煮熟切細或打泥', ''],
].map(([name, prep, allergen]) => ({ name, prep, allergen }));

const observationDays = 3;
const isWeekend = date => [0, 6].includes(date.getUTCDay());
// Keep the requested early avocado date; unassessed early allergen introductions
// default to around six months. This is a planning choice, not a universal cutoff.
const foods = [];
const pending = [...candidates];
let nextDate = new Date(introductionStart);
while (pending.length) {
  if (isWeekend(nextDate)) {
    nextDate = new Date(+nextDate + dayMs);
    continue;
  }
  const index = pending.findIndex(food => !food.allergen || nextDate >= sixMonths);
  if (index < 0) {
    nextDate = new Date(+nextDate + dayMs);
    continue;
  }
  const [food] = pending.splice(index, 1);
  foods.push({ ...food, intro: Math.round((nextDate - introductionStart) / dayMs) });
  nextDate = new Date(+nextDate + observationDays * dayMs);
}
// Preserve the original 20 dates; fit additional candidates without shortening
// observation windows. Overflow stays explicitly unscheduled in the overview.
const extensionStart = new Date(+introductionStart + (foods.at(-1).intro + 7) * dayMs);
const extensionEnd = new Date(+birthday - observationDays * dayMs);
assert(extensionStart <= extensionEnd, '擴充日期不足，請調整起始日期或清單');
const deferredFoods = [];
let extraDate = new Date(extensionStart);
expandedFoods.forEach(food => {
  let date = new Date(extraDate);
  while (isWeekend(date)) date = new Date(+date + dayMs);
  if (date <= extensionEnd) foods.push({ ...food, intro: Math.round((date - introductionStart) / dayMs) });
  else deferredFoods.push({ ...food, intro: null });
  extraDate = new Date(+date + observationDays * dayMs);
});
const allFoods = [...foods, ...deferredFoods];
for (const [index, food] of foods.entries()) {
  const date = new Date(+introductionStart + food.intro * dayMs);
  assert(!isWeekend(date), '首次引入不可安排在週末');
  assert(!food.allergen || date >= sixMonths, '未經個別評估的過敏原先排約六個月起');
  if (index) assert(food.intro - foods[index - 1].intro >= observationDays);
}
// Household reminders only; individual amounts/frequency follow clinical advice.
const repeatWeekdays = {
  全熟蛋: [1, 4], 花生: [2, 5], 原味優格: [3], 小麥麵: [6],
  豆腐: [0], 鮭魚: [3], 芝麻: [6], 杏仁: [0], 蝦: [5],
};

// Nutritional roles explain the choice; exact dates/order are household scheduling.
const timingReasons = {
  ...Object.fromEntries(expandedFoods.map(food => [food.name, `${food.reason}；依平日與至少三天觀察安排，並非醫學上建議等到此日；觀察未完成則順延，不為湊滿100種趕進度`])),
  含鐵嬰兒燕麥: '約六個月開始優先增加含鐵食物，並讓穀類不只依賴米；選在起步時是營養與調製方便的考量，並非必須先吃燕麥',
  牛肉: '接著增加肉類含鐵食物與蛋白質；放在燕麥後便於分開觀察，也可與燕麥交換順序',
  全熟蛋: '約六個月可開始單一少量引入蛋；列在早期以免無故延後到更大月齡，毋須等肉類都試完',
  花生: '約六個月以安全稀釋形式引入，避免無故延後；排在蛋的觀察段後便於辨識反應，並非一定要先吃蛋；嚴重濕疹或蛋過敏者先詢問兒科',
  原味優格: '約六個月可用無糖巴氏殺菌優格引入乳；此日是接續前項觀察的安排，不需等一歲，但不可因此用鮮奶取代奶類主飲',
  小麥麵: '約六個月可引入含麩質食物；此時擴充主食選擇，日期為錯開新食材，可更早以安全質地安排',
  豆腐: '約六個月可引入黃豆，熟豆腐易壓泥並增加蛋白質來源；排在此處為單項觀察，並非黃豆必須比小麥晚',
  鮭魚: '約六個月可引入全熟去刺魚肉；此時加入魚類選擇，排在豆腐後只是分開觀察，不代表較早吃魚不適合',
  芝麻: '約六個月可用充分稀釋的純芝麻醬引入；此日接續魚的觀察段，沒有必須等到此日的月齡限制',
  杏仁: '約六個月可用安全稀釋的堅果醬引入；與花生分開記錄，因花生耐受不代表杏仁耐受，日期可與其他候選調換',
  蝦: '約六個月可引入全熟細磨甲殼類；與魚分開觀察，魚耐受不代表蝦耐受，不是必須等到這一天才能吃蝦',
  雞肉: '增加不同肉類與蛋白質來源；排在前面候選後是家庭輪替選擇，約六個月即可用熟肉泥引入，毋須等海鮮試完',
  花椰菜: '擴充已試過南瓜、地瓜之外的蔬菜味道；煮軟壓泥即可安排，排在此日無特殊生理門檻，也可提早',
  香蕉: '熟軟香蕉方便壓泥，增加水果選擇；此日為菜單擴充安排，不必等所有蔬菜或肉類都試完',
  梨: '以去皮去籽煮軟的梨增加水果變化；放在香蕉後便於分開記錄，沒有必須先香蕉再梨的要求',
  胡蘿蔔: '增加蔬菜變化，以煮至可壓爛控制質地；日期是輪替安排，安全煮軟後可在約六個月起另排',
  馬鈴薯: '增加米、燕麥、小麥之外的澱粉來源；熟泥適合初期，排在此日為主食輪替，並非此月齡才可消化',
  酪梨: '家長指定以酪梨作為本輪第一項新食材；熟軟去皮去核後壓泥便於準備，先單項觀察，再接續含鐵食物；這是家庭選擇，並非酪梨必須最先吃或有特定日期的醫學優勢',
  扁豆: '增加植物性鐵與蛋白質來源；煮熟壓泥可在約六個月起安排，較晚列入是菜單排序，毋須等肉類吃過才引入',
  菠菜: '增加綠葉蔬菜選擇；煮熟細處理後可在約六個月起安排，此日只是輪替順序，並非必須延至此時，也不取代主要含鐵食物',
};
assert(foods.every(food => timingReasons[food.name]), '每項新食材均須有時點理由');

const baselineFoods = ['米', '南瓜', '地瓜'];
const foodGroups = {
  ...Object.fromEntries(expandedFoods.map(food => [food.name, food.group])),
  米: '穀類', 南瓜: '蔬菜', 地瓜: '根莖', 酪梨: '水果', 含鐵嬰兒燕麥: '穀類',
  牛肉: '肉類', 全熟蛋: '蛋類', 花生: '豆類／過敏原', 原味優格: '乳品', 小麥麵: '穀類',
  豆腐: '豆類', 鮭魚: '魚類', 芝麻: '種子', 杏仁: '堅果', 蝦: '甲殼類', 雞肉: '肉類',
  花椰菜: '蔬菜', 香蕉: '水果', 梨: '水果', 胡蘿蔔: '蔬菜', 馬鈴薯: '根莖', 扁豆: '豆類', 菠菜: '蔬菜',
};
const preparedFood = name => ({
  ...Object.fromEntries(expandedFoods.map(food => [food.name, `${food.name}（${food.prep}）`])),
  米: '白米粥（僅米與水）', 含鐵嬰兒燕麥: '含鐵嬰兒燕麥糊（依標示調製）',
  牛肉: '全熟牛肉泥', 全熟蛋: '全熟蛋泥', 豆腐: '熟豆腐泥',
  鮭魚: '全熟去刺鮭魚泥', 雞肉: '全熟雞肉泥', 扁豆: '煮熟扁豆泥', 蝦: '全熟去殼蝦泥',
  南瓜: '蒸南瓜泥', 地瓜: '蒸地瓜泥', 花椰菜: '煮軟花椰菜泥',
  胡蘿蔔: '煮軟胡蘿蔔泥', 菠菜: '熟菠菜泥', 香蕉: '熟香蕉泥', 梨: '去皮去籽蒸梨泥',
  酪梨: '熟軟酪梨泥（去皮去核）', 馬鈴薯: '熟馬鈴薯泥',
  小麥麵: '單純小麥麵（煮軟切碎；初期打泥）', 原味優格: '巴氏殺菌全脂無糖原味優格',
  花生: '無顆粒純花生醬（以水充分稀釋，拌入同餐食物）',
  芝麻: '純芝麻醬（以水充分稀釋，拌入同餐食物）',
  杏仁: '無顆粒純杏仁醬（以水充分稀釋，拌入同餐食物）',
}[name] ?? name);
const formatMeal = ingredients => ingredients.length
  ? ingredients.map(preparedFood).join('＋')
  : '不安排副食品；母乳／配方奶照常';
const portionFor = date => date < sixMonths
  ? '僅白天少量試味，提前引入的量由兒科確認；不套用六個月份量'
  : '每餐先提供1–2大匙（合計約15–30mL），仍餓可續添，不是上限或必吃量；首次新食材僅少量試味，過敏原量依個別建議';

const months = new Map();
const records = [];
for (let date = new Date(start); date < birthday; date = new Date(+date + dayMs)) {
  const key = iso(date).slice(0, 7);
  if (!months.has(key)) months.set(key, []);
  let meals, mealFoods, introduction, timingReason, note;
  if (date < introductionStart) {
    const earlyMenu = [['米', '南瓜'], ['米', '地瓜']];
    const day = Math.round((date - start) / dayMs);
    mealFoods = [earlyMenu[day % earlyMenu.length], [], []];
    introduction = '不安排；只使用已試過的米、南瓜、地瓜';
    timingReason = '尚未到家長設定的新食材起始日，先輪替已試過食物作備選；實際開始仍須確認準備度與兒科建議';
    note = '僅在兒科已確認可繼續且具準備度、上述食物已耐受時少量提供；否則暫緩副食品，母乳／配方奶照常';
  } else {
    const offset = Math.round((date - introductionStart) / dayMs);
    const monthAge = Number(age(date).split('月')[0]);
    const introduced = foods.filter(food => food.intro + observationDays <= offset);
    const available = names => names.filter(name => introduced.some(food => food.name === name));
    const pick = (items, fallback, shift = 0) => items.length ? items[(offset + shift) % items.length] : fallback;
    const groupNames = groups => foods.filter(food => groups.includes(foodGroups[food.name])).map(food => food.name);
    const vegetables = ['南瓜', '地瓜', ...available(groupNames(['蔬菜']))];
    const fruits = available(groupNames(['水果']));
    const proteins = available(groupNames(['肉類', '蛋類', '豆類', '魚類', '甲殼類']));
    const starches = ['米', ...available(groupNames(['穀類', '根莖']).filter(name => name !== '含鐵嬰兒燕麥'))];
    const breakfastBase = available(['含鐵嬰兒燕麥']).length ? '含鐵嬰兒燕麥' : '米';
    mealFoods = [
      [breakfastBase, pick(fruits, pick(vegetables, '南瓜'))],
      [pick(proteins, breakfastBase), pick(vegetables, '南瓜', 1)],
      [pick(starches, '米', 1), pick(proteins, pick(fruits, '地瓜'), 1)],
    ];
    const current = foods.find(food => offset >= food.intro && offset < food.intro + observationDays);
    const nextFood = foods.find(food => food.intro > offset);
    introduction = current
      ? `${offset === current.intro ? '首次候選' : '重複觀察候選'}：${current.name}${current.allergen ? `【${current.allergen}】` : ''}；${current.prep}`
      : nextFood ? `不試新；下項候選：${iso(new Date(+introductionStart + nextFood.intro * dayMs))} ${nextFood.name}` : '無新食材候選；回顧實際紀錄';
    if (current) {
      if (offset === current.intro) {
        const previous = foods[foods.indexOf(current) - 1];
        timingReason = timingReasons[current.name] + (previous
          ? `；距前項「${previous.name}」首次候選已${current.intro - previous.intro}天，保留至少三天觀察並避開週末；未完成則順延`
          : `；以家長指定的 ${iso(introductionStart)} 作排程起點，仍須確認準備度`);
      } else {
        timingReason = `今天是「${current.name}」預定觀察第${offset - current.intro + 1}天；已實際引入且無反應才重複，不再加入另一新食材，以利辨識反應；三天是排程預設，必要時延長，無反應不代表排除過敏`;
      }
    } else {
      timingReason = nextFood
        ? '今天不加新食材，保留觀察與休息空間；首次引入只排平日，週末順延；過敏原暫以約六個月起安排，仍須確認準備度'
        : `本輪${foods.length}項新增候選已排完，今天輪替實際已耐受食物；種類數不是醫療門檻，未實際吃過者仍須依紀錄安排，新增只排平日且保留觀察間隔`;
      timingReason += monthAge < 9
        ? '；壓泥或軟顆粒依能力練習，不必等到特定生日，也不提前強迫升級'
        : '；此階段依能力練習軟碎食與較規律餐次，日期不是質地升級的硬性門檻';
    }
    if (current) {
      const familiar = current.name === breakfastBase ? pick(vegetables, '南瓜') : breakfastBase;
      mealFoods[0] = [current.name, familiar];
    }
    const repeats = foods.filter(food => food.allergen && food.intro + observationDays <= offset
      && repeatWeekdays[food.name].includes(date.getUTCDay()));
    note = monthAge < 9
      ? '由少量逐步到2–3餐；三欄為可選供餐，非必吃；泥到壓泥／軟顆粒依能力'
      : '依能力逐步3–4次供餐；此表列3餐，可按需要另記；軟碎食依能力';
    if (repeats.length) {
      assert(repeats.length <= 2, '複習項目須能分配到兩餐');
      repeats.forEach((food, index) => {
        const target = index === 0 ? 1 : 0;
        const protein = ['全熟蛋', '豆腐', '鮭魚', '蝦'].includes(food.name);
        const companion = target === 0 && current
          ? current.name
          : protein ? pick(vegetables, '南瓜', index) : breakfastBase;
        mealFoods[target] = [food.name, companion];
      });
      note += `；過敏原複習：${repeats.map(food => food.name).join('、')}（僅限已耐受；家庭提醒，非醫療劑量）`;
    }
    note += '；未實際耐受者換已耐受食物，觀察未完成則延後後續新食材';
    if (date < sixMonths) {
      timingReason = `家長指定自 ${iso(introductionStart)} 起排程，今天為${age(date)}；早於一般約六個月的建議，須兒科確認適合提前且具準備度才執行。` + timingReason;
      mealFoods[1] = [];
      mealFoods[2] = [];
      note = '未滿六個月，僅列白天少量一餐；準備度與提前引入須經兒科確認，未確認則暫緩並順延；不因表列菜單減少奶量；其他配餐食材須已耐受';
    }
  }
  if (date >= sixMonths && date < sevenMonths) {
    mealFoods[2] = [];
    note = '滿六個月至未滿七個月：每日兩餐，不安排第三餐；' + note.replace('由少量逐步到2–3餐；三欄為可選供餐，非必吃；', '');
  }
  mealFoods = mealFoods.map(items => [...new Set(items)]);
  assert(mealFoods.every(items => items.length <= 2), '每餐最多兩樣食材');
  meals = mealFoods.map(formatMeal);
  const portion = portionFor(date);
  if (isWeekend(date)) {
    introduction = '週末不首次試新；' + introduction;
    note += '；若前項其實尚未引入，週末不得補試，順延至平日';
  }
  assert(timingReason, '每天均須填寫引入時點理由');
  const record = { date: iso(date), age: age(date), meals, mealFoods, introduction, timingReason, note, portion };
  records.push(record);
  months.get(key).push(`| ${iso(date)}（${weekday[date.getUTCDay()]}） | ${record.age} | ${meals.join(' | ')} | ${introduction} | ${timingReason} | ${note} | ${portion} | [ ] |`);
}

assert.equal(records.length, Math.round((birthday - start) / dayMs));
assert.equal(new Set(records.map(record => record.date)).size, records.length);
assert.equal(records.at(-1).date, iso(new Date(+birthday - dayMs)));
const planDir = path.join(root, 'plans');
fs.mkdirSync(planDir, { recursive: true });
for (const [month, rows] of months) {
  const header = `# ${month} 每日副食品草稿\n\n[返回索引](README.md) · [安全原則](../docs/feeding-guide.md) · [每日紀錄範本](../templates/daily-log.md)\n\n`;
  const caveat = `> 新食材自家長指定的 ${iso(introductionStart)} 起安排。一般建議約六個月且具準備度開始；六個月前的候選須經兒科確認適合提前才執行，否則順延。每餐最多兩樣食材，米粥的米也算一樣；不用含其他食材的高湯或配料，稀釋用水。未滿六個月列一餐；滿六個月至未滿七個月（${iso(sixMonths)}～${iso(new Date(+sevenMonths - dayMs))}）每天兩餐，第三餐不安排。之後依能力逐步增加，非必吃三餐。份量是每餐兩樣合計的起始提供量，可依食慾續添，非整餐上限或必吃量；新過敏原只少量，不套用一般份量。只有當日候選可首次接觸，其餘須已耐受。泥食依能力調整為壓泥、軟顆粒或軟碎，不長期固定細泥。首次只排平日，至少間隔三天，週末或需更長觀察則順延。過敏原候選暫排約六個月起；週末只觀察或複習實際已引入食物。奶類持續提供；實吃量與反應另記 logs/。[份量依據](../docs/feeding-guide.md) · [食材 overview](overview.md) · [每週備餐](../prep/README.md)\n\n`;
  const table = '| 日期 | 月齡 | 第一餐／白天試新 | 第二餐 | 第三餐 | 新食材與安全形式 | 引入時點理由 | 當日提醒 | 餵食量參考（每餐合計） | 已記錄 |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n';
  fs.writeFileSync(path.join(planDir, `${month}.md`), header + caveat + table + rows.join('\n') + '\n');
}
const totalFoods = new Set([...baselineFoods, ...allFoods.map(food => food.name)]);
assert.equal(totalFoods.size, baselineFoods.length + allFoods.length, 'overview 不重複計數');
let overview = `# 食材 overview\n\n[返回每日索引](README.md) · [實際食材紀錄](../docs/food-log.md) · [餵食原則與份量](../docs/feeding-guide.md)\n\n`;
overview += `| 項目 | 種數 | 定義 |\n| --- | --- | --- |\n| 家長已回報試過 | ${baselineFoods.length} | 米、南瓜、地瓜；首次日期及個別反應待補 |\n| 新增候選總數 | ${allFoods.length} | 不代表已實際吃過 |\n| 本期已排首次日期 | ${foods.length} | 只排平日且每項至少三天，完整觀察落在本期內 |\n| 待後續引入 | ${deferredFoods.length} | 本期排不下，未硬塞入一歲前菜單 |\n| 食材候選總計 | **${totalFoods.size}** | 起始食物＋全部新增候選，去除重複 |\n| 清單中標記過敏原／含麩質的食物 | ${allFoods.filter(food => food.allergen).length} | 子集合不另加計；未標記也不代表絕不過敏，耐受不能跨食物推定 |\n\n`;
overview += `計數按本輪具名食物去重：十倍粥與米粥都算「米」；小麥麵算一項、優格算一項，不另外把小麥或乳再加一次。水不計，母乳／配方奶另記。選成分單純的產品；其他穀類、奶、蛋或調味配料仍是額外食材，不能藏在兩樣食材的料理裡。這是家長要求的簡化菜單，不是醫學上每餐只能兩樣。\n\n`;
overview += `本版保留最初20項首次候選日期，其餘由${iso(extensionStart)}起依至少三天與平日規則重排；先前較疏的22項日期會調整。到一歲前只排入${foods.length}項新增，另${deferredFoods.length}項明列待後續。100種是家庭候選庫，並非醫師訂定的必吃清單，也不宣稱一歲前完成。實際觀察未完成就順延。[台灣小兒科醫師與醫院資料查核](../docs/taiwan-recommendations.md)。\n\n`;
overview += `## 每月首次候選與累計\n\n| 月份 | 本月新增候選數 | 累計計畫涵蓋種類（含起始${baselineFoods.length}種） |\n| --- | --- | --- |\n`;
let cumulative = baselineFoods.length;
for (const month of months.keys()) {
  const added = foods.filter(food => iso(new Date(+introductionStart + food.intro * dayMs)).startsWith(month)).length;
  cumulative += added;
  overview += `| ${month} | ${added} | ${cumulative} |\n`;
}
overview += '\n累計欄只表示排程進度，不表示截至該月實際吃過的數量。以下狀態依家長起始回報，後續依 logs 更新食材紀錄；本工具不自動宣告耐受。\n\n## 逐項清單\n\n| 編號 | 食物 | 分類 | 過敏原 | 目前回報狀態 | 預定首次日期 |\n| --- | --- | --- | --- | --- | --- |\n';
baselineFoods.forEach((name, index) => { overview += `| ${index + 1} | ${name} | ${foodGroups[name]} | — | 家長已回報試過；反應細節待補 | 實際日期待補 |\n`; });
foods.forEach((food, index) => { overview += `| ${baselineFoods.length + index + 1} | ${food.name} | ${foodGroups[food.name]} | ${food.allergen || '—'} | 待引入，以實吃紀錄為準 | ${iso(new Date(+introductionStart + food.intro * dayMs))} |\n`; });
deferredFoods.forEach((food, index) => { overview += `| ${baselineFoods.length + foods.length + index + 1} | ${food.name} | ${foodGroups[food.name]} | ${food.allergen || '—'} | 待後續引入（本期未排） | 待後續安排，不壓縮觀察間隔 |\n`; });
fs.writeFileSync(path.join(planDir, 'overview.md'), overview);
const index = `# 每日規劃索引\n\n${profile.name}：${profile.birthDate} 出生。${iso(start)} 至 ${records.at(-1).date}，共 **${records.length} 天**，截至一歲前一天。\n\n家長指定新食材起始日：**${iso(introductionStart)}（${age(introductionStart)}）**，首次引入只排平日，至少間隔三天，遇週末順延；過敏原候選暫排約六個月起。滿六個月日期：${iso(sixMonths)}。六個月前僅列白天少量一餐，須經兒科確認適合提前且具準備度才執行；未確認則暫緩並順延。\n\n`;
fs.writeFileSync(path.join(planDir, 'README.md'), index + `[100種食材 overview：已回報${baselineFoods.length}種＋新增候選${allFoods.length}種](overview.md)；新增中${foods.length}項已排本期、${deferredFoods.length}項待後續。每餐最多兩樣；滿六個月至未滿七個月（${iso(sixMonths)}～${iso(new Date(+sevenMonths - dayMs))}）每日兩餐，第三餐不安排。各日均列餵食量參考。[台灣醫師資料查核](../docs/taiwan-recommendations.md) · [每週兩次備餐清單](../prep/README.md)。\n\n` + [...months].map(([month, rows]) => `- [${month}（${rows.length} 天）](${month}.md)`).join('\n') + '\n\n請先看 [安全原則](../docs/feeding-guide.md)。實際吃過與否以 [食材紀錄](../docs/food-log.md) 及 logs/ 為準，不由計畫自動推定。\n');
console.log(`產生 ${records.length} 天、${months.size} 個月份：${iso(start)} ～ ${records.at(-1).date}；已驗證日期連續、無重複、排除一歲生日。`);
const prep = writePrepPlans({ root, records, foods, preparedFood, introductionStart: iso(introductionStart) });
console.log(`同步產生${prep.weeks.size}週、${prep.batches.length}批備餐；逐項覆蓋${prep.totalUses}次食材使用。`);
