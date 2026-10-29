import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

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
const birthday = addMonths(birth, 12);
assert(start >= birth && start < birthday, '開始日期必須介於出生與一歲生日之間');
const weekday = ['日', '一', '二', '三', '四', '五', '六'];
function age(date) {
  let months = (date.getUTCFullYear() - birth.getUTCFullYear()) * 12 + date.getUTCMonth() - birth.getUTCMonth();
  if (addMonths(birth, months) > date) months--;
  return `${months}月${Math.round((date - addMonths(birth, months)) / dayMs)}天`;
}

// First introductions are candidates only. Actual tolerance must be checked in logs.
const foods = [
  ['含鐵嬰兒燕麥', '依標示調製；確認產品未含其他未試成分', ''],
  ['牛肉', '充分煮熟打成細泥', ''],
  ['全熟蛋', '充分煮熟壓成細泥', '蛋'],
  ['花生', '無顆粒純花生醬充分稀釋混入已耐受泥食', '花生'],
  ['原味優格', '巴氏殺菌無糖原味，確認成分', '乳'],
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
  ['酪梨', '熟軟去皮去核壓泥', ''],
  ['扁豆', '充分煮熟壓泥，不給整粒', ''],
  ['菠菜', '洗淨煮熟切細或打泥', ''],
].map(([name, prep, allergen], index) => ({ name, prep, allergen, intro: index * 3 }));

const months = new Map();
const records = [];
for (let date = new Date(start); date < birthday; date = new Date(+date + dayMs)) {
  const key = iso(date).slice(0, 7);
  if (!months.has(key)) months.set(key, []);
  let meals, introduction, note;
  if (date < sixMonths) {
    meals = ['奶類照常；副食品依兒科建議記錄', '—', '—'];
    introduction = '不安排新食材';
    note = '未滿六個月；已試過十倍粥／南瓜／地瓜，先確認繼續餵食的時機與準備度';
  } else {
    const offset = Math.round((date - sixMonths) / dayMs);
    const monthAge = Number(age(date).split('月')[0]);
    const introduced = foods.filter(food => food.intro + 3 <= offset);
    const available = names => names.filter(name => introduced.some(food => food.name === name));
    const pick = (items, fallback, shift = 0) => items.length ? items[(offset + shift) % items.length] : fallback;
    const iron = pick(available(['含鐵嬰兒燕麥', '牛肉', '雞肉', '扁豆']), '米粥');
    const protein = pick(available(['牛肉', '全熟蛋', '豆腐', '鮭魚', '雞肉', '扁豆']), '', 1);
    const vegetable = pick(['南瓜', '地瓜', ...available(['花椰菜', '胡蘿蔔', '菠菜'])], '南瓜');
    const fruit = pick(available(['香蕉', '梨', '酪梨']), vegetable);
    const starch = pick(['米粥', ...available(['小麥麵', '馬鈴薯'])], '米粥');
    const combine = (...parts) => [...new Set(parts.filter(Boolean))].join('＋');
    meals = [combine(iron, vegetable), combine(starch, protein, vegetable), combine(starch, protein, fruit)];
    const current = foods.find(food => offset >= food.intro && offset < food.intro + 3);
    introduction = current
      ? `${offset === current.intro ? '首次候選' : '重複觀察候選'}：${current.name}${current.allergen ? `【${current.allergen}】` : ''}；${current.prep}`
      : '無新食材候選；回顧實際紀錄';
    if (current) {
      meals[0] = `白天少量 ${current.name}（${offset === current.intro ? '僅此項可為新食材' : '僅在已引入且無反應時重複'}）＋已耐受米粥／南瓜`;
    }
    const repeatAllergens = foods.filter(food => food.allergen && food.intro + 3 <= offset);
    const repeat = repeatAllergens.length ? repeatAllergens[offset % repeatAllergens.length] : null;
    note = monthAge < 9
      ? '由少量逐步到2–3餐；三欄為可選供餐，非必吃；泥到壓泥／軟顆粒依能力'
      : '依能力逐步3–4次供餐；此表列3餐，可按需要另記；軟碎食依能力';
    if (repeat) note += `；若已耐受，可少量輪替${repeat.name}（按安全形式準備）`;
    note += '；未實際耐受者換已耐受食物，觀察未完成則延後後續新食材';
  }
  const record = { date: iso(date), age: age(date), meals, introduction, note };
  records.push(record);
  months.get(key).push(`| ${iso(date)}（${weekday[date.getUTCDay()]}） | ${record.age} | ${meals.join(' | ')} | ${introduction} | ${note} | [ ] |`);
}

assert.equal(records.length, Math.round((birthday - start) / dayMs));
assert.equal(new Set(records.map(record => record.date)).size, records.length);
assert.equal(records.at(-1).date, iso(new Date(+birthday - dayMs)));
const planDir = path.join(root, 'plans');
fs.mkdirSync(planDir, { recursive: true });
for (const [month, rows] of months) {
  const header = `# ${month} 每日副食品草稿\n\n[返回索引](README.md) · [安全原則](../docs/feeding-guide.md) · [每日紀錄範本](../templates/daily-log.md)\n\n`;
  const caveat = '> 菜單是候選，未確認準備度或耐受前不照表供餐。所有食物依能力處理至安全質地；不強迫份量。新食材間隔預設三天，必要時延長並順延。母乳／嬰兒配方奶持續提供。完成欄僅供手動勾記，實際反應另存 logs/。\n\n';
  const table = '| 日期 | 月齡 | 餐次一／白天新食材 | 餐次二候選 | 餐次三候選 | 新食材與安全形式 | 當日提醒 | 已記錄 |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n';
  fs.writeFileSync(path.join(planDir, `${month}.md`), header + caveat + table + rows.join('\n') + '\n');
}
const index = `# 每日規劃索引\n\n${profile.name}：${profile.birthDate} 出生。${iso(start)} 至 ${records.at(-1).date}，共 **${records.length} 天**，截至一歲前一天。\n\n滿六個月日期：${iso(sixMonths)}。六個月前不安排新食材，僅供紀錄及與兒科討論。其後共有 ${records.filter(record => record.date >= iso(sixMonths)).length} 天的菜單草稿。\n\n`;
fs.writeFileSync(path.join(planDir, 'README.md'), index + [...months].map(([month, rows]) => `- [${month}（${rows.length} 天）](${month}.md)`).join('\n') + '\n\n請先看 [安全原則](../docs/feeding-guide.md)。實際吃過與否以 [食材紀錄](../docs/food-log.md) 及 logs/ 為準，不由計畫自動推定。\n');
console.log(`產生 ${records.length} 天、${months.size} 個月份：${iso(start)} ～ ${records.at(-1).date}；已驗證日期連續、無重複、排除一歲生日。`);
