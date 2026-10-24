// 快照：固定情境下所有分頁、所有子模式的文字輸出。node tests/snap.js [index.html] [out]
// 只改外觀時，前後版本快照必須完全相同（版本號與 Changelog 除外）。
const fs=require('fs'),path=require('path');
const {A,set,txt,runAll}=require('./harness')(process.argv[2]);
const out=process.argv[3]||path.join(__dirname,'snap.txt');
const RISE=[["2026-01-10",2.1],["2026-04-10",3.0],["2026-07-10",4.4]];
// [情境名, 欄位, PSA 序列]
const SC=[
  ["empty",{}],
  ["screen",{age:58,psa:5.2,fpsa:0.6,vl:4.5,vw:4,vh:3.8,pirads:"4",prevBx:"neg",ari:true,fhx:true,le:"ge10",ct:"T1c",mr_epe:"n",mr_svi:"n",mr_n:"n",testo:30}],
  ["lowRisk",{age:66,psa:5,p1:3,p2:3,ct:"T1c",pos:2,tot:12,g45:0,le:"ge10",vol:40,pirads:"3"}],
  ["favInt",{age:72,psa:8.5,p1:3,p2:4,ct:"T2a",pos:3,tot:12,g45:0,le:"ge10",vol:35,pirads:"4"}],
  ["highRisk",{age:70,psa:25,p1:4,p2:5,ct:"T3a",pos:9,tot:12,g45:5,cn:"N0",cm:"M0",mr_epe:"y",mr_svi:"n",mr_n:"n",le:"ge10",l_crib:true,pirads:"5"}],
  ["shortLE",{age:84,psa:14,p1:4,p2:3,ct:"T2b",pos:5,tot:12,le:"lt10"}],
  ["bcrRP",{loc:"post",b_prim:"rp",b_pt:"pT3a",b_r:"r1",b_pgg:"3",b_pn:"pN0",b_stat:"bcr",b_psa:0.3,psadt:8,b_pet:"local",b_mo:24,b_fit:"y"},RISE],
  ["persistRP",{loc:"post",b_prim:"rp",b_pt:"pT3b",b_r:"r1",b_pgg:"5",b_pn:"pN1",b_nn:3,b_stat:"persist",b_psa:0.6,b_pet:"pelvic"}],
  ["bcrRT",{loc:"post",b_prim:"rt",b_psa:3.5,b_pet:"local",b_bx:"pos",b_fit:"y",b_mo:48,psadt:14}],
  ["mhspcHigh",{adv:"mhspc",psa:120,p1:4,p2:5,cm:"M1b",h_time:"sync",h_bone:6,h_out:"y",h_visc:"n",h_ecog:"1",h_fit:"y",h_hrr:"brca2",h_pten:"def",h_psma:"pos"}],
  ["mhspcLow",{adv:"mhspc",psa:12,p1:4,p2:4,cm:"M1b",h_time:"meta",h_bone:2,h_out:"n",h_visc:"n",h_ecog:"0",h_fit:"n",h_hrr:"none",h_seiz:true}],
  ["nmcrpc",{adv:"nmcrpc",psa:4.4,testo:20,n_castr:"y",n_ci:"y",n_ecog:"0"},RISE],
  ["mcrpc2L",{adv:"mcrpc",cm:"M1b",c_arpi:"abi",c_doc:"y",c_doccyc:6,c_hrr:"brca",c_msi:"n",c_psma:"pos",c_sympbone:"y",c_visc:"n",c_ecog:"1",c_fit:"y"}],
  ["mcrpcPreChemo",{adv:"mcrpc",cm:"M1b",c_arpi:"enza",c_doc:"n",c_hrr:"none",c_msi:"n",c_psma:"pos",c_sympbone:"n",c_visc:"n",c_ecog:"0",c_fit:"y"}],
  ["mcrpcNaive",{adv:"mcrpc",cm:"M1c",c_arpi:"none",c_doc:"n",c_hrr:"none",c_msi:"y",c_psma:"neg",c_visc:"y",c_ecog:"3",c_fit:"n"}],
  ["phiCalc",{age:62,psa:6.5,fpsa:0.9,p2psa:18,ct:"T1c",pirads:"3",vol:45,le:"ge10"}],
  ["phiReport",{age:48,psa:3.2,fpsa:0.5,p2psa:9,phi:25,ari:true,uti:true,ct:"T2a",prevBx:"neg",pirads:"2",vol:30}],
  ["monitor",{m_adt:"agonist",m_long:true,m_abi:true,m_bone:"deno120",m_bmets:"crpc",m_t:-2.7,m_fx:true,m_cvd:true,m_dm:true,wt:70,ht:170}],
];
const ORDER=["strip","r-psad","r-kin","r-ajcc","r-img","r-misc","r-phi","r-dx","r-risk","r-loc","r-post","r-mhspc","r-nmcrpc","n-psadtSrc","r-mcrpc","r-mon","r-bsa","r-drugs"];
const L=[];
const add=(lab,f)=>{ let h; try{h=f();}catch(e){h="EXC "+e.message;} L.push("## "+lab+"\n"+txt(h)); };
add("panels",()=>{ set({}); const P=A.buildPanels(); return Object.keys(P).sort().map(k=>"["+k+"] "+P[k]).join("\n"); });
for(const [n,o,rows] of SC){
  set(o,rows); let R;
  try{ R=runAll(); }catch(e){ L.push("## "+n+"\nEXC "+e.message); continue; }
  for(const id of ORDER){ if(n!=="empty" && id==="r-drugs") continue; // 藥物表與情境無關，只存一次
    L.push("## "+n+" "+id+"\n"+txt(R[id]||"")); }
  add(n+" risk-obj",()=>JSON.stringify({nccn:A.riskNCCN(),eau:A.riskEAU(),aua:A.riskAUA(),damico:A.riskDamico(),capra:A.capra(),ajcc:A.ajcc()}));
}
for(const k of Object.keys(A.DCLS)){ set({dflt:k}); add("drugs "+k,A.renderDrugs); }
add("ref",A.renderRefPanel);
fs.writeFileSync(out,L.join("\n\n")+"\n");
const bad=L.filter(x=>/\bundefined\b|\bNaN\b|\[object|EXC /.test(x)).map(x=>x.split("\n")[0]);
console.log("SNAP "+L.length+" blocks → "+path.basename(out)+(bad.length?"  BAD in: "+bad.join(", "):""));
process.exitCode=bad.length?1:0;
