import {
  journals as jnames,
  jhe,
  escapeText as esc,
  routeLink as href,
  lineFigure,
  topSeries,
  nberSeries,
  bars,
} from "./figures.js?v=20261124-gallery2";
const el = document.querySelector("#app");
const fmt = (n) => Number(n).toLocaleString("zh-CN");
const btn = (title, page, params = {}) =>
  `<a class="btn" href="${esc(href(page, params))}">${esc(title)}</a>`;
const detailCache = new Map();
let stats, byId;
let works,
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
  return `<article class="paper"><div class="meta">${esc(w.date || w.year)} · ${esc(w.venue)}${w.volume ? " · 卷 " + esc(w.volume) : ""}${w.issue ? " · 第 " + esc(w.issue) + " 期" : ""}${w.set === "本年在线" ? " · 提前在线" : ""}${w.articleType ? " · " + esc(w.articleType) : ""}</div><h3><a href="${esc(internal)}">${esc(w.titleZh || w.title)}</a></h3>${w.titleZh ? `<p lang="en">${esc(w.title)}</p>` : ""}${w.question ? `<p>${esc(w.question)}</p>` : ""}<div class="meta">${esc((w.authors || "").replaceAll(" | ", ", "))}</div>${[
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
const latestYear = () => stats.cutoff.slice(0, 4);
const sourceTitles = {
  top5: "经济学五大刊",
  nber: "NBER 工作论文",
  jhe,
  he: "Health Economics",
};
const sourceNames = { top5: "Top 5", nber: "NBER", jhe: "JHE", he: "HE" };

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
function home(p) {
  const venue = jnames.includes(p.get("venue")) ? p.get("venue") : "";
  const scope = p.get("basis") === "issue" ? "issue" : "toc";
  const compare = p.get("nber") !== "off";
  const year = latestYear();
  return `<p class="definition">健康经济学研究生活条件如何影响健康，也研究谁能获得医疗、谁来支付费用。</p>
    <div class="hero"><div class="copy"><p class="eyebrow">近期研究　/　NBER 工作论文</p><h1>街灯换了，<br>居民睡得更好吗？</h1><p>加拿大本拿比市陆续把老式街灯换成 LED 灯。研究者比较街区更换照明前后的变化，追踪居民的睡眠、心理健康和工作缺勤。</p><div class="actions">${btn("读这篇研究 ↗", "paper", { id: "10.3386/w36060" })}<span>2026 年 11 月</span></div></div><figure class="cover-print"><a href="https://www.nga.gov/artworks/127442-wet-night-columbus-circle-new-york" aria-label="查看馆藏完整照片"><img src="assets/fraser-wet-night.jpg" alt="纽约哥伦布圆环雨夜，树影之间的街灯倒映在湿漉漉的路面上" width="1000" height="1343" fetchpriority="high"></a><figcaption>纽约哥伦布圆环的雨夜，1899 · William A. Fraser 摄影（局部） <a href="https://www.nga.gov/artworks/127442-wet-night-columbus-circle-new-york">美国国家美术馆 ↗</a></figcaption></figure></div>
    <section class="home-trend"><div><h2>健康研究占多少？</h2><p>五大刊按卷期发表年，NBER 按工作论文发布年。两条线各用本来源的年度论文总数作分母。</p><form class="controls compact" data-auto>${select("venue", "五大刊合计", jnames, venue)}<select name="basis" aria-label="期刊分母"><option value="toc">独立卷期 · 2010–2025</option><option value="issue" ${scope === "issue" ? "selected" : ""}>本站卷期 · 2003 年起</option></select><label><input type="checkbox" name="showNber" ${compare ? "checked" : ""}> 对照 NBER</label></form><small>数据截至 ${esc(stats.cutoff)}</small></div><div id="home-figure">${homeSeries(venue, scope, compare)}</div></section>
    <section class="shelf"><h2>${year} 年的研究</h2><p class="meta">截至 ${esc(stats.cutoff)}，本年累计</p><div class="editions">${[
      "top5",
      "nber",
      "jhe",
      "he",
    ]
      .map((source, i) => {
        const n =
          source === "top5"
            ? topSeries(stats, "", "trend").at(-1).count
            : source === "nber"
              ? stats.nber[year][0]
              : stats[source][year];
        return `<a href="${href(source, { year, series: source === "top5" ? "trend" : "" })}"><span>${["五大刊 · 卷期发表", "NBER · 健康项目", "JHE · 期刊收录", "HE · 期刊收录"][i]}</span><strong>${n} <small>篇</small></strong><em>浏览论文 →</em></a>`;
      })
      .join("")}</div></section>`;
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
        ? jnames.includes(w.venue) && (w.trend || current.includes(w))
        : w.venue === (nber ? "NBER" : sourceTitles[page])),
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
    : nber
      ? nberSeries(stats)
      : Object.entries(stats[page]).map(([year, count]) => ({
          year,
          count,
          link: href(page, { year, focus: "list" }),
        }));
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
  } else if (nber) {
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
  } else {
    side = "各卷收录篇数";
    const volumes = new Map();
    for (const w of yearPapers)
      volumes.set(w.volume || "", 1 + (volumes.get(w.volume || "") || 0));
    breakdown = Array.from(volumes, ([volume, value]) => ({
      label: volume ? "卷 " + volume : "卷号未载",
      value,
      link: href(page, { year, volume: volume || "unknown", focus: "list" }),
    })).sort((a, b) => a.label.localeCompare(b.label, "zh", { numeric: true }));
  }
  const intro = top
    ? "查阅五大经济学期刊中的健康研究，比较不同期刊的发表数量与占比。"
    : nber
      ? "按首次发布年份，阅读 NBER 健康经济学项目的工作论文。"
      : "按年份或卷期浏览这本刊物自 2003 年以来的研究。";
  const controls = top
    ? `<form class="controls compact" data-auto>${select("venue", "五大刊合计", jnames, venue)}<select name="series" aria-label="图表指标"><option value="trend">发表篇数</option><option value="toc" ${scope === "toc" ? "selected" : ""}>独立卷期占比</option><option value="issue" ${scope === "issue" ? "selected" : ""}>本站目录占比</option></select></form>`
    : nber
      ? `<form class="controls compact" data-auto><select name="metric" aria-label="图表指标"><option value="share">项目占比</option><option value="count" ${!percent ? "selected" : ""}>发布篇数</option></select></form>`
      : "";
  const caption = top
    ? scope === "toc"
      ? "分母为独立卷期目录中的研究论文，覆盖 2010–2025 年。"
      : scope === "issue"
        ? "分母为本站已收录的同刊卷期研究论文。"
        : "按卷期计算，提前在线论文另列。"
    : nber
      ? "项目占比的分母为 NBER 同年全部普通工作论文。"
      : `篇数按本站收录的 ${sourceNames[page]} 研究论文计算。`;
  return (
    (!top && !nber
      ? `<section><div class="journal-tabs" role="group" aria-label="选择专业期刊">${["jhe", "he"].map((code) => `<a href="${href(code, { year: p.get("year"), q: p.get("q"), zh: p.get("zh"), sort: p.get("sort") })}" ${code === page ? 'aria-current="page"' : ""}>${sourceNames[code]}</a>`).join("")}</div><h1>${sourceTitles[page]}</h1><p>${intro}</p></section>`
      : titleblock(sourceNames[page], sourceTitles[page], intro)) +
    `<div class="overview"><section><h2>年度${percent ? "占比" : "篇数"}</h2>${controls}${lineFigure([{ name: lineName, points }], percent, lineName + "年度趋势")}<p class="meta">${caption} 本年截至 ${esc(nber ? stats.nberLatest : stats.cutoff)}。</p></section><section><span class="eyebrow">${esc(year)} 年</span><h2>${side}</h2>${breakdown.length ? bars(breakdown) : "<p>该年没有这一口径的卷期记录。</p>"}</section></div>` +
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
    [...new Set(source.map((w) => w[key]).filter(Boolean))].sort((a, b) =>
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
      (!p.get("period") || current.includes(w)) &&
      (!p.get("quarter") || quarter(w) === p.get("quarter")) &&
      (!volume || (volume === "unknown" ? !w.volume : w.volume === volume)) &&
      (!p.get("issue") || w.issue === p.get("issue")) &&
      (!p.get("topic") || w.topic === p.get("topic")) &&
      (!p.get("method") || w.methodMentions?.includes(p.get("method"))) &&
      (!p.get("region") || w.region === p.get("region")) &&
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
    `<select name="zh" aria-label="译文"><option value="">全部语言</option><option value="title" ${p.get("zh") === "title" ? "selected" : ""}>有中文题名</option><option value="abstract" ${p.get("zh") === "abstract" ? "selected" : ""}>有中文摘要</option></select>`,
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
  <section class="box"><h2>阅读全文</h2><p>有开放版本的论文提供 arXiv 或 OpenAlex 登记的全文入口；期刊页面可能另有机构访问要求。个人收藏的 PDF 可在本地打开。</p><a class="btn" href="reader.html">打开本机全文阅读器</a></section><p class="meta">首页配图选自 William A. Fraser 1899 年的摄影凹版作品《Wet Night, Columbus Circle, New York》。美国国家美术馆藏，编号 2002.120.23，公有领域。<a href="https://www.nga.gov/artworks/127442-wet-night-columbus-circle-new-york">查看完整作品与使用说明 ↗</a>。</p>`
  );
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
    jhe: (p) => channel("jhe", p),
    he: (p) => channel("he", p),
    library,
    paper: paperPage,
    atlas,
    about,
  };
  el.innerHTML = (pages[page] || home)(p);
  document.querySelectorAll("nav a").forEach((a) => {
    if (
      a.hash ===
      "#" + (page === "paper" ? "library" : page === "he" ? "jhe" : page)
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
        figure.innerHTML = homeSeries(
          form.elements.venue.value,
          form.elements.basis.value,
          form.elements.showNber.checked,
        );
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
let catalogRequest, statsRequest;
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
function canonical(route) {
  return { trends: "top5", frontier: "nber" }[route] || route || "home";
}
let navigation = 0;
async function navigate() {
  const ticket = ++navigation,
    route = canonical(location.hash.slice(1).split("?")[0]);
  const needs = [];
  if (["top5", "nber", "jhe", "he", "library", "paper"].includes(route))
    needs.push(loadCatalog());
  if (["home", "top5", "nber", "jhe", "he", "atlas"].includes(route))
    needs.push(loadStats());
  if (
    ![
      "home",
      "top5",
      "nber",
      "jhe",
      "he",
      "library",
      "paper",
      "atlas",
      "about",
    ].includes(route)
  )
    needs.push(loadStats());
  if (needs.length) el.textContent = "正在读取…";
  try {
    await Promise.all(needs);
    if (ticket !== navigation) return;
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
