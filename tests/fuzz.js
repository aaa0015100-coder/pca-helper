// 組合模擬（00 第八節第 2 點）。node tests/fuzz.js [index.html] [--mod=risk,mcrpc,…] [--n=3000] [--seed=1]
// 模組：all（全頁隨機，查 undefined／NaN／例外與步驟編號）、risk（窮舉，單調性與定義）、mhspc、nmcrpc、mcrpc、mon、cc（目前結論卡）、phi
// 只印失敗摘要；失敗依「規則＋訊息」分組，每組附一個重現用的輸入。
const {A,set,txt,out,spec,conv,runAll}=require('./harness')((process.argv[2]&&!process.argv[2].startsWith("--"))?process.argv[2]:undefined);
const arg=k=>{const a=process.argv.find(x=>x.startsWith("--"+k+"="));return a?a.split("=")[1]:null;};
const MODS=(arg("mod")||"all,risk,mhspc,nmcrpc,mcrpc,mon,cc,phi").split(",");
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
  wt:[null,50,70,90],ht:[null,150,170],p2psa:[null,5,12,20,40],phi:[null,15,20.5,21,26.9,27,29.9,30,30.1,35.9,36,39.9,40,54.9,55,80]};
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

/* ---------- cc：目前結論卡只摘錄頁面輸出（v1.6） ---------- */
if(MODS.includes("cc")) for(let i=0;i<N;i++){
  const o=randState(); if(rnd()<.3) o.cm=pick(["M1a","M1b","M1c"]); const r=rows(); set(o,r); n++;
  const MODES=[["dx",null],["risk",null],["loc","init"],["loc","post"],["adv","mhspc"],["adv","nmcrpc"],["adv","mcrpc"],["mon",null]];
  let R; try{ R=runAll(); }catch(e){ fail("cc",o,"EXC "+e.message); continue; }
  for(const [tab,sub] of MODES){
    if(tab==="loc"){ A.S.loc=sub; A.renderLocTab(); } if(tab==="adv"){ A.S.adv=sub; A.renderAdv(); }
    const cid={dx:"r-dx",risk:"r-risk",mon:"r-mon",loc:sub==="post"?"r-post":"r-loc",adv:"r-"+sub}[tab];
    const lab=tab+(sub?"/"+sub:"");
    let D; try{ D=A.ccData(tab); }catch(e){ fail("cc",o,lab+" EXC "+e.message); continue; }
    const H=JSON.stringify(D); const m=txt(D.map(([k,it])=>k+" "+it.map(x=>x.h).join(" ")).join(" ")).match(new RegExp(".{0,30}("+BAD.source+").{0,30}"));
    if(m) fail("cc",o,lab+" BAD「"+m[0]+"」");
    if(!D.length) fail("cc",o,lab+" 結論卡空白");
    // 跳轉目標存在
    for(const [,it] of D) for(const x of it){ if(!x.go) continue; const [c,kind,ix]=x.go.split("|"); if(c==="pin") continue;
      const h=out(c); if(kind==="c"){ continue; }
      const cnt=(h.match(new RegExp('<div class="'+{step:"step ",opt:"opt ",alert:"alert "}[kind],"g"))||[]).length;
      if(+ix>=cnt){ fail("cc",o,`${lab} 跳轉目標不存在：${x.go}（只有 ${cnt} 個）`); continue; }
      // 跳轉目標須是被摘錄的那一段（標題對得上）
      const it=txt(x.h);
      if(kind==="opt"){ const t=[...h.matchAll(/<div class="opt [a-z ]*"><div class="opt-h"><b>([\s\S]*?)<\/b>/g)].map(m=>txt(m[1]))[+ix]; if(!it.startsWith(t)) fail("cc",o,`${lab} 首選跳轉到別張卡：「${it.slice(0,30)}」→「${t.slice(0,30)}」`); }
      if(kind==="step"&&!/^另 /.test(it)){ const t=[...h.matchAll(/<span class="st-t">([\s\S]*?)<\/span>/g)].map(m=>txt(m[1]))[+ix]; if(!it.includes(t)) fail("cc",o,`${lab} 步驟跳轉到別一步：「${it.slice(0,30)}」→「${t}」`); }
      if(kind==="alert"){ const t=[...h.matchAll(/<div class="alert a-[a-z]+">([\s\S]*?)<\/div>/g)].map(m=>txt(m[1].replace(/<button[^>]*class="src"[\s\S]*?<\/button>/g,"")))[+ix]; if(!t.replace(/\s/g,"").startsWith(it.replace(/…$/,"").replace(/\s/g,""))) fail("cc",o,`${lab} 提醒跳轉到別則：「${it.slice(0,30)}」→「${t.slice(0,30)}」`); } }
    const h=out(cid), row=k=>(D.find(x=>x[0]===k)||[null,[]])[1];
    // 首選：與頁面 .opt.pref 標題完全一致（loc/init、adv）
    if(tab==="adv"||(tab==="loc"&&sub==="init")){ const want=[...h.matchAll(/<div class="opt pref"><div class="opt-h"><b>([\s\S]*?)<\/b>/g)].map(m=>txt(m[1])).join("｜");
      const got=row("首選").map(x=>txt(x.h).replace(/ 指引不一致.*$| 健保.*$/,"")).join("｜");
      if(want!==got) fail("cc",o,`${lab} 首選不一致：頁面「${want.slice(0,80)}」結論卡「${got.slice(0,80)}」`); }
    // 分組：與風險函式一致
    if(tab==="risk"||(tab==="loc"&&sub==="init")){ const g=row("分組").map(x=>txt(x.h)).join("｜");
      for(const [k,f] of [["NCCN",A.riskNCCN],["EAU",A.riskEAU],["AUA/ASTRO",A.riskAUA]]){ const v=f().g;
        if(tab==="loc" && /請見「晚期治療」|後顯示/.test(txt(h))) continue;
        if(v && !g.includes(k+" "+v)) fail("cc",o,`${lab} 分組缺 ${k} ${v}`); if(!v && g.includes(k+" ")) fail("cc",o,`${lab} ${k} 無分組卻列出`); }
      if(tab==="risk"){ const a=A.ajcc(); if(a.st && !g.includes("AJCC Stage "+a.st)) fail("cc",o,"AJCC 分期未摘錄"); } }
    // 步驟：與頁面步驟數一致（最多 5 項＋「另 n 項」）
    if(["dx","mon"].includes(tab)||(tab==="loc"&&sub==="post")){ const ns=(h.match(/<div class="step /g)||[]).length, it=row("步驟");
      const exp= ns>5? 6 : ns; if(it.length!==exp) fail("cc",o,`${lab} 步驟數 ${it.length}，頁面 ${ns}`); }
    // 注意：頁面非 info 提醒都列出（步驟頁只算步驟之前的提醒）
    { const hh=(["dx","mon"].includes(tab)||(tab==="loc"&&sub==="post"))? h.replace(/<div class="step [\s\S]*$/,"") : h;
      const na=(hh.match(/<div class="alert a-(warn|bad)">/g)||[]).length; if(row("注意").length!==na) fail("cc",o,`${lab} 注意 ${row("注意").length} 項，頁面 ${na} 項`); }
  }
}

/* ---------- phi：計算、各來源判讀、健保逐項、不改變診斷流程（v1.7） ---------- */
if(MODS.includes("phi")) for(let i=0;i<N;i++){
  const o=randState(["dx","calc","risk"]); if(rnd()<.5) o.psaRep=true; n++;
  set(o); let R; try{ R=runAll(); }catch(e){ fail("phi",o,"EXC "+e.message); continue; }
  const h=R["r-phi"], t=txt(h), dx=R["r-dx"];
  badIn("phi",o,"r-phi",h);
  const p2=o.p2psa, f=o.fpsa, ps=o.psa;
  const calc=(p2!=null&&f>0&&ps>0)? p2/f*Math.sqrt(ps) : null;
  const c=A.phiCalc(); if((c===null)!==(calc===null) || (c!==null && Math.abs(c-calc)>1e-9)) fail("phi",o,`計算錯誤：${c} vs ${calc}`);
  const v=o.phi!=null? o.phi : calc;
  if(A.phiV()!==v && !(v==null&&A.phiV()==null)) fail("phi",o,"未以報告值優先");
  if(v!=null){
    if(v<30 && !/<30 低風險/.test(t)) fail("phi",o,"PHI <30 未標健保低風險"); if(v>=30 && /<30 低風險/.test(t)) fail("phi",o,"PHI ≥30 卻標低風險");
    const eauTag=(h.match(/EAU 2026<\/th><td><span class="tag [^"]*">([^<]*)</)||[])[1]; if(eauTag!==(v>30?">30":"≤30")) fail("phi",o,`EAU 標籤 ${eauTag}（PHI ${v}）`);
    const hl=[...h.matchAll(/<span class="tag t-info" style="margin-right:6px">([^：<]*)：/g)].map(m=>m[1]);
    const ifu = v<21?"0–21":v<40?"21–40":"40+", f12 = v<27?"0–26.9":v<36?"27.0–35.9":v<55?"36.0–54.9":"≥55.0";
    const in410 = ps!=null && ps>=4 && ps<=10;
    const exp = in410? [ifu,f12] : [ifu];
    if(hl.join("|")!==exp.join("|")) fail("phi",o,`分級標示 ${hl.join("|")}，應為 ${exp.join("|")}`);
    // 超出驗證範圍提醒
    const need=[]; if(ps!=null&&(ps<2||ps>10)) need.push("不在仿單適用範圍"); else if(ps!=null&&ps<4) need.push("2012 FDA 核准範圍");
    if(o.ct&&o.ct!=="T1c") need.push("DRE 異常"); if(o.ari) need.push("5-ARI"); if(o.uti) need.push("近期感染"); if(o.age!=null&&o.age<50) need.push("驗證族群為 ≥50 歲");
    for(const k of need) if(!t.includes(k)) fail("phi",o,"缺提醒："+k);
    if(!need.length && /超出驗證範圍/.test(t) && !(calc!=null&&o.phi!=null)) fail("phi",o,"無條件卻出現超出範圍提醒");
    // 診斷流程有顯示 PHI（流程未停在「輸入 PSA 與 DRE」時）
    if(!/輸入 PSA 與 DRE 後顯示/.test(txt(dx)) && !/PHI [\d.]/.test(txt(dx))) fail("phi",o,"診斷流程未顯示 PHI");
  }
  // 健保逐項
  const it=[ ps==null?null:(ps>=4&&ps<=10), o.uti?false:null, !o.ct?null:o.ct==="T1c", o.age==null?null:(o.age>=50||!!o.fhx) ];
  const head = it.includes(false)? "✘ 不符" : it.includes(null)? "待確認" : "✔ 符合";
  if(!t.includes(head+" 適應症")) fail("phi",o,`健保判定應為 ${head}`);
  // PHI 不改變診斷流程：拿掉 PHI 相關欄位後，步驟標題、類型、主文相同
  const steps=x=>[...x.matchAll(/<div class="step ([a-z-]+)"><div class="st-h"><span class="st-n">([^<]*)<\/span><span class="st-t">([^<]*)<\/span><\/div>\s*<div class="st-c">([\s\S]*?)<\/div>/g)].map(m=>m.slice(1).join("|")).join("\n");
  set(Object.assign({},o,{phi:null,p2psa:null})); const R0=runAll();
  if(steps(R0["r-dx"])!==steps(dx)) fail("phi",o,"PHI 改變了診斷流程的步驟或結論");
}

// 輸出
const by={}; for(const f of fails){const k=f[0]+" | "+f[2].slice(0,110);(by[k]=by[k]||[]).push(f[1]);}
console.log("FUZZ "+MODS.join(",")+"：TOTAL "+n+"  FAILS "+fails.length+(fails.length?"（"+Object.keys(by).length+" 類）":""));
for(const [k,v] of Object.entries(by)) console.log("  "+v.length+"× "+k+"\n     e.g. "+JSON.stringify(Object.fromEntries(Object.entries(v[0]).filter(([,x])=>x!==null&&x!==""&&x!==false))).slice(0,300));
process.exitCode=fails.length?1:0;
