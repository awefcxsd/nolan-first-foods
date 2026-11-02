'use strict';
(()=>{
const data=window.FEEDING_DATA,p=data.planning,$=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=s=>new Date(`${s}T00:00:00`);
const short=s=>s.slice(5).replace('-','/');
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const days=(a,b)=>Math.round((Date.parse(b+'T00:00:00Z')-Date.parse(a+'T00:00:00Z'))/86400000);
const pct=(a,b,x)=>100*clamp((days(a,x)+1)/(days(a,b)+1),0,1);
const months=['10月','11月','12月','1月','2月','3月','4月','5月'];
const monthStarts=['2026-10-21','2026-11-01','2026-12-01','2027-01-01','2027-02-01','2027-03-01','2027-04-01','2027-05-01'];
const foodDone=p.plannedFoods.filter(f=>f.actualDate).length;
const dateControl=$('as-of');dateControl.value=p.referenceDate;
$('plan-today').textContent=`${p.referenceDate} · Nolan ${data.name}`;
const fieldReady=p.readinessConfirmed?'已確認':'準備度待確認';
$('plan-stats').innerHTML=[['計畫區間',`${short(p.start)} — ${short(p.end)}`,'歷史開始日加上既有排程範圍'],['排入本期',`${p.plannedFoods.length} 種`,'另有候選種類留待後續'],['已實際引入',`${foodDone} / ${p.plannedFoods.length} 種`,'按首次實吃日去重'],['發展準備度',fieldReady,'進階質地依能力確認']].map(([a,b,c])=>`<article class="plan-stat"><span>${esc(a)}</span><strong>${esc(b)}</strong><small>${esc(c)}</small></article>`).join('');
$('progress-start').textContent=short(p.start)+' 起';$('progress-end').textContent=short(p.end)+' 目標窗末';
function update(){
 const selected=dateControl.value||p.referenceDate;
 const timeline=clamp(pct(p.start,p.end,selected),0,100),calendarDone=selected>=p.end,calendarPct=Math.round(timeline);
 const actualAsOf=p.plannedFoods.filter(f=>f.actualDate&&f.actualDate<=data.asOf).length;
 const coverage=Math.round(actualAsOf/p.plannedFoods.length*100);
 $('progress-fill').style.width=`${calendarPct}%`;$('progress-fill').setAttribute('aria-valuenow',String(calendarPct));
 $('progress-caption').textContent=`截至 ${selected}：日曆已走過 ${calendarPct}% · 本期共排入 ${p.plannedFoods.length} 種 · 已記錄 ${actualAsOf} 種首次嘗試（${coverage}%）。這是排程對照，尚不代表質地或餐次里程碑完成。`;
 $('milestone-chips').innerHTML=`<span>${selected<p.start?'尚未進入計畫窗口':calendarDone?'已到計畫範圍末段':'進行中'} · ${short(selected)}</span><span>${foodDone} / ${p.plannedFoods.length} 項有實際首次日期</span><span>${fieldReady}</span>`;
 $('gantt').innerHTML=`<div class="gantt-axis"><div class="axis-label">練習階段</div><div class="axis-track">${months.map((m,i)=>`<span style="left:${pct(p.start,p.end,monthStarts[i])}%">${m}</span>`).join('')}</div></div>`+p.textures.map(t=>{
  const left=pct(p.start,p.end,t.start),right=pct(p.start,p.end,t.end),active=selected>=t.start&&selected<=t.end;
  const observed=t.id==='puree'&&data.foods.some(f=>f.textures.includes('泥狀'));
  return `<div class="gantt-row ${active?'in-window':''}"><div class="gantt-label"><strong>${esc(t.name)}</strong><span>${esc(t.focus)}</span></div><div class="axis-track row-track"><span class="month-grid">${months.map((m,i)=>`<i style="left:${pct(p.start,p.end,monthStarts[i])}%"></i>`).join('')}</span><span class="gantt-bar" style="left:${left}%;width:${Math.max(2,right-left)}%;background:${t.color}" title="${short(t.start)}–${short(t.end)}">${short(t.start)} — ${short(t.end)}</span>${active?`<i class="today-line" style="left:${timeline}%"></i>`:''}</div><div class="gantt-detail"><span>${active?'目前日期落在這個練習窗口':selected<t.start?'接續練習':'日期窗口已過'} · ${observed?'有泥狀實吃紀錄':'尚無可對應的質地紀錄'}</span><span>${esc(t.gate)}</span><span>例：${esc(t.example)}</span></div></div>`;
 }).join('');
 const activeVolume=p.volume.find(v=>selected>=v.start&&selected<=v.end);
 $('volume-rows').innerHTML=p.volume.map(v=>`<tr class="${v===activeVolume?'current-row':''}"><td>${short(v.start)}–${short(v.end)}${v===activeVolume?'<span class="current-pill">選定日</span>':''}</td><td>${esc(v.age)}</td><td>${esc(v.meals)}</td><td><strong>${esc(v.portion)}</strong><span class="cell-sub">每日算例：${esc(v.daily)}</span></td><td>${esc(v.note)}</td></tr>`).join('');
 $('volume-summary').innerHTML=`<div class="volume-active"><span class="micro">${activeVolume?'選定日期所在階段':'日期早於份量計畫'}</span><strong>${activeVolume?esc(activeVolume.age):'—'}</strong><span>${activeVolume?esc(activeVolume.meals):'查看日期前的歷史紀錄'}</span><b>${activeVolume?esc(activeVolume.daily):''}</b></div><div class="volume-glyph" aria-hidden="true"><span>少量</span><i></i><span>按食慾漸增</span><i></i><span>三餐並行</span></div>`;
 $('milk-title').textContent=p.milk.title;$('milk-copy').textContent=p.milk.text;$('milk-gate').textContent=p.milk.gate;$('milk-after').textContent=p.milk.afterYear;
 const dateFoodCount=new Map();for(const f of p.plannedFoods)if(f.plannedDate){const m=f.plannedDate.slice(0,7);dateFoodCount.set(m,(dateFoodCount.get(m)||0)+1);}
 $('monthly-milestones').innerHTML=p.monthly.map(m=>{
   const start=m.month+'-'+(m.month.endsWith('10')?'21':'01');
   const ends={'2026-10':'2026-10-31','2026-11':'2026-11-30','2026-12':'2026-12-31','2027-01':'2027-01-31','2027-02':'2027-02-28','2027-03':'2027-03-31','2027-04':'2027-04-30','2027-05':p.end};
   const monthlyTarget=m.cumulative;
   const actualBy= p.plannedFoods.filter(f=>f.actualDate&&f.actualDate<=data.asOf&&f.actualDate.slice(0,7)<=m.month).length;
   const isSelected=selected.slice(0,7)===m.month;
   const passed=selected>ends[m.month];
   return `<article class="month-card ${isSelected?'month-current':''} ${passed?'month-passed':''}"><div class="month-top"><strong>${m.month}</strong><span>${passed?'日期已過':isSelected?'目前月份':'計畫節點'}</span></div><p><b>+${m.newCandidates}</b> 種候選</p><div class="mini-track"><i style="width:${Math.min(100,actualBy/Math.max(1,monthlyTarget)*100)}%"></i></div><small>規劃累計 ${monthlyTarget} 種 · 已記錄 ${actualBy} 種</small><details><summary>查看本月種類</summary><p>${esc(m.foods.join('、'))||'無新候選'}</p></details></article>`;
 }).join('');
 $('food-plan-count').textContent=`本期排程 ${p.plannedFoods.length} 種 · 庫中另有 ${p.deferred} 種待後續`;
 const upcoming=p.plannedFoods.filter(f=>f.plannedDate>selected&&!f.actualDate).slice(0,6);
 $('next-foods').innerHTML=upcoming.length?upcoming.map(f=>`<span class="next-chip"><time>${short(f.plannedDate)}</time><b>${esc(f.name)}</b><small>${esc(f.category)}${f.allergen!=='—'?' · 過敏原候選':''}</small></span>`).join(''):`<p class="empty">所選日期之後沒有待首次引入候選。</p>`;
 const dayOptions=p.daily.map(d=>`<option value="${d.date}" ${d.date===selected?'selected':''}>${d.date}</option>`).join('');
 $('menu-date').innerHTML=dayOptions;
 const chosen=p.daily.find(d=>d.date===($('menu-date').value||selected))||p.daily.find(d=>d.date>=selected)||p.daily.at(-1);
 $('daily-menu').innerHTML=chosen?`<div class="menu-date-title"><strong>${chosen.date}</strong><span>${esc(chosen.amount)}</span></div>${chosen.meals.filter(x=>x&&x!=='—').map((meal,i)=>`<article><span>餐次 ${i+1}</span><p>${esc(meal)}</p></article>`).join('')}<p class="muted">${esc(chosen.candidate)}</p>`:'';
 $('plan-today').textContent=`選定 ${selected} · Nolan ${data.name}`;
}
dateControl.addEventListener('change',()=>{update();$('menu-date').value=dateControl.value;});
$('today-button').addEventListener('click',()=>{dateControl.value=p.referenceDate;update();});
$('menu-date').addEventListener('change',()=>{const chosen=p.daily.find(d=>d.date===$('menu-date').value);if(chosen){dateControl.value=chosen.date;update();$('menu-date').value=chosen.date;}});
$('source-links').innerHTML=p.sources.map(s=>`<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)} ↗</a>`).join('');
update();
})();
