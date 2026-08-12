# 詹大汽車精品網站與部落格

正式網站：<https://jimmy-xinhow.github.io/janda-auto/>

此專案由 GitHub Pages 發布，文章使用 Jekyll 建置，Mio 可透過 Pages CMS 的圖形化介面新增與更新文章。文章原始檔保存在 `_posts/`，圖片保存在 `assets/images/blog/`，每次修改都有 Git 版本紀錄。

## Mio 上稿入口

1. 前往 <https://jimmy-xinhow.github.io/janda-auto/admin/>，再按「登入文章管理系統」。
2. 使用被邀請的電子郵件登入，或以有此專案權限的 GitHub 帳號登入。
3. 選擇 `Jimmy-xinhow/janda-auto`。
4. 開啟「部落格文章」，按「新增」。
5. 完成所有必填欄位後儲存；GitHub Pages 會自動重新發布。
6. 先查看 GitHub Actions 的 `Content quality` 是否通過，再到正式網站確認文章。

Mio 不需要編輯 HTML，也不應直接改 `_layouts/`、`_includes/`、`_config.yml` 或 `.pages.yml`。

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

## 管理者一次性設定

1. 在 Pages CMS 安裝 GitHub App，並只授權 `Jimmy-xinhow/janda-auto` repository。
2. 在 Pages CMS 的 Collaborators 功能以 Mio 的工作信箱發送邀請；Mio 不需要 GitHub 帳號。若改用 GitHub 登入，則只授予此 repository 所需的存取權。
3. Mio 完成第一次登入後，以現有文章建立一篇草稿、上傳測試圖片並儲存，確認 `Content quality` 通過。

Pages CMS 只提供編輯層，內容與發布仍以 GitHub repository 為權威來源。
