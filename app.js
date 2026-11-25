import {
  journals as jnames,
  escapeText as esc,
  routeLink as href,
  lineFigure,
  activateFigures,
  topSeries,
  nberSeries,
  bars,
} from "./figures.js?v=20261125-sources";
const el = document.querySelector("#app");
const fmt = (n) => Number(n).toLocaleString("zh-CN");
const btn = (title, page, params = {}) =>
  `<a class="btn" href="${esc(href(page, params))}">${esc(title)}</a>`;
const detailCache = new Map();
const readingYears = new Map();
let readingIndex = {}, readingRequest;
function loadReadingIndex() {
  return readingRequest ||= get("readings/index").then(index => { readingIndex = index; })
    .catch(() => { readingRequest = undefined; });
}
const readingVersions = {workingPaper:"工作论文版",acceptedVersion:"作者定稿",submittedVersion:"投稿稿",preprint:"预印本",publishedVersion:"期刊发表版",publisherCopy:"出版社版本",repositoryFullText:"机构库版本",localCopy:"本地核对版本",openCopy:"公开版本"};
let stats, byId;
let works;
const isCurrent = w => w.set === "本年卷期" || w.set === "本年在线";
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
function abstractSource(source) {
  if (!source?.startsWith("Top5 Papers · ")) return source === "RePEc-JPE" ? "RePEc" : source;
  const names = {crossref: "Crossref", openalex: "OpenAlex", repec: "RePEc", "working-paper": "工作论文版本"};
  return names[source.split(" · ")[1]] || "Top5 Papers";
}
function paper(w, expanded = false) {
  const internal = href("paper", { id: w.id, group: paperGroup(w) });
  const url = w.id.startsWith("10.") ? "https://doi.org/" + w.id : w.id;
  const safe = /^https:\/\/(doi\.org|openalex\.org|arxiv\.org)\//i.test(url);
  const identifier = w.id.startsWith("10.") ? "DOI · " + w.id : "书目标识";
  const verified = Object.entries(w.fulltextTags || {});
  const modelTags = Object.entries(readingIndex[w.id] || {}).filter(([label]) => !Object.hasOwn(w.fulltextTags || {}, label));
  const badges = verified.map(([label, pages]) =>
    `<span title="已核对全文 · PDF 第 ${esc(pages.join("、"))} 页">${esc(label)}</span>`
  ).concat(modelTags.map(([label]) => `<span title="本地模型据正文识别">${esc(label)}</span>`)).join("");
  return `<article class="paper"><div class="meta">${esc(w.date || w.year)} · ${esc(w.venue)}${w.volume ? " · 卷 " + esc(w.volume) : ""}${w.issue ? " · 第 " + esc(w.issue) + " 期" : ""}${w.set === "本年在线" ? " · 提前在线" : ""}${w.articleType ? " · " + esc(w.articleType) : ""}</div><${expanded ? "h1" : "h3"}>${expanded ? esc(w.titleZh || w.title) : `<a href="${esc(internal)}">${esc(w.titleZh || w.title)}</a>`}</${expanded ? "h1" : "h3"}>${w.titleZh ? `<p lang="en">${esc(w.title)}</p>` : ""}${w.question ? `<p>${esc(w.question)}</p>` : ""}<div class="meta">${esc((w.authors || "").replaceAll(" | ", ", "))}</div>${[
    w.fulltextTags?.[w.topic] ? "" : w.topic,
    w.region,
  ]
    .filter((x) => x && x !== "待核")
    .map((x) => `<span class="tag">${esc(x)}</span>`)
    .join(
      "",
    )}${badges ? `<div class="paper-tags" role="group" aria-label="已核对全文的标签">${badges}</div>` : ""}${(w.hasDetail || Object.hasOwn(readingIndex,w.id)) ? `<details class="paper-detail" data-year="${esc(w.year)}" data-key="${esc(w.id)}" ${expanded === true ? "open" : ""}><summary>${w.hasAbstract ? "阅读摘要" : "论文信息"}</summary><div class="abstract-body"></div></details>` : expanded === true ? "<p>这篇论文暂缺公开摘要。</p>" : ""}<div class="paper-actions">${safe ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(identifier)} ↗</a>` : ""}</div></article>`;
}
function paperPage(p) {
  const w = byId.get(p.get("id"));
  return w
    ? `<div class="reading-page"><p class="reading-back"><a href="#library">← 文献概览</a></p>${paper(w, true)}</div>`
    : '<p>没有找到这篇论文。<a href="#library">浏览文献</a></p>';
}
async function readDetail(node) {
  if (!node.open || node.dataset.ready) return;
  node.dataset.ready = "loading";
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
    const entry = (await detailCache.get(year))[node.dataset.key] || {};
    const a = entry.abstract;
    const links = [];
    if (entry.workingPaper)
      links.push(
        `<a href="${esc(href("paper", { id: entry.workingPaper }))}">NBER 工作论文版</a>`,
      );
    box.innerHTML =
      (entry.abstractZh
        ? `<strong>中文译文</strong>${entry.translationSource ? ` <span class="meta">· ${esc(entry.translationSource)}</span>` : ""}<p>${esc(entry.abstractZh)}</p>`
        : "") +
      (a
        ? `<strong>${esc(a.version === "工作论文" ? "工作论文摘要" : a.version === "预印本" ? "预印本摘要" : "原文摘要")}</strong><p lang="en">${esc(a.text)}</p><small class="meta">摘要来源 · ${esc(abstractSource(a.source))}</small>`
        : "<p>这篇论文暂缺公开摘要。</p>") +
      (byId.get(node.dataset.key)?.methodMentions
        ? `<p class="meta">摘要提及的方法 · ${esc(byId.get(node.dataset.key).methodMentions.join(" · "))}</p>`
        : "") +
      (entry.jel?.length
        ? `<p class="meta">JEL · ${esc(entry.jel.join(" · "))}</p>`
        : "") +
      (links.length ? `<div class="paper-actions">${links.join(" ")}</div>` : "");
    if (Object.hasOwn(readingIndex,node.dataset.key)) {
      if (!readingYears.has(year)) readingYears.set(year,get("readings/"+year).catch(e=>{readingYears.delete(year);throw e;}));
      const note=(await readingYears.get(year))[node.dataset.key];
      if (note) {
        const locs=Object.entries(readingIndex[node.dataset.key]).map(([label,nums])=>esc(label)+" · 第 "+esc(nums.join("、"))+" "+esc(note.unit)).join("　");
        box.insertAdjacentHTML("beforeend",`<section class="research-note"><h3>中文导读</h3><small class="meta">${esc(readingVersions[note.version] || "馆藏全文")} · 本地模型据${esc(note.basis)}整理</small>${note.paragraphs.map(t=>"<p>"+esc(t)+"</p>").join("")}${locs ? "<details><summary>全文标签出处</summary><small>"+locs+"</small></details>" : ""}</section>`);
      }
    }
    node.dataset.ready = "1";
  } catch {
    delete node.dataset.ready;
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
const latestYear = () => stats.cutoff.slice(0, 4);
const sourceTitles = {
  top5: "经济学五大刊",
  nber: "NBER 工作论文",
};
const sourceNames = { top5: "Top 5", nber: "NBER" };

function homeSeries(venue, scope, compare) {
  const points = topSeries(stats, venue, scope);
  const years = new Set(points.map((v) => v.year));
  const lines = [{ name: (venue || "五大刊") + " · 健康研究", points }];
  if (compare)
    lines.push({
      name: "NBER · 健康项目",
      points: nberSeries(stats).filter((v) => years.has(v.year)),
    });
  return lineFigure(lines, true, "健康研究在各来源中的年度占比");
}
function homeFinding(venue, scope, compare) {
  const years = topSeries(stats, venue, scope).filter(p => p.year < latestYear());
  const end = years.at(-1), previous = years.at(-2);
  if (!end?.total || !previous?.total) return "";
  const pct = p => (p.count * 100 / p.total).toFixed(1) + "%";
  const subject = venue || "五大刊";
  const statements = [`${end.year} 年，${subject}共发表 ${end.count} 篇健康研究，占当年论文的 ${pct(end)}，上一年为 ${pct(previous)}。`];
  const nber = stats.nber[end.year];
  if (compare && nber?.[1])
    statements.push(`同年，NBER 每发表 100 篇工作论文，约有 ${Math.round(100 * nber[0] / nber[1])} 篇属于健康研究项目。`);
  return statements.join("");
}
function homeFeature() {
  return `<p class="definition"><strong>用经济学理解健康与医疗中的取舍。</strong></p>
    <div class="hero"><div class="copy"><p class="eyebrow">近期研究　/　NBER 工作论文</p><h1>街灯换了，<br>居民睡得更好吗？</h1><p>加拿大本拿比市陆续把老式街灯换成 LED 灯。研究者比较街区更换照明前后的变化，追踪居民的睡眠、心理健康和工作缺勤。</p><div class="actions">${btn("看研究摘要 →", "paper", { id: "10.3386/w36060" })}<span>2026 年 11 月</span></div></div><figure class="cover-print"><a href="https://www.nga.gov/artworks/127442-wet-night-columbus-circle-new-york" aria-label="查看馆藏完整照片"><img src="assets/fraser-wet-night-760.webp" srcset="assets/fraser-wet-night-480.webp 480w, assets/fraser-wet-night-760.webp 760w, assets/fraser-wet-night-1000.webp 1000w" sizes="(max-width: 650px) 91vw, (max-width: 850px) calc(54vw - 12px), (max-width: 1494px) 51.65vw, 775px" alt="纽约哥伦布圆环雨夜，树影之间的街灯倒映在湿漉漉的路面上" width="1000" height="535" fetchpriority="high"></a><figcaption>纽约哥伦布圆环的雨夜，1899 · William A. Fraser 摄影（局部） <a href="https://www.nga.gov/artworks/127442-wet-night-columbus-circle-new-york">美国国家美术馆 ↗</a></figcaption></figure></div>`;
}
function home(p) {
  const venue = jnames.includes(p.get("venue")) ? p.get("venue") : "";
  const scope = p.get("basis") === "issue" ? "issue" : "toc";
  const compare = p.get("nber") !== "off";
  const year = latestYear();
  return `${homeFeature()}
    <section class="home-trend"><div><h2>健康研究占多少？</h2><p id="home-finding">${esc(homeFinding(venue, scope, compare))}</p><form class="controls compact" data-auto>${select("venue", "五大刊合计", jnames, venue)}<select name="basis" aria-label="趋势时间范围"><option value="toc">2010–2025 · 核对卷期</option><option value="issue" ${scope === "issue" ? "selected" : ""}>2003 年起 · 收录卷期</option></select><label><input type="checkbox" name="showNber" ${compare ? "checked" : ""}> 对照 NBER</label></form><small>更新至 ${esc(stats.cutoff)}</small></div><div id="home-figure">${homeSeries(venue, scope, compare)}</div></section>
    <section class="shelf"><h2>${year} 年的研究</h2><p class="meta">截至 ${esc(stats.cutoff)}，本年累计</p><div class="editions">${[
      ["top5", "五大刊 · 卷期发表", topSeries(stats, "", "trend").at(-1).count],
      ["nber", "NBER · 健康项目", stats.nber[year][0]],
    ].map(([source, label, count]) =>
      `<a href="${href(source, { year, series: source === "top5" ? "trend" : "" })}"><span>${label}</span><strong>${count} <small>篇</small></strong><em>浏览论文 →</em></a>`
    ).join("")}</div></section>`;
}

function channel(page, p) {
  const top = page === "top5",
    nber = page === "nber";
  const venue = top && jnames.includes(p.get("venue")) ? p.get("venue") : "";
  const year =
    p.get("year") ||
    (top && p.get("series") === "toc"
      ? topSeries(stats, venue, "toc").at(-1).year
      : latestYear());
  const corpus = works.filter(
    (w) =>
      w.health &&
      (top
        ? jnames.includes(w.venue) && (w.trend || isCurrent(w))
        : w.venue === "NBER"),
  );
  const scope = top
    ? ["toc", "issue"].includes(p.get("series"))
      ? p.get("series")
      : "trend"
    : "";
  const percent =
    (top && scope !== "trend") || (nber && p.get("metric") !== "count");
  const points = top
    ? topSeries(stats, venue, scope)
    : nberSeries(stats);
  const lineName = top ? venue || "五刊合计" : sourceNames[page];
  const yearPapers = corpus.filter((w) => w.year === year);
  let side, breakdown;
  if (top) {
    side = "各刊收录篇数";
    breakdown = jnames
      .map((venue) => ({
        label: venue,
        value:
          topSeries(stats, venue, scope).find((r) => r.year === year)?.count ??
          null,
        link: href(page, { year, venue, series: scope, focus: "list" }),
      }))
      .filter((r) => r.value != null);
  } else {
    side = "各季发布篇数";
    breakdown = Array.from({ length: 4 }, (_, i) => ({
      label: "第 " + (i + 1) + " 季度",
      value: yearPapers.filter((w) => quarter(w) === String(i + 1)).length,
      link: href(page, { year, quarter: i + 1, focus: "list" }),
    })).filter(
      (r, i) =>
        year !== latestYear() ||
        i <= Math.floor((Number(stats.nberLatest.slice(5, 7)) - 1) / 3),
    );
  }
  const intro = top
    ? "查阅五大经济学期刊中的健康研究，比较不同期刊的发表数量与占比。"
    : "按首次发布年份，阅读 NBER 健康经济学项目的工作论文。";
  const controls = top
    ? `<form class="controls compact" data-auto>${select("venue", "五大刊合计", jnames, venue)}<select name="series" aria-label="图表指标"><option value="trend">发表篇数</option><option value="toc" ${scope === "toc" ? "selected" : ""}>年度占比 · 核对卷期</option><option value="issue" ${scope === "issue" ? "selected" : ""}>年度占比 · 收录卷期</option></select></form>`
    : `<form class="controls compact" data-auto><select name="metric" aria-label="图表指标"><option value="share">项目占比</option><option value="count" ${!percent ? "selected" : ""}>发布篇数</option></select></form>`;
  return (
    titleblock(sourceNames[page], sourceTitles[page], intro) +
    `<div class="overview"><section><h2>年度${percent ? "占比" : "篇数"}</h2>${controls}${lineFigure([{ name: lineName, points }], percent, lineName + "年度趋势")}<p class="meta">${scope === "toc" ? "2010–2025 年完整卷期" : "更新至 " + esc(nber ? stats.nberLatest : stats.cutoff)}</p></section><section><span class="eyebrow">${esc(year)} 年</span><h2>${side}</h2>${breakdown.length ? bars(breakdown) : "<p>该年没有这一口径的卷期记录。</p>"}</section></div>` +
    library(p, page, corpus)
  );
}
function quarter(w) {
  return w.date ? String(Math.ceil(Number(w.date.slice(5, 7)) / 3)) : "";
}
function library(p, page = "library", pool = works) {
  const general = page === "library",
    top = page === "top5",
    nber = page === "nber";
  const year = p.get("year") || "",
    venue = p.get("venue") || "",
    volume = p.get("volume") || "";
  const q = (p.get("q") || "").trim(),
    sort = p.get("sort") || "recent",
    series = p.get("series") || "";
  const unique = (key, source = pool) =>
    [...new Set(source.map((w) => w[key]).filter(value => value && value !== "待核"))].sort((a, b) =>
      String(a).localeCompare(String(b), "zh", { numeric: true }),
    );
  const available = pool.filter(
    (w) => (!year || w.year === year) && (!venue || w.venue === venue),
  );
  const term = q.toLowerCase();
  const visible = pool.filter(
    (w) =>
      (p.get("scope") === "all" || w.health) &&
      (!venue || w.venue === venue) &&
      (!year || w.year === year) &&
      (!series ||
        (w.trend &&
          (series !== "toc" || w.inToc) &&
          (series !== "issue" || w.catalogueIssue))) &&
      (!p.get("set") || w.set === p.get("set")) &&
      (!p.get("period") || isCurrent(w)) &&
      (!p.get("quarter") || quarter(w) === p.get("quarter")) &&
      (!volume || (volume === "unknown" ? !w.volume : w.volume === volume)) &&
      (!p.get("issue") || w.issue === p.get("issue")) &&
      (!p.get("topic") || w.topic === p.get("topic")) &&
      (!p.get("method") || w.methodMentions?.includes(p.get("method"))) &&
      (!p.get("fulltext") || Object.hasOwn(w.fulltextTags || {}, p.get("fulltext")) || Object.hasOwn(readingIndex[w.id] || {}, p.get("fulltext"))) &&
      (!p.get("region") || w.region === p.get("region")) &&
      (p.get("abstract") !== "yes" || w.hasAbstract) &&
      (p.get("abstract") !== "no" || !w.hasAbstract) &&
      (p.get("zh") !== "title" || w.titleZh) &&
      (p.get("zh") !== "abstract" || w.hasAbstractZh) &&
      (!term || w.search.includes(term)),
  );
  const chronological = (a, b) =>
    Number(a.year) - Number(b.year) ||
    (a.date || "").localeCompare(b.date || "") ||
    String(a.volume || "").localeCompare(String(b.volume || ""), "en", {
      numeric: true,
    }) ||
    String(a.issue || "").localeCompare(String(b.issue || ""), "en", {
      numeric: true,
    });
  visible.sort(
    (a, b) =>
      (sort === "title"
        ? 0
        : sort === "old"
          ? chronological(a, b)
          : chronological(b, a)) || a.title.localeCompare(b.title),
  );
  exportRows = visible;
  const pages = Math.max(1, Math.ceil(visible.length / 24)),
    num = Math.max(1, Math.min(pages, parseInt(p.get("page")) || 1));
  const fields = [
    '<input type="search" name="q" aria-label="搜索论文" placeholder="搜索题名、作者或 DOI" value="' +
      esc(q) +
      '">',
    general || top
      ? select(
          "venue",
          top ? "五大刊合计" : "所有来源",
          top ? jnames : unique("venue"),
          venue,
        )
      : "",
    `<select name="abstract" aria-label="摘要"><option value="">全部论文</option><option value="yes" ${p.get("abstract") === "yes" ? "selected" : ""}>有摘要</option><option value="no" ${p.get("abstract") === "no" ? "selected" : ""}>未附摘要</option></select>`,
    select("year", "全部年份", unique("year").reverse(), year),
    nber
      ? select("quarter", "全部季度", ["1", "2", "3", "4"], p.get("quarter"))
      : "",
    !general && !nber
      ? select(
          "volume",
          "全部卷",
          unique("volume", available)
            .reverse()
            .concat(volume === "unknown" ? ["unknown"] : []),
          volume,
        )
      : "",
    !general && !nber && unique("issue", available).length
      ? select(
          "issue",
          "全部期",
          unique(
            "issue",
            available.filter((w) => !volume || w.volume === volume),
          ),
          p.get("issue"),
        )
      : "",
    general ? select("topic", "全部主题", unique("topic"), p.get("topic")) : "",
    select("fulltext", "全文标签", [...new Set(pool.flatMap(w => [...Object.keys(w.fulltextTags || {}), ...Object.keys(readingIndex[w.id] || {})]))].sort(), p.get("fulltext")),
    general
      ? select("region", "研究地点", unique("region"), p.get("region"))
      : "",
    general
      ? select(
          "method",
          "摘要提及的方法",
          [...new Set(pool.flatMap((w) => w.methodMentions || []))].sort(),
          p.get("method"),
        )
      : "",
    general
      ? '<select name="scope" aria-label="目录范围"><option value="">健康研究目录</option><option value="all" ' +
        (p.get("scope") === "all" ? "selected" : "") +
        ">跨学科目录</option></select>"
      : "",
    '<select name="sort" aria-label="排列顺序"><option value="recent">由近及远</option><option value="old" ' +
      (sort === "old" ? "selected" : "") +
      '>由远及近</option><option value="title" ' +
      (sort === "title" ? "selected" : "") +
      ">按题名</option></select>",
  ].join("");
  const pg = (n, label) =>
    btn(label, page, { ...Object.fromEntries(p), page: n, focus: "list" });
  const context = [
    p.get("set"),
    p.get("period") ? "本年清单" : "",
    series === "toc"
      ? "独立卷期"
      : series === "issue"
        ? "本站卷期"
        : series === "trend"
          ? "卷期发表"
          : "",
  ]
    .filter(Boolean)
    .map(esc)
    .join(" · ");
  return (
    (general
      ? titleblock(
          "文献索引",
          "文献概览",
          "检索各来源的文献，展开题名下的摘要，或保存当前书目。",
        )
      : "") +
    `<section id="papers"><div class="row"><h2>${general ? "检索文献" : "论文目录"}</h2>${top ? '<a href="' + href(page, { year: latestYear(), period: "current", focus: "list" }) + '">本年度论文（含提前在线） →</a>' : ""}</div><form class="controls filters" data-list>${fields}<button type="submit">查找</button><a href="#${page}">重置</a></form><div class="row"><p class="meta" role="status">${context ? context + " · " : ""}共 ${fmt(visible.length)} 篇</p><button class="text-action" id="export">导出书目 ↓</button></div><div class="list">${
      visible
        .slice((num - 1) * 24, num * 24)
        .map((w) => paper(w))
        .join("") ||
      '<p class="empty">没有符合这些条件的论文。<a href="#' +
        page +
        '">清除筛选</a></p>'
    }</div><div class="paging">${num > 1 ? pg(num - 1, "上一页") : ""}${num} / ${pages}${num < pages ? pg(num + 1, "下一页") : ""}</div></section>`
  );
}
function atlas() {
  const counts = new Map();
  for (const w of works) {
    if (w.topic) counts.set(w.topic, (counts.get(w.topic) || 0) + 1);
  }
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
        (counts.get(topic) || 0) + " 篇",
        topic,
        desc,
        "library",
        { topic },
      ]),
    )
  );
}
function about() {
  return `<article class="about-page"><h1>关于 healthecon</h1>
  <p class="about-lead">整理 2020—2024 年经济学五大刊的健康研究时，我想知道，哪些问题反复出现在这些期刊上？把时间再往前拉十年，看到的还是同一幅图景吗？这个网站就是从那份书单开始的。</p>
  <section><h2>从工作论文到期刊发表</h2><p>五大刊让人看到，健康议题何时进入综合经济学期刊。NBER 工作论文往往更早流通，适合追踪最近有哪些问题引起了研究者的兴趣。</p>
  <p>你可以从首页的一年开始，沿着折线找到当年的论文。也可以直接在<a href="#library">文献概览</a>里查作者和题名，展开摘要，把筛选后的书目导出。想随意翻翻，可以从<a href="#atlas">研究主题</a>里的一个问题读起。</p></section>
  <section><h2>这些数字怎样读</h2><p>五大刊按卷期发表年计，NBER 按工作论文首次发布年计。每个比例的分母都是本来源当年的论文总数。五大刊依据本站逐篇选录，NBER 依据健康研究项目归属。一篇工作论文后来在期刊发表，两个来源会分别记录它。</p>
  <p>首页默认的五刊占比使用 2010–2025 年独立核对的卷期目录。想看更早的年份，可以切换到 2003 年起的本站卷期目录。今年的数字会随新论文增加。发现漏收、误收或年份有误，欢迎在 <a href="https://github.com/fyapeng/healthecon/issues">GitHub 留言</a>，附上题名或 DOI 就好。</p></section>
  <section><h2>资料与致谢</h2><p>五刊卷期参考 <a href="https://github.com/kochiuyu/econ-journal-authors">Econ Journal Authors</a>（<a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>），AER 采用常规期。2017 年及以前的年会专期与 2018 年起独立出版的 AEA Papers and Proceedings 均已从目录和统计中剔除。工作论文来自 <a href="https://www.nber.org/research/data/nber-working-papers-and-chapters-metadata">NBER 公开书目</a>，历史项目按<a href="https://www.nber.org/programs-projects/programs-working-groups/economics-health">合并后的健康研究项目</a>回溯。各篇摘要标有来源。</p>
  <p>首页雨夜街景摄于 1899 年，记录纽约哥伦布圆环的街灯。摄影师 William A. Fraser，公有领域作品，藏于<a href="https://www.nga.gov/artworks/127442-wet-night-columbus-circle-new-york">美国国家美术馆</a>。</p></section></article>`;
}
let exportRows = [];
function render() {
  const [route, query] = location.hash.slice(1).split("?"),
    page = canonical(route),
    p = new URLSearchParams(query);
  if (route === "trends" && !p.has("series"))
    p.set(
      "series",
      { share: "toc", indexed: "issue" }[p.get("metric")] || "trend",
    );
  const pages = {
    home,
    top5: (p) => channel("top5", p),
    nber: (p) => channel("nber", p),
    library,
    paper: paperPage,
    atlas,
    about,
  };
  el.innerHTML = (pages[page] || home)(p);
  activateFigures(el, p.get("year") || (stats && String(Number(latestYear()) - 1)));
  document.querySelectorAll("nav a").forEach((a) => {
    if (
      a.hash ===
      "#" + (page === "paper" ? "library" : page)
    )
      a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  for (const node of el.querySelectorAll(".paper-detail")) {
    node.addEventListener("toggle", () => readDetail(node));
    if (node.open) readDetail(node);
  }
  for (const form of el.querySelectorAll("form")) {
    const apply = () => {
      const next = new URLSearchParams(p);
      next.delete("page");
      next.delete("focus");
      for (const [key, value] of new FormData(form))
        value ? next.set(key, value) : next.delete(key);
      if (form.elements.showNber) {
        next.delete("showNber");
        if (form.elements.showNber.checked) next.delete("nber");
        else next.set("nber", "off");
      }
      if (form.hasAttribute("data-list")) next.set("focus", "list");
      const url = href(page, Object.fromEntries(next));
      if (page === "home" && form.elements.showNber) {
        history.replaceState(history.state, "", url);
        const figure = document.getElementById("home-figure");
        const expanded = figure.querySelector("details")?.open;
        const year = figure.querySelector("input[type=range]")?.getAttribute("aria-valuetext");
        const args = [form.elements.venue.value, form.elements.basis.value, form.elements.showNber.checked];
        figure.innerHTML = homeSeries(...args);
        document.getElementById("home-finding").textContent = homeFinding(...args);
        activateFigures(figure, year);
        if (expanded) figure.querySelector("details").open = true;
        return;
      }
      location.hash = url;
    };
    form.onsubmit = (e) => {
      e.preventDefault();
      apply();
    };
    if (form.hasAttribute("data-auto")) form.onchange = apply;
    if (form.hasAttribute("data-list"))
      form.addEventListener("change", (e) => {
        if (e.target.matches('[name="year"],[name="venue"],[name="volume"]')) {
          if (e.target.name !== "volume" && form.elements.volume)
            form.elements.volume.value = "";
          if (form.elements.issue) form.elements.issue.value = "";
        }
      });
  }
  const ex = el.querySelector("#export");
  if (ex)
    ex.onclick = () => {
      const text = exportRows
        .map((w) =>
          [w.year, w.venue, w.titleZh, w.title, w.authors, w.id, w.topic, w.region]
            .map((x) => String(x ?? "").replace(/[\t\r\n]/g, " "))
            .join("\t"),
        )
        .join("\r\n");
      const u = URL.createObjectURL(
        new Blob(
          ["\uFEFF年份\t刊物\t中文题名\t原题\t作者\t标识\t主题\t国家或场景\r\n", text],
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
let statsRequest;
const healthGroups = ["top5", "nber", "other"];
const catalogRequests = new Map();
function paperGroup(w) {
  if (!w.health) return "all";
  if (jnames.includes(w.venue)) return "top5";
  return w.venue === "NBER" ? "nber" : "other";
}
function catalogGroup(group) {
  if (!catalogRequests.has(group)) {
    const file = group === "all" ? "papers-index" : "index/" + group;
    const request = get(file).then(records => {
      const rows = group === "all"
        ? records.filter(w => w.venue !== "Journal of Health Economics" && w.venue !== "Health Economics")
        : records;
      for (const w of rows)
        w.search = [w.title, w.titleZh, w.authors, w.id, w.venue, w.question, w.topic].join(" ").toLowerCase();
      return rows;
    }).catch(error => {
      catalogRequests.delete(group);
      throw error;
    });
    catalogRequests.set(group, request);
  }
  return catalogRequests.get(group);
}
async function catalogFor(route, params) {
  if (route === "paper") {
    const id = params.get("id");
    if (byId?.has(id)) return [byId.get(id)];
    const hint = params.get("group") || (id?.startsWith("10.3386/") ? "nber" : "");
    if (healthGroups.includes(hint)) {
      const rows = await catalogGroup(hint);
      if (rows.some(w => w.id === id)) return rows;
    }
    return catalogGroup("all");
  }
  if (healthGroups.includes(route)) return catalogGroup(route);
  if (route === "library" || route === "atlas") {
    if (route === "library" && params.get("scope") === "all") return catalogGroup("all");
    return (await Promise.all(healthGroups.map(catalogGroup))).flat();
  }
}
function loadingView(route) {
  const block = '<div class="loading-block" aria-hidden="true"><i></i><i></i><i></i></div>';
  const status = '<span class="sr-only" role="status">正在载入页面</span>';
  return route === "home" ? homeFeature() + status + block :
    `<div class="loading-page ${route === "paper" ? "reading-page" : ""}">${status}${block}${block}</div>`;
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
function canonical(route) {
  return { trends: "top5", frontier: "nber", jhe: "library", he: "library" }[route] || route || "home";
}
let navigation = 0;
async function navigate() {
  const ticket = ++navigation,
    route = canonical(location.hash.slice(1).split("?")[0]);
  const params = new URLSearchParams(location.hash.split("?")[1]);
  const needsStats = !["library", "paper", "about", "atlas"].includes(route);
  if (!el.dataset.rendered || el.dataset.route !== route) el.innerHTML = loadingView(route);
  el.setAttribute("aria-busy", "true");
  try {
    const [rows] = await Promise.all([catalogFor(route, params), needsStats && loadStats(), loadReadingIndex()]);
    if (ticket !== navigation) return;
    if (rows) {
      works = rows;
      byId = new Map(rows.map(w => [w.id, w]));
    }
    el.dataset.rendered = "true";
    el.dataset.route = route;
    el.removeAttribute("aria-busy");
    render();
    menu.setAttribute("aria-expanded", "false");
    document.querySelector("#main-nav").classList.remove("open");
    if (
      new URLSearchParams(location.hash.split("?")[1]).get("focus") === "list"
    )
      document.querySelector("#papers")?.scrollIntoView();
    else window.scrollTo(0, 0);
  } catch (error) {
    if (ticket !== navigation) return;
    el.removeAttribute("aria-busy");
    el.replaceChildren(document.createTextNode("页面数据暂时无法载入。 "));
    const button = document.createElement("button");
    button.textContent = "重试";
    button.onclick = navigate;
    el.append(button);
  }
}
const menu = document.querySelector(".menu-toggle");
menu.addEventListener("click", () => {
  const open = document.querySelector("#main-nav").classList.toggle("open");
  menu.setAttribute("aria-expanded", String(open));
});
const clock = document.querySelector("#clock-time");
const zone = new Intl.DateTimeFormat().resolvedOptions().timeZone;
const clockFormat = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});
const calendar = new Intl.DateTimeFormat("zh-CN", {
  month: "numeric",
  day: "numeric",
  weekday: "short",
});
function tick() {
  const now = new Date();
  clock.dateTime = now.toISOString();
  clock.textContent = clockFormat.format(now);
  document.querySelector("#clock-zone").textContent =
    calendar.format(now) + " · 当地";
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
  );
  const elapsed = (now - midnight) / (tomorrow - midnight);
  clock.parentElement.style.setProperty(
    "--elapsed",
    (elapsed * 100).toFixed(2) + "%",
  );
  clock.parentElement.title =
    zone + " · 今天已过 " + Math.floor(elapsed * 100) + "%";
}
tick();
setInterval(tick, 1000);
window.addEventListener("hashchange", navigate);
navigate();
