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
  const years = [...new Set(series.flatMap(s => s.points.map(p => p.year)))].sort();
  if (!years.length) return "<p>暂无可比较的年份。</p>";
  const narrow = matchMedia("(max-width: 650px)").matches;
  const width = narrow ? 400 : 700, height = narrow ? 223 : 244;
  const left = 42, right = narrow ? 76 : 101, top = 23, bottom = height - 32;
  const usable = p => p && Number.isFinite(p.count) && (!pct || p.total > 0);
  const rows = years.map(year => series.map(s => s.points.find(p => p.year === year)));
  const max = Math.max(1,...rows.flat().filter(usable).map(p => amount(p,pct)));
  const step = [1,2,5,10,20,25,50,100,200,500,1000].find(n => n >= max/5) || Math.ceil(max/5);
  const ceiling = Math.ceil(max/step)*step;
  const span = width-left-right;
  const x = i => left+span*i/Math.max(1,years.length-1);
  const y = p => bottom-(bottom-top)*amount(p,pct)/ceiling;
  const grid = [];
  for (let n=0;n<=ceiling;n+=step) {
    const py=bottom-(bottom-top)*n/ceiling;
    grid.push(`<line x1="${left}" x2="${width-right}" y1="${py}" y2="${py}"/><text x="${left-8}" y="${py+4}" text-anchor="end">${n}${pct?"%":""}</text>`);
  }
  const ticks = years.map((yr,i) => i===0 || i===years.length-1 || (i%Math.ceil(years.length/(narrow?4:6))===0 && i<years.length-2)
    ? `<text x="${x(i)}" y="${height-8}" text-anchor="middle">${yr}</text>` : "").join("");
  const ends=[];
  const lines=series.map((s,j) => {
    let path="",marks="",prev=-2;
    rows.forEach((r,i) => {
      const p=r[j];
      if (!usable(p)) return;
      const px=x(i),py=y(p);
      path+=(prev===i-1 && Number(years[i])-Number(years[prev])===1?" L":" M")+px+" "+py;
      prev=i;
      marks+=`<a href="${escapeText(p.link)}" data-i="${i}" aria-label="${escapeText(s.name+"，"+p.year+"，"+display(p,pct))}"><circle class="hit" cx="${px}" cy="${py}" r="8"/><circle class="dot" cx="${px}" cy="${py}" r="2.7"/></a>`;
    });
    if(prev>=0) ends.push({j,i:prev,py:y(rows[prev][j]),name:s.name.split(" · ")[0]});
    return `<g class="series s${j}"><path class="trend-stroke" d="${path}"/>${marks}<circle class="selected-dot" r="5.1" visibility="hidden"/></g>`;
  }).join("");
  ends.sort((a,b)=>a.py-b.py);
  let last=top-22;
  const names=ends.map((e,k)=>{
    const py=Math.min(bottom-21*(ends.length-k-1),Math.max(last+21,e.py));last=py;
    return `<g class="end-label s${e.j}"><path d="M${x(e.i)+5} ${e.py} L${width-right+12} ${py}"/><text x="${width-right+16}" y="${py+4}">${escapeText(e.name)}</text></g>`;
  }).join("");
  const table=rows.map((r,i)=>`<tr data-x="${x(i)}"><th scope="row">${years[i]}</th>${r.map(p=>usable(p)?`<td data-value="${amount(p,pct)}" data-y="${y(p)}"><a href="${escapeText(p.link)}" aria-label="${escapeText(years[i]+" 年，"+display(p,pct))}">${pct ? amount(p,true).toFixed(1)+"%" : display(p,false)}</a>${pct ? `<span class="fraction">（${p.count}/${p.total}）</span>` : ""}</td>`:`<td>${escapeText(p?.missing||"无数据")}</td>`).join("")}</tr>`).join("");
  return `<div class="time-figure" data-unit="${pct?"个百分点":"篇"}"><div class="figure-plot"><svg class="chart" viewBox="0 0 ${width} ${height}" role="group" aria-label="${escapeText(title)}">${grid.join("")}${ticks}<line class="ref-guide" visibility="hidden" y1="${top}" y2="${bottom}"/><line class="year-guide" y1="${top}" y2="${bottom}"/>${lines}${names}</svg></div><div class="inspect-year"><div class="year-navigation"><label>查看年份 <strong></strong><input type="range" aria-label="查看年份" min="0" max="${years.length-1}" step="1"></label><button type="button" class="ref-year" aria-pressed="false">设为对照年</button></div><div class="year-values"></div></div><details class="numbers"><summary>查看年度数字</summary><table><thead><tr><th>年份</th>${series.map(s=>"<th>"+escapeText(s.name)+"</th>").join("")}</tr></thead><tbody>${table}</tbody></table></details></div>`;
}

export function activateFigures(root, preferredYear) {
  for(const figure of root.querySelectorAll(".time-figure")){
    if(figure.dataset.active) continue;
    figure.dataset.active="1";
    const chart=figure.querySelector("svg"),rows=[...figure.querySelectorAll("tbody tr")];
    const slider=figure.querySelector("input"),label=figure.querySelector(".inspect-year strong");
    const pin=figure.querySelector(".ref-year"),guide=chart.querySelector(".year-guide"),ref=chart.querySelector(".ref-guide");
    const cells=[...figure.querySelectorAll("thead th")].slice(1).map((th,j)=>{
      const node=document.createElement("a");
      node.className="value-card s"+j;
      node.innerHTML="<span></span><b></b><small></small>";
      node.firstChild.textContent=th.textContent;
      figure.querySelector(".year-values").append(node);
      return node;
    });
    let selected=-1,reference=-1;
    function focusYear(i,force=false){
      if(i<0 || i>=rows.length || (i===selected && !force)) return;
      selected=i;
      const row=rows[i],yr=row.cells[0].textContent,px=row.dataset.x;
      label.textContent=yr;slider.value=i;slider.setAttribute("aria-valuetext",yr);
      guide.setAttribute("x1",px);guide.setAttribute("x2",px);
      const baseIndex=reference>=0?reference:(i>0 && Number(yr)-Number(rows[i-1].cells[0].textContent)===1?i-1:-1);
      cells.forEach((card,j)=>{
        const cell=row.cells[j+1],link=cell.querySelector("a"),dot=chart.querySelector(".s"+j+" .selected-dot");
        dot.setAttribute("visibility",link?"visible":"hidden");
        if(link){
          dot.setAttribute("cx",px);dot.setAttribute("cy",cell.dataset.y);
          card.href=link.href;card.setAttribute("aria-label",yr+" 年 "+card.firstChild.textContent+" "+cell.textContent+"，浏览对应论文");
        }else{card.removeAttribute("href");card.removeAttribute("aria-label");}
        card.children[1].textContent=cell.textContent;
        const base=rows[baseIndex]?.cells[j+1];
        const change=Number(cell.dataset.value)-Number(base?.dataset.value);
        const unit=figure.dataset.unit;
        const delta=Number(change.toFixed(unit==="篇"?0:1));
        card.lastChild.textContent=reference===i?"对照年":!link||!base?.hasAttribute("data-value")?"":`较 ${rows[baseIndex].cells[0].textContent} 年 ${delta>0?"+":""}${delta} ${unit}`;
      });
      figure.dispatchEvent(new CustomEvent("inspectyear",{bubbles:true,detail:yr}));
    }
    const initial=rows.findIndex(r=>r.cells[0].textContent===preferredYear);
    focusYear(initial<0?rows.length-1:initial);
    pin.onclick=()=>{
      reference=reference<0?selected:-1;pin.setAttribute("aria-pressed",String(reference>=0));
      pin.textContent=reference<0?"设为对照年":"取消对照 · "+rows[reference].cells[0].textContent;
      ref.setAttribute("visibility",reference<0?"hidden":"visible");
      if(reference>=0){ref.setAttribute("x1",rows[reference].dataset.x);ref.setAttribute("x2",rows[reference].dataset.x);}
      focusYear(selected,true);
    };
    slider.oninput=()=>focusYear(Number(slider.value));
    const inspect=event=>{
      const transform=chart.getScreenCTM();if(!transform)return;
      const px=new DOMPoint(event.clientX,event.clientY).matrixTransform(transform.inverse()).x;
      if(px<Number(rows[0].dataset.x)-8||px>Number(rows.at(-1).dataset.x)+8)return;
      focusYear(rows.findIndex((r,j)=>j===rows.length-1||px<(Number(r.dataset.x)+Number(rows[j+1].dataset.x))/2));
    };
    chart.addEventListener("pointermove",e=>{if(e.pointerType==="mouse")inspect(e);});
    chart.addEventListener("pointerdown",inspect);
    chart.addEventListener("focusin",e=>{const a=e.target.closest("[data-i]");if(a)focusYear(Number(a.dataset.i));});
  }
}

// Each source can finish a different set of years. Break the line at every gap.
export function compositionCell(cell, topic) {
  if (!topic || !cell.excludedFromTopics) return cell;
  return {...cell, total: cell.total - cell.excludedFromTopics, coded: cell.coded - cell.excludedFromTopics};
}

export function compositionFigure(data, code, label, group = "data") {
  const years=Object.keys(data).sort();
  const field={data:"dataset", methods:"technique", topics:"topic"}[group];
  const series=[["top5","五大刊"],["nber","NBER"]].map(([key,name])=>({name,points:years.map(year=>{
    const cell=compositionCell(data[year][key],group==="topics");
    const complete=cell.total>0 && cell.total===cell.coded;
    return {year,count:complete?(cell.counts[code]||0):null,total:cell.total,
      missing:cell.total?"已标 "+cell.coded+"/"+cell.total:"无论文",
      link:routeLink(key,{year,[field]:label,series:key==="top5"?"trend":"",focus:"list"})};
  })}));
  return lineFigure(series,true,label+"在健康研究中的年度占比");
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
