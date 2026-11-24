# healthecon

[打开健康经济学研究观察](https://fyapeng.com/healthecon/)

healthecon 记录经济学家如何研究健康、医疗服务和保险。首页面向初次接触这个领域的读者。五大刊趋势、工作论文和研究主题均可进入同一个可筛选、可导出的文献目录。项目公开的是书目、分类判断和统计依据。

## 数据与口径

- 五大刊的 2020–2024 年曲线以历史人工清单为分子，按 DOI 和卷期核对。分母按同刊同年目录中标记为研究论文的记录计算。年度合计使用分子之和除以分母之和。历史清单包含与健康相关的理论应用，仍可有漏收或误收。2025 年尚待核读。
- 2026 年清单来自五刊的 Crossref 卷期和在线发表记录，截止 11 月 24 日。以 DOI 去重，分别标明本年卷期和本年在线。每篇附中文研究问题。最新清单按当前核读结果展示，不能视作全年发表量。
- 专业期刊纳入 Journal of Health Economics 和 Health Economics。书目由 OpenAlex 提供。国家指研究场景，理论研究和跨国研究可有独立标注。主题和国家筛选只覆盖已有标注的条目。
- NBER 用官方普通工作论文 w 编号和首次发布日期计年。分子取目前归入 Economics of Health（EH）的工作论文，分母取同年所有普通工作论文。两个前身项目于 2023 年 7 月合并。截止时间以批量目录中的最新日期为准。[NBER 书目](https://www.nber.org/research/data/nber-working-papers-and-chapters-metadata) · [项目沿革](https://www.nber.org/programs-projects/programs-working-groups/economics-health)
- arXiv 按标识中的首次公告月份统计快照所载全站记录及挂有 econ.* 标签的记录，跨栏论文只计一次。表中末月可能不完整。逐篇标注的健康研究可单独浏览。全站健康经济学分子尚待系统核读。[冻结的元数据镜像](https://huggingface.co/datasets/librarian-bots/arxiv-metadata-snapshot/tree/c428226b689a0e17db2cd55265133b9eca15d97f)
- 论文链接指向 DOI、NBER 或 arXiv。部分条目有 OpenAlex 登记的开放全文位置，开放版本可能为作者手稿。个人 PDF 由浏览器在本机打开。私人收藏和获取权限由研究者管理。

## 本地预览与更新

仓库附带前端所需的书目快照。在根目录运行 `python -m http.server 8000`，打开 `http://localhost:8000`。GitHub Pages 从 main 分支根目录发布。

`scripts/import_catalog.py` 从本地书目导出导入元数据，`scripts/document_types.py` 处理期务、勘误及其他待核条目，理由保存在 `data/document_audit.json`。`data/toc_special.tsv` 和五刊分母使用 [Econ Journal Authors 卷期目录](https://github.com/kochiuyu/econ-journal-authors/tree/c54c997888859067223103b659f4ee98d059b71b/releases/articles_toc_2010_2025)，原项目以 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) 发布。本站对数据作筛选和聚合。

`data/baseline-curation.txt` 和 `data/current-curation.txt` 保存可修订的分类。`scripts/current_year.py <卷期缓存目录>` 下载本年候选，`scripts/observatory.py <本地书目项目根目录>` 读取卷期目录、NBER 批量表和分类文件，更新图表。新快照须同步修改截止日和缓存路径。`scripts/open_copies.py <缓存目录>` 补充开放全文位置，可从环境读取 OPENALEX_API_KEY。

arXiv 的三个脚本按 `arxiv_snapshot.py`、`arxiv_econ.py`、`arxiv_public.py` 顺序运行，均接收同一个本地缓存目录，依赖 DuckDB。快照版本固定，更新时使用新的缓存目录。

首页插图选自芝加哥艺术博物馆公共领域馆藏，Mary Cassatt，《孩子的沐浴》，1893 年。[作品资料](https://www.artic.edu/artworks/111442/the-child-s-bath)
