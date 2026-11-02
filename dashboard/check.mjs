import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { buildData, buildAllergies, sentiment } from './build.mjs';

assert.equal(sentiment('吃得不是很好').score,-2,'否定句不能誤判成吃得好');
assert.equal(sentiment('未提供').score,null,'缺少回饋不能當負評');
assert.equal(sentiment('沒有吐出來').score,null,'吞嚥表現不等於喜歡');
assert.equal(sentiment('很喜歡，吃了好多口').score,5);
const metadata=JSON.parse(fs.readFileSync(new URL('./foods.json',import.meta.url),'utf8'));
const profile=JSON.parse(fs.readFileSync(new URL('../profile.json',import.meta.url),'utf8'));
const data=buildData(fileURLToPath(new URL('../logs/',import.meta.url)),metadata,profile);
assert.equal(data.foods.length,5);
assert.equal(data.logDates.length,3);
assert.equal(data.foods.find(f=>f.id==='rice').daysAtLeast,3,'歷史三天與單日日誌不重複相加');
assert.equal(data.foods.find(f=>f.id==='avocado').consecutiveDays,2);
assert.equal(data.foods.find(f=>f.id==='oats').textures[0],'未記錄','不依食物名稱推測質地');
assert.equal(data.foods.find(f=>f.id==='sweet-potato').attention,true);
assert.equal(data.foods.find(f=>f.id==='rice').score,null);
assert(data.foods.find(f=>f.id==='oats').score>data.foods.find(f=>f.id==='pumpkin').score);
assert.equal(data.allergies.confirmedCount,0,'一般想吐不會自動變成過敏紀錄');
const allergyMetadata=JSON.parse(fs.readFileSync(new URL('./allergies.json',import.meta.url),'utf8'));
assert.equal(buildAllergies(allergyMetadata,data.foods).confirmedCount,0);
const allergyFixture=buildAllergies({records:[
  {id:'one',foodId:'rice',date:'2026-10-30',symptoms:'測試症狀 A',status:'confirmed',confirmedBy:'測試確認依據'},
  {id:'two',foodId:'rice',date:'2026-11-02',symptoms:'測試症狀 B',status:'confirmed'},
  {id:'three',foodId:'oats',date:'2026-11-02',symptoms:'測試疑似症狀',status:'suspected'}
]},data.foods);
assert.equal(allergyFixture.confirmedCount,1,'同一食物多次事件只算一種');
assert.equal(allergyFixture.confirmed[0].events.length,2);
assert.equal(allergyFixture.confirmed[0].events[0].date,'2026-11-02');
assert.equal(allergyFixture.suspectedCount,1,'疑似與確認不混算');
const manyFoods=Array.from({length:12},(_,i)=>({id:`food-${i}`,name:`測試食物 ${i}`}));
const capped=buildAllergies({records:manyFoods.map((food,i)=>({id:`event-${i}`,foodId:food.id,date:`2026-10-${String(i+1).padStart(2,'0')}`,symptoms:'測試症狀',status:'confirmed'}))},manyFoods);
assert.equal(capped.confirmedCount,12);assert.equal(capped.confirmed.length,10);assert.equal(capped.confirmed[0].foodId,'food-11');
assert.throws(()=>buildAllergies({records:[{id:'invalid',foodId:'rice',date:'2026-11-02',symptoms:'測試',status:'unknown'}]},data.foods),/明確區分/);
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'nolan-dashboard-check-'));
try {
  const meal='| 未提供 | 酪梨 | 否 | 泥 | 已吃 | 很喜歡 | 未提供 |\n';
  fs.writeFileSync(path.join(temporary,'2026-10-30.md'),meal+meal);
  fs.writeFileSync(path.join(temporary,'2026-11-02.md'),meal);
  const fixture=buildData(temporary,metadata,profile).foods.find(f=>f.id==='avocado');
  assert.equal(fixture.observedDays,2,'同一天吃兩次只算一天');
  assert.equal(fixture.consecutiveDays,1,'跨過缺少紀錄的日期不算連續');
  fs.writeFileSync(path.join(temporary,'2026-11-03.md'),'| 未提供 | 未知新品 | 是 | 泥 | 少量 | 未提供 | 未提供 |\n');
  assert.throws(()=>buildData(temporary,metadata,profile),/未知食材/,'新食材必須先分類，不靜默漏掉');
} finally {
  for(const name of fs.readdirSync(temporary))fs.unlinkSync(path.join(temporary,name));
  fs.rmdirSync(temporary);
}
// 在不依賴瀏覽器的 DOM 介面替身上驗證渲染與事件；不取代視覺 QA。
const elements=new Map();
const element=id=>{
  if(!elements.has(id))elements.set(id,{value:id==='sort'?'default':'',hidden:id==='method',innerHTML:'',textContent:'',listeners:{},addEventListener(event,handler){this.listeners[event]=handler;},setAttribute(key,value){this[key]=value;},insertAdjacentHTML(_position,html){this.innerHTML+=html;},scrollIntoView(){}});
  return elements.get(id);
};
const context=vm.createContext({window:{FEEDING_DATA:data},document:{getElementById:element,querySelectorAll:()=>[]},matchMedia:()=>({matches:true})});
vm.runInContext(fs.readFileSync(new URL('./app.js',import.meta.url),'utf8'),context);
assert.equal((element('food-rows').innerHTML.match(/<tr>/g)||[]).length,5);
assert.equal((element('top-list').innerHTML.match(/<details /g)||[]).length,3);
assert.equal((element('bottom-list').innerHTML.match(/<details /g)||[]).length,1);
element('category-filter').value='蛋白質';element('category-filter').listeners.change();
assert.equal(element('food-rows').innerHTML,'');assert.equal(element('empty').hidden,false);
element('reset').listeners.click();assert.equal(element('empty').hidden,true);
element('search').value='地瓜';element('search').listeners.input();
assert.equal((element('food-rows').innerHTML.match(/<tr>/g)||[]).length,1);
assert(element('food-rows').innerHTML.includes('進食時一直想吐'));
element('reset').listeners.click();element('texture-filter').value='泥狀';element('texture-filter').listeners.change();
assert.equal((element('food-rows').innerHTML.match(/<tr>/g)||[]).length,2);
element('method-toggle').listeners.click();assert.equal(element('method').hidden,false);
element('reset').listeners.click();element('sort').value='liked';element('sort').listeners.change();
assert(element('food-rows').innerHTML.indexOf('寶寶燕麥')<element('food-rows').innerHTML.indexOf('地瓜'));
assert.equal(element('allergy-empty').hidden,false);
assert.equal(element('allergy-confirmed').hidden,true);
assert.equal(element('allergy-confirmed-rows').innerHTML,'');
assert.equal(element('allergy-suspected-rows').innerHTML,'');
elements.clear();
vm.runInContext(fs.readFileSync(new URL('./app.js',import.meta.url),'utf8'),vm.createContext({window:{FEEDING_DATA:{...data,allergies:allergyFixture}},document:{getElementById:element,querySelectorAll:()=>[]},matchMedia:()=>({matches:true})}));
assert.equal(element('allergy-empty').hidden,true);
assert.equal(element('allergy-confirmed').hidden,false);
assert.equal(element('allergy-suspected').hidden,false);
assert(element('allergy-confirmed-rows').innerHTML.includes('測試症狀 B'));
assert(!element('allergy-confirmed-rows').innerHTML.includes('測試疑似症狀'));
console.log('Dashboard checks passed: dates, history, sentiment, table rendering, search, filters, ranking and disclosure events. Browser visual QA remains separate.');
