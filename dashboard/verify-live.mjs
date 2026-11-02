import fs from 'node:fs';
import assert from 'node:assert/strict';

console.log('Ready for private read credential on stdin (hidden).');
const input=await new Promise(resolve=>{
  let value='';process.stdin.setRawMode?.(true);process.stdin.setEncoding('utf8');
  const handler=chunk=>{value+=chunk;if(/[\r\n]/.test(value)){process.stdin.off('data',handler);process.stdin.setRawMode?.(false);process.stdin.pause();resolve(JSON.parse(value));}};
  process.stdin.on('data',handler);process.stdin.resume();
});
const expected=JSON.parse(fs.readFileSync(new URL('./dist/data.json',import.meta.url),'utf8'));
const response=await fetch('https://nolan-food-journal.mattebee2.chatgpt.site/?verify='+Date.now(),{headers:{'OAI-Sites-Authorization':`Bearer ${input.token}`},redirect:'manual'});
assert.equal(response.status,200,'線上頁面需能正常讀取');
const html=await response.text();
const foodRows=html.match(/id="food-rows"[^>]*>([\s\S]*?)<\/tbody>/)?.[1]??'';
assert.equal((foodRows.match(/<tr>/g)||[]).length,expected.foods.length,'線上 HTML 必須直接包含全部食材列');
for(const food of expected.foods)assert(foodRows.includes(food.name),`線上缺少食材 ${food.id}`);
assert(!/id="stats"[^>]*>\s*<\/section>/.test(html),'線上統計不可空白');
assert(!/id="donut"[^>]*>\s*<\/div>/.test(html),'線上分類圖不可空白');
assert(html.includes('window.FEEDING_DATA = '),'線上必須內嵌互動資料');
if(expected.actualStartDate){
  const elapsed=(Date.parse(expected.asOf)-Date.parse(expected.actualStartDate))/86400000+1;
  assert(html.includes(`自 ${expected.actualStartDate} 起`),'線上實際起始日必須與日誌一致');
  assert(html.includes(`${elapsed}<small>天</small>`),'線上副食品天數必須更新');
}
assert(!html.includes('留下日誌的日子'),'不應再顯示日誌天數卡片');
const stats=html.match(/id="stats"[^>]*>([\s\S]*?)<\/section>/)?.[1]??'';
assert.equal((stats.match(/class="stat"/g)||[]).length,2,'首頁總覽只保留兩張卡片');
const tolerated=expected.foods.filter(f=>f.tolerance==='已確認耐受（家庭觀察）').length;
assert.equal((foodRows.match(/class="badge ">已確認耐受（家庭觀察）/g)||[]).length,tolerated,'食材耐受狀態需同步更新');
assert(!/<script[^>]*\bsrc=/.test(html),'線上不可依賴外部腳本載入資料');
const planningResponse=await fetch('https://nolan-food-journal.mattebee2.chatgpt.site/planning.html?verify='+Date.now(),{headers:{'OAI-Sites-Authorization':`Bearer ${input.token}`},redirect:'follow'});
assert.equal(planningResponse.status,200,'線上計畫頁需能正常讀取');
const planningHtml=await planningResponse.text();
assert(planningHtml.includes('id="gantt"'),'線上計畫頁必須包含質地甘特圖');
assert((planningHtml.match(/class="gantt-row/g)||[]).length>=4,'質地甘特圖必須包含四個階段');
assert(planningHtml.includes('牛奶')||planningHtml.includes('母乳'),'線上計畫頁必須說明奶類安排');
assert(planningHtml.includes('本期共排入'),'線上計畫進度必須顯示整體排程分母');
console.log(JSON.stringify({status:response.status,planningStatus:planningResponse.status,foodRows:expected.foods.length,startDate:expected.actualStartDate,logDays:expected.logDates.length,statisticsPresent:true,chartPresent:true,planningGanttRows:(planningHtml.match(/class="gantt-row/g)||[]).length,embeddedData:true,externalAppScripts:0}));
