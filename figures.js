export const journals = ["AER", "QJE", "JPE", "REStud", "Econometrica"];

export function escapeText(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        ch
      ],
  );
}

export function routeLink(route, params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== "" && v != null),
  );
  return "#" + route + (query.size ? "?" + query : "");
}

export function topSeries(stats, venue, scope) {
  const points = [];
  for (const [year, journalsByName] of Object.entries(stats.top5)) {
    const cells = venue
      ? [journalsByName[venue]]
      : Object.values(journalsByName);
    if (scope === "toc" && cells.some((c) => c.total == null)) continue;
    const sum = (key) => cells.reduce((total, cell) => total + cell[key], 0);
    const count = sum(
      scope === "toc"
        ? "inToc"
        : scope === "issue"
          ? "cataloguedHealth"
          : "found",
    );
    const total =
      scope === "toc"
        ? sum("total")
        : scope === "issue"
          ? sum("cataloguedTotal")
          : null;
    points.push({
      year,
      count,
      total,
      link: routeLink("top5", { venue, year, series: scope, focus: "list" }),
    });
  }
  return points;
}

export function nberSeries(stats) {
  return Object.entries(stats.nber).map(([year, [count, total]]) => ({
    year,
    count,
    total,
    link: routeLink("nber", { year, focus: "list" }),
  }));
}

const amount = (p, pct) => (pct ? (p.count / p.total) * 100 : p.count);
const display = (p, pct) =>
  pct
    ? amount(p, true).toFixed(1) + "%（" + p.count + "/" + p.total + "）"
    : p.count + " 篇";

export function lineFigure(series, pct, title) {
  const years = series[0].points.map((p) => p.year);
  if (!years.length) return "<p>暂无可比较的年份。</p>";
  const narrow = matchMedia("(max-width: 650px)").matches;
  const width = narrow ? 410 : 720,
    height = narrow ? 200 : 215;
  const names = series.map(s => narrow ? s.name.split(" · ")[0] : s.name);
  // Reserve space for the widest label, including Chinese and long journal names.
  const labelWidth = name => Array.from(name).reduce((n, c) => n + (c.charCodeAt(0) > 255 ? 14 : 8), 0);
  const left = 43,
    right = Math.max(...names.map(labelWidth)) + 23,
    top = 17,
    base = height - 30;
  const max = Math.max(
    1,
    ...series.flatMap((s) => s.points.map((p) => amount(p, pct))),
  );
  const step =
    [1, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000].find((n) => n >= max / 5) ||
    Math.ceil(max / 5);
  const ceiling = Math.ceil(max / step) * step;
  const x = (year) =>
    left +
    ((width - left - right) * years.indexOf(year)) /
      Math.max(1, years.length - 1);
  const y = (point) => base - ((base - top) * amount(point, pct)) / ceiling;
  let grid = "";
  for (let n = 0; n <= ceiling; n += step) {
    const row = base - ((base - top) * n) / ceiling;
    grid +=
      '<line x1="' +
      left +
      '" x2="' +
      (width - right) +
      '" y1="' +
      row +
      '" y2="' +
      row +
      '"/><text x="' +
      (left - 7) +
      '" y="' +
      (row + 4) +
      '" text-anchor="end">' +
      n +
      (pct ? "%" : "") +
      "</text>";
  }
  const labels = years
    .map((year, i) =>
      i === 0 || i === years.length - 1 || (i % 4 === 0 && i < years.length - 2)
        ? '<text x="' +
          x(year) +
          '" y="' +
          (height - 6) +
          '" text-anchor="middle">' +
          year +
          "</text>"
        : "",
    )
    .join("");
  const ends = series.map((s, i) => ({i, point: s.points.at(-1), label: names[i]}))
    .sort((a, b) => y(a.point) - y(b.point));
  const gap = 19;
  for (const [rank, end] of ends.entries()) {
    const lower = rank ? ends[rank - 1].labelY + gap : top;
    end.labelY = Math.min(base - gap * (ends.length - rank - 1), Math.max(y(end.point), lower));
  }
  const endLabels = ends.map(({i, point, label, labelY}) => {
    const anchor = x(point.year);
    return `<g class="end-label s${i}" aria-hidden="true"><path d="M${anchor + 5} ${y(point)}L${anchor + 14} ${labelY}"/><text x="${anchor + 18}" y="${labelY + 4}">${escapeText(label)}</text></g>`;
  }).join("");
  const lines = series
    .map((s, i) => {
      const pts = s.points.map((p) => x(p.year) + "," + y(p)).join(" ");
      const marks = s.points
        .map((p) => {
          const caption = escapeText(
            s.name + " · " + p.year + " · " + display(p, pct),
          );
          return (
            '<a href="' +
            escapeText(p.link) +
            '" aria-label="' +
            caption +
            '"><title>' +
            caption +
            '</title><circle cx="' +
            x(p.year) +
            '" cy="' +
            y(p) +
            '" r="3.8"/></a>'
          );
        })
        .join("");
      return (
        '<g class="series s' +
        i +
        '"><polyline points="' +
        pts +
        '"/>' +
        marks +
        "</g>"
      );
    })
    .join("");
  const rows = years
    .map(
      (year, i) =>
        '<tr><th scope="row">' +
        year +
        "</th>" +
        series
          .map((s) => {
            const p = s.points[i];
            return (
              '<td><a href="' +
              escapeText(p.link) +
              '">' +
              display(p, pct) +
              "</a></td>"
            );
          })
          .join("") +
        "</tr>",
    )
    .join("");
  return (
    '<div class="time-figure"><svg class="chart" viewBox="0 0 ' +
    width +
    " " +
    height +
    '" role="group" aria-label="' +
    escapeText(title) +
    '">' +
    grid +
    labels +
    `<line class="year-guide" y1="${top}" y2="${base}" aria-hidden="true"/>` +
    lines + endLabels +
    `</svg><div class="inspect-year"><label>查看年份 <strong></strong><input type="range" aria-label="查看年份" min="0" max="${years.length - 1}" step="1"></label><div class="year-values"></div></div>` +
    '<details class="numbers"><summary>查看年度数字</summary><table><thead><tr><th>年份</th>' +
    series.map((s) => "<th>" + escapeText(s.name) + "</th>").join("") +
    "</tr></thead><tbody>" +
    rows +
    "</tbody></table></details></div>"
  );
}

// The readout, slider and links share the same rows as the accessible data table.
export function activateFigures(root, preferredYear) {
  for (const figure of root.querySelectorAll(".time-figure")) {
    const chart = figure.querySelector(".chart");
    const rows = Array.from(figure.querySelectorAll("tbody tr"));
    const marks = Array.from(chart.querySelectorAll(".s0 circle"));
    const columns = Array.from(figure.querySelectorAll("thead th")).slice(1).map(cell => cell.textContent);
    const slider = figure.querySelector("input[type=range]");
    const label = figure.querySelector(".inspect-year strong");
    const values = figure.querySelector(".year-values");
    const guide = chart.querySelector(".year-guide");
    const positions = marks.map(mark => Number(mark.getAttribute("cx")));
    const links = columns.map(name => {
      const link = document.createElement("a");
      const caption = document.createElement("span");
      caption.textContent = name;
      const value = document.createElement("b");
      link.append(caption, value);
      values.append(link);
      return link;
    });
    function inspect(i) {
      const row = rows[i];
      const year = row.cells[0].textContent;
      if (label.textContent === year) return;
      label.textContent = year;
      slider.value = i;
      slider.setAttribute("aria-valuetext", year);
      guide.setAttribute("x1", positions[i]);
      guide.setAttribute("x2", positions[i]);
      for (const [j, link] of links.entries()) {
        const source = row.cells[j + 1].querySelector("a");
        link.href = source.href;
        link.lastChild.textContent = source.textContent;
        link.setAttribute("aria-label", year + " 年 · " + columns[j] + " · " + source.textContent + "，浏览论文");
      }
      figure.dispatchEvent(new CustomEvent("inspectyear", {bubbles:true, detail:year}));
    }
    const selected = rows.findIndex(row => row.cells[0].textContent === preferredYear);
    inspect(selected >= 0 ? selected : rows.length - 1);
    slider.addEventListener("input", () => inspect(Number(slider.value)));
    chart.addEventListener("pointermove", event => {
      if (event.pointerType !== "mouse") return;
      const transform = chart.getScreenCTM();
      if (!transform) return;
      const x = new DOMPoint(event.clientX, event.clientY).matrixTransform(transform.inverse()).x;
      const i = positions.findIndex((v, j) => j + 1 === positions.length || x < (v + positions[j + 1]) / 2);
      inspect(i);
    });
    chart.addEventListener("focusin", event => {
      const mark = event.target.closest("a")?.querySelector("circle");
      if (mark) inspect(positions.indexOf(Number(mark.getAttribute("cx"))));
    });
  }
}

// Each source can finish a different set of years. Break the line at every gap.
export function compositionCell(cell, topic) {
  if (!topic || !cell.excludedFromTopics) return cell;
  return {...cell, total: cell.total - cell.excludedFromTopics, coded: cell.coded - cell.excludedFromTopics};
}

export function compositionFigure(data, code, label, topic = false) {
  const years = Object.keys(data).sort();
  if (!years.length) return "";
  const sources = [["top5", "五大刊"], ["nber", "NBER"]];
  const complete = cell => cell.total > 0 && cell.total === cell.coded;
  const share = cell => 100 * (cell.counts[code] || 0) / cell.total;
  const totals = sources.map(([key, name]) => {
    const cells = years.map(y => compositionCell(data[y][key], topic));
    return name + " " + cells.reduce((s,c) => s+c.coded,0) + " / " + cells.reduce((s,c) => s+c.total,0) + " 篇";
  });
  const coverage = '<p class="meta">全文标签覆盖 · ' + totals.join("　·　") + '</p>';
  if (!years.some(y => sources.some(([key]) => complete(compositionCell(data[y][key], topic))))) {
    return coverage + '<p>首个来源年度完成全文标注后，这里将显示年度占比。</p>';
  }
  const width = 700, height = 198, left = 40, right = 665, base = 166;
  const x = i => left + i * (right-left) / Math.max(1,years.length-1);
  const y = pct => base - pct * 1.46;
  const grid = [0,25,50,75,100].map(n => `<line x1="${left}" x2="${right}" y1="${y(n)}" y2="${y(n)}"/><text x="33" y="${y(n)+4}" text-anchor="end">${n}%</text>`).join("");
  const ticks = years.map((v,i) => i % 5 === 0 || i === years.length-1 ? `<text x="${x(i)}" y="190" text-anchor="middle">${v}</text>` : "").join("");
  const series = sources.map(([key,name],j) => {
    let previous, marks = "";
    for (const [i,year] of years.entries()) {
      const cell = compositionCell(data[year][key], topic);
      if (!complete(cell)) { previous = null; continue; }
      const point = x(i) + "," + y(share(cell));
      if (previous) marks += `<polyline points="${previous} ${point}"/>`;
      marks += `<circle cx="${x(i)}" cy="${y(share(cell))}" r="4"><title>${year} · ${name} · ${share(cell).toFixed(1)}%（${cell.counts[code] || 0}/${cell.total}）</title></circle>`;
      previous = point;
    }
    return `<g class="series s${j}">${marks}</g>`;
  }).join("");
  const rows = years.map(year => "<tr><th>" + year + "</th>" + sources.map(([key]) => {
    const c = compositionCell(data[year][key], topic);
    const value = complete(c) ? share(c).toFixed(1) + "%（" + (c.counts[code] || 0) + "/" + c.total + "）"
      : c.total ? "已标 " + c.coded + "/" + c.total : "无论文";
    return "<td>" + value + "</td>";
  }).join("") + "</tr>").join("");
  return coverage + `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeText(label)}年度占比">${grid}${ticks}${series}</svg><small>砖红实线 · 五大刊　深色虚线 · NBER</small><details class="numbers"><summary>查看各年占比与覆盖篇数</summary><table><thead><tr><th>年份</th><th>五大刊</th><th>NBER</th></tr></thead><tbody>${rows}</tbody></table></details>`;
}

export function bars(items) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    '<div class="bars">' +
    items
      .map(
        (i) =>
          '<a href="' +
          escapeText(i.link) +
          '"><span>' +
          escapeText(i.label) +
          '</span><meter min="0" max="' +
          max +
          '" value="' +
          i.value +
          '" aria-label="' +
          escapeText(i.label) +
          '"></meter><b>' +
          i.value +
          " 篇</b></a>",
      )
      .join("") +
    "</div>"
  );
}
