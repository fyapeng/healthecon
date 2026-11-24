# HealthLab

HealthLab 是健康经济学综述与选题研究的公共书目网站。读者可以浏览研究专题、检索跨来源文献、按年份和来源查看收录趋势。

[打开 HealthLab](https://fyapeng.github.io/healthlab/)

## 当前覆盖

首个专题为「患者选择与医疗资源配置」。书目快照截至 2026-11-24，覆盖五大经济学期刊的全学科目录、Journal of Health Economics、Health Economics、近年 NBER 卫生经济学项目及首轮引文扩展。五刊及两份专业期刊以 2003 年为起点，NBER 项目从 2021 年起，后向引文可追溯至更早年份。各来源重叠，刊行版与工作论文如有不同标识则分别保留。

年度图统计当前快照的书目数量。来源收录区间、末年覆盖和研究版本会影响曲线。每个专题都可独立维护阅读顺序和初读意见。排序服务于安排阅读，相关性取舍须有逐篇阅读的依据。收录规模随来源和证据扩展。

## 本地预览

从仓库根目录运行以下命令，打开 http://localhost:8000 。

```sh
python -m http.server 8000
```

## 维护书目与专题

- 公共书目保存在 `data/catalog.json`，按 DOI 或 OpenAlex 标识合并来源。`data/coverage.json` 记录来源计数与截止日。每条记录使用公开书目字段与原文入口，PDF 和原始研究缓存由研究者在本地管理。
- `scripts/import_catalog.py <本地书目目录> --cutoff YYYY-MM-DD` 从现有综述项目的 CSV 导入书目、全量阅读顺序和逐篇初读意见。输入列和文件名见脚本。仓库附带可直接运行的书目快照。
- 在 `topics/index.json` 登记新专题的标识、题名、研究问题和数据文件。专题 JSON 的 `order` 存书目标识列表，`notes` 以相同标识为键保存初读意见。多个专题可以使用同一篇研究，各自维护独立判断。
- GitHub Pages 使用 main 分支的根目录。站点按发布快照更新。后续可扩展中文研究、专业期刊、工作论文系列和跨版本关联。

## 数据来源

[Crossref](https://www.crossref.org/) · [OpenAlex](https://openalex.org/) · [RePEc](https://ideas.repec.org/) · [NBER 批量书目](https://www.nber.org/research/data/nber-working-papers-and-chapters-metadata)
