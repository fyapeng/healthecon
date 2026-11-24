export const journals = ["AER", "QJE", "JPE", "REStud", "Econometrica"];
export const jhe = "Journal of Health Economics";

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
  const left = 43,
    right = 20,
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
  const legend = series
    .map(
      (s, i) =>
        '<span class="key key-' + i + '">' + escapeText(s.name) + "</span>",
    )
    .join("");
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
    '<div class="legend">' +
    legend +
    '</div><svg class="chart" viewBox="0 0 ' +
    width +
    " " +
    height +
    '" role="group" aria-label="' +
    escapeText(title) +
    '">' +
    grid +
    labels +
    lines +
    '</svg><details class="numbers"><summary>查看年度数字</summary><table><thead><tr><th>年份</th>' +
    series.map((s) => "<th>" + escapeText(s.name) + "</th>").join("") +
    "</tr></thead><tbody>" +
    rows +
    "</tbody></table></details>"
  );
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
