# 瀏覽器測試（00 第八節第 4 點）。python3 tests/e2e.py [index.html] [--full] [--wide] [--tab=id,id] [--shots=dir]
# 快速模式：390 深淺色＋1280；每個分頁與子模式（局部：初始／術後；晚期：mHSPC／nmCRPC／mCRPC；藥物分類）開啟
#           → 無橫向溢出、無 undefined/NaN、無網路請求；.src／.upd／縮寫各點 1 個確認 #ov 有內容；console 0 錯誤
# --wide：加跑 320／768（改到版面或 CSS 結構時）
# --tab=：指定分頁在 390 寬完整操作（每個 select 的所有選項、全勾 checkbox、數字欄位填值、展開全部 details）
# --full：v1.0 完整測試，四種寬度×深淺色、全部分頁完整操作，另測 PSA 序列、跨頁同步、清除全部、主題切換
# 介面互動（v1.6，每次都跑）：更多選單、網址 hash、結論卡跳轉、輸入卡收合與摘要、摘要列跳欄位、清除後復原、免責收合、
#   藥物商品名與篩選、來源篩選、看結果按鈕、寬螢幕雙欄位置
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
        wide=pg.evaluate(f"""[...document.querySelectorAll('body *')].filter(e=>{{const r=e.getBoundingClientRect();return r.right>{W}+1&&r.width>0&&!e.closest('.tscroll,.tbl-wrap,nav.tabs,.schips')}}).slice(0,3).map(e=>e.tagName+'.'+e.className)""")
        issues.append(f"{W} {where}: scrollWidth {sw} {wide}")
    b=pg.evaluate(BADJS)
    if b: issues.append(f"{W} {where}: 文字「{b}」")
def tab(pg,t):
    # 手機版部分分頁收在「更多」，直接用 goTab 切換（選單本身另測）
    pg.evaluate(f"goTab('{t}')"); pg.wait_for_timeout(30)
def subs(pg,t):
    return pg.eval_on_selector_all(SUB[t],"e=>e.map(x=>x.outerHTML.match(/data-(loc|adv|dc)=\"([^\"]+)\"/).slice(1).join('='))") if t in SUB else []
def open_details(pg,sel):
    pg.evaluate(f"document.querySelectorAll('{sel} details').forEach(d=>d.open=true)")
def exercise(pg,W,t):
    sel=f"#p-{t}"
    pg.evaluate("document.querySelectorAll('.card.incard.col').forEach(c=>setCol(c,false))")
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

def ui(pg,W,scheme):
    """v1.6 介面互動。每個寬度／主題各跑一次；只在 390 淺色與 1280 跑完整項目。"""
    def bad(m): issues.append(f"{W}{scheme[0]} UI：{m}")
    ev=pg.evaluate
    pg.goto("about:blank"); pg.goto(FILE.as_uri()); pg.wait_for_timeout(150)   # 重新載入，空白狀態、無 hash
    if ev("CUR")!="dx": bad("預設未開診斷流程")
    # 分頁列：依診斷邏輯順序；主列＋「更多」合起來＝完整順序，主列不溢出、不捲動
    ORDER="dx,risk,loc,adv,mon,drug,calc,ref"
    vis=ev("[...document.querySelectorAll('#tabs [data-tab]')].filter(b=>b.offsetParent).map(b=>b.dataset.tab).join(',')")
    menu=ev("[...document.querySelectorAll('#moreMenu [data-tab]')].map(b=>b.dataset.tab).join(',')")
    if ",".join(x for x in [vis,menu] if x)!=ORDER: bad(f"分頁順序：主列 {vis}｜更多 {menu}")
    if ev("(()=>{const r=document.getElementById('tabs');return r.scrollWidth>r.clientWidth+1})()"): bad("分頁列仍需橫向捲動")
    if bool(menu)!=pg.is_visible("#moreBtn"): bad("「更多」顯示與收納分頁不一致")
    if W==390 and vis!="dx,risk,loc,adv,mon": bad("390 px 主列應為 dx,risk,loc,adv,mon，實為 "+vis)
    if W>=768 and menu: bad(f"{W} px 應全部顯示，更多裡有 {menu}")
    if scheme!="light" and W!=390: return
    if menu:
        last=menu.split(",")[-1]
        pg.click("#moreBtn")
        if not pg.is_visible("#moreMenu"): bad("更多選單未開")
        else:
            pg.click(f'#moreMenu [data-tab="{last}"]'); pg.wait_for_timeout(30)
            if ev("CUR")!=last or ev("TABS.find(t=>t.id==='"+last+"').s||TABS.find(t=>t.id==='"+last+"').t") not in pg.inner_text("#moreBtn"): bad("從更多選單切頁失敗或按鈕未顯示目前分頁")
            if pg.is_visible("#moreMenu"): bad("切換後更多選單未關")
            if ev("location.hash")!="#"+last: bad("切頁後 hash 未更新："+ev("location.hash"))
            w0=ev("document.getElementById('moreBtn').offsetWidth"); ev("goTab('dx')"); w1=ev("document.getElementById('moreBtn').offsetWidth")
            if w0!=w1: bad(f"「更多」按鈕寬度隨分頁改變 {w0}→{w1}（分頁列會跳動）")
    # hash 直接開子模式
    pg.goto(FILE.as_uri()+"#adv-mcrpc"); pg.wait_for_timeout(150)
    if ev("CUR")!="adv" or not ev("document.querySelector('#advSeg [data-adv=\"mcrpc\"]').classList.contains('on')"): bad("#adv-mcrpc 未開到 mCRPC")
    pg.click('#advSeg [data-adv="nmcrpc"]'); pg.wait_for_timeout(30)
    if ev("location.hash")!="#adv-nmcrpc": bad("切子模式後 hash 未更新")
    pg.goto(FILE.as_uri()+"#loc-post"); pg.wait_for_timeout(150)
    if ev("S.loc")!="post" or ev("CUR")!="loc": bad("#loc-post 未開到術後・復發")
    # 輸入高風險病人 → 結論卡、跳轉
    pg.goto(FILE.as_uri()+"#risk"); pg.wait_for_timeout(150)
    if ev("CUR")!="risk": bad("#risk 未開分期・風險")
    for f,v in [("psa","25"),("pos","9"),("tot","12"),("age","70")]: pg.fill(f'#p-risk input[data-f="{f}"]',v)
    for f,v in [("p1","4"),("p2","5"),("ct","T2a"),("mr_epe","y")]: pg.select_option(f'#p-risk select[data-f="{f}"]',v)
    cc=pg.inner_text("#cc-risk")
    for w in ["NCCN","EAU","AUA/ASTRO","AJCC","注意"]:
        if w not in cc: bad(f"結論卡缺「{w}」")
    for t in ["dx","risk","loc","adv","mon"]:
        ev(f"goTab('{t}')")
        n=ev(f"""(()=>{{let bad=0;document.querySelectorAll('#cc-{t} [data-go]').forEach(b=>{{const [c,k,i]=b.dataset.go.split('|'); if(c==='pin') return;
            const C=document.getElementById(c); const el=!C?null:k==='c'?C:C.querySelectorAll({{step:'.step',opt:'.opt',alert:'.alert'}}[k])[+i]; if(!el) bad++;}}); return bad}})()""")
        if n: bad(f"{t} 結論卡有 {n} 個跳轉目標不存在")
    ev("goTab('loc','init')"); b=pg.query_selector('#cc-loc .cci[data-go*="|opt|"]')
    if not b: bad("局部治療結論卡無首選")
    else:
        b.click(); pg.wait_for_timeout(60)
        if not ev("!!document.querySelector('#r-loc .opt.flash')"): bad("點首選未跳到方案卡")
    # 收合與摘要：切回 risk，手機版已填卡應收合且摘要含 PSA
    ev("goTab('dx')"); ev("goTab('risk')")
    if W<920:
        if not ev("document.querySelector('#p-risk .card.incard').classList.contains('col')"): bad("手機切頁後已填輸入卡未自動收合")
        if "PSA" not in pg.inner_text("#p-risk .card.incard .isum"): bad("收合摘要未列 PSA")
        pg.click("#p-risk .card.incard .isum"); pg.wait_for_timeout(30)
        if ev("document.querySelector('#p-risk .card.incard').classList.contains('col')"): bad("點摘要未展開")
        # 看結果按鈕
        ev("window.scrollTo(0,0)"); ev("updJump()")
        if pg.is_visible("#jumpBtn"):
            pg.click("#jumpBtn"); pg.wait_for_timeout(80)
            if ev("document.querySelector('#p-risk .pout').getBoundingClientRect().top")>400: bad("看結果未捲到結果")
    else:
        pin=ev("document.querySelector('#p-risk .pin').getBoundingClientRect().right"); ccl=ev("document.getElementById('cc-risk').getBoundingClientRect().left")
        if ccl<pin: bad("寬螢幕結論卡不在右欄")
        if ev("getComputedStyle(document.querySelector('#p-risk .pin')).position")!="sticky": bad("寬螢幕輸入欄未固定")
    # 摘要列跳欄位
    ev("goTab('mon')"); pg.click('#strip [data-jf="psa"]'); pg.wait_for_timeout(60)
    if ev("CUR")!="risk" or ev("document.activeElement&&document.activeElement.dataset.f")!="psa": bad("點摘要 PSA 未跳到分期頁 PSA 欄")
    # 清除與復原
    pg.click("#clearAll"); pg.wait_for_timeout(40)
    if not pg.is_visible("#toast") or ev("S.psa")!=None: bad("清除全部後無提示或未清空")
    pg.click("#undoBtn"); pg.wait_for_timeout(40)
    if ev("S.psa")!=25 or pg.input_value('#p-risk input[data-f="psa"]')!="25": bad("復原後 PSA 未恢復")
    # 免責聲明
    pg.click("#discOk")
    if pg.is_visible("#disc") or not pg.is_visible("#disc2"): bad("免責聲明「知道了」後未移到頁尾")
    # 藥物：商品名與篩選
    ev("goTab('drug')")
    if pg.is_visible("#p-drug .brand"): bad("藥物商品名預設即顯示")
    pg.click("#p-drug .brandbtn")
    if not pg.is_visible("#p-drug .brand"): bad("點藥名未顯示商品名")
    pg.click('#dSeg [data-dc="all"]'); pg.fill("#dq","olap"); pg.wait_for_timeout(30)
    names=ev("[...document.querySelectorAll('#r-drugs .brandbtn')].map(b=>b.textContent)")
    if names!=["Olaparib"]: bad(f"藥名篩選 olap 結果 {names}")
    pg.fill("#dq","zzzz"); pg.wait_for_timeout(30)
    if "沒有符合" not in pg.inner_text("#r-drugs"): bad("篩選無結果時沒有提示")
    pg.fill("#dq","")
    # 來源篩選
    ev("goTab('ref')"); pg.fill("#rq","PROfound"); pg.wait_for_timeout(30)
    vis=ev("[...document.querySelectorAll('#p-ref p[data-rk]')].filter(p=>p.offsetParent).map(p=>p.dataset.rk)")
    if vis!=["PROfound"]: bad(f"來源篩選 PROfound 結果 {vis}")
    pg.fill("#rq","")
    chk(pg,W,"ui")

def sandbox(br):
    """模擬沙盒預覽（history.replaceState 被拒絕，如對話內檔案預覽）：不可有 pageerror，分頁與輸入仍要能用。"""
    pg=br.new_page(viewport={"width":390,"height":800}); E=[]
    pg.on("pageerror",lambda e:E.append(str(e)))
    pg.add_init_script("history.replaceState=function(){throw new DOMException('Failed to execute replaceState','SecurityError')}")
    pg.goto(FILE.as_uri()); pg.wait_for_timeout(150)
    pg.click('#tabs [data-tab="risk"]'); pg.wait_for_timeout(30)
    if pg.evaluate("CUR")!="risk": issues.append("沙盒預覽：點分頁無反應")
    pg.fill('#p-risk input[data-f="psa"]',"25"); pg.wait_for_timeout(30)
    if "25" not in pg.inner_text("#strip"): issues.append("沙盒預覽：輸入後摘要列未更新")
    pg.click('#tabs [data-tab="adv"]'); pg.wait_for_timeout(30)
    pg.click('#advSeg [data-adv="mcrpc"]'); pg.wait_for_timeout(30)
    if pg.evaluate("S.adv")!="mcrpc": issues.append("沙盒預覽：切子模式無反應")
    if E: issues.append(f"沙盒預覽：操作時 pageerror ×{len(E)}："+E[0][:100])
    pg.close()

with sync_playwright() as p:
    br=p.chromium.launch()
    sandbox(br)
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
            ui(pg,W,scheme)
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
                pg.evaluate("goTab('risk')"); pg.click("#clearAll"); pg.wait_for_timeout(50)
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
