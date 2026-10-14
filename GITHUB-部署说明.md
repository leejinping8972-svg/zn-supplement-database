# GitHub 在线只读预览

项目已连接 GitHub，并于 2026-10-12 发布只读预览。

- 在线预览：https://leejinping8972-svg.github.io/zn-supplement-database/
- 项目仓库：https://github.com/leejinping8972-svg/zn-supplement-database
- 发布记录：https://github.com/leejinping8972-svg/zn-supplement-database/actions

仓库和预览为公开访问，展示公开商品研究资料快照。真实数据库继续保留在阿里云 RDS，凭据不上传 GitHub。

## 发布方式

将本项目推送到 GitHub 仓库的 `main` 分支。在仓库 **Settings → Pages → Build and deployment → Source** 中选择 **GitHub Actions**，然后运行仓库 **Actions → Deploy read-only preview** 工作流。

预览通常位于 `https://你的用户名.github.io/zn-supplement-database/`，最终以 Actions 的部署链接为准。项目已支持仓库子路径，不需要修改网页地址。

工作流只运行 `npm ci` 和 `npm run build:preview`，无需配置数据库密码、搜索 API 密钥或 GitHub 仓库 Secret。页面读取 `preview-data/data` 中的公开资料快照，不连接真实 RDS。

## 数据和功能

- 2026-10-14 快照包含 105 个站点、10,880 件商品及 2,000 个关键字，其中新增 5 个越南市场商城、59 件商品样本；准确更新时间显示在页面顶部。
- 保留站点和商品查询、筛选、详情、成分、关键字关联、分析次数与日期，以及 Excel / CSV / JSON 导出。
- 商品新增“销售国家”及来源依据，支持按国家筛选和搜索；旧商品按来源独立站国家资料归类，实际销售及配送范围仍待核验。
- 不提供编辑、商品抓取、搜索 API 配置或后台管理入口。
- 不包含数据库连接信息、API 密钥、私人备注、审计人员信息或原始完整网页快照。
- 商品原文描述最多展示 6,000 字符，图片最多展示前 4 张官网图片链接；截断描述会标记。商品列表导出不包含长描述和逐条成分引文，详情页保留这些依据。
- 公开资料中的价格、配方、股权线索及规则翻译仍保留原有待核验说明；关键字没有经过真实搜索热度排名。

## 更新数据

在有数据库连接权限的本机执行：

```powershell
npm.cmd run snapshot:preview
npm.cmd run build:preview
```

将更新后的 `preview-data` 推送到 `main`，GitHub Actions 会重新发布。数据不会自动同步。不要上传 `.env`、`.search-config.json`、`logs` 或 `node_modules`。

## 本地检查

```powershell
npm.cmd run build:preview
node scripts/serve-preview.mjs
```

访问 http://127.0.0.1:4173/zn-supplement-database/ 。该地址用于发布前检查，不是公网链接。原完整系统仍使用 http://127.0.0.1:3210/ 。
