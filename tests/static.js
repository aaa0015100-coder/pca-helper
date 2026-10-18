// 靜態檢查（00 第八節第 1 點）。node tests/static.js [index.html]
// REF 完整、出處都存在且列於來源頁、無重複 id、無寫死色碼、無外部載入、無瀏覽器儲存、縮寫正規式不用 lookbehind
const {A,html,js}=require('./harness')(process.argv[2]);
const F=[],W=[];
const css=(html.match(/<style>([\s\S]*?)<\/style>/)||["",""])[1];
// REF：每筆有 t/f；引用都存在；全部列在來源頁；都有被引用
for(const [k,v] of Object.entries(A.REF)){ if(!v.t||!v.f) F.push("REF 缺 t/f："+k); }
const used=new Set([...js.matchAll(/src\(\s*["']([A-Za-z0-9_]+)["']/g)].map(m=>m[1])
  .concat([...js.matchAll(/ref:\s*["']([A-Za-z0-9_]+)["']/g)].map(m=>m[1])));
for(const k of used) if(!A.REF[k]) F.push("引用不存在的 REF："+k);
const rp0=js.indexOf("function renderRefPanel"), rp1=js.indexOf("\nfunction ",rp0+10);
const refPanel=js.slice(rp0, rp1<0?undefined:rp1);
const grp=(refPanel.match(/const groups\s*=\s*\[([\s\S]*?)\];/)||["",""])[1];
const listed=new Set([...grp.matchAll(/"([A-Za-z0-9_]+)"/g)].map(m=>m[1]));
for(const k of Object.keys(A.REF)){ if(!listed.has(k)) F.push("REF 未列在來源頁："+k); }
for(const k of listed){ if(!A.REF[k]) F.push("來源頁列了不存在的 REF："+k); }
// 被引用：src("k")、ref:"k"，或藥物資料等以其他字串形式出現（排除 REF 定義與來源頁本身）
const body=js.replace(/const REF\s*=\s*\{[\s\S]*?\n\};/,"").replace(refPanel,"");
for(const k of Object.keys(A.REF)){ if(!new RegExp("[\"'`]"+k+"[\"'`]").test(body)) W.push("REF 未被任何建議引用："+k); }
// 靜態 id 重複（script 外）
const ids=[...html.replace(/<script>[\s\S]*<\/script>/,"").matchAll(/\sid="([^"$]+)"/g)].map(m=>m[1]);
const dup=ids.filter((x,i)=>ids.indexOf(x)!==i); if(dup.length) F.push("重複 id："+[...new Set(dup)].join(","));
// buildPanels 產生的 id 重複
try{ const P=A.buildPanels(); const all=Object.values(P).join(""); const d=[...all.matchAll(/\sid="([^"$]+)"/g)].map(m=>m[1]);
  const dd=d.filter((x,i)=>d.indexOf(x)!==i); if(dd.length) F.push("分頁內重複 id："+[...new Set(dd)].join(",")); }catch(e){ F.push("buildPanels 例外："+e.message); }
// 色碼：只允許出現在 :root token 區塊；rgba(0,0,0,x) 陰影／遮罩允許
const noRoot=css.replace(/@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*:root[^{]*\{[^}]*\}\s*\}/g,"").replace(/:root[^{]*\{[^}]*\}/g,"");
const hex=noRoot.match(/#[0-9a-fA-F]{3,8}\b/g); if(hex) F.push("CSS 寫死色碼："+[...new Set(hex)].join(","));
const rgb=(noRoot.match(/rgba?\([^)]*\)/g)||[]).filter(x=>!/^rgba\(0,\s*0,\s*0,\s*[.\d]+\)$/.test(x)); if(rgb.length) F.push("CSS 寫死 rgb："+[...new Set(rgb)].join(","));
if(/(^|[^-\w])(white|black)\b/.test(noRoot.replace(/white-space/g,""))) F.push("CSS 使用色名 white/black");
const jsHex=js.match(/["'`][^"'`\n]*#[0-9a-fA-F]{6}\b/g); if(jsHex) F.push("JS 內寫死色碼："+jsHex.slice(0,3).join(" | "));
const inlineColor=[...js.matchAll(/style="[^"]*(?:color|background)\s*:\s*(#[0-9a-fA-F]{3,6}|rgb)/g)]; if(inlineColor.length) F.push("行內 style 寫死顏色 ×"+inlineColor.length);
// 外部載入、儲存、meta
if(/<link[^>]+href=["']https?:/i.test(html)) F.push("外部 <link>");
if(/<script[^>]+src=/i.test(html)) F.push("外部 <script>");
if(/@import|url\(\s*["']?https?:/i.test(css)) F.push("CSS 外部資源");
if(/fonts\.googleapis/.test(html)) F.push("Google Fonts 未移除");
if(/localStorage|sessionStorage|document\.cookie|indexedDB/.test(js)) F.push("使用瀏覽器儲存");
if(/<meta name="claude:/.test(html)) F.push("含 claude: meta");
if(!/^<!doctype html>/i.test(html.trim())) F.push("缺 <!doctype html>");
if(!/<html lang="zh-Hant">/.test(html)) F.push("缺 <html lang=\"zh-Hant\">");
if(!/viewport-fit=cover/.test(html)) F.push("viewport 缺 viewport-fit=cover");
// 縮寫正規式：不可用 lookbehind（舊版 iOS）
if(/\(\?<[=!]/.test(js)) F.push("正規式使用 lookbehind");
// 版本號與查證日期
if(!/^\d+\.\d+$/.test(A.APP_VERSION)) F.push("APP_VERSION 格式："+A.APP_VERSION);
if(!/^\d{4}-\d{2}-\d{2}$/.test(A.CHECKED)) F.push("CHECKED 格式："+A.CHECKED);
console.log(F.length?"STATIC FAIL "+F.length+"\n  "+F.join("\n  "):"STATIC OK");
if(W.length) console.log("STATIC WARN "+W.length+"\n  "+W.join("\n  "));
process.exitCode=F.length?1:0;
