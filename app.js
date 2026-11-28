import {
  journals as jnames,
  escapeText as esc,
  routeLink as href,
  lineFigure,
  activateFigures,
  compositionFigure,
  compositionCell,
  topSeries,
  nberSeries,
  bars,
} from "./figures.js?v=ec987d35e2-0cc851a6f0d3";
const el = document.querySelector("#app");
const localPreview = ["127.0.0.1","localhost"].includes(location.hostname) && location.port === "4173";
if (localPreview) {
  const previewURL = new URL(location.href);
  previewURL.port = "4174";
  location.replace(previewURL);
}
const apiBase = document.querySelector('meta[name="healthecon-api"]')?.content ||
  (localPreview ? "http://127.0.0.1:4174/api/v1/" : "");
const publicData = document.querySelector('meta[name="healthecon-public-data"]')?.content;
async function publication(name) {
  const response = await fetch(new URL(name + ".json",publicData));
  if (!response.ok) throw Object.assign(Error(name),{status:response.status});
  return response.json();
}
const apiPapers = new Map();
let composition, feature;
async function api(path, params = {}) {
  if (publicData && path === "paper") {
    const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(params.id)));
    const bucket = bytes[0].toString(16).padStart(2,"0") + (bytes[1] >> 6);
    const items = await publication("paper/"+bucket);
    if (!Object.hasOwn(items,params.id)) throw Object.assign(Error("paper"),{status:404});
    const paper = items[params.id];
    if (paper.labels) summaryIndex[params.id] = paper.labels;
    if (paper.reading) readingIndex[params.id] = paper.reading;
    return paper;
  }
  if (publicData && path !== "papers") return publication(path);
  const url = new URL(apiBase + path, location.href);
  url.search = new URLSearchParams(params);
  const response = await fetch(url);
  if (!response.ok) throw Object.assign(Error(path), {status:response.status});
  return response.json();
}
function apiPaper(id) {
  if (!apiPapers.has(id)) apiPapers.set(id, api("paper", {id}).catch(error => {
    apiPapers.delete(id);
    throw error;
  }));
  return apiPapers.get(id);
}
const fmt = (n) => Number(n).toLocaleString("zh-CN");
const btn = (title, page, params = {}) =>
  `<a class="btn" href="${esc(href(page, params))}">${esc(title)}</a>`;
const detailCache = new Map();
const readingYears = new Map();
let readingIndex = {}, readingRequest;
function loadReadingIndex() {
  return readingRequest ||= get("studies/index").then(index => { readingIndex = index; })
    .catch(() => { readingRequest = undefined; });
}
let taxonomy, taxonomyRequest, summaryIndex = {}, summaryRequest;
const topicAliases = new Map();
function setTaxonomy(data) {
    taxonomy = data;
    for (const {name, aliases} of Object.values(data.topics)) {
      for (const alias of [name, ...aliases]) topicAliases.set(alias, name);
    }
}
function loadTaxonomy() {
  if (taxonomy) return;
  return taxonomyRequest ||= get("taxonomy").then(setTaxonomy).catch(error => { taxonomyRequest = undefined; throw error; });
}
function loadSummaries() {
  return summaryRequest ||= get("summaries/index").then(data => {summaryIndex = data;})
    .catch(error => { summaryRequest = undefined; throw error; });
}
function topicsFor(w) {
  const entry = summaryIndex[w.id];
  if (!w.health || entry?.includeInTopics === false) return [];
  if (apiBase) return [...new Set((entry?.tags || []).map(n => topicAliases.get(n)).filter(Boolean))];
  const names = entry?.tagStage === "editorial" ? entry.tags :
    [w.topic, ...Object.keys(readingIndex[w.id] || {}), ...(entry?.tags || [])];
  return [...new Set(names.map(n => topicAliases.get(n)).filter(Boolean))];
}
function labelsFor(w, group) {
  const entry = summaryIndex[w.id];
  const all = new Set((apiBase && entry) || entry?.tagStage === "editorial" ? (entry.tags || []) :
    [...Object.keys(readingIndex[w.id] || {}), ...(entry?.tags || [])]);
  return Object.values(taxonomy[group]).filter(name => all.has(name));
}
function badgesFor(w) {
  return [["topic","主题",topicsFor(w)],["method","方法",labelsFor(w,"methods")],["data","数据",labelsFor(w,"data")]]
    .filter(([, ,items]) => items.length)
    .map(([key,title,items]) => `<div class="label-group label-${key}"><small>${title}</small>${items.map(name=>`<span>${esc(name)}</span>`).join("")}</div>`).join("");
}
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
  const badges = badgesFor(w);
  return `<article class="paper"><div class="meta">${esc(w.date || w.year)} · ${esc(w.venue)}${w.volume ? " · 卷 " + esc(w.volume) : ""}${w.issue ? " · 第 " + esc(w.issue) + " 期" : ""}${w.set === "本年在线" ? " · 提前在线" : ""}${w.articleType ? " · " + esc(w.articleType) : ""}</div><${expanded ? "h1" : "h3"}>${expanded ? esc(w.titleZh || w.title) : `<a href="${esc(internal)}">${esc(w.titleZh || w.title)}</a>`}</${expanded ? "h1" : "h3"}>${w.titleZh ? `<p lang="en">${esc(w.title)}</p>` : ""}${w.question ? `<p>${esc(w.question)}</p>` : ""}<div class="meta">${esc((w.authors || "").replaceAll(" | ", ", "))}</div>${[
    w.region,
  ]
    .filter((x) => x && x !== "待核")
    .map((x) => `<span class="tag">${esc(x)}</span>`)
    .join(
      "",
    )}${badges ? `<div class="paper-tags" role="group" aria-label="论文标签">${badges}</div>` : ""}${(w.hasDetail || Object.hasOwn(readingIndex,w.id)) ? `<details class="paper-detail" data-year="${esc(w.year)}" data-key="${esc(w.id)}" ${expanded === true && !Object.hasOwn(readingIndex,w.id) ? "open" : ""}><summary>${w.hasAbstract ? "阅读摘要" : "论文信息"}</summary><div class="abstract-body"></div></details>` : expanded === true ? "<p>这篇论文暂缺公开摘要。</p>" : ""}<div class="paper-actions">${safe ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(identifier)} ↗</a>` : ""}</div></article>`;
}
function paperPage(p) {
  const w = byId.get(p.get("id"));
  return w
    ? `<div class="reading-page"><p class="reading-back"><a href="#library">← 文献概览</a></p>${paper(w, true)}${(summaryIndex[w.id]?.hasSummary || Object.hasOwn(readingIndex,w.id)) ? `<section class="study-summary" aria-labelledby="study-heading" data-key="${esc(w.id)}" data-year="${esc(w.year)}"><h2 id="study-heading">Summary</h2><div class="study-body"></div></section>` : ""}</div>`
    : '<p>没有找到这篇论文。<a href="#library">浏览文献</a></p>';
}
async function readDetail(node) {
  if (!node.open || node.dataset.ready) return;
  node.dataset.ready = "loading";
  const box = node.querySelector(".abstract-body"),
    year = node.dataset.year;
  box.textContent = "正在读取…";
  if (!apiBase && !detailCache.has(year))
    detailCache.set(
      year,
      get("details/" + year).catch((error) => {
        detailCache.delete(year);
        throw error;
      }),
    );
  try {
    const entry = (apiBase ? (await apiPaper(node.dataset.key)).detail : (await detailCache.get(year))[node.dataset.key]) || {};
    const a = entry.abstract;
    const links = [];
    if (entry.workingPaper)
      links.push(
        `<a href="${esc(href("paper", { id: entry.workingPaper }))}">NBER 工作论文版</a>`,
      );
    box.innerHTML =
      (entry.abstractZh
        ? `<strong>中文摘要</strong><p>${esc(entry.abstractZh)}</p>`
        : "") +
      (a
        ? `<strong>${esc(a.version === "工作论文" ? "工作论文摘要" : a.version === "预印本" ? "预印本摘要" : "原文摘要")}</strong><p lang="en">${esc(a.text)}</p><small class="meta">摘要来源 · ${esc(abstractSource(a.source))}</small>`
        : "<p>这篇论文暂缺公开摘要。</p>") +
      (entry.jel?.length
        ? `<p class="meta">JEL · ${esc(entry.jel.join(" · "))}</p>`
        : "") +
      (links.length ? `<div class="paper-actions">${links.join(" ")}</div>` : "");
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
async function showStudy(section) {
  const box=section.querySelector(".study-body");
  const {year,key}=section.dataset;
  try {
    if (summaryIndex[key]?.hasSummary) {
      const sections = (apiBase ? (await apiPaper(key)).summary : (await get("summaries/" + year))[key]).sections;
      box.innerHTML = sections.map(s => s.name === "注释"
        ? `<details class="reading-notes"><summary>注释（${s.paragraphs.length}）</summary>${s.paragraphs.map(t=>`<p>${esc(t)}</p>`).join("")}</details>`
        : `<section><h3>${esc(s.name)}</h3>${s.paragraphs.map(t=>`<p>${esc(t)}</p>`).join("")}</section>`).join("");
      return;
    }
    if (!apiBase && !readingYears.has(year)) readingYears.set(year,get("studies/"+year).catch(e=>{readingYears.delete(year);throw e;}));
    const note=apiBase ? (await apiPaper(key)).study : (await readingYears.get(year))[key];
    if (!note) throw new Error("missing study");
    const pages=Object.entries(note.tagEvidence).map(([label,item])=>
      `<li><b>${esc(label)}</b>　${esc(item.reason)} <small>（第 ${esc(item.pages.join("、"))} ${esc(note.unit)}）</small></li>`).join("");
    box.innerHTML=note.paragraphs.map(p=>`<p>${esc(p.text)} <small class="study-loc">〔${esc(note.unit)} ${esc(p.pages.join("、"))}〕</small></p>`).join("")+
      (pages ? `<details><summary>标签依据</summary><ul>${pages}</ul></details>` : "");
  } catch {
    box.textContent="文章总结暂时无法载入。 ";
    const retry=document.createElement("button"); retry.textContent="重试"; retry.onclick=()=>showStudy(section); box.append(retry);
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
      name: "NBER · 健康研究",
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
    statements.push(`同年，NBER 每发表 100 篇工作论文，约有 ${Math.round(100 * nber[0] / nber[1])} 篇研究健康与医疗问题。`);
  return statements.join("");
}
function homeFeature() {
  const art = feature.image;
  const base = "assets/" + encodeURIComponent(art.base);
  const source = /^https:\/\//.test(art.source) ? esc(art.source) : "#";
  return `<p class="definition"><strong>用经济学理解健康与医疗中的取舍。</strong></p>
    <div class="hero"><div class="copy"><p class="eyebrow">${esc(feature.series)}</p><h1>${feature.headline.map(esc).join("<br>")}</h1><p>${esc(feature.description)}</p><div class="actions">${btn("看研究摘要 →","paper",{id:feature.paper})}<span>${esc(feature.date)}</span></div></div><figure class="cover-print"><a href="${source}" aria-label="查看馆藏完整照片"><img src="${base}-760.webp" srcset="${base}-480.webp 480w, ${base}-760.webp 760w, ${base}-1000.webp 1000w" sizes="(max-width: 650px) 91vw, (max-width: 850px) calc(54vw - 12px), (max-width: 1494px) 51.65vw, 775px" alt="${esc(art.alt)}" width="${Number(art.width)}" height="${Number(art.height)}" fetchpriority="high"></a><figcaption>${esc(art.caption)} <a href="${source}">${esc(art.credit)} ↗</a></figcaption></figure></div>`;
}
function home(p) {
  const venue = jnames.includes(p.get("venue")) ? p.get("venue") : "";
  const scope = p.get("basis") === "issue" ? "issue" : "toc";
  const compare = p.get("nber") !== "off";
  const year = latestYear();
  return `${homeFeature()}
    <section class="home-trend"><div><h2>健康研究占多少？</h2><p id="home-finding">${esc(homeFinding(venue, scope, compare))}</p><form class="controls compact" data-auto>${select("venue", "五大刊合计", jnames, venue)}<select name="basis" aria-label="趋势时间范围"><option value="toc">2010–2025 · 核对卷期</option><option value="issue" ${scope === "issue" ? "selected" : ""}>2003 年起 · 收录卷期</option></select><label><input type="checkbox" name="showNber" ${compare ? "checked" : ""}> 对照 NBER</label></form><small>更新至 ${esc(stats.cutoff)}</small></div><div id="home-figure">${homeSeries(venue, scope, compare)}</div></section>
    ${homeComposition()}
    <section class="shelf"><h2>${year} 年的研究</h2><p class="meta">截至 ${esc(stats.cutoff)}，本年累计</p><div class="editions">${[
      ["top5", "五大刊 · 卷期发表", topSeries(stats, "", "trend").at(-1).count],
      ["nber", "NBER · 健康研究", stats.nber[year][0]],
    ].map(([source, label, count]) =>
      `<a href="${href(source, { year, series: source === "top5" ? "trend" : "" })}"><span>${label}</span><strong>${count} <small>篇</small></strong><em>浏览论文 →</em></a>`
    ).join("")}</div></section>`;
}

const dimensions = {data:"数据来源", methods:"研究方法", topics:"研究主题"};
function tagItems(group) {
  return Object.entries(taxonomy[group]).map(([code,item]) => [code, item.name || item]);
}
function homeComposition() {
  if (!composition) return "";
  const ready = Object.values(composition).some(row => ["top5","nber"].some(key => row[key].total && row[key].coded === row[key].total));
  const selector = ready ? '<label>比较指标 <select id="composition-tag">' + Object.entries(dimensions).map(([group,title]) =>
    '<optgroup label="' + title + '">' + tagItems(group).map(([code,name]) => '<option value="' + esc(code) + '">' + esc(name) + '</option>').join("") + '</optgroup>'
  ).join("") + '</select></label>' : "";
  return `<section class="home-trend"><div><h2>健康研究用了哪些数据和方法？</h2><p>逐年比较五大刊和 NBER 健康研究中使用行政数据、结构估计、DID 以及讨论各个主题的论文比例。</p>${selector}</div><div id="composition-figure">${compositionFigure(composition,"admin","行政数据")}</div></section>`;
}

function journalBars(year, scope) {
  return jnames.flatMap(venue => {
    const point = topSeries(stats,venue,scope).find(row => row.year === year);
    return point ? [{label:venue, value:point.count, link:point.link}] : [];
  });
}
function updateTopSide(section, year) {
  const {venue, scope} = section.dataset;
  section.querySelector(".eyebrow").textContent = year + " 年";
  const group = section.querySelector("select")?.value || "journals";
  const body = section.querySelector(".side-body");
  if (group === "journals") {
    const items = journalBars(year,scope);
    body.innerHTML = items.length ? bars(items) : "<p>该年暂无卷期记录。</p>";
    return;
  }
  const key = (venue || "top5") + (scope === "trend" ? "" : ":" + scope);
  const cell = compositionCell(composition[year][key], group === "topics");
  const items = tagItems(group);
  const head = `<p class="meta">${esc(venue || "五刊合计")} · 已标注 ${cell.coded} / ${cell.total} 篇</p>`;
  if (!cell.coded) { body.innerHTML = head + (cell.total ? "<p>该年度尚无已标注论文。</p>" : "<p>该年度无收录论文。</p>"); return; }
  const complete = cell.total === cell.coded;
  const rows = items.map(([code,label]) => [label,cell.counts[code] || 0]).sort((a,b)=>b[1]-a[1]);
  body.innerHTML = head + '<div class="bars tag-bars">' + rows.map(([label,n]) =>
    `<div><span>${esc(label)}</span><meter min="0" max="${cell.coded}" value="${n}" aria-label="${esc(label)}"></meter><b>${complete ? (100*n/cell.total).toFixed(1)+"%" : n+" 篇"}</b></div>`
  ).join("") + '</div>';
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
    breakdown = journalBars(year,scope);
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
    : "按首次发布年份，阅读 NBER 中研究健康与医疗问题的工作论文。";
  const controls = top
    ? `<form class="controls compact" data-auto>${select("venue", "五大刊合计", jnames, venue)}<select name="series" aria-label="图表指标"><option value="trend">发表篇数</option><option value="toc" ${scope === "toc" ? "selected" : ""}>年度占比 · 核对卷期</option><option value="issue" ${scope === "issue" ? "selected" : ""}>年度占比 · 收录卷期</option></select></form>`
    : `<form class="controls compact" data-auto><select name="metric" aria-label="图表指标"><option value="share">健康研究占比</option><option value="count" ${!percent ? "selected" : ""}>发布篇数</option></select></form>`;
  const sidePanel = top ? `<section data-top-side data-venue="${esc(venue)}" data-scope="${esc(scope)}"><span class="eyebrow">${esc(year)} 年</span><h2>年度构成</h2>${composition ? '<label>查看 <select aria-label="年度构成指标"><option value="journals">各刊收录篇数</option>' + Object.entries(dimensions).map(([k,v])=>'<option value="'+k+'">'+v+'</option>').join("") + '</select></label>' : '<p>各刊收录篇数</p>'}<div class="side-body"></div></section>` :
    `<section data-quarter-side><span class="eyebrow">${esc(year)} 年</span><h2>${side}</h2><div class="side-body">${breakdown.length ? bars(breakdown) : "<p>暂无季度记录。</p>"}</div></section>`;
  return (
    titleblock(sourceNames[page], sourceTitles[page], intro) +
    `<div class="overview"><section><h2>年度${percent ? "占比" : "篇数"}</h2>${controls}${lineFigure([{ name: lineName, points }], percent, lineName + "年度趋势")}<p class="meta">${scope === "toc" ? "2010–2025 年完整卷期" : "更新至 " + esc(nber ? stats.nberLatest : stats.cutoff)}</p></section>${sidePanel}</div>` +
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
      (!p.get("topic") || topicsFor(w).includes(topicAliases.get(p.get("topic")) || p.get("topic")))
      && (!p.get("technique") || labelsFor(w,"methods").includes(p.get("technique")))
      && (!p.get("dataset") || labelsFor(w,"data").includes(p.get("dataset"))) &&
      (!(p.get("fulltext") || p.get("method")) || Object.hasOwn(readingIndex[w.id] || {}, p.get("fulltext") || p.get("method"))) &&
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
    select("topic", "研究主题", Object.values(taxonomy.topics).map(t => t.name), topicAliases.get(p.get("topic"))),
    select("technique", "研究方法", Object.values(taxonomy.methods), p.get("technique")),
    select("dataset", "数据类型", Object.values(taxonomy.data), p.get("dataset")),
    general
      ? select("region", "研究地点", unique("region"), p.get("region"))
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
  let covered = 0;
  for (const w of works) {
    const topics = topicsFor(w);
    if (topics.length) covered++;
    for (const name of topics) counts.set(name, (counts.get(name) || 0) + 1);
  }
  return titleblock("研究问题", "研究主题",
    `已有 ${fmt(covered)} 篇论文归入主题。同一篇论文可以回答几个问题。`) +
    cards(Object.values(taxonomy.topics).map(({name,question}) => [
      fmt(counts.get(name) || 0) + " 篇", name, question, "library", {topic:name}
    ]));
}
function about() {
  return `<article class="about-page"><h1>关于 healthecon</h1>
  <p class="about-lead">整理 2020—2024 年经济学五大刊的健康研究时，我想知道，哪些问题反复出现在这些期刊上？把时间再往前拉十年，看到的还是同一幅图景吗？这个网站就是从那份书单开始的。</p>
  <section><h2>从工作论文到期刊发表</h2><p>五大刊让人看到，健康议题何时进入综合经济学期刊。NBER 工作论文往往更早流通，适合追踪最近有哪些问题引起了研究者的兴趣。</p>
  <p>你可以从首页的一年开始，沿着折线找到当年的论文。也可以直接在<a href="#library">文献概览</a>里查作者和题名，展开摘要，把筛选后的书目导出。想随意翻翻，可以从<a href="#atlas">研究主题</a>里的一个问题读起。</p></section>
  <section><h2>这些数字怎样读</h2><p>五大刊按卷期发表年计，NBER 按工作论文首次发布年计。“健康研究占多少”把当年的健康论文与同一来源的全部论文相比。NBER 的项目归属提供候选书目，本站按论文的研究问题和实际应用核定收录范围。一篇工作论文后来在期刊发表，两个来源会分别记录它。</p>
  <p>数据、方法和主题的年度占比以该来源当年的健康论文为分母。一个年度完成全文标注后才会画出占比。同一篇可以使用多种方法，也可以讨论多个主题。</p>
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
  const side = el.querySelector("[data-top-side]");
  if (side) {
    const overview = side.closest(".overview");
    overview.addEventListener("inspectyear", e => updateTopSide(side,e.detail));
    side.querySelector("select")?.addEventListener("change", () => updateTopSide(side,overview.querySelector(".inspect-year strong").textContent));
  }
  const quarterSide = el.querySelector("[data-quarter-side]");
  if (quarterSide) {
    const counts = new Map();
    for (const w of works) {
      if (w.health && w.venue === "NBER") {
        const key = w.year + "-" + quarter(w);
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
    quarterSide.closest(".overview").addEventListener("inspectyear", ({detail: year}) => {
      quarterSide.querySelector(".eyebrow").textContent = year + " 年";
      const last = year === String(latestYear()) ? Math.ceil(Number(stats.nberLatest.slice(5,7))/3) : 4;
      quarterSide.querySelector(".side-body").innerHTML = bars(Array.from({length:last}, (_, i) => ({
        label: "第 " + (i+1) + " 季度", value: counts.get(year+"-"+(i+1)) || 0,
        link: href("nber",{year,quarter:i+1,focus:"list"})
      })));
    });
  }
  activateFigures(el, p.get("year") || (stats && (page === "top5" || page === "nber" ? latestYear() : String(Number(latestYear()) - 1))));
  const tag = el.querySelector("#composition-tag");
  if (tag) tag.onchange = () => {
    const figure=el.querySelector("#composition-figure");
    const year=figure.querySelector(".inspect-year strong")?.textContent;
    const group=Object.keys(dimensions).find(k=>Object.hasOwn(taxonomy[k],tag.value));
    figure.innerHTML=compositionFigure(composition,tag.value,tag.selectedOptions[0].textContent,group);
    activateFigures(figure,year);
  };
  document.querySelectorAll("nav a").forEach((a) => {
    if (
      a.hash ===
      "#" + (page === "paper" ? "library" : page)
    )
      a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  const study=el.querySelector(".study-summary");
  if (study) showStudy(study);
  for (const node of el.querySelectorAll(".paper-detail")) {
    node.addEventListener("toggle", () => readDetail(node));
    if (node.open) readDetail(node);
  }
  for (const form of el.querySelectorAll("form")) {
    const apply = () => {
      const next = new URLSearchParams(p);
      next.delete("page");
      next.delete("focus");
      next.delete("method");
      next.delete("fulltext");
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
          [w.year, w.venue, w.titleZh, w.title, w.authors, w.id, topicsFor(w).join("、"), labelsFor(w,"methods").join("、"), labelsFor(w,"data").join("、"), w.region]
            .map((x) => String(x ?? "").replace(/[\t\r\n]/g, " "))
            .join("\t"),
        )
        .join("\r\n");
      const u = URL.createObjectURL(
        new Blob(
          ["\uFEFF年份\t刊物\t中文题名\t原题\t作者\t标识\t主题\t方法\t数据\t国家或场景\r\n", text],
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
  if (apiBase) return api(file);
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
    const request = (apiBase ? catalogPages(group) : get(file)).then(records => {
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
async function catalogPages(source) {
  if (publicData) return publication("catalog/"+source);
  const all = [];
  let after = "";
  do {
    const page = await api("papers", {source, after, limit: 500});
    all.push(...page.papers);
    after = page.next;
  } while (after);
  return all;
}
async function catalogFor(route, params) {
  if (route === "paper") {
    const id = params.get("id");
    if (publicData && id) {
      try { return [(await apiPaper(id)).record]; }
      catch (error) { if (error.status===404) return []; throw error; }
    }
    if (byId?.has(id)) return [byId.get(id)];
    if (apiBase) {
      try { return [(await apiPaper(id)).record]; }
      catch (error) {
        if (!id || error.status === 404) return [];
        throw error;
      }
    }
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
  return route === "home" && feature ? homeFeature() + status + block :
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
  const mapped = { trends: "top5", frontier: "nber", jhe: "library", he: "library" }[route] || route;
  return ["library","paper","nber","atlas","about","top5"].includes(mapped) ? mapped : "home";
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
    if (publicData && route==="home" && (!composition || !feature || !stats || !taxonomy)) {
      const home = await publication("home");
      stats = home["archive-stats"]; feature = home.feature; composition = home.composition; setTaxonomy(home.taxonomy);
    }
    const needsIndex = !["home","about"].includes(route) && !(publicData && route==="paper");
    const [rows] = await Promise.all([catalogFor(route, params), needsStats && !stats && loadStats(), needsIndex && loadReadingIndex(), route!=="about" && loadTaxonomy(), needsIndex && loadSummaries(),
      route === "home" && !feature && get("feature").then(data => {feature=data;}),
      apiBase && (route === "home" || route === "top5") && !composition && api("composition").then(data => {composition = data;})]);
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
