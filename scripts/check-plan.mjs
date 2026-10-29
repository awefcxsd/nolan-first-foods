import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = fs.readdirSync(path.join(root, 'plans')).filter(name => /^\d{4}-\d{2}\.md$/.test(name)).sort();
const rows = files.flatMap(file => fs.readFileSync(path.join(root, 'plans', file), 'utf8')
  .split('\n').filter(line => /^\| \d{4}-/.test(line))
  .map(line => line.split('|').slice(1, -1).map(cell => cell.trim())));
const profile = JSON.parse(fs.readFileSync(path.join(root, 'profile.json'), 'utf8'));
const dayMs = 86400000;
const foodPattern = name => ({ 小麥麵: /小麥麵/, 梨: /(?<!酪)梨/, 米: /白米粥/, 雞肉: /(?<!火)雞肉/, 地瓜: /地瓜(?!葉)/ }[name] ?? new RegExp(name));
const firsts = rows.filter(row => row[5].includes('首次候選：'));
assert.equal(rows.length, 204);
assert.equal(firsts.length, 57);
const introductions = new Map(firsts.map(row => [row[5].match(/首次候選：([^【；]+)/)[1], Date.parse(row[0].slice(0, 10))]));
assert.equal(introductions.size, 57);
assert.equal(firsts[0][0].slice(0, 10), '2026-10-30');
assert(firsts[0][5].includes('酪梨'));
assert(firsts[0][6].includes('家長指定以酪梨'));
for (const [name, expected] of Object.entries({ 含鐵嬰兒燕麥: '2026-11-02', 全熟蛋: '2026-11-23', 花生: '2026-11-26', 菠菜: '2027-01-04' })) {
  assert.equal(introductions.get(name), Date.parse(expected), `保留既有首次日期：${name}`);
}
const sixMonths = Date.parse('2026-11-22');
firsts.forEach((row, index) => {
  const date = new Date(row[0].slice(0, 10));
  assert(![0, 6].includes(date.getUTCDay()), `週末首次引入：${row[0]}`);
  if (index) assert(+date - Date.parse(firsts[index - 1][0].slice(0, 10)) >= 3 * dayMs);
  assert(+date + 2 * dayMs <= Date.parse(rows.at(-1)[0].slice(0, 10)), '首次候選須保留本期內完整觀察');
  if (row[5].includes('【')) assert(+date >= sixMonths, `過敏原預設起點：${row[0]}`);
});
rows.forEach((row, index) => {
  const date = Date.parse(row[0].slice(0, 10));
  assert.equal(date, Date.parse(profile.planStartDate) + index * dayMs);
  assert.equal(row.length, 10);
  assert(row[6].length > 20);
  if ([0, 6].includes(new Date(date).getUTCDay())) assert(row[5].startsWith('週末不首次試新'));
  const activeMeals = row.slice(2, 5).filter(cell => !cell.startsWith('不安排副食品'));
  if (date < sixMonths) assert.equal(activeMeals.length, 1);
  if (date >= sixMonths && date < Date.parse('2026-12-22')) {
    assert.equal(activeMeals.length, 2, `${row[0]} 六月齡只能排兩餐`);
    assert(row[4].startsWith('不安排副食品'));
    assert(row[8].includes('15–30mL') && row[8].includes('合計'));
  }
  if (date >= Date.parse('2026-12-22')) assert.equal(activeMeals.length, 3);
  for (const cell of activeMeals) {
    assert.equal(cell.split('＋').length, 2, `${row[0]} 每餐必須兩樣食材`);
    const detected = [...introductions.keys(), '米', '南瓜', '地瓜'].filter(name => foodPattern(name).test(cell));
    assert.equal(detected.length, 2, `${row[0]} 料理實際包含${detected.join('、')}，必須兩樣`);
  }
  assert(row[8].length > 20, '餵食量欄不可空白');
  assert.equal(row[9], '[ ]');
  for (let meal = 0; meal < 3; meal++) {
    for (const [name, first] of introductions) {
      const pattern = foodPattern(name);
      if (!pattern.test(row[meal + 2])) continue;
      const isCurrent = row[5].includes(`候選：${name}`);
      assert(date >= first + (meal === 0 && isCurrent ? 0 : 3 * dayMs), `${row[0]} 餐${meal + 1} 提早混入 ${name}`);
    }
  }
  const repeat = row[7].match(/過敏原複習：(.+?)（/);
  if (repeat) for (const name of repeat[1].split('、')) {
    const pattern = foodPattern(name);
    assert(row.slice(2, 5).some(cell => pattern.test(cell)), `${row[0]} 複習未出現在餐點：${name}`);
    assert(date >= introductions.get(name) + 3 * dayMs);
  }
});
// Independent full-week check after all introductions: two egg/peanut reminders,
// one for each other allergen; no prescription about portion size is implied.
const week = rows.filter(row => row[0].slice(0, 10) >= '2027-02-01' && row[0].slice(0, 10) <= '2027-02-07');
assert.equal(week.length, 7);
for (const [name, count] of Object.entries({ 全熟蛋: 2, 花生: 2, 原味優格: 1, 小麥麵: 1, 豆腐: 1, 鮭魚: 1, 芝麻: 1, 杏仁: 1, 蝦: 1 })) {
  const actual = week.filter(row => row[7].match(/過敏原複習：(.+?)（/)?.[1].split('、').includes(name)).length;
  assert.equal(actual, count, `${name} 每週複習提醒`);
}
const overview = fs.readFileSync(path.join(root, 'plans', 'overview.md'), 'utf8');
const foodRows = overview.split('\n').filter(line => /^\| \d+ \|/.test(line));
assert.equal(foodRows.length, 100);
const overviewFoods = foodRows.map(line => line.split('|')[2].trim());
assert.equal(new Set(overviewFoods).size, 100);
assert.equal(foodRows.filter(line => line.includes('家長已回報試過')).length, 3);
assert.equal(foodRows.filter(line => line.includes('待引入，以實吃紀錄為準')).length, 57);
const deferredRows = foodRows.filter(line => line.includes('待後續引入（本期未排）'));
assert.equal(deferredRows.length, 40);
for (const row of deferredRows) {
  const name = row.split('|')[2].trim();
  assert(!introductions.has(name), `待後續項目不可假裝已排：${name}`);
  assert(row.includes('待後續安排'));
  assert(!rows.some(daily => daily.slice(2, 5).some(meal => foodPattern(name).test(meal))), `待後續食物不可混入餐點：${name}`);
}
for (const [name, date] of introductions) {
  const foodRow = foodRows.find(line => line.split('|')[2].trim() === name);
  assert(foodRow?.includes(new Date(date).toISOString().slice(0, 10)), `overview 日期不一致：${name}`);
}
assert.equal(rows.filter(row => row[0].slice(0, 10) >= '2026-11-22' && row[0].slice(0, 10) < '2026-12-22').length, 30);
const additions = firsts.slice(20);
assert.equal(additions[0][0].slice(0, 10), '2027-01-11');
assert.equal(additions.at(-1)[0].slice(0, 10), '2027-05-17');
for (const month of ['2027-01', '2027-02', '2027-03', '2027-04', '2027-05']) {
  assert(additions.some(row => row[0].startsWith(month)), `${month} 仍應繼續擴充食材`);
}
// Added foods must enter regular meals too, rather than appear only in overview.
for (const row of additions) {
  const name = row[5].match(/首次候選：([^【；]+)/)[1];
  assert(foodPattern(name).test(row[2]), `${name} 必須出現在試新餐`);
  const observed = rows.filter(other => other[5].includes(`重複觀察候選：${name}`));
  assert.equal(observed.length, 2, `${name} 保留兩天重複觀察`);
}
assert(rows.some(row => row[0].startsWith('2027-05') && !/(?:首次|重複觀察)候選：/.test(row[5]) && /豬肉|小米|櫛瓜|藜麥/.test(row.slice(2, 5).join(' '))), '擴充食材應納入日常輪替');
console.log(`通過：${rows.length}天、100項候選＝3項起始＋57項已排＋40項待後續；六月齡兩餐、每餐兩樣、份量完整、平日首次、觀察間隔與過敏原複習。`);
