const app = document.querySelector("#app");
const status = document.querySelector("#status");
const fmt = n => n.toLocaleString("zh-CN");
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
async function get(path) {
  const res = await fetch(path);
  if (!res.ok) throw Error(path);
  return res.json();
}
let works, coverage, topics;
const route = () => new URLSearchParams(location.hash.slice(1).split("?")[1]);
const link = (view, params={}) => "#" + view + "?" + new URLSearchParams(params);
function render() {
  const view = location.hash.slice(1).split("?")[0] || "topics";
  const params = route();
  document.querySelectorAll("nav a").forEach(a => {
    if (a.hash === "#" + view) a.setAttribute("aria-current","page"); else a.removeAttribute("aria-current");
  });
  if (view === "topics") {
    app.innerHTML = `<div class="hero"><div class="kicker">HEALTHLAB</div><h1>健康经济学研究</h1><p>查找文献，追踪研究问题，比较不同制度下的经验证据。</p><div class="metrics"><div><b>${fmt(works.length)}</b><span>书目记录</span></div><div><b>${topics.length}</b><span>研究专题</span></div></div></div>
    <section><h2>研究专题</h2>${topics.map(t => `<article class="topic"><h3>${esc(t.name)}</h3><p>${esc(t.description)}</p><p class="meta">${fmt(Object.keys(t.notes).length)} 条摘要初读意见 · ${fmt(t.order.length)} 条已排序发现记录</p><div class="actions"><a class="btn" href="${esc(link("library",{topic:t.id,scope:"notes"}))}">阅读初读意见</a><a class="btn" href="${esc(link("library",{topic:t.id}))}">浏览专题线索</a></div></article>`).join("")}</section>`;
    return;
  }
  const topic = topics.find(t => t.id === params.get("topic"));
  const source = params.get("source") || "";
  const year = params.get("year") || "";
  const q = (params.get("q") || "").trim();
  const notes = params.get("scope") === "notes";
  const rows = works.filter(w => (!topic || (notes ? Object.hasOwn(topic.notes,w.id) : topic.rank.has(w.id))) &&
    (!source || w.sources.includes(source)) && (!year || w.year === year) &&
    (!q || w.search.includes(q.toLowerCase())));
  const options = (items, current) => items.map(i => `<option value="${esc(i)}" ${i===current?"selected":""}>${esc(i)}</option>`).join("");
  const controls = `<form class="filters"><input name="q" aria-label="检索题名、作者、期刊或 DOI" placeholder="检索题名、作者、期刊或 DOI" value="${esc(q)}"><select name="source" aria-label="来源"><option value="">全部来源</option>${options(Object.keys(coverage.counts),source)}</select><select name="year" aria-label="年份"><option value="">全部年份</option>${options(years,year)}</select><button>筛选</button><a class="btn" href="${esc(link(view,topic?{topic:topic.id,...(notes?{scope:"notes"}:{})}:{}))}">重置</a></form>`;
  if (view === "trends") {
    const bins = new Map();
    rows.forEach(w=>{if (/^\d{4}$/.test(w.year)) bins.set(w.year,(bins.get(w.year)||0)+1)});
    const peak = Math.max(1,...bins.values());
    app.innerHTML = `<section><h1>收录趋势</h1><p>按发表年份统计当前目录。五大刊包含各学科，专业期刊系统收录从 2003 年起，NBER 卫生项目从 2021 年起，引文可追溯至更早年份。末年截至 ${esc(coverage.cutoff)}。</p>${controls}<p class="meta">当前筛选共 ${fmt(rows.length)} 条。同一标识跨来源合并，工作论文与期刊版本可各占一条。</p><div class="box"><ol class="chart">${[...bins.keys()].sort().reverse().map(y=>`<li><span>${y}</span><div class="bar" style="width:${100*bins.get(y)/peak}%"></div><strong>${fmt(bins.get(y))}</strong></li>`).join("") || "无符合条件的记录"}</ol></div><h2>来源覆盖</h2>${Object.entries(coverage.counts).map(([s,n])=>`<p><a href="${esc(link("trends",{source:s}))}">${esc(s)}</a> · ${fmt(n)} 条原始记录</p>`).join("")}</section>`;
  } else {
    if(topic) rows.sort((a,b)=>topic.rank.get(a.id)-topic.rank.get(b.id));
    else rows.sort((a,b)=>Number(b.year)-Number(a.year)||a.title.localeCompare(b.title));
    const size=30, pages=Math.max(1,Math.ceil(rows.length/size)), page=Math.min(pages,Math.max(1,parseInt(params.get("page"))||1));
    const pageLink=p=>esc(link("library",{...Object.fromEntries(params),page:p}));
    app.innerHTML=`<section><h1>${topic?esc(topic.name):"文献库"}</h1><p>${topic?(notes?"逐篇记录摘要中可支持的研究判断。":"按与已读文献的相似度排列，供发现与核读。相关性和纳入状态仍需逐篇判断。"):"跨来源检索书目信息。点击题名可前往 DOI 或 OpenAlex 记录。"}</p>${controls}<div class="line"><p class="meta">共 ${fmt(rows.length)} 条 · ${topic?"专题阅读顺序":"发表年份降序"}</p>${topic?`<a href="#library">全部文献</a>`:""}</div>${rows.slice((page-1)*size,page*size).map(w=>{
      const url=w.id.startsWith("10.")?"https://doi.org/"+w.id:w.id;
      const title=/^https:\/\/(doi\.org|openalex\.org)\//i.test(url)?`<a href="${esc(url)}" target="_blank" rel="noopener">${esc(w.title)} ↗</a>`:esc(w.title);
      return `<article class="paper"><div class="meta">${esc(w.year)} · ${esc(w.venue)}</div><h3>${title}</h3><p class="meta">${esc(w.authors || "作者待补")}</p><small>${esc(w.sources.join(" · "))}</small>${topic?.notes[w.id]?`<p class="note">${esc(topic.notes[w.id])}</p>`:""}</article>`;
    }).join("")||"<p>没有符合条件的记录。</p>"}<div class="pagination">${page>1?`<a class="btn" href="${pageLink(page-1)}">上一页</a>`:""}<span>${page} / ${pages}</span>${page<pages?`<a class="btn" href="${pageLink(page+1)}">下一页</a>`:""}</div></section>`;
  }
  app.querySelector("form").onsubmit = ev => {
    ev.preventDefault();
    params.delete("page");
    for(const [k,v] of new FormData(ev.target)) { if(v) params.set(k,v); else params.delete(k); }
    location.hash = link(view,Object.fromEntries(params));
  };
}
let years;
try {
  [works,coverage,topics] = await Promise.all(["data/catalog.json","data/coverage.json","topics/index.json"].map(get));
  await Promise.all(topics.map(async t=>{Object.assign(t,await get(t.file));t.rank=new Map(t.order.map((id,i)=>[id,i]));}));
  works.forEach(w=>{w.search=[w.title,w.venue,w.authors,w.id].join(" ").toLowerCase();});
  years=[...new Set(works.map(w=>w.year).filter(y=>/^\d{4}$/.test(y)))].sort().reverse();
  status.textContent="";
  render();
  window.addEventListener("hashchange",()=>{render();window.scrollTo(0,0);});
} catch(error) {status.textContent="书目载入失败，请刷新重试。";console.error(error);}
