# healthecon

[访问健康经济学研究观察](https://fyapeng.com/healthecon/) · [前端数据说明](docs/reading-data.md) · [前端设计委托](docs/gemini-design-brief.md)

中文公共文献站。收录健康经济学研究，展示五大经济学期刊的年度变化、专业期刊文章和工作论文。读者可以从图表进入对应论文，按年、期刊、主题、研究地点筛选，展开原文摘要、已有中文译文，或访问开放版本。

## 当前快照

目录按 2003–2026 年组织，2026 年截至 11 月 24 日。索引包括跨学科文献，默认的健康研究目录只是其中一部分。独立卷期核对覆盖 2010–2025 年。五刊长期目录、NBER 项目和 arXiv 分类各自使用不同的分子、分母和时间定义。各年的分子、分母与核心字段见公开数据说明。

## 本地运行

仓库提供完整的静态展示数据。在根目录运行 `python -m http.server 8000` 并打开 http://localhost:8000。GitHub Pages 从 main 分支根目录发布。摘要按年份加载。个人 PDF 在本机读取，仓库不保存 PDF 和私人笔记。

## 重建数据

采集输入与缓存保存在站外。先用 `scripts/import_catalog.py` 导入书目 CSV，用 `scripts/current_year.py` 和 `scripts/observatory.py` 生成本年卷期和原始五年对照。前端发布索引由 `scripts/reading_archive.py` 从上述底稿重建。其四个位置参数依次为本地书目项目根目录、Top5 Papers 的 src/data、NBER Weekly 的 src/data 和 SenLab 对外发布的 site/src/data。使用 `--cutoff 2026-11-24` 重现本次快照。更换截止日时同时更新本年卷期与来源快照。

- arXiv 使用同一固定元数据镜像。对同一缓存目录依次运行 arxiv_snapshot.py、arxiv_econ.py、arxiv_history.py 和 arxiv_public.py，以早期 archive/YYMMNNN 及后期 YYMM.NNNNN 标识还原首次公告月份。
- europe_pmc.py 和 specialist_catalog.py 按 ISSN 分别取得摘要和专业期刊卷期记录，接收缓存目录与 --cutoff。书目补全保留原文来源。首次生成公开索引后，可运行 abstract_gaps.py 以仍缺摘要的 DOI 跨刊补查，运行 crossref_abstracts.py 按刊比对出版社提交的摘要，再生成索引。
- 专业期刊卷期、欧洲PMC、跨刊摘要、出版社摘要等缓存目录位于本地书目项目的“采集”目录下。研究型论文与期务/待核记录的原始处理见 document_types.py、data/document_audit.json。archive-curation.json 存放增补选录与主题；最终分组、版本关系和去重理由见 reading_archive.py。
- open_copies.py 从 OpenAlex 补充开放版本位置。部分条目只有出版社链接。
- [Econ Journal Authors 的冻结卷期目录](https://github.com/kochiuyu/econ-journal-authors/tree/c54c997888859067223103b659f4ee98d059b71b/releases/articles_toc_2010_2025)采用 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)。本站按刊年选取记录，校正会议期标记并汇总。首页图像为 Mary Cassatt 1893 年作品《孩子的沐浴》，来自[芝加哥艺术博物馆公共领域馆藏](https://www.artic.edu/artworks/111442/the-child-s-bath)。
