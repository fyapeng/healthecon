const el = document.querySelector("#app");
const fmt = (n) => Number(n).toLocaleString("zh-CN");
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const href = (page, values = {}) =>
  "#" +
  page +
  "?" +
  new URLSearchParams(
    Object.entries(values).filter(([, v]) => v !== "" && v != null),
  );
const btn = (title, page, params = {}) =>
  `<a class="btn" href="${esc(href(page, params))}">${esc(title)}</a>`;
const jnames = ["AER", "QJE", "JPE", "REStud", "Econometrica"];
const years = ["2020", "2021", "2022", "2023", "2024"];
let data,
  works,
  frontier,
  baseline,
  current,
  openCopies = {};
const options = (arr, v) =>
  arr
    .map(
      (x) =>
        `<option ${x === v ? "selected" : ""} value="${esc(x)}">${esc(x)}</option>`,
    )
    .join("");
function select(name, title, arr, selected) {
  return `<select name="${name}" aria-label="${title}"><option value="">${title}</option>${options(arr, selected)}</select>`;
}
function titleblock(label, title, intro) {
  return `<section><p class="eyebrow">${esc(label)}</p><h1>${esc(title)}</h1><p>${esc(intro)}</p></section>`;
}
function paper(w) {
  const url = w.id.startsWith("10.") ? "https://doi.org/" + w.id : w.id;
  const safe = /^https:\/\/(doi\.org|openalex\.org|arxiv\.org)\//i.test(url);
  const reader =
    "reader.html#" + new URLSearchParams({ title: w.title, id: w.id });
  const openUrl =
    w.venue === "arXiv" ? w.id.replace("/abs/", "/pdf/") : openCopies[w.id];
  const fulltext =
    openUrl && /^https:\/\//.test(openUrl)
      ? `<a href="${esc(openUrl)}" target="_blank" rel="noopener">开放版本 ↗</a>`
      : "";
  const nber =
    w.venue === "NBER" && /^10[.]3386\/w[0-9]+$/.test(w.id)
      ? `<a href="https://www.nber.org/papers/${w.id.slice(8)}" target="_blank" rel="noopener">NBER 全文入口 ↗</a>`
      : "";
  return `<article class="paper"><div class="meta">${esc(w.year)} · ${esc(w.venue)}${w.set ? " · " + esc(w.set) : ""}</div><h3>${safe ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(w.title)} ↗</a>` : esc(w.title)}</h3>${w.question ? `<p>${esc(w.question)}</p>` : ""}<div class="meta">${esc((w.authors || "").replaceAll(" | ", ", "))}</div>${[
    w.topic,
    w.region,
  ]
    .filter((x) => x && x !== "待核")
    .map((x) => `<span class="tag">${esc(x)}</span>`)
    .join(
      "",
    )}<div class="paper-actions">${fulltext}${nber}<a href="${esc(reader)}">阅读我的 PDF</a></div></article>`;
}
function cards(items) {
  return `<div class="cards">${items.map(([n, t, desc, page, filter]) => `<a href="${esc(href(page, filter))}">${n ? `<b>${esc(n)}</b>` : ""}<h3>${esc(t)} ↗</h3><p>${esc(desc)}</p></a>`).join("")}</div>`;
}
function home() {
  return `<div class="hero"><div class="copy"><span class="eyebrow">健康经济学研究观察</span><h1>健康如何改变<br>我们的选择？</h1><p>一笔自付费用会让谁放弃治疗？医生如何决定给谁做检查？新药诞生以后，哪些人能够用上它？健康经济学研究健康、资源与人的选择如何相互影响。</p><div class="actions">${btn("探索五大刊趋势 →", "trends")}<a href="#atlas">从研究问题开始 ↗</a></div></div><figure><img src="assets/cassatt.jpg" alt="玛丽·卡萨特画中的家庭照护场景"><figcaption>玛丽·卡萨特《孩子的沐浴》，1893</figcaption></figure></div>
  <section><h2>从三个问题走进这个领域</h2>${cards([
    [
      "",
      "谁承担疾病的代价？",
      "保险分摊风险，也会改变就医、用药与参保选择。",
      "library",
      { topic: "健康保险" },
    ],
    [
      "",
      "医疗服务由谁决定？",
      "医生的判断、医院的容量和支付规则共同影响患者得到的照护。",
      "library",
      { topic: "医疗供给" },
    ],
    [
      "",
      "创新如何到达患者？",
      "药品价格、临床证据与创新激励决定技术如何被使用。",
      "library",
      { topic: "药品与创新" },
    ],
  ])}</section>
  <section class="box"><h2>在正式发表之前</h2><p>工作论文让我们更早看到正在讨论的问题。按发布年份查看 NBER 卫生经济学项目的变化，或浏览 arXiv 经济学分类中的健康研究。</p>${btn("查看工作论文 →", "frontier")}</section>`;
}
function chart(points, j, metric) {
  const width = 700,
    left = 52,
    step = 146,
    bottom = 167,
    span = 124;
  const top = Math.max(1, Math.ceil(Math.max(...points.map((p) => p.v)) * 1.1));
  const x = (i) => left + i * step,
    y = (v) => bottom - (span * v) / top;
  return `<svg class="chart" viewBox="0 0 ${width} 215" role="group" aria-label="2020 至 2024 各年手工清单篇数或占比">${[0, 0.5, 1].map((t) => `<line x1="48" x2="665" y1="${y(top * t)}" y2="${y(top * t)}"/><text x="4" y="${y(top * t) + 5}">${(top * t).toFixed(t === 0.5 ? 1 : 0)}${metric === "share" ? "%" : ""}</text>`).join("")}<polyline points="${points.map((p, i) => x(i) + "," + y(p.v)).join(" ")}"/>${points.map((p, i) => `<a href="${esc(href("library", { set: "历史人工清单", year: p.year, venue: j }))}" aria-label="${p.year} 年 ${p.n} 篇"><title>${p.year} · ${p.n} / ${p.d}</title><circle cx="${x(i)}" cy="${y(p.v)}" r="7"/><text x="${x(i)}" y="${y(p.v) - 13}" text-anchor="middle">${metric === "share" ? p.v.toFixed(1) + "%" : p.n}</text><text x="${x(i)}" y="198" text-anchor="middle">${p.year}</text></a>`).join("")}</svg>`;
}
function trends(p) {
  const j = jnames.includes(p.get("venue")) ? p.get("venue") : "",
    metric = p.get("metric") === "share" ? "share" : "count";
  const pts = years.map((year) => {
    const n = baseline.filter(
      (w) => w.year === year && (!j || w.venue === j),
    ).length;
    const d = j
      ? data.denominators[year][j]
      : Object.values(data.denominators[year]).reduce((a, b) => a + b, 0);
    return { year, n, d, v: metric === "share" ? (100 * n) / d : n };
  });
  const now = current.filter((w) => !j || w.venue === j);
  return (
    titleblock(
      "期刊观察",
      "Top 5 趋势",
      "回看五大经济学期刊中健康研究的发表情况。点击图上的年份，即可核对组成该点的论文。",
    ) +
    `<section class="box"><div class="row"><h2>${j || "五刊合计"} · ${metric === "share" ? "发表占比" : "发表篇数"}</h2><form class="controls">${select("venue", "五刊合计", jnames, j)}<select name="metric" aria-label="指标"><option value="count">篇数</option><option value="share" ${metric === "share" ? "selected" : ""}>占比</option></select><button>更新图表</button></form></div>${chart(pts, j, metric)}<p class="meta">2020–2024 · 分子为历史人工整理清单（含健康相关应用），分母为同年卷期目录标作研究论文的条目。五刊合计占比按篇数加权。2025 年尚待逐篇核读。</p></section>
  <section><div class="row"><h2>2026 年至今</h2>${btn("浏览本年清单 →", "library", { period: "current", venue: j })}</div><p>截至 11 月 24 日，当前筛得 ${now.length} 篇。其中 ${now.filter((w) => w.set === "本年卷期").length} 篇归入本年卷期，其余为在线发表记录。清单仍在核读，不与历史曲线拼接。</p><div class="list">${now.map(paper).join("") || "暂无已核条目"}</div></section>`
  );
}
function library(p) {
  const scope = p.get("scope") || "",
    set = p.get("set") || "",
    period = p.get("period") || "";
  const year = p.get("year") || "",
    venue = p.get("venue") || "",
    topic = p.get("topic") || "",
    region = p.get("region") || "",
    q = (p.get("q") || "").trim().toLowerCase();
  const visible = works.filter(
    (w) =>
      (scope === "all" || w.health) &&
      (!set || w.set === set) &&
      (!period || current.includes(w)) &&
      (!year || w.year === year) &&
      (!venue || w.venue === venue) &&
      (!topic || w.topic === topic) &&
      (!region || w.region === region) &&
      (!q || w.search.includes(q)),
  );
  exportRows = visible;
  const page = Math.max(
      1,
      Math.min(Math.ceil(visible.length / 24), parseInt(p.get("page")) || 1),
    ),
    pages = Math.max(1, Math.ceil(visible.length / 24));
  const unique = (key) =>
    [
      ...new Set(
        works
          .filter((w) => w.health)
          .map((w) => w[key])
          .filter(Boolean),
      ),
    ].sort();
  return (
    titleblock(
      "文献索引",
      "文献概览",
      "按研究场景查找论文，也可以单独查看 JHE 或 NBER。主题与国家筛选仅包含已有相应标注的记录。",
    ) +
    `<form class="controls"><input name="q" aria-label="题名、作者或 DOI" placeholder="题名、作者或 DOI" value="${esc(q)}">${select("venue", "所有期刊或系列", [...new Set([...jnames, "Journal of Health Economics", "Health Economics", "NBER", "arXiv", venue].filter(Boolean))], venue)}${select("year", "全部年份", [...new Set(works.map((w) => w.year).filter(Boolean))].sort().reverse(), year)}${select("topic", "全部主题", unique("topic"), topic)}${select("region", "国家或研究场景", unique("region"), region)}<select name="scope" aria-label="目录范围"><option value="">健康研究目录</option><option value="all" ${scope === "all" ? "selected" : ""}>全部来源底册</option></select><button>筛选</button><a href="#library">重置</a></form>
  <div class="row"><p class="meta">${set ? esc(set) + " · " : ""}${period ? "本年清单 · " : ""}共 ${fmt(visible.length)} 条 · 按年份降序</p><button id="export">导出当前书目</button></div><div class="list">${
    visible
      .slice((page - 1) * 24, page * 24)
      .map(paper)
      .join("") || "没有匹配的文献。"
  }</div><div class="paging">${page > 1 ? btn("上一页", "library", { ...Object.fromEntries(p), page: page - 1 }) : ""}${page} / ${pages}${page < pages ? btn("下一页", "library", { ...Object.fromEntries(p), page: page + 1 }) : ""}</div>`
  );
}
function front() {
  const entries = Object.entries(data.nber);
  const table = entries
    .map(
      ([y, [n, d]]) =>
        `<tr><td><a href="${href("library", { venue: "NBER", year: y })}">${y}</a></td><td>${n}</td><td>${fmt(d)}</td><td>${((100 * n) / d).toFixed(1)}%</td></tr>`,
    )
    .join("");
  return (
    titleblock(
      "研究前沿",
      "工作论文",
      "一个想法从公开讨论走向期刊发表，往往要经历多次修订。这里记录工作论文的公开年份。",
    ) +
    `<section class="box"><div class="row"><h2>NBER · 卫生经济学项目</h2>${btn("浏览文献", "library", { venue: "NBER" })}</div><table><thead><tr><th>首次发布年</th><th>EH 项目</th><th>全部工作论文</th><th>项目占比</th></tr></thead><tbody>${table}</tbody></table><p class="meta">以 w 编号去重，分子使用官方 EH 项目代码。跨项目论文计一次。2023 年 7 月，Health Care 与 Health Economics 两个项目合并，早年数字采用当前项目归属。2026 年为部分年度，已入表最新日期 ${esc(data.cutoff)}。</p></section>
  <section class="box"><h2>arXiv · 跨学科预印本</h2><p>arXiv 没有专门的健康经济学分类。下表按首次公告月份统计全站及挂有 econ.* 标签的论文，交叉分类只计一次。健康研究需另行判读。</p><table><thead><tr><th>公告年</th><th>全站记录</th><th>含经济学分类</th></tr></thead><tbody>${Object.entries(
    frontier.years,
  )
    .map(
      ([y, [all, econ]]) =>
        `<tr><td>${y}</td><td>${fmt(all)}</td><td>${fmt(econ)}</td></tr>`,
    )
    .join(
      "",
    )}</tbody></table><p class="meta">来自固定版 arXiv 元数据镜像，末月 ${esc(frontier.lastMonth)}，可能为部分月份。经济学分类计数不可解释为健康经济学占比。</p>${btn("阅读已核健康研究", "library", { venue: "arXiv" })}</section>`
  );
}
function atlas() {
  const question = {
    健康保险: "不同的人如何选择保障，谁会因价格放弃治疗？",
    医疗供给: "医生、医院和支付方怎样共同决定服务？",
    人口健康: "环境与制度怎样改变寿命和健康差距？",
    药品与创新: "创新成本、定价和监管如何影响用药？",
    预防与筛查: "谁从筛查、疫苗和预防投入中获益？",
    器官配置: "稀缺器官如何在等待者之间分配？",
    心理健康: "治疗与社会环境如何影响精神健康？",
    长期照护: "家庭和护理机构怎样分担照护？",
    社会保障: "收入保障如何应对疾病与失能？",
    信息与决策: "信息披露如何影响选择和激励？",
  };
  return (
    titleblock(
      "研究问题",
      "研究主题",
      "从一个问题进入文献。卡片上的篇数统计已人工标注的研究，尚待编码的论文仍可在文献概览中查找。",
    ) +
    cards(
      Object.entries(question).map(([topic, desc]) => [
        works.filter((w) => w.topic === topic).length + " 篇",
        topic,
        desc,
        "library",
        { topic },
      ]),
    )
  );
}
function about() {
  return (
    titleblock(
      "来源与方法",
      "关于 healthecon",
      "观察经济学如何研究健康。各项统计都注明文献范围、发表时间和分类依据。",
    ) +
    `<section class="box"><h2>五大刊与专业期刊</h2><p>五年基准窗口来自手工回顾的逐条卷期匹配。健康作为研究对象、制度场景或理论应用均可能入选；现有标注是可修订的研究判断。2026 年根据 Crossref 正式出版及首次在线记录筛查，先行版单列。JHE 和 Health Economics 作为专业期刊提供独立检索，元数据通过 OpenAlex 获取。</p><a href="https://github.com/kochiuyu/econ-journal-authors">卷期核对数据 ↗</a> · <a href="https://openalex.org/">OpenAlex ↗</a></section>
  <section class="box"><h2>工作论文与时间</h2><p>NBER 以首次发布日期计年，项目代码可能漏掉跨领域的健康研究。arXiv 用原始公告编号计月。首次公开是可观测时间，实际构思可能更早。不同系列和发表版本分别保留。</p><a href="https://www.nber.org/research/data/nber-working-papers-and-chapters-metadata">NBER 原始数据 ↗</a> · <a href="https://www.nber.org/programs-projects/programs-working-groups/economics-health">NBER 项目沿革 ↗</a> · <a href="https://huggingface.co/datasets/librarian-bots/arxiv-metadata-snapshot">arXiv 元数据镜像 ↗</a></section>
  <section class="box"><h2>阅读全文</h2><p>有开放版本的论文提供 arXiv 或 OpenAlex 登记的全文入口；期刊页面可能另有机构访问要求。已收藏的 PDF 可在本机阅读器打开，文件留在浏览器中。</p><a class="btn" href="reader.html">打开本机全文阅读器</a></section><p class="meta">首页插图为 Mary Cassatt 的 The Child’s Bath（1893），取自 <a href="https://www.artic.edu/artworks/111442/the-child-s-bath">芝加哥艺术博物馆公共领域馆藏</a>。</p>`
  );
}
let exportRows = [];
function render() {
  const [route, query] = location.hash.slice(1).split("?"),
    page = route || "home",
    p = new URLSearchParams(query);
  const pages = { home, trends, library, frontier: front, atlas, about };
  el.innerHTML = (pages[page] || home)(p);
  document.querySelectorAll("nav a").forEach((a) => {
    if (a.hash === "#" + page) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  const form = el.querySelector("form");
  if (form)
    form.onsubmit = (e) => {
      e.preventDefault();
      p.delete("page");
      for (const [k, v] of new FormData(form)) v ? p.set(k, v) : p.delete(k);
      location.hash = href(page, Object.fromEntries(p));
    };
  const ex = el.querySelector("#export");
  if (ex)
    ex.onclick = () => {
      const text = exportRows
        .map((w) =>
          [w.year, w.venue, w.title, w.authors, w.id, w.topic, w.region]
            .map((x) => String(x ?? "").replace(/[\t\r\n]/g, " "))
            .join("\t"),
        )
        .join("\r\n");
      const u = URL.createObjectURL(
        new Blob(
          ["\uFEFF年份\t刊物\t题名\t作者\t标识\t主题\t国家或场景\r\n", text],
          { type: "text/tab-separated-values;charset=utf-8" },
        ),
      );
      const a = document.createElement("a");
      a.href = u;
      a.download = "healthecon-文献.tsv";
      a.click();
      setTimeout(() => URL.revokeObjectURL(u), 1000);
    };
}
async function get(file) {
  const r = await fetch("data/" + file + ".json");
  if (!r.ok) throw Error(file);
  return r.json();
}
try {
  if (!location.hash || location.hash === "#home") el.innerHTML = home();
  [data, works, frontier, openCopies] = await Promise.all(
    ["observatory", "catalog", "arxiv", "open-copies"].map(get),
  );
  const map = new Map(works.map((w) => [w.id, w]));
  for (const w of frontier.papers) {
    if (!map.has(w.id)) {
      map.set(w.id, w);
      works.push(w);
    }
  }
  for (const [id, meta] of Object.entries(data.labels)) {
    const w = map.get(id);
    if (w) {
      const title = w.title;
      Object.assign(w, meta);
      w.title = title;
    }
  }
  for (const w of works) {
    w.health =
      w.set ||
      [
        "NBER",
        "Journal of Health Economics",
        "Health Economics",
        "arXiv",
      ].includes(w.venue);
    w.search = [w.title, w.authors, w.id, w.venue, w.question, w.topic]
      .join(" ")
      .toLowerCase();
  }
  works.sort(
    (a, b) =>
      Number(b.year) - Number(a.year) ||
      a.venue.localeCompare(b.venue) ||
      a.title.localeCompare(b.title),
  );
  baseline = works.filter((w) => w.set === "历史人工清单");
  current = works.filter((w) => ["本年卷期", "本年在线"].includes(w.set));
  render();
  window.addEventListener("hashchange", () => {
    render();
    window.scrollTo(0, 0);
  });
} catch (error) {
  el.textContent = "文献数据载入失败，请刷新重试。";
  console.error(error);
}
