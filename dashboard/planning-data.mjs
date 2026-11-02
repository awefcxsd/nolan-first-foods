import fs from 'node:fs';
import path from 'node:path';

export const daysBetween=(start,end)=>Math.round((Date.parse(end+'T00:00:00Z')-Date.parse(start+'T00:00:00Z'))/86400000);
export const progressAt=(start,end,date)=>Math.min(1,Math.max(0,(daysBetween(start,date)+1)/(daysBetween(start,end)+1)));
const sources=[
  {title:'NHS：約六個月起步與質地',url:'https://www.nhs.uk/best-start-in-life/baby/weaning/what-to-feed-your-baby/from-around-6-months/'},
  {title:'NHS：7–9 個月，逐步三餐與奶類並行',url:'https://www.nhs.uk/best-start-in-life/baby/weaning/what-to-feed-your-baby/7-to-9-months/'},
  {title:'NHS：10–12 個月，軟碎與手指食物',url:'https://www.nhs.uk/best-start-in-life/baby/weaning/what-to-feed-your-baby/10-to-12-months/'},
  {title:'CDC：6–12 個月的母乳餵養',url:'https://www.cdc.gov/infant-toddler-nutrition/breastfeeding/how-much-and-how-often.html'}
];

export function buildPlanning(root,data,profile){
  const overview=fs.readFileSync(path.join(root,'plans/overview.md'),'utf8');
  const rows=overview.split('\n').filter(l=>/^\| \d+ \|/.test(l)).map(l=>l.split('|').slice(1,-1).map(c=>c.trim()));
  const ids={'米':'rice','南瓜':'pumpkin','地瓜':'sweet-potato','酪梨':'avocado','含鐵嬰兒燕麥':'oats'};
  const scheduled=rows.map(row=>{
    const actual=data.foods.find(f=>f.id===ids[row[1]]);
    const plannedDate=/^\d{4}-\d{2}-\d{2}$/.test(row[5])?row[5]:actual?.firstTriedDate;
    return {name:row[1],category:row[2],allergen:row[3],plannedDate:plannedDate??null,actualDate:actual?.dates[0]??null};
  }).filter(food=>food.plannedDate);
  const monthly=overview.split('\n').filter(l=>/^\| \d{4}-\d{2} \|/.test(l)).map(l=>{
    const [month,added,cumulative]=l.split('|').slice(1,-1).map(c=>c.trim());
    return {month,newCandidates:Number(added),cumulative:Number(cumulative),foods:scheduled.filter(f=>f.plannedDate.startsWith(month)).map(f=>f.name)};
  });
  const daily=fs.readdirSync(path.join(root,'plans')).filter(n=>/^\d{4}-\d{2}\.md$/.test(n)).sort().flatMap(name=>fs.readFileSync(path.join(root,'plans',name),'utf8').split('\n').filter(l=>/^\| \d{4}-\d{2}-\d{2}/.test(l)).map(l=>{
    const c=l.split('|').slice(1,-1).map(s=>s.trim());
    return {date:c[0].slice(0,10),meals:c.slice(2,5),candidate:c[5],amount:c[8]};
  }));
  const calendarParts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const parts=Object.fromEntries(calendarParts.map(p=>[p.type,p.value]));
  return {
    start:data.actualStartDate??profile.planStartDate,end:daily.at(-1)?.date??'2027-05-21',referenceDate:`${parts.year}-${parts.month}-${parts.day}`,checkedDate:'2026-11-02',scheduleStart:profile.planStartDate,readinessConfirmed:profile.readinessConfirmed,
    plannedFoods:scheduled,monthly,daily,candidateLibrary:rows.length,deferred:rows.length-scheduled.length,sources,
    textures:[
      {id:'puree',name:'泥狀／滑順軟食',start:'2026-10-21',end:'2026-12-21',color:'#78956f',focus:'起步練習',example:'細緻南瓜泥、燕麥糊、細磨肉泥',gate:'這是已開始的歷史階段；六個月前的提前試吃仍須確認準備度與兒科建議。細泥可繼續搭配其他質地，不是到期就禁用。'},
      {id:'lumps',name:'叉壓泥／柔軟顆粒',start:'2026-11-22',end:'2027-01-21',color:'#d1ae75',focus:'約 6–7 個月',example:'叉壓南瓜、熟軟碎食',gate:'能穩定坐好並控制頭頸、處理當前食物，再逐步加入柔軟顆粒；持續難吞嚥時先評估，不按日曆硬升級。'},
      {id:'finger',name:'軟手指食物',start:'2026-11-22',end:'2027-03-21',color:'#ba7858',focus:'約 6 個月起可並行',example:'適合抓握、可壓爛的熟軟蔬菜條',gate:'具備進食準備度、能抓取並處理適合形狀的軟食時可開始；不必等顆粒階段結束，成人全程看顧。'},
      {id:'family',name:'軟碎家庭食物',start:'2027-02-22',end:'2027-05-21',color:'#728d9c',focus:'約 9–11 個月的重點',example:'細切軟菜、去刺魚、軟碎肉',gate:'從已能處理的軟度逐步細切；此處「固體」仍是可壓爛的軟食，不代表硬塊或成人硬食。'}
    ],
    volume:[
      {start:'2026-10-21',end:'2026-11-21',age:'未滿 6 個月',meals:'白天少量 1 次',portion:'少量試味，確切 mL 未記錄',daily:'不設定每日配額',note:'先前已開始的實際歷程；奶類照常，不依此減奶。提前引入的適合性與準備度待確認。'},
      {start:'2026-11-22',end:'2026-12-21',age:'6 個月',meals:'家庭計畫每天 2 餐，循序建立',portion:'起始每餐 15–30 mL，仍餓可續添',daily:'兩餐各 15–30 時：30–60 mL',note:'這是家庭起始提供量，不是上限或必吃量；兩樣食材合計。'},
      {start:'2026-12-22',end:'2027-01-21',age:'7 個月',meals:'從 2 餐逐步到 3 餐',portion:'已舒服吃到 60 mL／餐時，第三餐先 15–30 mL',daily:'兩餐 60＋第三餐 15–30：135–150 mL',note:'家庭備餐算例；若三餐各 60，合計 180 mL。先看實際能力與食慾。'},
      {start:'2027-01-22',end:'2027-02-21',age:'8 個月',meals:'逐步穩定 3 餐',portion:'例如從 60 增至 90 mL／餐',daily:'三餐各 60–90 時：180–270 mL',note:'可視食慾再增加；不是必須在這個月達標，也不靠加水增加數字。'},
      {start:'2027-02-22',end:'2027-03-21',age:'9 個月',meals:'3 個主要餐次',portion:'約半杯（120–125 mL）作備餐參考',daily:'三餐都約半杯時：360–375 mL',note:'家庭算例，實吃可多可少；不把 mL 換算成要減的奶量。'},
      {start:'2027-03-22',end:'2027-05-21',age:'10–11 個月',meals:'3 餐，與奶類並行',portion:'依食慾、生長與營養密度調整',daily:'不設個人固定總量',note:'朝家庭軟食與自主進食發展，沒有固定生日加量規則。'}
    ],
    milk:{title:'先建立正餐，奶類繼續按需提供',reviewStart:'2026-12-22',reviewEnd:'2027-03-21',text:'7–9 個月（12/22–3/21）的目標是逐步建立三餐，並觀察奶量是否自然改變；10–12 個月仍是三餐加奶。現有資料沒有奶量、體重與生長曲線，因此不設定「哪一天取消一整餐母奶」。',gate:'穩定吃多樣正餐、進食舒適、生長與奶量適合時，再與兒科／營養專業人員討論某次奶是否需要調整。餐量達到 60、90 或 120 mL，都不等於可以直接減掉一餐奶。',afterYear:'一歲生日為 2027-05-22，是後續飲食安排的檢視點，不是必須停母乳的日期。'}
  };
}
