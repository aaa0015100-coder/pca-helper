# 瀏覽器測試（00 第八節第 4 點）。python3 tests/e2e.py [index.html] [--full] [--wide] [--tab=id,id] [--shots=dir]
# 快速模式：390 深淺色＋1280；每個分頁與子模式（局部：初始／術後；晚期：mHSPC／nmCRPC／mCRPC；藥物分類）開啟
#           → 無橫向溢出、無 undefined/NaN、無網路請求；.src／.upd／縮寫各點 1 個確認 #ov 有內容；console 0 錯誤
# --wide：加跑 320／768（改到版面或 CSS 結構時）
# --tab=：指定分頁在 390 寬完整操作（每個 select 的所有選項、全勾 checkbox、數字欄位填值、展開全部 details）
# --full：v1.0 完整測試，四種寬度×深淺色、全部分頁完整操作，另測 PSA 序列、跨頁同步、清除全部、主題切換
import sys, os, pathlib
from playwright.sync_api import sync_playwright
args=[a for a in sys.argv[1:] if not a.startswith("--")]
FILE=pathlib.Path(args[0] if args else pathlib.Path(__file__).parent.parent/"index.html").resolve()
FULL="--full" in sys.argv
TABSEL=next((a.split("=",1)[1].split(",") for a in sys.argv if a.startswith("--tab=")),None)
SHOTS=next((a.split("=",1)[1] for a in sys.argv if a.startswith("--shots=")),None)
WIDTHS=[320,390,768,1280] if (FULL or "--wide" in sys.argv) else [390,1280]
SUB={"loc":"#locSeg [data-loc]","adv":"#advSeg [data-adv]","drug":"#dSeg [data-dc]"}
NUMV={"psa":"12","fpsa":"1.2","testo":"30","vl":"4.5","vw":"4","vh":"3.8","vol":"40","age":"68","pos":"4","tot":"12","g45":"1",
      "b_psa":"0.3","psadt":"8","b_nn":"2","b_mo":"24","h_bone":"5","c_doccyc":"6","m_t":"-2.6","wt":"70","ht":"170"}
errs=[];issues=[]
BADJS="(()=>{const t=document.body.innerText;const m=t.match(/.{0,30}(\\bundefined\\b|\\bNaN\\b|\\[object|Infinity).{0,30}/);return m?m[0]:''})()"
def chk(pg,W,where):
    sw=pg.evaluate("document.documentElement.scrollWidth")
    if sw>W:
        wide=pg.evaluate(f"""[...document.querySelectorAll('body *')].filter(e=>{{const r=e.getBoundingClientRect();return r.right>{W}+1&&r.width>0&&!e.closest('.tscroll,.tbl-wrap,nav.tabs')}}).slice(0,3).map(e=>e.tagName+'.'+e.className)""")
        issues.append(f"{W} {where}: scrollWidth {sw} {wide}")
    b=pg.evaluate(BADJS)
    if b: issues.append(f"{W} {where}: 文字「{b}」")
def tab(pg,t):
    pg.click(f'#tabs [data-tab="{t}"]'); pg.wait_for_timeout(30)
def subs(pg,t):
    return pg.eval_on_selector_all(SUB[t],"e=>e.map(x=>x.outerHTML.match(/data-(loc|adv|dc)=\"([^\"]+)\"/).slice(1).join('='))") if t in SUB else []
def open_details(pg,sel):
    pg.evaluate(f"document.querySelectorAll('{sel} details').forEach(d=>d.open=true)")
def exercise(pg,W,t):
    sel=f"#p-{t}"
    for i in range(len(pg.query_selector_all(sel+" select[data-f]"))):
        s=pg.query_selector_all(sel+" select[data-f]")[i]
        if not s.is_visible(): continue
        vals=s.evaluate("e=>[...e.options].map(o=>o.value)")
        for v in vals:
            try: pg.query_selector_all(sel+" select[data-f]")[i].select_option(v)
            except Exception: pass
            b=pg.evaluate(BADJS)
            if b: issues.append(f"{W} {t} select{i}={v}: 文字「{b}」")
        chk(pg,W,f"{t} select{i}")
    for i in range(len(pg.query_selector_all(sel+" input[type=checkbox][data-f]"))):
        try:
            c=pg.query_selector_all(sel+" input[type=checkbox][data-f]")[i]
            if c.is_visible(): c.check()
        except Exception: pass
    chk(pg,W,f"{t} 全勾")
    for i in range(len(pg.query_selector_all(sel+" input[data-f]:not([type=checkbox])"))):
        try:
            e=pg.query_selector_all(sel+" input[data-f]:not([type=checkbox])")[i]
            if e.is_visible(): e.fill(NUMV.get(e.get_attribute("data-f"),"5"))
        except Exception: pass
    chk(pg,W,f"{t} 填值")
    open_details(pg,sel); chk(pg,W,f"{t} 展開")

with sync_playwright() as p:
    br=p.chromium.launch()
    for W in WIDTHS:
        for scheme in (["light","dark"] if (W==390 or FULL) else ["light"]):
            pg=br.new_page(viewport={"width":W,"height":800},color_scheme=scheme)
            pg.on("pageerror",lambda e,W=W:errs.append(f"{W}:{e}"))
            pg.on("console",lambda m,W=W:errs.append(f"{W}:{m.text}") if m.type=="error" else None)
            pg.on("request",lambda r:issues.append("網路請求 "+r.url) if not r.url.startswith(("file:","data:","about:","blob:")) else None)
            pg.goto(FILE.as_uri()); pg.wait_for_timeout(200)
            tabs=pg.eval_on_selector_all("#tabs [data-tab]","e=>e.map(x=>x.dataset.tab)")
            if not tabs: issues.append(f"{W}: 找不到分頁")
            for t in tabs:
                tab(pg,t); chk(pg,W,t)
                for sb in subs(pg,t) or [None]:
                    if sb:
                        k,v=sb.split("="); pg.click(f'#p-{t} [data-{k}="{v}"]'); pg.wait_for_timeout(30); chk(pg,W,f"{t}/{v}")
                    if W==390 and (FULL or (TABSEL and t in TABSEL and scheme=="light")):
                        exercise(pg,W,t)
                if SHOTS and W in (390,1280) and t in ("calc","dx","risk","adv"):
                    os.makedirs(SHOTS,exist_ok=True); pg.screenshot(path=f"{SHOTS}/{W}_{scheme}_{t}.png",full_page=False)
            # 彈出層：.src／.upd／縮寫各 1 個
            for s in [".panel .src",".panel .upd","#panels abbr.gl"]:
                el=next((e for e in pg.query_selector_all(s)),None)
                if not el: issues.append(f"{W} 找不到 {s}"); continue
                t=el.evaluate("e=>{const p=e.closest('.panel');return p?p.id.slice(2):null}")
                if t: tab(pg,t)
                el.evaluate("e=>{let d=e.closest('details');while(d){d.open=true;d=d.parentElement.closest('details')}}")
                if not el.is_visible():
                    issues.append(f"{W} {s} 不可見，略過"); continue
                el.click(); pg.wait_for_timeout(30)
                if not pg.evaluate("document.getElementById('ov').classList.contains('on') && document.getElementById('ovBox').innerText.trim().length>5"):
                    issues.append(f"{W} {s} 點擊後 #ov 無內容")
                pg.keyboard.press("Escape")
                if pg.evaluate("document.getElementById('ov').classList.contains('on')"): issues.append(f"{W} Esc 未關閉 #ov")
            if W==390 and scheme=="light":
                for _ in range(3): pg.click("#themeBtn")
                if pg.evaluate("document.documentElement.dataset.theme||'auto'")!="auto": issues.append("主題切換 3 次後不是自動")
            if FULL and W==390 and scheme=="light":
                pg.reload(); pg.wait_for_timeout(150)
                # PSA 序列 → 動力學有結果
                tab(pg,"calc")
                d=pg.query_selector_all('#psaRows input[type=date]'); v=pg.query_selector_all('#psaRows input[type=number]')
                for (dd,vv),(x,y) in zip([("2026-01-10","2.1"),("2026-04-10","3.0"),("2026-07-10","4.4")],zip(d,v)):
                    x.fill(dd); y.fill(vv)
                if "PSADT" not in pg.inner_text("#r-kin"): issues.append("PSA 序列輸入後 #r-kin 無 PSADT")
                # 跨頁同步：在分期頁選 Gleason，晚期頁同名欄位同步
                tab(pg,"risk"); pg.select_option('#p-risk select[data-f="p1"]',"4"); pg.select_option('#p-risk select[data-f="p2"]',"5")
                tab(pg,"adv")
                vals=pg.eval_on_selector_all('#p-adv select[data-f="p1"]',"e=>e.map(x=>x.value)")
                if any(x!="4" for x in vals): issues.append(f"跨頁同步失敗：晚期頁 p1={vals}")
                # 清除全部
                pg.click("#clearAll"); pg.wait_for_timeout(50)
                if pg.eval_on_selector_all('[data-f="p1"]',"e=>e.some(x=>x.value!=='')"): issues.append("清除全部後 p1 仍有值")
                if "Gleason" in pg.inner_text("#strip") and "GG" in pg.inner_text("#strip"): issues.append("清除全部後摘要列未清空")
            pg.close()
    br.close()
print("E2E", "OK" if not issues and not errs else "FAIL")
# 依類別合併：同一問題在不同 select 選項／寬度重複出現只列一次並計數
import re
G={}
for x in issues:
    k=re.sub(r"select\d+(=\S*)?","select*",x); k=re.sub(r"^\d+ ","",k); G.setdefault(k,[]).append(x)
if G: print("ISSUES",len(issues),f"（{len(G)} 類）\n  "+"\n  ".join(f"{len(v)}× {k}" for k,v in list(G.items())[:40]))
if errs: print("ERRORS",len(errs),"\n  "+"\n  ".join(errs[:20]))
sys.exit(1 if issues or errs else 0)
