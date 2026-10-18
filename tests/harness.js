// 用 node vm 載入 index.html 的函式。用法：const {A,set,txt,out}=require('./harness')(path)
// pca-helper 有幾個 render 函式直接寫入 DOM（renderCalc、renderRisk、renderLocTab、renderAdv、renderDrugTab、renderStrip），
// 所以這裡提供最小的假 document：getElementById 回傳記錄 innerHTML 的物件，querySelectorAll 回傳空陣列。
// 不定義 window，init() 不會執行。
const fs=require('fs'),vm=require('vm'),path=require('path');
module.exports=function(file){
  file=file||path.join(__dirname,'..','index.html');
  const html=fs.readFileSync(file,'utf8');
  const js=html.match(/<script>([\s\S]*)<\/script>/)[1];
  const els={};
  const mk=id=>({id,innerHTML:"",textContent:"",value:"",style:{},dataset:{},classList:{add(){},remove(){},toggle(){},contains(){return false}},querySelectorAll(){return []},querySelector(){return null}});
  const document={getElementById:id=>els[id]||(els[id]=mk(id)),querySelectorAll:()=>[],querySelector:()=>null,activeElement:null,createTreeWalker:()=>({nextNode:()=>null})};
  const ctx={console,document}; vm.createContext(ctx);
  const names=[...js.matchAll(/^function ([A-Za-z0-9_]+)/gm)].map(m=>m[1]);
  vm.runInContext(js+"\n;this.__api={S0,get S(){return S},set S(v){S=v},get PSA_ROWS(){return PSA_ROWS},set PSA_ROWS(v){PSA_ROWS=v},REF,GLOSS,TABS,DRUGS,DCLS,BOOL_F,STR_F,INT_F,APP_VERSION,CHECKED,"+names.join(",")+"};",ctx);
  const A=ctx.__api;
  // set(欄位, PSA 序列 [[日期,值],…])
  const set=(o,rows)=>{ A.S=Object.assign(JSON.parse(JSON.stringify(A.S0)),o||{});
    A.PSA_ROWS=(rows&&rows.length?rows.map(([d,v])=>({d,v:String(v)})):[{d:"",v:""},{d:"",v:""},{d:"",v:""}]); };
  const out=id=>(els[id]?els[id].innerHTML:"");
  const reset=()=>{ for(const k in els) els[k].innerHTML=""; };
  const txt=h=>String(h).replace(/<(\d)/g,"&lt;$1").replace(/<[^>]+>/g," ").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&amp;/g,"&").replace(/\s+/g," ").trim();
  // 從 buildPanels() 抽出欄位規格：select → 選項值；checkbox → bool；其他 input → num（附分頁 id）
  const spec=()=>{ const P=A.buildPanels(), F={};
    for(const [tab,h] of Object.entries(P)){
      for(const m of h.matchAll(/<select[^>]*data-f="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g))
        F[m[1]]=F[m[1]]||{type:"sel",tab,opts:[...m[2].matchAll(/<option[^>]*value="([^"]*)"/g)].map(x=>x[1])};
      for(const m of h.matchAll(/<input[^>]*>/g)){ const f=(m[0].match(/data-f="([^"]+)"/)||[])[1]; if(!f||F[f]) continue;
        F[f]={type:/type="checkbox"/.test(m[0])?"bool":"num",tab}; }
    }
    return F; };
  // 模擬 readField：把 UI 上的字串值轉成 S 裡實際存的型別
  const conv=(f,v)=>{ if(A.BOOL_F.has(f)) return !!v; if(A.STR_F.has(f)) return String(v);
    if(A.INT_F.has(f)) return v===""?null:+v; if(v===""||v===null) return null; const n=+v; return isNaN(n)||(n<0&&f!=="m_t")?null:n; };
  // 依目前 S 跑完所有分頁與子模式（局部：初始／術後；晚期：mHSPC／nmCRPC／mCRPC），回傳 {輸出區 id: HTML}
  const OUT_IDS={calc:["r-psad","r-kin","r-ajcc","r-img","r-misc"],risk:["r-risk"],dx:["r-dx"],mon:["r-mon"],drug:["r-bsa","r-drugs"],strip:["strip"]};
  const runAll=()=>{ reset(); const R={}, s0=JSON.parse(JSON.stringify(A.S));
    const grab=ids=>ids.forEach(i=>R[i]=out(i));
    A.S.loc="init"; A.S.adv="mhspc"; A.renderAll(); Object.values(OUT_IDS).forEach(grab); grab(["r-loc","r-mhspc"]);
    A.S.loc="post"; A.renderLocTab(); grab(["r-post"]);
    A.S.adv="nmcrpc"; A.renderAdv(); grab(["r-nmcrpc","n-psadtSrc"]);
    A.S.adv="mcrpc"; A.renderAdv(); grab(["r-mcrpc"]);
    A.S=Object.assign(A.S,{loc:s0.loc,adv:s0.adv});
    return R; };
  return {A,set,txt,out,reset,spec,conv,runAll,html,js};
};
