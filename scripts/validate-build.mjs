import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.join(process.cwd(), '_site');
const errors = [];
const required = [
  'index.html', 'blog/index.html', 'blog/janda-auto-care-blog/index.html',
  'robots.txt', 'sitemap.xml', 'feed.xml', 'llms.txt', 'llms-full.txt', '404.html', 'admin/index.html',
  'assets/css/site.css', 'assets/css/admin.css', 'assets/js/blog.js', 'assets/js/article.js', 'assets/js/admin.js', 'assets/favicon.svg',
];

function fail(message) { errors.push(message); }
function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

if (!fs.existsSync(root)) fail('找不到 _site 建置輸出');
required.forEach((relative) => {
  if (!fs.existsSync(path.join(root, relative))) fail(`缺少建置檔案：${relative}`);
});

if (fs.existsSync(root)) {
  const publicFiles = walk(root).filter((file) => /\.(?:html|xml|txt|css|js)$/i.test(file));
  publicFiles.forEach((file) => {
    const relative = path.relative(root, file).replaceAll('\\', '/');
    const source = fs.readFileSync(file, 'utf8');
    for (const needle of ['janda-auto.pages.dev', 'jimmy-xinhow.github.io/blog/', 'localhost', '127.0.0.1']) {
      if (source.toLowerCase().includes(needle.toLowerCase())) fail(`${relative} 包含禁止內容：${needle}`);
    }
    if (/{{|{%/.test(source)) fail(`${relative} 仍含未渲染 Liquid 標記`);
    if (relative.endsWith('.html')) {
      const canonical = source.match(/<link rel="canonical" href="([^"]+)"/g) || [];
      if (canonical.length !== 1) fail(`${relative} canonical 數量不是 1`);
      if (!source.includes('<meta name="description"')) fail(`${relative} 缺少 meta description`);
      if (!source.includes('<meta property="og:title"')) fail(`${relative} 缺少 Open Graph`);
      const scripts = Array.from(source.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g));
      scripts.forEach((match, index) => {
        try { JSON.parse(match[1]); } catch (error) { fail(`${relative} JSON-LD #${index + 1} 無效：${error.message}`); }
      });
      if (source.includes('本文已由 進行內容審閱')) fail(`${relative} 顯示空白審閱者`);
    }
  });

  const sitemap = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
  for (const url of [
    'https://jimmy-xinhow.github.io/janda-auto/',
    'https://jimmy-xinhow.github.io/janda-auto/blog/',
    'https://jimmy-xinhow.github.io/janda-auto/blog/janda-auto-care-blog/',
  ]) if (!sitemap.includes(url)) fail(`sitemap.xml 缺少 ${url}`);

  const robots = fs.readFileSync(path.join(root, 'robots.txt'), 'utf8');
  if (!robots.includes('https://jimmy-xinhow.github.io/janda-auto/sitemap.xml')) fail('robots.txt sitemap 網址錯誤');
  const llms = fs.readFileSync(path.join(root, 'llms-full.txt'), 'utf8');
  if (!llms.includes('詹大汽車精品保養文章上線')) fail('llms-full.txt 未收錄正式文章');
}

if (errors.length) {
  errors.forEach((message) => console.error(`ERROR ${message}`));
  console.error(`\n建置驗證失敗：${errors.length} 個問題`);
  process.exit(1);
}
console.log('Jekyll 建置驗證通過');
