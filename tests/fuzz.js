// 組合模擬（00 第八節第 2 點）。node tests/fuzz.js [index.html] [--mod=risk,mcrpc,…] [--n=3000] [--seed=1]
// 模組：all（全頁隨機，查 undefined／NaN／例外與步驟編號）、risk（窮舉，單調性與定義）、mhspc、nmcrpc、mcrpc、mon
// 只印失敗摘要；失敗依「規則＋訊息」分組，每組附一個重現用的輸入。
const {A,set,txt,spec,conv,runAll}=require('./harness')((process.argv[2]&&!process.argv[2].startsWith("--"))?process.argv[2]:undefined);
const arg=k=>{const a=process.argv.find(x=>x.startsWith("--"+k+"="));return a?a.split("=")[1]:null;};
const MODS=(arg("mod")||"all,risk,mhspc,nmcrpc,mcrpc,mon").split(",");
const N=+(arg("n")||3000);
let seed=+(arg("seed")||1); const rnd=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;}; // 可重現
const pick=a=>a[Math.floor(rnd()*a.length)];
const F=spec();
const BAD=/\bundefined\b|\bNaN\b|\[object|Infinity|\bnull\b/;
const fails=[]; let n=0;
const fail=(mod,o,msg)=>fails.push([mod,o,msg]);

// 數字欄位的取值（含切點兩側與缺值）
const NUMV={psa:[null,0.5,2.9,3,4,6,9.9,10,15,19.9,20,20.1,30,100],fpsa:[null,0.1,0.5,1.5],testo:[null,10,49,50,300],
  vl:[null,3,4.5,6],vw:[null,3,4.5,6],vh:[null,3,4.5,6],vol:[null,20,40,80],age:[null,45,55,65,75,85],
  pos:[null,0,2,6,12],tot:[null,6,12,14],g45:[null,0,2,5],b_psa:[null,0.05,0.1,0.2,0.5,2,5],psadt:[null,3,6,9,10,10.1,12,15,30],
  b_nn:[null,0,1,4],b_mo:[null,6,18,36,60],h_bone:[null,0,1,3,4,6,10],c_doccyc:[null,1,2,6,10],m_t:[null,-3,-2.5,-1.5,0],
  wt:[null,50,70,90],ht:[null,150,170]};
const RISE=[["2026-01-10",2.1],["2026-04-10",3.0],["2026-07-10",4.4]], SLOW=[["2025-01-10",2.0],["2026-01-10",2.6]];
function randState(tabs){ const o={};
  for(const [f,v] of Object.entries(F)){ if(tabs&&!tabs.includes(v.tab)) continue;
    o[f]= v.type==="sel"? conv(f,pick(v.opts)) : v.type==="bool"? rnd()<.3 : pick(NUMV[f]||[null,1,5,20]); }
  if(o.g45!=null && o.pos!=null && o.g45>o.pos) o.g45=o.pos;      // GG4–5 針數不超過陽性針數
  if(o.pos!=null && o.tot!=null && o.pos>o.tot) o.pos=o.tot;
  return o; }
const rows=()=>pick([null,null,RISE,SLOW]);

// 卡片與步驟解析
const cards=h=>[...String(h).matchAll(/<div class="opt ([a-z ]*)"><div class="opt-h"><b>([^<]*)/g)].map(m=>({cls:m[1].trim(),t:m[2]}));
const pref=(h,re)=>cards(h).filter(c=>c.cls==="pref"&&re.test(c.t)).map(c=>c.t);
function stepSeq(h){ // 數字步驟須 1、2、3… 連續；字母區段須 A、B、C… 連續；「!」（停止條件）與「↳」（子步驟）不編號，略過
  const s=[...String(h).matchAll(/class="st-n">([^<]*)</g)].map(m=>m[1]).filter(x=>x!=="!"&&x!=="↳"); if(!s.length) return "";
  const num=s.filter(x=>/^\d+$/.test(x)).map(Number), let_=s.filter(x=>/^[A-Z]$/.test(x));
  if(num.some((x,i)=>x!==i+1)) return "步驟編號不連續："+num.join(",");
  if(let_.some((x,i)=>x!==String.fromCharCode(65+i))) return "步驟字母跳號："+let_.join(",");
  return ""; }
const badIn=(mod,o,id,h)=>{ const m=txt(h).match(new RegExp(".{0,30}("+BAD.source+").{0,30}")); if(m) fail(mod,o,id+" BAD「"+m[0]+"」"); };
const OWN={mhspc:["r-mhspc"],nmcrpc:["r-nmcrpc","n-psadtSrc"],mcrpc:["r-mcrpc"],mon:["r-mon"]};
const tryRun=(mod,o,r)=>{ set(o,r); let R; try{ n++; R=runAll(); }catch(e){ fail(mod,o,"EXC "+e.message); return null; }
  for(const id of OWN[mod]||[]) badIn(mod,o,id,R[id]); return R; };

/* ---------- all：全頁隨機 ---------- */
if(MODS.includes("all")) for(let i=0;i<N;i++){
  const o=randState(); o.dflt=pick(Object.keys(A.DCLS)); const r=rows(); const R=tryRun("all",o,r); if(!R) continue;
  for(const [id,h] of Object.entries(R)){ badIn("all",o,id,h); const s=stepSeq(h); if(s) fail("all",o,id+" "+s); }
}

/* ---------- risk：窮舉，比對定義與單調性 ---------- */
if(MODS.includes("risk")){
  const RANK=g=>{ if(!g) return null; g=g.replace(/（暫定）/,"");
    if(/^Very high/.test(g)) return 4; if(/^Locally advanced/.test(g)) return 3.5; if(/^High/.test(g)) return 3;
    if(/Unfavou?rable/.test(g)) return 2; if(/^Intermediate$/.test(g)) return 1.5; if(/Favou?rable/.test(g)) return 1; if(/^Low/.test(g)) return 0; return null; };
  const AJ=["I","IIA","IIB","IIC","IIIA","IIIB","IIIC"];
  const SYS={NCCN:()=>RANK(A.riskNCCN().g),EAU:()=>RANK(A.riskEAU().g),AUA:()=>RANK(A.riskAUA().g),DAmico:()=>RANK(A.riskDamico().g),
    CAPRA:()=>{const c=A.capra(); return c.score;}, AJCC:()=>{const a=A.ajcc(); return a.st?AJ.indexOf(a.st):null;}};
  const PSA=[0.5,4,9.9,10,15,19.9,20,20.1,30,39.9,40,100], CT=["T1c","T2a","T2b","T2c","T3a","T3b","T4"];
  const GL=[[3,3],[3,4],[4,3],[4,4],[3,5],[5,3],[4,5],[5,4],[5,5]]; const PT=[[1,12],[5,12],[6,12],[10,12]];
  const gg=(p,s)=>{const t=p+s; return t<=6?1:t===7?(p===3?2:3):t===8?4:5;};
  const val=o=>{ set(o); const v={}; for(const [k,f] of Object.entries(SYS)) v[k]=f(); return v; };
  const mono=(lab,a,b,o,skip)=>{ for(const k of Object.keys(SYS)){ if(skip&&skip.includes(k)) continue;
    if(a[k]!=null&&b[k]!=null&&b[k]<a[k]) fail("risk",o,`${k} 不單調：${lab} 升高後分組下降`); } };
  for(const psa of PSA) for(const ct of CT) for(const [p1,p2] of GL) for(const [pos,tot] of PT){
    const o={psa,ct,p1,p2,pos,tot,age:66,cn:"N0",cm:"M0"}; const v=val(o); n++;
    // CAPRA：分數＝各項加總、0–10、組別與分數區間一致
    set(o); const c=A.capra();
    if(c.score!=null){ const sum=c.parts.reduce((s,x)=>s+(+x.split(" ").pop()),0);
      if(sum!==c.score||c.score<0||c.score>10) fail("risk",o,"CAPRA 分數與各項加總不符");
      const band=c.score<=2?"Low":c.score<=5?"Intermediate":"High"; if(!c.g.startsWith(band)) fail("risk",o,"CAPRA 組別與分數不符"); }
    // 單調：PSA、cT、陽性針比例
    const ip=PSA.indexOf(psa); if(ip<PSA.length-1) mono("PSA",v,val({...o,psa:PSA[ip+1]}),o);
    const ic=CT.indexOf(ct); if(ic<CT.length-1) mono("cT",v,val({...o,ct:CT[ic+1]}),o);
    const it=PT.findIndex(x=>x[0]===pos); if(it<PT.length-1) mono("陽性針比例",v,val({...o,pos:PT[it+1][0],tot:PT[it+1][1]}),o);
    // 單調：GG（CAPRA 依 primary／secondary pattern 計分、NCCN 的 primary pattern 5 屬 very high，兩者依定義不單調，排除）
    for(const [q1,q2] of GL) if(gg(q1,q2)>gg(p1,p2)){ const w=val({...o,p1:q1,p2:q2}); mono("GG",v,w,o,["CAPRA"]); }
    // NCCN v1.2027 PROS-2：VHR＝cT3–T4、GG4–5、PSA ≥40 中 ≥2 項；High＝cT3–T4、GG4–5、PSA >20 任一且非 VHR
    { const G=gg(p1,p2), t34=CT.indexOf(ct)>=4, nv=(t34?1:0)+(G>=4?1:0)+(psa>=40?1:0), hi=t34||G>=4||psa>20;
      set(o); const ng=(A.riskNCCN().g||"").replace(/（暫定）/,"");
      const exp = nv>=2? "Very high" : hi? "High" : null;
      if(exp && ng!==exp) fail("risk",o,`NCCN 應為 ${exp}，實得 ${ng}`);
      if(!exp && /^(High|Very high)/.test(ng)) fail("risk",o,`NCCN 不應為 ${ng}`); }
  }
  // N1／M1：局限性系統不可給 Low／Intermediate
  for(const [cn,cm] of [["N1","M0"],["N0","M1a"],["N1","M1c"]]){ set({psa:4,ct:"T1c",p1:3,p2:3,pos:1,tot:12,age:60,cn,cm}); n++;
    for(const [k,f] of Object.entries({NCCN:A.riskNCCN,EAU:A.riskEAU,AUA:A.riskAUA})){ const g=f().g||""; if(/^(Low|Intermediate)/.test(g)) fail("risk",{cn,cm},k+" 在 "+cn+cm+" 仍給 "+g); } }
}

/* ---------- mHSPC：前提條件 ---------- */
if(MODS.includes("mhspc")) for(let i=0;i<N;i++){
  const o=randState(["adv","risk"]); o.cm=pick(["M1a","M1b","M1c"]); o.adv="mhspc"; const R=tryRun("mhspc",o); if(!R) continue; const h=R["r-mhspc"];
  if(o.h_fit==="n" && pref(h,/docetaxel/i).length) fail("mhspc",o,"不適合 docetaxel 仍以含 docetaxel 為首選："+pref(h,/docetaxel/i)[0]);
  const highVol = o.h_visc==="y" || (o.h_bone!=null && o.h_bone>=4 && o.h_out==="y");
  if((o.h_time!=="sync"||highVol) && pref(h,/prostate EBRT/).length) fail("mhspc",o,"非同時性或高轉移量仍建議 prostate EBRT");
  if(cards(h).some(c=>c.cls==="pref") && cards(h).filter(c=>c.cls==="pref").some(c=>cards(h).some(d=>d.cls==="no"&&d.t===c.t))) fail("mhspc",o,"同一方案同時為首選與不建議");
}

/* ---------- nmCRPC：前提條件與互斥 ---------- */
if(MODS.includes("nmcrpc")) for(let i=0;i<N;i++){
  const o=randState(["adv"]); o.adv="nmcrpc"; const r=rows(); const R=tryRun("nmcrpc",o,r); if(!R) continue; const h=R["r-nmcrpc"];
  const arpi=pref(h,/ARPI/).length>0, obs=pref(h,/觀察/).length>0;
  if(arpi&&obs) fail("nmcrpc",o,"「ADT＋ARPI」與「觀察」同時為首選");
  if(o.n_castr==="n" && arpi) fail("nmcrpc",o,"睪固酮未達去勢（非 CRPC）仍以 ADT＋ARPI 為首選");
  if(o.n_ci==="n" && arpi) fail("nmcrpc",o,"傳統影像已見轉移（屬 mCRPC）仍以 nmCRPC 的 ADT＋ARPI 為首選");
  if((o.n_castr==="n"||o.n_ci==="n") && cards(h).length) fail("nmcrpc",o,"前提不符（未去勢或已見轉移）仍顯示治療卡");
  const dt=A.S.psadt; if(dt!=null){ if(dt<=10&&obs) fail("nmcrpc",o,"PSADT ≤10 卻建議觀察"); if(dt>10&&arpi) fail("nmcrpc",o,"PSADT >10 卻建議 ARPI"); }
}

/* ---------- mCRPC：已用過的治療不再為首選；不適合化療不推化療 ---------- */
if(MODS.includes("mcrpc")) for(let i=0;i<N;i++){
  const o=randState(["adv","risk"]); o.cm=pick(["M1a","M1b","M1c"]); o.adv="mcrpc"; const R=tryRun("mcrpc",o); if(!R) continue; const h=R["r-mcrpc"];
  const used=[[o.c_arpi&&o.c_arpi!=="none",/ADT ＋ ARPI|PARPi ＋ ARPI/,"ARPI 一線"],[o.c_doc==="y",/^Docetaxel ＋/,"docetaxel"],
    [o.c_cabazi,/^Cabazitaxel/,"cabazitaxel"],[o.c_lu,/Lu-PSMA/,"Lu-PSMA"],[o.c_parp,/Olaparib|PARPi/,"PARPi"],[o.c_ra,/Radium/,"radium-223"]];
  for(const [u,re,lab] of used) if(u && pref(h,re).length) fail("mcrpc",o,"已用過 "+lab+" 仍列為首選："+pref(h,re)[0]);
  if(o.c_fit==="n" && pref(h,/Docetaxel|Cabazitaxel/).length) fail("mcrpc",o,"不適合化療仍以化療為首選");
  if(o.c_psma!=="pos" && pref(h,/Lu-PSMA/).length) fail("mcrpc",o,"PSMA PET 非陽性仍以 Lu-PSMA 為首選");
}

/* ---------- 監測 ---------- */
if(MODS.includes("mon")) for(let i=0;i<Math.min(N,1500);i++){
  const o=randState(["mon","drug"]); const R=tryRun("mon",o); if(!R) continue; const t=txt(R["r-mon"]);
  if(!t) fail("mon",o,"監測頁空白（無內容也無提示）");
  { const L=[...R["r-mon"].matchAll(/class="st-n">([^<]*)</g)].map(m=>m[1]).join(""); if(L!=="ABCDEFGH".slice(0,L.length)) fail("mon",o,"步驟字母不連續："+L); }
  if(o.m_adt&&o.m_adt!=="none"&&!o.m_long&&/長期 ADT：先做 DXA/.test(t)) fail("mon",o,"未勾長期 ADT 卻顯示「長期 ADT：先做 DXA」");
  if((!o.m_adt||o.m_adt==="none") && !o.m_long && /長期 ADT：先做 DXA/.test(t)) fail("mon",o,"未用 ADT 卻顯示「長期 ADT：先做 DXA」");
}

// 輸出
const by={}; for(const f of fails){const k=f[0]+" | "+f[2].slice(0,110);(by[k]=by[k]||[]).push(f[1]);}
console.log("FUZZ "+MODS.join(",")+"：TOTAL "+n+"  FAILS "+fails.length+(fails.length?"（"+Object.keys(by).length+" 類）":""));
for(const [k,v] of Object.entries(by)) console.log("  "+v.length+"× "+k+"\n     e.g. "+JSON.stringify(Object.fromEntries(Object.entries(v[0]).filter(([,x])=>x!==null&&x!==""&&x!==false))).slice(0,300));
process.exitCode=fails.length?1:0;
