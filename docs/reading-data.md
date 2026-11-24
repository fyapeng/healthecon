# 前端读取数据

所有文件相对于站点根目录，无需登录。当前为截至 2026-11-24 的静态快照。日期字符串保持 ISO 顺序；记录标识按原值精确匹配，用 URLSearchParams 构造深链接。

| 文件 | 用途 |
| --- | --- |
| data/papers-index.json | 2003 年以来的公开目录。methodMentions 表示英文摘要明确提及的研究方法，不能据此判定主识别策略。默认展示 health 为 true 的记录；整个目录还包含五大刊的其他学科和引文来源。id、year、venue、title、authors 为索引字段，titleZh、topic、region、question、set、articleType 等有数据时出现。region 是研究场景。 |
| data/details/{year}.json | 以 id 为键的单年详情。用索引中的 year 加载。abstract.text 为正文，version、source、url 表明其版本和出处。abstractZh 为已有中文译文；无译文时展示原文。hasDetail、hasAbstract 分别表示是否有详情或可展示摘要。senlab 为公开延伸阅读链接。workingPaper 指向独立的 NBER 记录。 |
| data/archive-stats.json | top5[year][venue] 含 found（趋势篇数）、cataloguedHealth / cataloguedTotal（有卷期的公开目录口径）、inToc / total（独立卷期口径）。total 为 null 时，该年不能画独立卷期占比。跨刊合计先加分子和分母，再相除。nber[year] 为 EH 项目篇数和普通工作论文总数。 |
| data/arxiv.json | years[year] 为全站和 econ.* 分类计数，按首次公告月份分组；最后一年覆盖到 lastMonth。papers 为选读，不能据此推算全站健康经济学份额。 |
| data/open-copies.json | 以 DOI 为键的开放版本 URL；链接可通向存储库或出版社。私人收藏在读者本机打开。 |

年度篇数跳转到 #library?series=trend&year=2003；独立卷期占比使用 series=toc，目录占比使用 series=issue。论文页使用 #paper?id=10.1086%2F374180。筛选状态保存在链接中。传统专题快照和 data/catalog.json 保留作上游输入；当前前端以 papers-index 为准。

## 口径与来源

- 年度趋势中的健康研究来自可逐篇查到的选录，仍可增补。JEL I1、NBER 项目归属和全文检索提供发现线索；期刊条目进入健康研究趋势需要独立的选录记录。NBER 的年度指标使用项目归属。早期工作论文漏配、改题和跨项目发表都会影响可关联的版本数。
- 五刊卷期与 DOI 的对照使用 Econ Journal Authors 的冻结版，沿用其 CC BY 4.0 署名。AER 的 2012、2013 年第 3 期按 AEA 确认为 Papers and Proceedings，单列。部分早期论文有多个 DOI，同刊、同卷、同起页及同一标准化题名才合并。当前卷期参考 Wiley 与出版者提供给 RePEc 的 Econometrica 目录。
- NBER 日期和项目来自官方批量表。专业期刊交叉核对 OpenAlex、PubMed 及 Europe PMC。英文摘要优先采用能对应同一 DOI 的期刊记录。工作论文摘要另标；已有译文与对应原文一起呈现。SenLab 仅复用公开书目字段，个人笔记和本地文件不属于公共数据。
- 相关来源：[卷期目录](https://github.com/kochiuyu/econ-journal-authors/tree/c54c997888859067223103b659f4ee98d059b71b/releases/articles_toc_2010_2025)、[AEA 期务说明](https://swlb2.aeaweb.org/content/file?id=842)、[Econometrica 卷期](https://ideas.repec.org/s/wly/emetrp.html)、[Europe PMC](https://europepmc.org/RestfulWebService)、[NBER](https://www.nber.org/research/data/nber-working-papers-and-chapters-metadata)。

发布时更新 index.html 引用脚本的版本号。前端对数据请求使用相同的版本号，避免缓存使旧脚本与新快照混合。
