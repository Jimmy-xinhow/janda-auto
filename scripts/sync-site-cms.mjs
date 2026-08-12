import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { stringify } from 'yaml';

const root = path.resolve(process.cwd());
const outputDirectory = path.resolve(root, '_posts', 'cms');
const siteId = 'cmn9128eo00pl8mq3391820gm';
const expectedSiteUrl = 'https://jimmy-xinhow.github.io/janda-auto/';
const endpoint = `https://api.geovault.app/api/site-cms/sites/${siteId}/public/export`;

if (!outputDirectory.startsWith(`${root}${path.sep}`) || path.basename(outputDirectory) !== 'cms') {
  throw new Error('CMS output path escaped the approved repository scope');
}

function addExcerpt(content, format) {
  if (content.includes('<!--more-->')) return content;
  if (format === 'html') {
    const paragraphEnd = content.search(/<\/p\s*>/i);
    if (paragraphEnd >= 0) {
      const insertAt = content.indexOf('>', paragraphEnd) + 1;
      return `${content.slice(0, insertAt)}\n\n<!--more-->\n\n${content.slice(insertAt)}`;
    }
    return `${content}\n\n<!--more-->\n`;
  }
  const lines = content.split(/\r?\n/);
  let seenParagraph = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (line && !line.startsWith('#') && !line.startsWith('- ') && !line.startsWith('> ')) seenParagraph = true;
    if (seenParagraph && !line && index + 1 < lines.length) {
      lines.splice(index + 1, 0, '<!--more-->', '');
      return lines.join('\n');
    }
  }
  return `${content}\n\n<!--more-->\n`;
}

function postSource(article) {
  const publishedAt = new Date(article.publishedAt);
  const updatedAt = new Date(article.updatedAt);
  if (Number.isNaN(publishedAt.getTime()) || Number.isNaN(updatedAt.getTime())) throw new Error(`Article ${article.id} has an invalid timestamp`);
  const frontMatter = {
    layout: 'post',
    managed_by: 'janda-site-cms',
    cms_article_id: article.id,
    title: article.title,
    slug: article.slug,
    description: article.description,
    date: publishedAt.toISOString(),
    updated_at: updatedAt.toISOString(),
    author: article.author,
    reviewed_by: article.reviewedBy || '',
    category: article.category,
    tags: article.tags,
    keywords: article.keywords,
    cover_image: article.coverImageUrl,
    cover_alt: article.coverAlt,
    featured: Boolean(article.featured),
    published: true,
    key_takeaways: article.keyTakeaways,
    faq: article.faq,
    sources: article.sources,
    content_format: article.contentFormat === 'html' ? 'html' : 'markdown',
    custom_css: article.customCss || '',
  };
  return `---\n${stringify(frontMatter, { lineWidth: 0 }).trimEnd()}\n---\n\n${addExcerpt(article.content, frontMatter.content_format).trim()}\n`;
}

const response = await fetch(endpoint, { headers: { Accept: 'application/json', 'User-Agent': 'janda-site-cms-sync/1.0' }, signal: AbortSignal.timeout(25_000) });
if (!response.ok) throw new Error(`CMS export failed with HTTP ${response.status}`);
const payload = await response.json();
const data = payload?.data ?? payload;
if (data?.site?.id !== siteId || data?.site?.url !== expectedSiteUrl) throw new Error('CMS export site identity did not match Janda');
if (!Array.isArray(data.articles)) throw new Error('CMS export articles payload is invalid');

fs.mkdirSync(outputDirectory, { recursive: true });
const desiredFiles = new Set();
for (const article of data.articles) {
  if (!article?.id || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(article.slug || '')) throw new Error('CMS export contains an invalid article identity');
  const date = new Date(article.publishedAt).toISOString().slice(0, 10);
  const fileName = `${date}-${article.slug}.md`;
  const filePath = path.join(outputDirectory, fileName);
  desiredFiles.add(fileName);
  const next = postSource(article);
  const previous = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
  if (previous !== next) fs.writeFileSync(filePath, next, 'utf8');
}

for (const entry of fs.readdirSync(outputDirectory, { withFileTypes: true })) {
  if (!entry.isFile() || !entry.name.endsWith('.md') || desiredFiles.has(entry.name)) continue;
  const stalePath = path.join(outputDirectory, entry.name);
  const source = fs.readFileSync(stalePath, 'utf8');
  if (!source.includes('managed_by: janda-site-cms')) throw new Error(`Refusing to remove unmanaged file ${entry.name}`);
  fs.unlinkSync(stalePath);
}

console.log(`CMS sync complete: ${data.articles.length} published article(s)`);
