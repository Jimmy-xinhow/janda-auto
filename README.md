# 詹大汽車精品網站與部落格

正式網站：<https://jimmy-xinhow.github.io/janda-auto/>

此專案由 GitHub Pages 發布，文章使用 Jekyll 建置。Mio 透過詹大網站自有的登入後台新增與更新文章；帳號、草稿與圖片儲存在 Geovault 後端，已發布內容由 GitHub Actions 定時同步為可被搜尋引擎與 AI 爬取的靜態頁面。

## Mio 上稿入口

1. 前往 <https://jimmy-xinhow.github.io/janda-auto/admin/>。
2. 以 Mio 的管理者帳號登入；第一次登入需更換臨時密碼。
3. 按「新增文章」，完成搜尋摘要、分類、首圖、正文、FAQ 與來源。
4. 先儲存草稿，依右側 SEO/GEO 完整度修正未通過項目。
5. 按「通過檢查並發布」；系統每五分鐘同步一次，通常數分鐘內會出現在正式部落格。
6. 到正式文章頁確認排版、圖片、canonical、結構化資料與分享預覽。

Mio 不需要 GitHub 帳號，也不需要編輯 HTML；後台不會提供網站程式碼權限。

## 上稿前檢查

- 標題直接對應讀者問題，不使用誇張保證或無來源排名。
- SEO 摘要是該篇文章獨有的 70–160 字摘要。
- slug 只用小寫英文字母、數字和連字號；發布後避免更改。
- 封面圖片有客觀、可理解的替代文字。
- 重點摘要在脫離正文時仍可獨立理解。
- 產品特性、施工安全、數據與外部規範都有 HTTPS 來源。
- 涉及材質與化學品時，正文說明閱讀產品標示與小範圍測試。
- 沒有實際審閱者時，「專業審閱者」留空，不自行填寫資格。
- 草稿請關閉「正式發布」。
- GitHub Pages 不會在未來時間自動重建；預排文章先存草稿，到發布時間再開啟「正式發布」。

## SEO／GEO 自動輸出

文章發布後會自動產生：

- 獨立 canonical、description、Open Graph 與 Twitter Card。
- `BlogPosting`、`BreadcrumbList` 與有內容時的 `FAQPage` JSON-LD。
- `/blog/` 文章列表、分類／關鍵字搜尋、分頁與相關文章。
- `/sitemap.xml`、`/feed.xml`、`/llms.txt`、`/llms-full.txt`。
- 作者、發布／更新時間、閱讀時間、重點摘要、來源與分享功能。
- Geovault crawler tracker。

## 本機檢查

```bash
npm ci
npm test
bundle install
npm run build
node scripts/validate-build.mjs
```

本機預覽：

```bash
npm run dev
```

開啟 <http://127.0.0.1:3333/janda-auto/>。

## 發布架構

- 後台登入與文章 API：`api.geovault.app` 的獨立網站 CMS 模組。
- 公開文章同步：`.github/workflows/deploy-pages.yml` 每五分鐘讀取已發布內容。
- 靜態內容輸出：`_posts/cms/` 只由同步程式管理，草稿不會進入 repository 或公開建置。
- GitHub Pages 是公開頁面的發布權威；CMS 資料庫是帳號、草稿與編輯狀態的權威。
