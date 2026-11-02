import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const categories = ['蛋白質', '蔬菜', '碳水', '脂肪', '水果', '待分類'];
const day = 86400000;
const dateNumber = d => Date.parse(`${d}T00:00:00Z`);
const unknown = /^(未提供|待補|未記錄)/;

// 可重現的中文語意線索歸納，非機器學習模型或臨床評分。
// 每個訊號同餐只計一次；只分析食量及興趣欄，不把想吐、過敏或吞嚥當成偏好。
export function sentiment(text) {
  const cues = [
    [/很喜歡|很喜欢|非常喜歡|非常喜欢|很愛吃|很爱吃/, 3, '明確表達喜歡'],
    [/吃得不是很好|吃得不太好|不喜歡|不喜欢|拒吃|不願意吃|不愿意吃/, -2, '接受度較低'],
    [/吃得挺好|吃得很好|吃得不錯|吃得不错/, 2, '吃得好'],
    [/好多口|很多口|吃了很多/, 2, '吃了多口'],
    [/幾乎吃完|几乎吃完|全部吃完/, 2, '大部分吃完'],
    [/越來越會張開嘴|越来越会张开嘴|主動張嘴|主动张嘴/, 1, '主動張嘴']
  ];
  const evidence = cues.filter(([re]) => re.test(text)).map(([, weight, label]) => ({weight, label}));
  return {score:evidence.length ? Math.max(-5, Math.min(5, evidence.reduce((sum,x)=>sum+x.weight,0))) : null, evidence};
}

function texture(raw) {
  if (unknown.test(raw)) return '未記錄';
  if (/顆粒|颗粒/.test(raw)) return '顆粒狀';
  if (/手指|固體|固体|塊狀|块状/.test(raw)) return '軟固體';
  if (/泥/.test(raw)) return '泥狀';
  if (/粥/.test(raw)) return '粥狀';
  if (/糊/.test(raw)) return '糊狀';
  return '未記錄';
}
function streak(dates) {
  let best=0, current=0, prior;
  for (const date of dates) {const n=dateNumber(date);current=n-prior===day?current+1:1;best=Math.max(best,current);prior=n;}
  return best;
}

export function buildAllergies(metadata = {records:[]}, foods = []) {
  const seen = new Set();
  const records = (metadata.records ?? []).map(record => {
    if (!record.id || seen.has(record.id)) throw new Error('過敏事件需有不重複的 id');
    seen.add(record.id);
    const food = foods.find(f => f.id === record.foodId);
    if (!food) throw new Error(`過敏紀錄的食材不存在：${record.foodId}`);
    if (!['confirmed','suspected'].includes(record.status)) throw new Error('過敏紀錄需明確區分 confirmed 或 suspected');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(record.date) || !Number.isFinite(dateNumber(record.date))) throw new Error('過敏紀錄需提供有效日期');
    if (!record.symptoms?.trim()) throw new Error('過敏紀錄需提供原始症狀描述');
    return {...record,foodName:food.name,icon:food.icon};
  });
  const group = status => {
    const foods = new Map();
    for (const event of records.filter(r=>r.status===status).sort((a,b)=>b.date.localeCompare(a.date))) {
      if (!foods.has(event.foodId)) foods.set(event.foodId,{foodId:event.foodId,foodName:event.foodName,icon:event.icon,status,latestDate:event.date,events:[]});
      foods.get(event.foodId).events.push(event);
    }
    return [...foods.values()];
  };
  const confirmed = group('confirmed');
  const suspected = group('suspected');
  return {lastReviewed:metadata.lastReviewed??null,summary:metadata.summary??'',confirmedCount:confirmed.length,suspectedCount:suspected.length,confirmed:confirmed.slice(0,10),suspected:suspected.slice(0,10)};
}

export function buildData(logDirectory, metadata, profile, allergyMetadata) {
  const files=fs.readdirSync(logDirectory).filter(n=>/^\d{4}-\d{2}-\d{2}\.md$/.test(n)).sort();
  const observations=[];
  for(const file of files) {
    const date=file.slice(0,10);
    for(const line of fs.readFileSync(path.join(logDirectory,file),'utf8').split('\n')) {
      if(!line.startsWith('|')) continue;
      const cells=line.split('|').slice(1,-1).map(x=>x.trim());
      if(cells.length!==7 || cells[0]==='時間' || cells.every(x=>/^[- :]*$/.test(x))) continue;
      if(cells.every(x=>!x)) continue;
      const food=metadata.foods.find(f=>f.aliases.some(alias=>cells[1].includes(alias)));
      if(!food) throw new Error(`未知食材：${cells[1]}（${file}）。請先在 dashboard/foods.json 新增分類與別名。`);
      const preference=sentiment(`${cells[4]}；${cells[5]}`);
      observations.push({foodId:food.id,date,ingredients:cells[1],texture:cells[3],textureGroup:texture(cells[3]),amount:cells[4],interest:cells[5],reaction:cells[6],...preference});
    }
  }
  const lastDate=files.at(-1)?.slice(0,10)??metadata.baselineReportedAt;
  const foods=metadata.foods.map(f=>{
    const entries=observations.filter(o=>o.foodId===f.id);
    const dates=[...new Set(entries.map(o=>o.date))].sort();
    const rated=entries.filter(o=>o.score!==null);
    const weighted=rated.map(o=>({...o,weight:1/(1+(dateNumber(lastDate)-dateNumber(o.date))/day/30)}));
    const score=rated.length?weighted.reduce((sum,o)=>sum+o.score*o.weight,0)/weighted.reduce((sum,o)=>sum+o.weight,0):null;
    const latest=entries.at(-1);
    return {...f,entries,dates,observedDays:dates.length,daysAtLeast:Math.max(dates.length,f.confirmedDays??0),consecutiveDays:Math.max(streak(dates),f.confirmedConsecutiveDays??0),score,feedbackDays:new Set(rated.map(o=>o.date)).size,evidence:rated.map(o=>({date:o.date,quote:`${o.amount}；${o.interest}`,cues:o.evidence})),textures:[...new Set(entries.map(o=>o.textureGroup))],latest,attention:entries.some(o=>/想吐|嘔吐|呕吐|嗆咳|呛咳/.test(o.reaction)&&!/^未提供/.test(o.reaction))};
  }).filter(f=>f.baseline||f.entries.length);
  return {name:profile.name,birthDate:profile.birthDate,actualStartDate:metadata.actualStartDate,baselineReportedAt:metadata.baselineReportedAt,firstLogDate:files[0]?.slice(0,10)??null,asOf:lastDate,logDates:files.map(n=>n.slice(0,10)),categoryOrder:categories,foods,observations,allergies:buildAllergies(allergyMetadata,foods),method:'以中文語意線索歸納每日食量與興趣，分數 -5～+5；近 30 天回饋權重較高。同餐同一訊號只計一次，再取加權平均；無偏好訊號不計分。反應欄不參與喜好分數。'};
}

export function writeDashboard() {
  const metadata=JSON.parse(fs.readFileSync(path.join(here,'foods.json'),'utf8'));
  const profile=JSON.parse(fs.readFileSync(path.join(here,'../profile.json'),'utf8'));
  const allergyMetadata=JSON.parse(fs.readFileSync(path.join(here,'allergies.json'),'utf8'));
  const data=buildData(path.join(here,'../logs'),metadata,profile,allergyMetadata);
  fs.mkdirSync(path.join(here,'dist'),{recursive:true});
  for(const name of ['index.html','app.js','style.css']) fs.copyFileSync(path.join(here,name),path.join(here,'dist',name));
  fs.writeFileSync(path.join(here,'dist','data.js'),`window.FEEDING_DATA = ${JSON.stringify(data,null,2).replaceAll('<','\\u003c')};\n`);
  fs.writeFileSync(path.join(here,'dist','data.json'),JSON.stringify(data,null,2)+'\n');
  const standalone=fs.readFileSync(path.join(here,'index.html'),'utf8')
    .replace('<link rel="stylesheet" href="style.css">',`<style>${fs.readFileSync(path.join(here,'style.css'),'utf8')}</style>`)
    .replace('<script defer src="data.js"></script><script defer src="app.js"></script>','')
    .replace('</body>',`<script>${fs.readFileSync(path.join(here,'dist','data.js'),'utf8')}</script><script>${fs.readFileSync(path.join(here,'app.js'),'utf8')}</script></body>`);
  fs.writeFileSync(path.join(here,'dashboard.html'),standalone.replace(/[ \t]+$/gm,''));
  console.log(`Dashboard：${data.asOf}，${data.foods.length} 種食材，${data.logDates.length} 天日誌。`);
  return data;
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) writeDashboard();
