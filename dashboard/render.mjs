import vm from 'node:vm';

const escape = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// Render the trusted application at build time. No browser or external assets
// are needed to read the resulting dashboard; JS only adds interactions.
function locate(html,id) {
  const open=new RegExp(`<([a-z][a-z0-9-]*)\\b[^>]*\\bid="${id}"[^>]*>`,'i').exec(html);
  if(!open)throw new Error(`Missing dashboard element: ${id}`);
  const start=open.index,contentStart=start+open[0].length;
  if(['input','img','br','hr','meta','link'].includes(open[1])) return {start,contentStart,end:contentStart,contentEnd:contentStart,open:open[0]};
  const tags=new RegExp(`</?${open[1]}\\b[^>]*>`,'gi');tags.lastIndex=contentStart;
  let depth=1,tag;
  while((tag=tags.exec(html))){depth+=tag[0].startsWith('</')?-1:1;if(!depth)return {start,contentStart,contentEnd:tag.index,end:tags.lastIndex,open:open[0]};}
  throw new Error(`Unclosed dashboard element: ${id}`);
}

export function renderDashboard(template,app,data) {
  const nodes=new Map();
  const getElementById=id=>{
    if(nodes.has(id))return nodes.get(id).element;
    const range=locate(template,id);
    const state={html:template.slice(range.contentStart,range.contentEnd),hidden:/\shidden(?:\s|>|=)/.test(range.open),attributes:{}};
    const element={value:id==='sort'?'default':'',style:{},addEventListener(){},scrollIntoView(){},setAttribute(key,value){state.attributes[key]=value;},insertAdjacentHTML(position,html){if(position!=='beforeend')throw new Error('Unsupported insertion');this.innerHTML+=html;}};
    Object.defineProperties(element,{
      innerHTML:{get:()=>state.html,set:value=>{state.html=value;state.htmlChanged=true;}},
      textContent:{get:()=>state.text,set:value=>{state.text=value;state.textChanged=true;}},
      hidden:{get:()=>state.hidden,set:value=>{state.hidden=value;state.hiddenChanged=true;}}
    });
    nodes.set(id,{state,element});return element;
  };
  vm.runInNewContext(app,{window:{FEEDING_DATA:data},document:{getElementById,querySelectorAll:()=>[]},matchMedia:()=>({matches:true})},{timeout:3000});
  let html=template;
  for(const [id,{state}] of nodes){
    const range=locate(html,id);
    let open=range.open;
    if(state.hiddenChanged){open=open.replace(/\shidden(?:="[^"]*")?/g,'');if(state.hidden)open=open.slice(0,-1)+' hidden>';}
    for(const [key,value] of Object.entries(state.attributes)){open=open.replace(new RegExp(`\\s${key}="[^"]*"`,'g'),'');open=open.slice(0,-1)+` ${key}="${escape(value)}">`;}
    const body=state.textChanged?escape(state.text):state.htmlChanged?state.html:html.slice(range.contentStart,range.contentEnd);
    html=html.slice(0,range.start)+open+body+html.slice(range.contentEnd);
  }
  return html;
}
