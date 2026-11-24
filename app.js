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
const detailCache = new Map();
let stats, byId;
let works,
  frontier,
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
function paper(w, expanded = false) {
  const internal = href("paper", { id: w.id });
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
  return `<article class="paper"><div class="meta">${esc(w.year)} · ${esc(w.venue)}${w.set === "本年在线" ? " · 提前在线" : ""}${w.articleType ? " · " + esc(w.articleType) : ""}</div><h3><a href="${esc(internal)}">${esc(w.titleZh || w.title)}</a></h3>${w.titleZh ? `<p lang="en">${esc(w.title)}</p>` : ""}${w.question ? `<p>${esc(w.question)}</p>` : ""}<div class="meta">${esc((w.authors || "").replaceAll(" | ", ", "))}</div>${[
    w.topic,
    w.region,
  ]
    .filter((x) => x && x !== "待核")
    .map((x) => `<span class="tag">${esc(x)}</span>`)
    .join(
      "",
    )}${w.hasDetail ? `<details class="paper-detail" data-year="${esc(w.year)}" data-key="${esc(w.id)}" ${expanded === true ? "open" : ""}><summary>${w.hasAbstract ? "阅读摘要" : "论文信息"}</summary><div class="abstract-body"></div></details>` : expanded === true ? "<p>此条目的公开书目未附摘要。</p>" : ""}<div class="paper-actions">${safe ? `<a href="${esc(url)}" target="_blank" rel="noopener">原文 ↗</a>` : ""}${fulltext}${nber}${expanded === true ? `<a href="${esc(reader)}">打开本地 PDF</a>` : ""}</div></article>`;
}
function paperPage(p) {
  const w = byId.get(p.get("id"));
  return w
    ? `<p><a href="#library">文献概览</a></p>${paper(w, true)}`
    : '<p>没有找到这篇论文。<a href="#library">浏览文献</a></p>';
}
async function readDetail(node) {
  if (!node.open || node.dataset.ready) return;
  const box = node.querySelector(".abstract-body"),
    year = node.dataset.year;
  box.textContent = "正在读取…";
  if (!detailCache.has(year))
    detailCache.set(
      year,
      get("details/" + year).catch((error) => {
        detailCache.delete(year);
        throw error;
      }),
    );
  try {
    const entry = (await detailCache.get(year))[node.dataset.key];
    if (!entry) throw Error("missing");
    const a = entry.abstract;
    const links = [];
    if (a?.url && /^https:\/\//.test(a.url))
      links.push(
        `<a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.source)} ↗</a>`,
      );
    if (entry.senlab)
      links.push(`<a href="${esc(entry.senlab)}">SenLab 延伸阅读 ↗</a>`);
    if (entry.workingPaper)
      links.push(
        `<a href="${esc(href("paper", { id: entry.workingPaper }))}">NBER 工作论文版</a>`,
      );
    box.innerHTML =
      (entry.abstractZh
        ? `<strong>中文译文</strong>${entry.translationSource ? ` <span class="meta">· ${esc(entry.translationSource)}</span>` : ""}<p>${esc(entry.abstractZh)}</p>`
        : "") +
      (a
        ? `<strong>${esc(a.version === "工作论文" ? "工作论文摘要" : a.version === "预印本" ? "预印本摘要" : "原文摘要")}</strong><p lang="en">${esc(a.text)}</p>`
        : "<p>此条目的公开书目未附摘要。</p>") +
      (byId.get(node.dataset.key)?.methodMentions
        ? `<p class="meta">摘要提及的方法 · ${esc(byId.get(node.dataset.key).methodMentions.join(" · "))}</p>`
        : "") +
      (entry.jel?.length
        ? `<p class="meta">JEL · ${esc(entry.jel.join(" · "))}</p>`
        : "") +
      `<div class="paper-actions">${links.join(" ")}</div>`;
    node.dataset.ready = "1";
  } catch {
    box.replaceChildren(document.createTextNode("摘要暂时无法载入。 "));
    const retry = document.createElement("button");
    retry.textContent = "重试";
    retry.onclick = () => readDetail(node);
    box.append(retry);
  }
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
function chart(points, venue, metric) {
  const width = 920,
    left = 42,
    right = 20,
    bottom = 170;
  const ceiling = Math.max(
    1,
    Math.ceil(Math.max(...points.map((p) => p.value)) * 1.15),
  );
  const x = (i) => left + (i * (width - left - right)) / (points.length - 1);
  const y = (v) => bottom - (130 * v) / ceiling;
  const ticks = [0, 0.5, 1]
    .map(
      (t) =>
        `<line x1="${left}" x2="${width - right}" y1="${y(t * ceiling)}" y2="${y(t * ceiling)}"/><text x="1" y="${y(t * ceiling) + 5}">${+(t * ceiling).toFixed(1)}${metric !== "count" ? "%" : ""}</text>`,
    )
    .join("");
  const dots = points
    .map((p, i) => {
      const value =
        metric !== "count" ? p.value.toFixed(1) + "%" : p.value + " 篇";
      const caption = `${p.year} · ${value}${metric !== "count" ? " (" + p.count + "/" + p.total + ")" : ""}`;
      return `<a href="${esc(href("library", { venue, year: p.year, series: metric === "share" ? "toc" : metric === "indexed" ? "issue" : "trend" }))}" aria-label="${esc(caption)}"><title>${esc(caption)}</title><circle cx="${x(i)}" cy="${y(p.value)}" r="5"/>${i === 0 || i === points.length - 1 || Number(p.year) % 4 === 0 ? `<text x="${x(i)}" y="198" text-anchor="middle">${p.year}</text>` : ""}</a>`;
    })
    .join("");
  return `<svg class="chart" viewBox="0 0 ${width} 210" role="group" aria-label="五大刊年度发表情况">${ticks}<polyline points="${points.map((p, i) => x(i) + "," + y(p.value)).join(" ")}"/>${dots}</svg>`;
}
function trends(p) {
  const j = jnames.includes(p.get("venue")) ? p.get("venue") : "",
    metric = ["share", "indexed"].includes(p.get("metric"))
      ? p.get("metric")
      : "count";
  const pts = [];
  for (const [year, journals] of Object.entries(stats.top5)) {
    const cells = j ? [journals[j]] : Object.values(journals);
    if (metric === "share" && cells.some((c) => c.total === null)) continue;
    const total = cells.reduce(
      (n, c) => n + (metric === "indexed" ? c.cataloguedTotal : c.total || 0),
      0,
    );
    const count = cells.reduce(
      (n, c) =>
        n +
        (metric === "share"
          ? c.inToc
          : metric === "indexed"
            ? c.cataloguedHealth
            : c.found),
      0,
    );
    pts.push({
      year,
      total,
      count,
      value: metric !== "count" ? (100 * count) / total : count,
    });
  }
  const now = current.filter((w) => !j || w.venue === j);
  return (
    titleblock(
      "期刊观察",
      "Top 5 趋势",
      "回看五大经济学期刊中健康研究的发表情况。点击图上的年份，即可核对组成该点的论文。",
    ) +
    `<section class="box"><div class="row"><h2>${j || "五刊合计"} · ${metric === "share" ? "卷期占比" : metric === "indexed" ? "目录占比" : "发表篇数"}</h2><form class="controls">${select("venue", "五刊合计", jnames, j)}<select name="metric" aria-label="指标"><option value="count">篇数</option><option value="share" ${metric === "share" ? "selected" : ""}>卷期占比</option><option value="indexed" ${metric === "indexed" ? "selected" : ""}>目录占比</option></select><button>更新图表</button></form></div>${chart(pts, j, metric)}<details><summary>查看年度数字</summary><table><thead><tr><th>年份</th><th>健康研究</th>${metric !== "count" ? "<th>同口径总数</th><th>占比</th>" : ""}</tr></thead><tbody>${pts.map((point) => `<tr><td><a href="${esc(href("library", { year: point.year, venue: j, series: metric === "share" ? "toc" : metric === "indexed" ? "issue" : "trend" }))}">${point.year}</a></td><td>${point.count}</td>${metric !== "count" ? `<td>${point.total}</td><td>${point.value.toFixed(1)}%</td>` : ""}</tr>`).join("")}</tbody></table></details><p class="meta">${metric === "share" ? "2010–2025 · 占比＝同刊当年卷期内收录的健康研究 ÷ 该刊卷期研究论文总数。" : metric === "indexed" ? "2003–2026 · 分母为本站同刊当年有卷期的目录条目，已去除识别出的期务、会议论文与评论等。" : "2003–2026 · 按年展示本站收录的健康研究。会议论文、评论、讲座和提前在线稿单列。2026 年截至 11 月 24 日。"}</p></section>
  <section><div class="row"><h2>2026 年至今</h2>${btn("浏览本年清单 →", "library", { period: "current", venue: j })}</div><p>截至 11 月 24 日，当前筛得 ${now.length} 篇。其中 ${now.filter((w) => w.set === "本年卷期").length} 篇归入本年卷期，其余为在线发表记录。题名可进入论文页。</p><div class="list">${now.map(paper).join("") || "暂无已核条目"}</div></section>`
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
      (!p.get("series") ||
        (w.trend &&
          (p.get("series") !== "toc" || w.inToc) &&
          (p.get("series") !== "issue" || w.catalogueIssue))) &&
      (!period || current.includes(w)) &&
      (!year || w.year === year) &&
      (!venue || w.venue === venue) &&
      (!topic || w.topic === topic) &&
      (!region || w.region === region) &&
      (!p.get("method") || w.methodMentions?.includes(p.get("method"))) &&
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
      "按年份、期刊、主题或研究地点查找论文，展开条目即可阅读摘要。",
    ) +
    `<form class="controls"><input name="q" aria-label="题名、作者或 DOI" placeholder="题名、作者或 DOI" value="${esc(q)}">${select("venue", "所有期刊或系列", [...new Set([...jnames, "Journal of Health Economics", "Health Economics", "NBER", "arXiv", "SSRN", venue].filter(Boolean))], venue)}${select("year", "全部年份", [...new Set(works.map((w) => w.year).filter(Boolean))].sort().reverse(), year)}${select("topic", "全部主题", unique("topic"), topic)}${select("method", "摘要提及的方法", [...new Set(works.flatMap((w) => w.methodMentions || []))].sort(), p.get("method") || "")}${select("region", "国家或研究场景", unique("region"), region)}<select name="scope" aria-label="目录范围"><option value="">健康研究目录</option><option value="all" ${scope === "all" ? "selected" : ""}>跨学科目录</option></select><button>筛选</button><a href="#library">重置</a></form>
  <div class="row"><p class="meta">${set ? esc(set) + " · " : ""}${period ? "本年清单 · " : ""}共 ${fmt(visible.length)} 条 · 按年份降序</p><button id="export">导出当前书目</button></div><div class="list">${
    visible
      .slice((page - 1) * 24, page * 24)
      .map(paper)
      .join("") || "没有匹配的文献。"
  }</div><div class="paging">${page > 1 ? btn("上一页", "library", { ...Object.fromEntries(p), page: page - 1 }) : ""}${page} / ${pages}${page < pages ? btn("下一页", "library", { ...Object.fromEntries(p), page: page + 1 }) : ""}</div>`
  );
}
function front() {
  const entries = Object.entries(stats.nber).reverse();
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
      "按首次公开年份，浏览进入期刊之前的健康经济学研究。",
    ) +
    `<section class="box"><div class="row"><h2>NBER · 卫生经济学项目</h2>${btn("浏览文献", "library", { venue: "NBER" })}</div><table><thead><tr><th>首次发布年</th><th>EH 项目</th><th>全部工作论文</th><th>项目占比</th></tr></thead><tbody>${table}</tbody></table><p class="meta">比例为 NBER 当年工作论文中归入 Economics of Health 的份额。同一篇论文可属于多个项目，此处只计一次。本年度统计至 ${esc(stats.nberLatest)}。</p></section>
  <section class="box"><h2>arXiv · 跨学科预印本</h2><p>查看 arXiv 全站和经济学分类每年的预印本数量。经济学分类于 2017 年设立，早年记录按现有分类回溯。</p><table><thead><tr><th>公告年</th><th>全站记录</th><th>含经济学分类</th></tr></thead><tbody>${Object.entries(
    frontier.years,
  )
    .map(
      ([y, [all, econ]]) =>
        `<tr><td>${y}</td><td>${fmt(all)}</td><td>${fmt(econ)}</td></tr>`,
    )
    .join(
      "",
    )}</tbody></table><p class="meta">按首次公告月份统计，截止 ${esc(frontier.lastMonth)}，可能为部分月份。</p>${btn("浏览健康研究", "library", { venue: "arXiv" })}</section>`
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
    titleblock("研究问题", "研究主题", "选择感兴趣的问题，浏览相关论文。") +
    cards(
      Object.entries(question).map(([topic, desc]) => [
        (stats.topics[topic] || 0) + " 篇",
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
    `<section class="box"><h2>五大刊与专业期刊</h2><p>篇数按同刊同年已收录的健康研究计算。目录占比采用本站有卷期的同刊条目，2010–2025 年另可对照独立卷期目录计算研究论文占比。专业期刊和工作论文可在文献概览中单独浏览。</p><a href="https://github.com/kochiuyu/econ-journal-authors">卷期核对数据 ↗</a> · <a href="https://openalex.org/">OpenAlex ↗</a></section>
  <section class="box"><h2>工作论文与时间</h2><p>NBER 以首次发布日期计年。2023 年两个卫生研究项目合并，历史数据按现有项目归属回溯。arXiv 用原始公告编号计月。首次公开是可观测时间，实际构思可能更早。不同系列和发表版本分别保留。</p><a href="https://www.nber.org/research/data/nber-working-papers-and-chapters-metadata">NBER 原始数据 ↗</a> · <a href="https://www.nber.org/programs-projects/programs-working-groups/economics-health">NBER 项目沿革 ↗</a> · <a href="https://huggingface.co/datasets/librarian-bots/arxiv-metadata-snapshot">arXiv 元数据镜像 ↗</a></section>
  <section class="box"><h2>阅读全文</h2><p>有开放版本的论文提供 arXiv 或 OpenAlex 登记的全文入口；期刊页面可能另有机构访问要求。个人收藏的 PDF 可在本地打开。</p><a class="btn" href="reader.html">打开本机全文阅读器</a></section><p class="meta">首页插图为 Mary Cassatt 的 The Child’s Bath（1893），取自 <a href="https://www.artic.edu/artworks/111442/the-child-s-bath">芝加哥艺术博物馆公共领域馆藏</a>。</p>`
  );
}
let exportRows = [];
function render() {
  const [route, query] = location.hash.slice(1).split("?"),
    page = route || "home",
    p = new URLSearchParams(query);
  const pages = {
    home,
    trends,
    library,
    paper: paperPage,
    frontier: front,
    atlas,
    about,
  };
  el.innerHTML = (pages[page] || home)(p);
  document.querySelectorAll("nav a").forEach((a) => {
    if (a.hash === "#" + page) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  for (const node of el.querySelectorAll(".paper-detail")) {
    node.addEventListener("toggle", () => readDetail(node));
    if (node.open) readDetail(node);
  }
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
  const url = new URL("data/" + file + ".json", import.meta.url);
  url.search = new URL(import.meta.url).search;
  const r = await fetch(url);
  if (!r.ok) throw Error(file);
  return r.json();
}
let catalogRequest, statsRequest, frontierRequest;
function loadCatalog() {
  return (catalogRequest ||= Promise.all(
    ["papers-index", "open-copies"].map(get),
  )
    .then(([index, links]) => {
      works = index;
      openCopies = links;
      byId = new Map(works.map((w) => [w.id, w]));
      for (const w of works)
        w.search = [
          w.title,
          w.titleZh,
          w.authors,
          w.id,
          w.venue,
          w.question,
          w.topic,
        ]
          .join(" ")
          .toLowerCase();
      works.sort(
        (a, b) =>
          Number(b.year) - Number(a.year) ||
          a.venue.localeCompare(b.venue) ||
          a.title.localeCompare(b.title),
      );

      current = works.filter((w) => ["本年卷期", "本年在线"].includes(w.set));
    })
    .catch((error) => {
      catalogRequest = undefined;
      throw error;
    }));
}
function loadStats() {
  return (statsRequest ||= get("archive-stats")
    .then((rows) => {
      stats = rows;
    })
    .catch((error) => {
      statsRequest = undefined;
      throw error;
    }));
}
function loadPreprints() {
  return (frontierRequest ||= get("arxiv")
    .then((rows) => {
      frontier = rows;
    })
    .catch((error) => {
      frontierRequest = undefined;
      throw error;
    }));
}
let navigation = 0;
async function navigate() {
  const ticket = ++navigation,
    route = location.hash.slice(1).split("?")[0] || "home";
  const needs = [];
  if (["trends", "library", "paper"].includes(route)) needs.push(loadCatalog());
  if (["trends", "atlas", "frontier"].includes(route)) needs.push(loadStats());
  if (route === "frontier") needs.push(loadPreprints());
  if (needs.length) el.textContent = "正在读取…";
  try {
    await Promise.all(needs);
    if (ticket !== navigation) return;
    render();
    window.scrollTo(0, 0);
  } catch (error) {
    if (ticket !== navigation) return;
    el.replaceChildren(document.createTextNode("页面数据暂时无法载入。 "));
    const button = document.createElement("button");
    button.textContent = "重试";
    button.onclick = navigate;
    el.append(button);
  }
}
window.addEventListener("hashchange", navigate);
navigate();
