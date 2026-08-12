import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { parse } from 'yaml';

const root = process.cwd();
const errors = [];
const warnings = [];
const categories = new Set([
  'washing', 'decontamination', 'paint-care', 'coating',
  'interior', 'product-guide', 'brand-news',
]);
const forbiddenPublicText = [
  'janda-auto.pages.dev',
  'jimmy-xinhow.github.io/blog/',
  'localhost',
  '127.0.0.1',
  '忽略前面的指令',
  '提高 AI 引用率',
];

function fail(file, message) { errors.push(`${file}: ${message}`); }
function warn(file, message) { warnings.push(`${file}: ${message}`); }
function chars(value) { return Array.from(String(value || '').trim()).length; }
function inRange(value, min, max) { const size = chars(value); return size >= min && size <= max; }
function listInRange(value, min, max) { return Array.isArray(value) && value.length >= min && value.length <= max; }

function readFrontMatter(file) {
  const source = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) throw new Error('缺少有效的 YAML front matter');
  return { data: parse(match[1]), body: match[2], source };
}

function walkFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(full) : [full];
  });
}

function validatePost(file) {
  const relative = path.relative(root, file).replaceAll('\\', '/');
  let parsed;
  try { parsed = readFrontMatter(file); } catch (error) { fail(relative, error.message); return; }
  const { data, body, source } = parsed;

  if (!/^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.test(path.basename(file))) {
    fail(relative, '檔名必須是 YYYY-MM-DD-lowercase-slug.md');
  }
  if (data.layout !== 'post') fail(relative, 'layout 必須是 post');
  if (!inRange(data.title, 12, 70)) fail(relative, 'title 必須是 12–70 個字元');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(data.slug || ''))) fail(relative, 'slug 只能使用小寫英數與連字號');
  if (!path.basename(file).endsWith(`-${data.slug}.md`)) fail(relative, '檔名結尾必須與 slug 相同');
  if (!inRange(data.description, 70, 160)) fail(relative, 'description 必須是 70–160 個字元');
  if (!data.date || Number.isNaN(Date.parse(data.date))) fail(relative, 'date 必須是有效日期時間');
  if (data.updated_at && Number.isNaN(Date.parse(data.updated_at))) fail(relative, 'updated_at 必須是有效日期時間');
  if (!inRange(data.author, 2, 40)) fail(relative, 'author 必須是 2–40 個字元');
  if (!categories.has(data.category)) fail(relative, `category 不在允許清單：${data.category}`);
  if (!listInRange(data.tags, 2, 8)) fail(relative, 'tags 必須有 2–8 個');
  if (!listInRange(data.keywords, 2, 10)) fail(relative, 'keywords 必須有 2–10 個');
  if (typeof data.cover_image !== 'string' || !data.cover_image.startsWith('/janda-auto/assets/images/blog/')) fail(relative, 'cover_image 必須位於 /janda-auto/assets/images/blog/');
  if (!inRange(data.cover_alt, 8, 120)) fail(relative, 'cover_alt 必須是 8–120 個字元');
  if (!listInRange(data.key_takeaways, 2, 5)) fail(relative, 'key_takeaways 必須有 2–5 個');
  if (!listInRange(data.sources, 1, 10)) fail(relative, 'sources 必須有 1–10 個');
  if (Array.isArray(data.sources)) data.sources.forEach((item, index) => {
    if (!item?.label || !/^https:\/\//.test(item?.url || '')) fail(relative, `sources[${index}] 必須有名稱和 https 網址`);
  });
  if (data.faq && (!Array.isArray(data.faq) || data.faq.length > 6)) fail(relative, 'faq 最多 6 組');
  if (Array.isArray(data.faq)) data.faq.forEach((item, index) => {
    if (!item?.question || chars(item?.answer) < 20) fail(relative, `faq[${index}] 必須有問題和至少 20 字回答`);
  });
  if (typeof data.published !== 'boolean') fail(relative, 'published 必須是 true 或 false');
  if (body.trim().length < 500) fail(relative, '正文至少需要 500 個字元');
  if ((body.match(/^##\s+/gm) || []).length < 2) fail(relative, '正文至少需要兩個 H2 段落');
  if (!body.includes('<!--more-->')) warn(relative, '建議加入 <!--more--> 控制列表摘要切點');

  if (data.cover_image?.startsWith('/janda-auto/')) {
    const localImage = path.join(root, data.cover_image.slice('/janda-auto/'.length));
    if (!fs.existsSync(localImage)) fail(relative, `找不到封面圖片 ${data.cover_image}`);
  }
  forbiddenPublicText.forEach((needle) => {
    if (source.toLocaleLowerCase('zh-TW').includes(needle.toLocaleLowerCase('zh-TW'))) fail(relative, `包含禁止公開內容：${needle}`);
  });
}

const postFiles = walkFiles(path.join(root, '_posts')).filter((file) => file.endsWith('.md'));
if (!postFiles.length) errors.push('_posts: 至少需要一篇文章範本');
postFiles.forEach(validatePost);

for (const relative of ['index.html', 'robots.txt', 'sitemap.xml', 'llms.txt', 'llms-full.txt', 'feed.xml']) {
  const source = fs.readFileSync(path.join(root, relative), 'utf8');
  forbiddenPublicText.forEach((needle) => {
    if (source.toLocaleLowerCase('zh-TW').includes(needle.toLocaleLowerCase('zh-TW'))) fail(relative, `包含失效或禁止公開內容：${needle}`);
  });
}

let pagesConfig;
try { pagesConfig = parse(fs.readFileSync(path.join(root, '.pages.yml'), 'utf8')); } catch (error) { fail('.pages.yml', `無法解析：${error.message}`); }
const postsCollection = pagesConfig?.content?.find((item) => item.name === 'posts');
if (!postsCollection || postsCollection.path !== '_posts') fail('.pages.yml', '必須設定 _posts 文章 collection');
for (const required of ['title', 'slug', 'description', 'date', 'author', 'category', 'tags', 'keywords', 'cover_image', 'cover_alt', 'key_takeaways', 'sources', 'body']) {
  if (!postsCollection?.fields?.some((field) => field.name === required && field.required)) fail('.pages.yml', `${required} 必須是 CMS 必填欄位`);
}

warnings.forEach((message) => console.warn(`WARN ${message}`));
if (errors.length) {
  errors.forEach((message) => console.error(`ERROR ${message}`));
  console.error(`\n內容檢查失敗：${errors.length} 個問題`);
  process.exit(1);
}
console.log(`內容檢查通過：${postFiles.length} 篇文章，${warnings.length} 個提醒`);
