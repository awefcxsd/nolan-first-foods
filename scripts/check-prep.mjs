import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const cells = line => line.split('|').slice(1, -1).map(cell => cell.trim());
const names = read('plans/overview.md').split('\n').filter(line => /^\| \d+ \|/.test(line)).map(line => cells(line)[1]);
const pattern = name => ({ 米: /白米粥/, 梨: /(?<!酪)梨/, 雞肉: /(?<!火)雞肉/, 地瓜: /地瓜(?!葉)/ }[name] ?? new RegExp(name));
const daily = fs.readdirSync(path.join(root, 'plans')).filter(file => /^\d{4}-\d{2}\.md$/.test(file)).sort().flatMap(file => read(`plans/${file}`).split('\n').filter(line => /^\| \d{4}-/.test(line)).map(cells));
const expected = new Map();
for (const row of daily) for (let meal = 1; meal <= 3; meal++) {
  if (row[meal + 1].startsWith('不安排副食品')) continue;
  for (const name of names.filter(name => pattern(name).test(row[meal + 1]))) expected.set(`${row[0].slice(0, 10)}/${meal}/${name}`, row[5].includes(`候選：${name}`));
}
const files = fs.readdirSync(path.join(root, 'prep')).filter(file => /^\d{4}-\d{2}-\d{2}\.md$/.test(file)).sort();
assert.equal(files.length, 30);
const seen = new Set(), dates = new Set();
let sessions = 0;
for (const file of files) {
  const doc = read(`prep/${file}`);
  const headings = doc.split('\n').filter(line => /^## \d{4}-/.test(line));
  assert(headings.length >= 1 && headings.length <= 2);
  sessions += headings.length;
  let prepDate;
  for (const line of doc.split('\n')) {
    const heading = line.match(/^## (\d{4}-\d{2}-\d{2})/);
    if (heading) {
      prepDate = heading[1];
      if (prepDate !== '2026-10-29') assert([0, 3].includes(new Date(prepDate).getUTCDay()));
    }
    if (/^\| \d{4}-/.test(line)) {
      const date = cells(line)[0].slice(0, 10);
      assert(!dates.has(date)); dates.add(date); assert(prepDate < date);
    }
    if (!line.startsWith('| [ ] ')) continue;
    const row = cells(line), name = row[0].slice(4).trim(), frozen = row.length === 7;
    assert(names.includes(name), `未知食材：${name}`);
    const uses = [...row[frozen ? 4 : 3].matchAll(/(\d{2}-\d{2})餐([123])(＊?)/g)];
    assert(uses.length);
    for (const use of uses) {
      let date = `${prepDate.slice(0, 4)}-${use[1]}`;
      if (date < prepDate) date = `${Number(prepDate.slice(0, 4)) + 1}-${use[1]}`;
      const key = `${date}/${use[2]}/${name}`;
      assert(expected.has(key), `備餐混入非當餐食材：${key}`);
      assert(!seen.has(key), `備餐重複：${key}`);
      assert.equal(Boolean(use[3]), expected.get(key), `試味標示：${key}`);
      seen.add(key);
    }
    if (frozen) {
      assert(!['全熟蛋', '原味優格', '含鐵嬰兒燕麥', '花生', '芝麻', '杏仁', '酪梨', '香蕉'].includes(name));
      const regular = uses.filter(use => !use[3]).length, trial = uses.length - regular;
      assert(row[3].includes(`10mL×${regular}＋5mL×${trial}＝約${regular * 10 + trial * 5}mL`));
      assert(doc.includes(`${prepDate}-${name}`));
    }
  }
}
assert.equal(sessions, 59); assert.equal(dates.size, 204); assert.equal(seen.size, expected.size);
console.log(`通過：30週、59批、204天，${seen.size}次食材用途逐項吻合；分裝估量、試味標示、標籤與現調分流完整。`);
