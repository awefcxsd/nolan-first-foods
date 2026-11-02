'use strict';
const data=window.FEEDING_DATA;
const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const colors={'蛋白質':'#b5beb6','蔬菜':'#7a9970','碳水':'#d8b98a','脂肪':'#bd7857','水果':'#d69b98','待分類':'#adb5b7'};
const short=d=>d.slice(5).replace('-','/');
const dateNumber=d=>Date.parse(`${d}T00:00:00Z`);
function ageAt(birth,at){const b=new Date(`${birth}T00:00:00Z`),a=new Date(`${at}T00:00:00Z`);let months=(a.getUTCFullYear()-b.getUTCFullYear())*12+a.getUTCMonth()-b.getUTCMonth();if(a.getUTCDate()<b.getUTCDate())months--;const base=new Date(b);base.setUTCMonth(base.getUTCMonth()+months);return `${months} 個月 ${Math.round((a-base)/86400000)} 天`;}
const familyTolerated=data.foods.filter(f=>f.tolerance.startsWith('已確認')).length;
const knownStart=[data.firstLogDate,data.baselineReportedAt].filter(Boolean).sort()[0];
const elapsed=Math.round((dateNumber(data.asOf)-dateNumber(data.actualStartDate||knownStart))/86400000)+1;
const scoreLabel=f=>f.score===null?'尚無偏好訊號':f.score>=3?'很喜歡':f.score>0?'吃得不錯':f.score<0?'接受度較低':'回饋混合';
const scoreClass=f=>f.score===null?'gray':f.score<0?'warm':'';
$('age').textContent=`Nolan · ${ageAt(data.birthDate,data.asOf)}`;
$('updated').textContent=`紀錄更新至 ${data.asOf.replaceAll('-',' / ')}`;
$('footer-date').textContent=data.asOf;
const stats=[
  ['副食品探索',`<small>${data.actualStartDate?'第':'至少第'}</small>${elapsed}<small>天</small>`,data.actualStartDate?`自 ${data.actualStartDate} 起`:`${short(knownStart)} 已回報吃過副食品<br>實際首次日期待補，非精確起始天數`],
  ['已嘗試的不同食材',`${data.foods.length}<small>種</small>`,'同一食材不同做法只計一次'],
  ['已確認耐受 · 家庭觀察',`${familyTolerated}<small>種</small>`,'含家長補充的三天試吃<br>地瓜另保留最新不適觀察'],
  ['留下日誌的日子',`${data.logDates.length}<small>天</small>`,'未記錄的日子不視為沒有進食']
];
$('stats').innerHTML=stats.map(([label,value,note])=>`<article class="stat"><p class="stat-label">${label}</p><p class="stat-value">${value}</p><p class="stat-note">${note}</p></article>`).join('');
const counts=data.categoryOrder.map(name=>({name,count:data.foods.filter(f=>f.category===name).length}));
let offset=0;
const rings=counts.filter(c=>c.count).map(c=>{const length=c.count/data.foods.length*100;const ring=`<circle cx="50" cy="50" r="40" fill="none" stroke="${colors[c.name]}" stroke-width="10" pathLength="100" stroke-dasharray="${length} ${100-length}" stroke-dashoffset="${-offset}"/>`;offset+=length;return ring;}).join('');
$('donut').innerHTML=`<div class="donut" role="img" aria-label="${esc(counts.map(c=>`${c.name} ${c.count} 種`).join('，'))}"><svg viewBox="0 0 100 100" aria-hidden="true">${rings}</svg><div class="donut-center"><strong>${data.foods.length}</strong><span>種食材的探索</span></div></div>`;
$('categories').innerHTML=counts.filter(c=>c.count||['蛋白質','蔬菜','碳水','脂肪'].includes(c.name)).map(c=>`<button class="category" data-category="${c.name}" ${c.count?'':'disabled'}><span class="dot" style="background:${colors[c.name]}"></span><span>${c.name}</span><strong>${c.count}</strong><span class="bar"><span style="width:${c.count/data.foods.length*100}%;background:${colors[c.name]}"></span></span></button>`).join('');
const baseline=data.foods.filter(f=>f.baseline);
const events=[{date:short(data.baselineReportedAt),title:'最初回報的滋味',note:`${baseline.map(f=>f.name).join('、')}已吃過；首次日期待補`,count:baseline.length}];
let total=data.foods.filter(f=>f.baseline).length;
for(const date of data.logDates){const introduced=data.foods.filter(f=>!f.baseline&&f.dates[0]===date);if(introduced.length){total+=introduced.length;events.push({date:short(date),title:`${introduced.map(f=>f.icon+' '+f.name).join('、')}`,note:'新增實吃回報',count:total});}}
$('timeline').innerHTML=events.map(e=>`<div class="timeline-row"><span class="timeline-date">${esc(e.date)}</span><span class="timeline-dot"></span><div><p class="timeline-title">${esc(e.title)}<span>${e.count} 種</span></p><p class="timeline-note">${esc(e.note)}</p></div></div>`).join('');
$('method').textContent=data.method+' 明確喜歡 +3、吃得好 +2、多口 +2、幾乎吃完 +2、主動張嘴 +1、接受度較低 −2，同餐合計限制在 −5～+5。分數只是排序線索，不是精準量表；每項顯示有偏好訊號的回饋天數，少量回饋的排序仍可能變動。分類與原文可在詳細表核對。';
$('method-toggle').addEventListener('click',()=>{const open=$('method').hidden;$('method').hidden=!open;$('method-toggle').setAttribute('aria-expanded',String(open));});
function ranking(list,container,kind){$(container).innerHTML=list.length?list.map((f,i)=>`<details class="rank-entry"><summary><span class="rank-number">${String(list.findIndex(other=>Math.abs(other.score-f.score)<0.0001)+1).padStart(2,'0')}</span><span class="food-icon" aria-hidden="true">${f.icon}</span><div class="rank-main"><strong>${esc(f.name)}</strong><p>${f.feedbackDays} 天偏好回饋 · ${esc(f.evidence.at(-1)?.cues.map(c=>c.label).join('、'))}</p></div><span class="badge ${scoreClass(f)}">${scoreLabel(f)}</span></summary><div class="evidence"><b>語意線索分數 ${f.score.toFixed(1)} / 5 · ${f.feedbackDays} 天回饋</b>${f.evidence.map(e=>`<blockquote><strong>${short(e.date)}</strong>「${esc(e.quote)}」<br>${esc(e.cues.map(c=>`${c.label} ${c.weight>0?'+':''}${c.weight}`).join(' · '))}</blockquote>`).join('')}${f.attention?'<p>另有進食不適紀錄，請查看下方詳細表。</p>':''}</div></details>`).join(''):'<p class="empty">目前還沒有這類偏好回饋。</p>';$(container).insertAdjacentHTML('beforeend',`<p class="rank-caption">目前 ${list.length} 種有${kind}回饋，不補滿名額。</p>`);}
const top=data.foods.filter(f=>f.score>0).sort((a,b)=>b.score-a.score).slice(0,10);
const bottom=data.foods.filter(f=>f.score<0).sort((a,b)=>a.score-b.score).slice(0,10);
ranking(top,'top-list','正向');ranking(bottom,'bottom-list','接受度較低的');
$('category-filter').insertAdjacentHTML('beforeend',counts.map(c=>`<option value="${c.name}">${c.name}（${c.count}）</option>`).join(''));
function renderTable(){const category=$('category-filter').value,query=$('search').value.trim().toLowerCase(),texture=$('texture-filter').value,sort=$('sort').value;let foods=data.foods.filter(f=>(!category||f.category===category)&&(!texture||f.textures.includes(texture))&&(!query||JSON.stringify(f).toLowerCase().includes(query)));
  if(sort==='days')foods.sort((a,b)=>b.daysAtLeast-a.daysAtLeast);if(sort==='liked')foods.sort((a,b)=>(b.score??-Infinity)-(a.score??-Infinity));if(sort==='least')foods.sort((a,b)=>(a.score??Infinity)-(b.score??Infinity));
  $('table-count').textContent=`${foods.length} / ${data.foods.length} 種食材`;$('empty').hidden=foods.length>0;
  $('food-rows').innerHTML=foods.map(f=>`<tr><td><span class="food-name"><span aria-hidden="true">${f.icon}</span>${esc(f.name)}</span><span class="cell-sub">${esc(f.category)}</span></td><td><span class="days">${f.confirmedDays?'至少 ':''}${f.daysAtLeast}<small> 天</small></span><span class="cell-sub">已確認最長連續 ${f.consecutiveDays} 天<br>有日期日誌 ${f.observedDays} 天<br>${f.dates.map(short).join('、')}${f.confirmedDays?'<br>另含家長補充，日期待補':''}</span></td><td>${f.textures.map(t=>`<span class="badge ${t==='未記錄'?'gray':''}">${esc(t)}</span>`).join(' ')}<span class="cell-sub">${esc(f.latest?.texture||'未提供')}</span></td><td><span class="badge ${scoreClass(f)}">${scoreLabel(f)}</span><p class="cell-text">${esc(f.latest?.interest||'未提供')}</p><span class="cell-sub">${f.feedbackDays?`${f.feedbackDays} 天偏好回饋 · ${f.score.toFixed(1)} / 5`:'缺少明確偏好回饋，未評分'}</span></td><td><span class="badge ${f.tolerance.startsWith('已確認')?'':'gray'}">${esc(f.tolerance)}</span><p class="cell-text">${esc(f.latest?.reaction||'未提供')}</p>${f.attention?'<p class="attention">需追蹤：進食時一直想吐，原因未確認</p>':''}<span class="cell-sub">${esc(f.note)}</span></td></tr>`).join('');
}
for(const id of ['search','category-filter','texture-filter','sort'])$(id).addEventListener(id==='search'?'input':'change',renderTable);
$('reset').addEventListener('click',()=>{for(const id of ['search','category-filter','texture-filter'])$(id).value='';$('sort').value='default';renderTable();});
document.querySelectorAll('[data-category]').forEach(b=>b.addEventListener('click',()=>{$('category-filter').value=b.dataset.category;renderTable();$('foods').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}));
renderTable();

function renderAllergies() {
  const allergies=data.allergies??{confirmedCount:0,suspectedCount:0,confirmed:[],suspected:[]};
  $('allergy-reviewed').textContent=allergies.lastReviewed?`最後回報 ${allergies.lastReviewed}`:'';
  $('allergy-summary').innerHTML=`<span><strong>${allergies.confirmedCount}</strong> 種已確認過敏食物</span><span><strong>${allergies.suspectedCount}</strong> 種疑似反應待確認</span>`;
  $('allergy-empty').hidden=allergies.confirmedCount+allergies.suspectedCount>0;
  for (const status of ['confirmed','suspected']) {
    const groups=allergies[status];
    $(`allergy-${status}`).hidden=groups.length===0;
    $(`allergy-${status}-rows`).innerHTML=groups.map(group=>`<tr><td><span class="food-name">${esc(group.icon)} ${esc(group.foodName)}</span><span class="cell-sub">${group.events.length} 次相關回報</span></td><td>${group.events.map(event=>`<p class="cell-text"><strong>${esc(event.date)}</strong> · ${esc(event.symptoms)}${event.onset?`<br>出現時間：${esc(event.onset)}`:''}</p>`).join('')}</td><td><span class="badge ${status==='suspected'?'warm':''}">${status==='confirmed'?'已確認過敏':'疑似，待確認'}</span>${group.events.map(event=>`<p class="cell-text">${esc(event.confirmedBy||'確認依據未提供')}${event.note?`<br>${esc(event.note)}`:''}</p>`).join('')}</td></tr>`).join('');
  }
}
renderAllergies();
