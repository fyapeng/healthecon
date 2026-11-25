# healthecon

[访问健康经济学研究观察](https://fyapeng.com/healthecon/) · [前端数据说明](docs/reading-data.md) · [前端设计委托](docs/gemini-design-brief.md)

中文公共文献站。收录健康经济学研究，展示五大经济学期刊的年度变化、专业期刊文章和工作论文。读者可以从图表进入对应论文，按年、期刊、主题、研究地点筛选，阅读中英文题名和摘要，通过 DOI 核对论文。

## 当前快照

目录按 2003–2026 年组织，2026 年截至 11 月 24 日。公共文库共 18,982 条，每条都有中文题名。18,254 条有原始摘要，并附中文译文。健康研究目录共 9,041 条，其余文献可从跨学科目录检索。独立卷期核对覆盖 2010–2025 年。五刊长期目录、NBER 项目和 arXiv 分类各自使用不同的分子、分母和时间定义。各年的分子、分母与核心字段见公开数据说明。

## 本地运行

仓库提供完整的静态展示数据。在根目录运行 `python -m http.server 8000` 并打开 http://localhost:8000。GitHub Pages 从 main 分支根目录发布。摘要按年份加载。论文页展示书目信息、公开摘要及 DOI。

## 重建数据

采集输入与缓存保存在站外。先用 `scripts/import_catalog.py` 导入书目 CSV，用 `scripts/current_year.py` 和 `scripts/observatory.py` 生成本年卷期和原始五年对照。前端发布索引由 `scripts/reading_archive.py` 从上述底稿重建。其四个位置参数依次为本地书目项目根目录、Top5 Papers 的 src/data、NBER Weekly 的 src/data 和 SenLab 对外发布的 site/src/data。使用 `--cutoff 2026-11-24` 重现本次快照。更换截止日时同时更新本年卷期与来源快照。

- arXiv 使用同一固定元数据镜像。对同一缓存目录依次运行 arxiv_snapshot.py、arxiv_econ.py、arxiv_history.py 和 arxiv_public.py，以早期 archive/YYMMNNN 及后期 YYMM.NNNNN 标识还原首次公告月份。
- europe_pmc.py 和 specialist_catalog.py 按 ISSN 分别取得摘要和专业期刊卷期记录，接收缓存目录与 --cutoff。书目补全保留原文来源。首次生成公开索引后，可运行 abstract_gaps.py 以仍缺摘要的 DOI 跨刊补查，运行 crossref_abstracts.py 按刊比对出版社提交的摘要，再生成索引。
- 专业期刊卷期、欧洲PMC、跨刊摘要、出版社摘要等缓存目录位于本地书目项目的“采集”目录下。研究型论文与期务/待核记录的原始处理见 document_types.py、data/document_audit.json。archive-curation.json 存放增补选录与主题；最终分组、版本关系和去重理由见 reading_archive.py。
- 完整书目生成后，在本机运行翻译服务（HY-MT1.5-1.8B，llama.cpp 的 18244 端口），执行 `python scripts/translate_local.py` 续译缺失字段，再用 `python scripts/translate_local.py --apply` 合入中文。译文按原文校验值保存在本地，重建也会保留原文相同的已发布译文。
- [Econ Journal Authors 的冻结卷期目录](https://github.com/kochiuyu/econ-journal-authors/tree/c54c997888859067223103b659f4ee98d059b71b/releases/articles_toc_2010_2025)采用 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)。本站按刊年选取记录，校正会议期标记并汇总。首页摄影选自美国国家美术馆公有领域馆藏 [William A. Fraser, Wet Night, Columbus Circle, New York (1899)](https://www.nga.gov/artworks/127442-wet-night-columbus-circle-new-york)。

本地采集 JHE 的卷期字段可运行 `scripts/jhe_issues.py <书目项目>/采集/JHE卷期/0167-6296.json`，再重建索引。卷期号来自 Crossref 出版者记录，年份沿用已核对的本站目录。
HE 的卷期缓存使用相同命令，指定 `--issn 1057-9230`，文件名为 `1057-9230.json`。人工补译保存在 `data/editorial-translations.json`。批量译文随索引和各年摘要一起发布，保留原始题名和摘要供读者对照。
