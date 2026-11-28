# 前端读取数据

在线页面和[关于页的当前篇数](https://fyapeng.com/healthecon/#about)读取同一套按月发布的数据。首页 HTML 中的 `healthecon-public-data` 指向该版公开数据的根目录。
 
- `archive-stats.json` 的 `summary.regular` 是五大刊卷期研究论文数，`summary.top5` 包含另外收录的提前在线论文和讲座、评论。各类篇数可从五大刊栏目分别点入清单。
- `catalog/top5.json`、`catalog/nber.json` 和 `catalog/other.json` 合起来是健康研究目录。`catalog/all.json` 还包含用于检索、核对和统计分母的其他书目。全文处理任务数独立于健康目录收录数。
- `home.json` 提供当期选读、趋势和标签统计。NBER 年度总数另取官方发布日目录，五大刊独立卷期分母取核对过的卷期目录。

## 本地构建输入

以下路径描述本地生成书目时的文件。网站发布时还会应用逐篇复核结果。

| 文件 | 用途 |
| --- | --- |
| data/papers-index.json | 2003 年以来的公开目录。methodMentions 表示英文摘要明确提及的研究方法，不能据此判定主识别策略。默认展示 health 为 true 的记录；整个目录还包含五大刊的其他学科和引文来源。id、year、venue、title、authors 为索引字段，titleZh、topic、region、question、set、articleType 等有数据时出现。region 是研究场景。 |
| data/details/{year}.json | 以 id 为键的单年详情。用索引中的 year 加载。abstract.text 为正文，version、source、url 表明其版本和出处。abstractZh 为已有中文译文；无译文时展示原文。hasDetail、hasAbstract 分别表示是否有详情或可展示摘要。senlab 为公开延伸阅读链接。workingPaper 指向独立的 NBER 记录。 |
| data/archive-stats.json | top5[year][venue] 含 found（趋势篇数）、cataloguedHealth / cataloguedTotal（有卷期的公开目录口径）、inToc / total（独立卷期口径）。total 为 null 时，该年不能画独立卷期占比。跨刊合计先加分子和分母，再相除。nber[year] 为 EH 项目篇数和普通工作论文总数。jhe[year]、he[year] 分别为当年 JHE 和 HE 研究目录篇数。 |
| data/arxiv.json | years[year] 为全站和 econ.* 分类计数，按首次公告月份分组；最后一年覆盖到 lastMonth。papers 为选读，不能据此推算全站健康经济学份额。 |

首页、Top 5、NBER、JHE 的路径分别为 #home、#top5、#nber、#jhe。专业期刊栏内的 #jhe 与 #he 分别对应两本刊物。期刊记录可以含 volume、issue。索引中的 titleZh 用于中文检索。读者可以按有无摘要筛选。NBER 日期允许按季度检索。分栏图表可通过 focus=list 定位到同一页面内的对应记录。旧版目录链接仍可使用。

年度篇数跳转到 #library?series=trend&year=2003；独立卷期占比使用 series=toc，目录占比使用 series=issue。论文页使用 #paper?id=10.1086%2F374180。筛选状态保存在链接中。默认健康目录合并 data/index/ 下的 top5、nber、other 三个分组，各来源栏目只加载自己的分组。跨学科目录使用 papers-index.json。导入中间文件 catalog.json 与上游 CSV 同目录存放。

## 本地输入的口径与来源

- 年度趋势中的健康研究来自可逐篇查到的选录，仍可增补。JEL I1、NBER 项目归属和全文检索提供发现线索；期刊条目进入健康研究趋势需要独立的选录记录。NBER 的年度指标使用项目归属。早期工作论文漏配、改题和跨项目发表都会影响可关联的版本数。
- 五刊卷期与 DOI 的对照使用 Econ Journal Authors 的冻结版，沿用其 CC BY 4.0 署名。AER 年会专期从书目和统计中排除。2003–2010 年对应第 2 期，2011–2013 年第 3 期，2014–2017 年第 5 期。2018 年起按独立刊名或其 DOI 排除 P&P，保留 AER 五月常规期。部分早期论文有多个 DOI，同刊、同卷、同起页及同一标准化题名才合并。当前卷期参考 Wiley 与出版者提供给 RePEc 的 Econometrica 目录。
- NBER 日期和项目来自官方批量表。专业期刊交叉核对 OpenAlex、PubMed 及 Europe PMC。英文摘要优先采用能对应同一 DOI 的期刊记录。工作论文摘要另标；已有译文与对应原文一起呈现。SenLab 仅复用公开书目字段，个人笔记和本地文件不属于公共数据。
- 相关来源：[卷期目录](https://github.com/kochiuyu/econ-journal-authors/tree/c54c997888859067223103b659f4ee98d059b71b/releases/articles_toc_2010_2025)、[AEA 期务说明](https://swlb2.aeaweb.org/content/file?id=842)、[Econometrica 卷期](https://ideas.repec.org/s/wly/emetrp.html)、[Europe PMC](https://europepmc.org/RestfulWebService)、[NBER](https://www.nber.org/research/data/nber-working-papers-and-chapters-metadata)。

发布时更新 index.html 引用脚本的版本号。前端对数据请求使用相同的版本号，避免缓存使旧脚本与新快照混合。

书目条目的 `fulltextTags` 只包含对该版本正文复核过的阳性标签，值为从 1 开始计的 PDF 文件页码。未出现的标签表示尚无已确认的阳性判断。原有的 `methodMentions` 仍表示英文摘要中的方法名称。前端在现有论文卡片上展示全文标签。

本地模型按正文片段定位证据并整理中文导读。data/readings/index.json 存有已完成论文的标签，年份文件内含概述、正文版本及 PDF 页码或 XML 节序。证据原句与提取的英文引言仅在本地保存。
