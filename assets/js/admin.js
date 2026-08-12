(() => {
  'use strict';

  const API_BASE = 'https://api.geovault.app/api';
  const SITE_ID = 'cmn9128eo00pl8mq3391820gm';
  const API_ROOT = `${API_BASE}/site-cms/sites/${SITE_ID}`;
  const categories = {
    washing: '洗車教學',
    decontamination: '去汙除垢',
    'paint-care': '漆面保養',
    coating: '鍍膜知識',
    interior: '內裝清潔',
    'product-guide': '產品指南',
    'brand-news': '品牌消息',
  };
  const qualityLabels = {
    title: '標題長度 12–70 字', slug: '網址代稱格式正確', description: 'SEO 描述 70–160 字',
    category: '文章分類完整', tags: '標籤 2–8 個', keywords: '關鍵字 2–10 個',
    coverImage: 'HTTPS 首圖', coverAlt: '首圖替代文字 8–120 字', author: '作者名稱完整',
    takeaways: '重點摘要 2–5 點', faq: 'FAQ 2–6 組', sources: '可信來源至少 1 筆',
    contentLength: '正文至少 800 字', headingStructure: '至少兩個 H2 小標題',
    safeContent: 'HTML 與連結內容安全', safeCss: '自訂 CSS 已限制作用範圍', publicSafety: '公開內容安全',
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const views = {
    login: $('#login-view'), password: $('#password-view'), dashboard: $('#dashboard-view'),
  };
  let token = null;
  let account = null;
  let currentArticle = null;
  let articleItems = [];
  let dirty = false;
  let requestInFlight = false;
  let editorMode = 'markdown';
  let contentFormat = 'markdown';
  let canonicalContent = '';
  let customCss = '';
  let lastPreview = null;
  let previewTimer = null;
  let previewSequence = 0;
  let previewObjectUrl = null;
  let previewStyleObjectUrl = null;

  function showView(name) {
    Object.entries(views).forEach(([key, element]) => { element.hidden = key !== name; });
    const authenticated = name === 'dashboard' || name === 'password';
    $('#logout-button').hidden = !authenticated;
    $('#session-label').hidden = !authenticated;
    if (authenticated && account) $('#session-label').textContent = `${account.displayName}（${account.role === 'admin' ? '管理者' : '編輯者'}）`;
  }

  function setMessage(id, message) { $(id).textContent = message || ''; }
  function toast(message, isError = false) {
    const region = $('#toast-region');
    const item = document.createElement('div');
    item.className = `toast${isError ? ' error' : ''}`;
    item.textContent = message;
    region.appendChild(item);
    window.setTimeout(() => item.remove(), 5500);
  }

  function getErrorMessage(payload, status) {
    if (payload && typeof payload.message === 'string') return payload.message;
    if (payload && Array.isArray(payload.message)) return payload.message.join('、');
    if (payload && payload.message && typeof payload.message.message === 'string') return payload.message.message;
    return `請求失敗（HTTP ${status}）`;
  }

  async function api(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (token) headers.set('Authorization', `Bearer ${token}`);
    if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch(`${API_ROOT}${path}`, { ...options, headers, signal: controller.signal });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 401 && path !== '/auth/login') resetSession('登入已失效，請重新登入。');
        const error = new Error(getErrorMessage(payload, response.status));
        error.status = response.status;
        error.payload = payload;
        throw error;
      }
      return payload && Object.prototype.hasOwnProperty.call(payload, 'data') ? payload.data : payload;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('連線逾時，請檢查網路後重試。');
      if (error instanceof TypeError) throw new Error('無法連線文章服務，請確認網路後再試。');
      throw error;
    } finally {
      window.clearTimeout(timer);
    }
  }

  function resetSession(message = '') {
    token = null;
    account = null;
    currentArticle = null;
    articleItems = [];
    dirty = false;
    $('#login-password').value = '';
    showView('login');
    if (message) setMessage('#login-message', message);
  }

  async function handleLogin(event) {
    event.preventDefault();
    if (requestInFlight) return;
    requestInFlight = true;
    const submit = $('#login-submit');
    submit.disabled = true;
    submit.textContent = '登入中…';
    setMessage('#login-message', '');
    try {
      const data = await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: $('#login-username').value.trim(), password: $('#login-password').value }),
      });
      token = data.token;
      account = data.account;
      if (account.mustChangePassword) {
        $('#current-password').value = $('#login-password').value;
        $('#login-password').value = '';
        showView('password');
        $('#new-password').focus();
      } else {
        $('#login-password').value = '';
        showView('dashboard');
        await loadArticles();
      }
    } catch (error) {
      setMessage('#login-message', error.message);
    } finally {
      requestInFlight = false;
      submit.disabled = false;
      submit.textContent = '登入後台';
    }
  }

  async function handlePasswordChange(event) {
    event.preventDefault();
    const currentPassword = $('#current-password').value;
    const newPassword = $('#new-password').value;
    const confirmPassword = $('#confirm-password').value;
    setMessage('#password-message', '');
    if (newPassword !== confirmPassword) return setMessage('#password-message', '兩次輸入的新密碼不一致。');
    if (!/^\d{8}$/.test(newPassword)) {
      return setMessage('#password-message', '新密碼必須是 8 碼純數字。');
    }
    const submit = $('#password-submit');
    submit.disabled = true;
    try {
      const data = await api('/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) });
      token = data.token;
      account = data.account;
      $('#password-form').reset();
      showView('dashboard');
      toast('新密碼已設定，現在可以上架文章。');
      await loadArticles();
    } catch (error) {
      setMessage('#password-message', error.message);
    } finally {
      submit.disabled = false;
    }
  }

  async function logout() {
    if (dirty && !window.confirm('目前有尚未儲存的內容，仍要登出嗎？')) return;
    try { if (token) await api('/auth/logout', { method: 'POST' }); } catch { /* local logout still applies */ }
    resetSession('已安全登出。');
  }

  function csv(value) {
    return [...new Set(String(value || '').split(/[,，]/).map((item) => item.trim()).filter(Boolean))];
  }
  function lines(value) {
    return [...new Set(String(value || '').split(/\r?\n/).map((item) => item.trim().replace(/^[-*]\s+/, '')).filter(Boolean))];
  }
  function fmtDate(value) {
    if (!value) return '尚未發布';
    return new Intl.DateTimeFormat('zh-TW', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  }

  async function loadArticles() {
    const query = new URLSearchParams();
    const status = $('#status-filter').value;
    const search = $('#article-search').value.trim();
    if (status) query.set('status', status);
    if (search) query.set('search', search);
    try {
      const data = await api(`/articles?${query.toString()}`);
      articleItems = data.items;
      renderArticleList();
    } catch (error) {
      toast(error.message, true);
    }
  }

  function renderArticleList() {
    const list = $('#article-list');
    list.replaceChildren();
    $('#article-count').textContent = `${articleItems.length} 篇`;
    if (!articleItems.length) {
      const note = document.createElement('p');
      note.className = 'save-state';
      note.textContent = '目前沒有符合條件的文章。';
      list.appendChild(note);
      return;
    }
    articleItems.forEach((article) => {
      const button = document.createElement('button');
      button.type = 'button';
      if (currentArticle && article.id === currentArticle.id) button.classList.add('active');
      const title = document.createElement('strong');
      title.textContent = article.title;
      const meta = document.createElement('small');
      meta.textContent = `${article.status === 'published' ? '已發布' : '草稿'} · ${fmtDate(article.updatedAt)}`;
      button.append(title, meta);
      button.addEventListener('click', () => openArticle(article.id));
      list.appendChild(button);
    });
  }

  async function openArticle(id) {
    if (dirty && !window.confirm('目前內容尚未儲存，確定要切換文章嗎？')) return;
    try {
      currentArticle = await api(`/articles/${encodeURIComponent(id)}`);
      dirty = false;
      populateEditor(currentArticle);
      renderArticleList();
    } catch (error) { toast(error.message, true); }
  }

  function newArticle() {
    if (dirty && !window.confirm('目前內容尚未儲存，確定要新增文章嗎？')) return;
    currentArticle = null;
    dirty = false;
    populateEditor({
      title: '', slug: '', description: '', content: '', contentFormat: 'html', customCss: '', category: 'washing', tags: [], keywords: [],
      coverImageUrl: '', coverAlt: '', author: account?.displayName || 'Mio', reviewedBy: '', keyTakeaways: [],
      faq: [{ question: '', answer: '' }, { question: '', answer: '' }], sources: [{ label: '詹大汽車精品官方網站', url: 'https://jimmy-xinhow.github.io/janda-auto/' }],
      featured: false, status: 'draft', quality: null,
    });
    $('#article-title').focus();
  }

  function populateEditor(article) {
    $('#empty-workspace').hidden = true;
    $('#article-form').hidden = false;
    $('#editor-heading').textContent = article.id ? article.title : '新增文章';
    $('#article-title').value = article.title || '';
    $('#article-slug').value = article.slug || '';
    $('#article-description').value = article.description || '';
    $('#article-category').value = article.category || 'washing';
    $('#article-tags').value = (article.tags || []).join(', ');
    $('#article-keywords').value = (article.keywords || []).join(', ');
    $('#article-cover-url').value = article.coverImageUrl || '';
    $('#article-cover-alt').value = article.coverAlt || '';
    $('#article-author').value = article.author || account?.displayName || 'Mio';
    $('#article-reviewer').value = article.reviewedBy || '';
    $('#article-takeaways').value = (article.keyTakeaways || []).join('\n');
    contentFormat = article.contentFormat === 'html' ? 'html' : 'markdown';
    canonicalContent = article.content || '';
    customCss = article.customCss || '';
    $('#article-content').value = contentFormat === 'markdown' ? canonicalContent : '';
    $('#article-html').value = contentFormat === 'html' ? canonicalContent : '';
    $('#article-css').value = customCss;
    $('#article-plain').value = contentText(canonicalContent, contentFormat);
    if (contentFormat === 'html') setSanitizedEditorHtml(canonicalContent);
    else $('#visual-editor').replaceChildren();
    $('#article-featured').checked = Boolean(article.featured);
    renderFaq(article.faq || []);
    renderSources(article.sources || []);
    updateCoverPreview();
    updateEditorState(article);
    showEditorPanel(contentFormat === 'html' ? 'visual' : 'markdown');
    updateCounts();
    renderQuality(article.quality || localQuality());
    schedulePreview(0);
    $('#save-state').textContent = article.id ? `最後更新：${fmtDate(article.updatedAt)}` : '尚未儲存';
  }

  function updateEditorState(article) {
    const published = article.status === 'published';
    const status = $('#editor-status');
    status.textContent = published ? '已發布' : '草稿';
    status.className = `status-pill ${published ? 'published' : 'draft'}`;
    $('#delete-button').hidden = !article.id || published || account?.role !== 'admin';
    $('#unpublish-button').hidden = !published;
    $('#publish-button').hidden = published;
    $('#save-button').textContent = published ? '儲存更新' : '儲存草稿';
  }

  function createRepeaterItem(type, data = {}) {
    const item = document.createElement('div');
    item.className = 'repeater-item';
    item.dataset.type = type;
    const remove = document.createElement('button');
    remove.type = 'button'; remove.className = 'remove-item'; remove.setAttribute('aria-label', '移除此項'); remove.textContent = '×';
    remove.addEventListener('click', () => { item.remove(); markDirty(); });
    item.appendChild(remove);
    if (type === 'faq') {
      item.append(makeLabel('問題'), makeInput('text', 'question', data.question || '', 160), makeLabel('回答'), makeTextarea('answer', data.answer || '', 1000));
    } else {
      item.append(makeLabel('來源名稱'), makeInput('text', 'label', data.label || '', 120), makeLabel('HTTPS 網址'), makeInput('url', 'url', data.url || '', 500));
    }
    return item;
  }
  function makeLabel(text) { const label = document.createElement('label'); label.textContent = text; return label; }
  function makeInput(type, field, value, maxLength) { const input = document.createElement('input'); input.type = type; input.dataset.field = field; input.value = value; input.maxLength = maxLength; return input; }
  function makeTextarea(field, value, maxLength) { const input = document.createElement('textarea'); input.dataset.field = field; input.value = value; input.maxLength = maxLength; input.rows = 3; return input; }
  function renderFaq(items) { const list = $('#faq-list'); list.replaceChildren(...items.map((item) => createRepeaterItem('faq', item))); }
  function renderSources(items) { const list = $('#source-list'); list.replaceChildren(...items.map((item) => createRepeaterItem('source', item))); }
  function collectRepeater(selector, fields) {
    return $$('.repeater-item', $(selector)).map((item) => Object.fromEntries(fields.map((field) => [field, $(`[data-field="${field}"]`, item).value.trim()]))).filter((item) => fields.some((field) => item[field]));
  }

  function formPayload() {
    syncCanonicalFromActiveEditor();
    const payload = {
      title: $('#article-title').value.trim(), slug: $('#article-slug').value.trim().toLowerCase(),
      description: $('#article-description').value.trim(), content: canonicalContent.trim(), contentFormat, customCss: customCss.trim(),
      category: $('#article-category').value, tags: csv($('#article-tags').value), keywords: csv($('#article-keywords').value),
      coverAlt: $('#article-cover-alt').value.trim(), author: $('#article-author').value.trim(), reviewedBy: $('#article-reviewer').value.trim(),
      keyTakeaways: lines($('#article-takeaways').value), faq: collectRepeater('#faq-list', ['question', 'answer']),
      sources: collectRepeater('#source-list', ['label', 'url']), featured: $('#article-featured').checked,
    };
    const coverImageUrl = $('#article-cover-url').value.trim();
    if (coverImageUrl) payload.coverImageUrl = coverImageUrl;
    if (currentArticle?.id) payload.version = currentArticle.version;
    return payload;
  }

  async function saveArticle(event) {
    if (event) event.preventDefault();
    const payload = formPayload();
    if (!payload.title || !payload.slug) throw new Error('請先填寫文章標題與網址代稱。');
    const saved = currentArticle?.id
      ? await api(`/articles/${encodeURIComponent(currentArticle.id)}`, { method: 'PATCH', body: JSON.stringify(payload) })
      : await api('/articles', { method: 'POST', body: JSON.stringify(payload) });
    currentArticle = saved;
    dirty = false;
    populateEditor(saved);
    await loadArticles();
    toast('文章草稿已安全儲存。');
    return saved;
  }

  async function handleSave(event) {
    const button = $('#save-button');
    button.disabled = true;
    try { await saveArticle(event); } catch (error) { if (event) event.preventDefault(); toast(error.message, true); }
    finally { button.disabled = false; }
  }

  async function publishArticle() {
    if (!window.confirm('確定要發布這篇文章？通過品質檢查後，數分鐘內會同步到公開部落格。')) return;
    const button = $('#publish-button');
    button.disabled = true;
    try {
      const saved = await saveArticle();
      currentArticle = await api(`/articles/${encodeURIComponent(saved.id)}/publish`, { method: 'POST', body: JSON.stringify({ version: saved.version }) });
      populateEditor(currentArticle);
      await loadArticles();
      toast('發布成功，公開網站將在數分鐘內完成同步。');
    } catch (error) {
      const quality = error.payload?.quality || error.payload?.message?.quality;
      if (quality) renderQuality(quality);
      toast(error.message, true);
    } finally { button.disabled = false; }
  }

  async function unpublishArticle() {
    if (!currentArticle?.id || !window.confirm('確定要下架這篇文章？同步完成後公開網址將移除。')) return;
    try {
      currentArticle = await api(`/articles/${encodeURIComponent(currentArticle.id)}/unpublish`, { method: 'POST', body: JSON.stringify({ version: currentArticle.version }) });
      populateEditor(currentArticle); await loadArticles(); toast('文章已下架，公開網站將在數分鐘內同步。');
    } catch (error) { toast(error.message, true); }
  }

  async function deleteArticle() {
    if (!currentArticle?.id || !window.confirm('確定永久刪除這份草稿？此動作無法復原。')) return;
    try {
      await api(`/articles/${encodeURIComponent(currentArticle.id)}`, { method: 'DELETE' });
      currentArticle = null; dirty = false; $('#article-form').hidden = true; $('#empty-workspace').hidden = false;
      await loadArticles(); toast('草稿已刪除。');
    } catch (error) { toast(error.message, true); }
  }

  async function uploadCover() {
    const file = $('#cover-file').files[0];
    if (!file) return toast('請先選擇圖片。', true);
    if (file.size > 5 * 1024 * 1024) return toast('圖片不可超過 5 MB。', true);
    const button = $('#upload-button'); button.disabled = true; button.textContent = '上傳中…';
    try {
      const form = new FormData(); form.append('file', file);
      const result = await api('/media', { method: 'POST', body: form });
      $('#article-cover-url').value = result.publicUrl; updateCoverPreview(); markDirty(); toast('首圖上傳完成。');
    } catch (error) { toast(error.message, true); }
    finally { button.disabled = false; button.textContent = '上傳圖片'; }
  }

  function localQuality() {
    const value = formPayload();
    const count = (text) => Array.from(String(text || '').trim()).length;
    const checks = {
      title: count(value.title) >= 12 && count(value.title) <= 70,
      slug: /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.slug),
      description: count(value.description) >= 70 && count(value.description) <= 160,
      category: Boolean(categories[value.category]), tags: value.tags.length >= 2 && value.tags.length <= 8,
      keywords: value.keywords.length >= 2 && value.keywords.length <= 10,
      coverImage: /^https:\/\//i.test(value.coverImageUrl || ''), coverAlt: count(value.coverAlt) >= 8 && count(value.coverAlt) <= 120,
      author: count(value.author) >= 2 && count(value.author) <= 40, takeaways: value.keyTakeaways.length >= 2 && value.keyTakeaways.length <= 5,
      faq: value.faq.length >= 2 && value.faq.length <= 6, sources: value.sources.length >= 1 && value.sources.length <= 10,
      contentLength: count(contentText(value.content, value.contentFormat)) >= 800,
      headingStructure: value.contentFormat === 'html'
        ? (value.content.match(/<h2(?:\s[^>]*)?>[\s\S]*?<\/h2>/gi) || []).length >= 2
        : (value.content.match(/^##\s+.+$/gm) || []).length >= 2,
      safeContent: !/<\s*\/?\s*(script|iframe|object|embed|form|style|svg|math|link|meta)\b|\bon[a-z]+\s*=|javascript\s*:|data:text\/html/i.test(value.content),
      safeCss: !/@|url\s*\(|expression\s*\(|javascript\s*:|position\s*:\s*(fixed|sticky)/i.test(value.customCss || ''),
    };
    const passed = Object.values(checks).filter(Boolean).length;
    return { score: Math.round(passed / Object.keys(checks).length * 100), checks, issues: [] };
  }

  function renderQuality(report) {
    const score = Number(report?.score || 0);
    $('#quality-score').textContent = String(score);
    $('.score-ring').style.background = `conic-gradient(var(--brand) ${score * 3.6}deg, #2a374b 0deg)`;
    const list = $('#quality-list'); list.replaceChildren();
    Object.entries(report?.checks || {}).filter(([key]) => !key.startsWith('faq.') && !key.startsWith('source.')).forEach(([key, passed]) => {
      const item = document.createElement('li'); item.className = passed ? 'pass' : 'fail';
      item.textContent = `${passed ? '✓' : '○'} ${qualityLabels[key] || key}`; list.appendChild(item);
    });
    $('#quality-summary').textContent = report?.passed ? '已符合公開發布門檻。' : score === 100 ? '本機檢查完成，儲存後由伺服器做最終驗證。' : '完成未通過項目後即可發布。';
  }

  function updateCounts() {
    $$('[data-count-for]').forEach((counter) => {
      const input = $(`#${counter.dataset.countFor}`); const count = Array.from(input.value.trim()).length;
      const ranges = { 'article-title': [12, 70], 'article-description': [70, 160] };
      const [min, max] = ranges[input.id]; counter.textContent = `${count} / ${min}–${max} 字`; counter.classList.toggle('invalid', count < min || count > max);
    });
    syncCanonicalFromActiveEditor();
    const count = Array.from(contentText(canonicalContent, contentFormat).trim()).length;
    $('#content-count').textContent = `${count.toLocaleString('zh-TW')} 字 · ${contentFormat === 'html' ? 'HTML' : 'Markdown'}`;
    $('#content-count').classList.toggle('invalid', count < 800 || count > 60000);
  }

  function markDirty() {
    if ($('#article-form').hidden) return;
    dirty = true; $('#save-state').textContent = '有尚未儲存的變更'; updateCounts(); renderQuality(localQuality()); updateCoverPreview(); schedulePreview();
  }

  function updateCoverPreview() {
    const url = $('#article-cover-url').value.trim(); const figure = $('#cover-preview');
    figure.hidden = !/^https:\/\//i.test(url); if (!figure.hidden) { $('#cover-preview-image').src = url; $('#cover-preview-image').alt = $('#article-cover-alt').value.trim() || '首圖預覽'; }
  }

  function contentText(content, format) {
    if (format !== 'html') return String(content || '');
    const parsed = new DOMParser().parseFromString(String(content || ''), 'text/html');
    return parsed.body.textContent || '';
  }

  function setSanitizedEditorHtml(html) {
    const parsed = new DOMParser().parseFromString(String(html || ''), 'text/html');
    const nodes = Array.from(parsed.body.childNodes).map((node) => document.importNode(node, true));
    $('#visual-editor').replaceChildren(...nodes);
  }

  function syncCanonicalFromActiveEditor() {
    if (editorMode === 'visual') {
      canonicalContent = $('#visual-editor').innerHTML.trim();
      contentFormat = 'html';
    } else if (editorMode === 'markdown') {
      canonicalContent = $('#article-content').value;
      contentFormat = 'markdown';
    } else if (editorMode === 'html') {
      canonicalContent = $('#article-html').value;
      customCss = $('#article-css').value;
      contentFormat = 'html';
    } else if (editorMode === 'plain') {
      canonicalContent = $('#article-plain').value;
      customCss = '';
      contentFormat = 'markdown';
    }
  }

  function showEditorPanel(mode) {
    editorMode = mode;
    $$('[data-editor-panel]').forEach((panel) => { panel.hidden = panel.dataset.editorPanel !== mode; });
    $$('[data-editor-mode]').forEach((button) => {
      const active = button.dataset.editorMode === mode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });
    $('.rich-toolbar').hidden = mode === 'html' || mode === 'plain';
    const notes = {
      visual: '可直接從 Word 貼上，內容會先經伺服器清理再插入。',
      markdown: '支援 H2、H3、清單、引言、連結與圖片等 Markdown 語法。',
      html: 'HTML 與 CSS 會使用白名單清理；CSS 只會作用於文章正文。',
      plain: '純文字模式會移除既有格式；切換前系統會要求確認。',
    };
    $('#editor-mode-note').textContent = notes[mode];
  }

  async function sanitizedPreview(content = canonicalContent, format = contentFormat, css = customCss) {
    return api('/articles/preview', {
      method: 'POST',
      body: JSON.stringify({ content, contentFormat: format, customCss: css }),
    });
  }

  async function switchEditorMode(nextMode) {
    if (nextMode === editorMode) return;
    syncCanonicalFromActiveEditor();
    try {
      if ((nextMode === 'visual' || nextMode === 'html') && contentFormat === 'markdown') {
        const preview = await sanitizedPreview();
        canonicalContent = preview.html;
        customCss = preview.customCss || '';
        contentFormat = 'html';
        setSanitizedEditorHtml(canonicalContent);
        $('#article-html').value = canonicalContent;
        $('#article-css').value = customCss;
        toast('文章已轉為安全 HTML，可使用視覺或 HTML/CSS 模式編輯。');
      } else if (nextMode === 'visual' && editorMode === 'html') {
        const preview = await sanitizedPreview();
        canonicalContent = preview.content;
        customCss = preview.customCss || '';
        $('#article-html').value = canonicalContent;
        $('#article-css').value = customCss;
        setSanitizedEditorHtml(canonicalContent);
        toast('HTML 與 CSS 已安全清理並載入視覺編輯器。');
      } else if (nextMode === 'markdown' && contentFormat === 'html') {
        if (canonicalContent && !window.confirm('轉為 Markdown 可能會簡化部分 HTML 樣式，確定要轉換嗎？')) return;
        canonicalContent = htmlToMarkdown(canonicalContent);
        customCss = '';
        contentFormat = 'markdown';
        $('#article-content').value = canonicalContent;
      } else if (nextMode === 'plain') {
        if (canonicalContent && !window.confirm('切換純文字會移除目前的排版與 CSS，確定要繼續嗎？')) return;
        canonicalContent = contentText(canonicalContent, contentFormat);
        customCss = '';
        contentFormat = 'markdown';
        $('#article-plain').value = canonicalContent;
      }

      if (nextMode === 'visual') setSanitizedEditorHtml(canonicalContent);
      if (nextMode === 'markdown') $('#article-content').value = canonicalContent;
      if (nextMode === 'html') {
        $('#article-html').value = canonicalContent;
        $('#article-css').value = customCss;
      }
      if (nextMode === 'plain') $('#article-plain').value = contentText(canonicalContent, contentFormat);
      showEditorPanel(nextMode);
      markDirty();
    } catch (error) {
      toast(error.message, true);
    }
  }

  function htmlToMarkdown(html) {
    const parsed = new DOMParser().parseFromString(String(html || ''), 'text/html');
    const render = (node) => {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent || '';
      if (node.nodeType !== Node.ELEMENT_NODE) return '';
      const element = node;
      const children = Array.from(element.childNodes).map(render).join('');
      const tag = element.tagName.toLowerCase();
      if (tag === 'h2') return `\n\n## ${children.trim()}\n\n`;
      if (tag === 'h3') return `\n\n### ${children.trim()}\n\n`;
      if (tag === 'h4') return `\n\n#### ${children.trim()}\n\n`;
      if (tag === 'strong' || tag === 'b') return `**${children}**`;
      if (tag === 'em' || tag === 'i') return `*${children}*`;
      if (tag === 's' || tag === 'del') return `~~${children}~~`;
      if (tag === 'code' && element.parentElement?.tagName.toLowerCase() !== 'pre') return `\`${children}\``;
      if (tag === 'pre') return `\n\n\`\`\`\n${element.textContent || ''}\n\`\`\`\n\n`;
      if (tag === 'blockquote') return `\n\n${children.trim().split(/\r?\n/).map((line) => `> ${line}`).join('\n')}\n\n`;
      if (tag === 'li') return `- ${children.trim()}\n`;
      if (tag === 'ul' || tag === 'ol') return `\n${children}\n`;
      if (tag === 'a') return `[${children.trim() || element.getAttribute('href') || '連結'}](${element.getAttribute('href') || ''})`;
      if (tag === 'img') return `![${element.getAttribute('alt') || '圖片'}](${element.getAttribute('src') || ''})`;
      if (tag === 'br') return '\n';
      if (tag === 'hr') return '\n\n---\n\n';
      if (tag === 'p' || tag === 'figure' || tag === 'figcaption' || tag === 'div') return `\n\n${children.trim()}\n\n`;
      return children;
    };
    return Array.from(parsed.body.childNodes).map(render).join('').replace(/\n{3,}/g, '\n\n').trim();
  }

  function insertMarkdownSyntax(button) {
    const area = $('#article-content');
    const start = area.selectionStart;
    const end = area.selectionEnd;
    const selected = area.value.slice(start, end) || '文字';
    const command = button.dataset.command;
    const block = button.dataset.block;
    let replacement = selected;
    if (block === 'h2') replacement = `## ${selected}`;
    else if (block === 'h3') replacement = `### ${selected}`;
    else if (block === 'blockquote') replacement = selected.split(/\r?\n/).map((line) => `> ${line}`).join('\n');
    else if (command === 'bold') replacement = `**${selected}**`;
    else if (command === 'italic') replacement = `*${selected}*`;
    else if (command === 'strikeThrough') replacement = `~~${selected}~~`;
    else if (command === 'formatCode') replacement = `\`${selected}\``;
    else if (command === 'insertUnorderedList') replacement = selected.split(/\r?\n/).map((line) => `- ${line}`).join('\n');
    else if (command === 'createLink') {
      const url = askForUrl('請輸入連結網址（http、https 或 mailto）：', false);
      if (!url) return;
      replacement = `[${selected}](${url})`;
    } else if (command === 'insertImage') {
      const url = askForUrl('請輸入圖片 HTTPS 網址：', true);
      if (!url) return;
      replacement = `![${selected === '文字' ? '圖片說明' : selected}](${url})`;
    } else if (['underline', 'justifyLeft', 'justifyCenter', 'justifyRight'].includes(command)) {
      return toast('此格式請切換到視覺編輯器使用。', true);
    } else if (command === 'undo') { document.execCommand('undo'); return; }
    else if (command === 'redo') { document.execCommand('redo'); return; }
    area.setRangeText(replacement, start, end, 'end');
    area.focus();
    markDirty();
  }

  function askForUrl(message, imageOnly) {
    const value = window.prompt(message, 'https://');
    if (!value) return null;
    try {
      const parsed = new URL(value);
      const allowed = imageOnly ? parsed.protocol === 'https:' : ['http:', 'https:', 'mailto:'].includes(parsed.protocol);
      if (!allowed) throw new Error('invalid protocol');
      return parsed.toString();
    } catch {
      toast(imageOnly ? '圖片只接受 HTTPS 網址。' : '連結網址格式不正確。', true);
      return null;
    }
  }

  function runToolbarCommand(button) {
    if (editorMode === 'markdown') return insertMarkdownSyntax(button);
    if (editorMode !== 'visual') return toast('請切換到視覺編輯器或 Markdown 後使用格式工具。', true);
    $('#visual-editor').focus();
    const command = button.dataset.command;
    const block = button.dataset.block;
    if (block) document.execCommand('formatBlock', false, block);
    else if (command === 'formatCode') document.execCommand('formatBlock', false, 'pre');
    else if (command === 'createLink') {
      const url = askForUrl('請輸入連結網址（http、https 或 mailto）：', false);
      if (url) document.execCommand('createLink', false, url);
    } else if (command === 'insertImage') {
      const url = askForUrl('請輸入圖片 HTTPS 網址：', true);
      if (url) document.execCommand('insertImage', false, url);
    } else if (command) document.execCommand(command, false);
    markDirty();
  }

  async function handleVisualPaste(event) {
    const html = event.clipboardData?.getData('text/html');
    if (!html) return;
    event.preventDefault();
    $('#preview-status').textContent = '正在清理貼上的 Word / HTML 內容…';
    try {
      const result = await sanitizedPreview(html, 'html', '');
      $('#visual-editor').focus();
      document.execCommand('insertHTML', false, result.content);
      markDirty();
      toast('貼上內容已完成安全清理。');
    } catch (error) {
      toast(`無法貼上內容：${error.message}`, true);
    }
  }

  function schedulePreview(delay = 450) {
    window.clearTimeout(previewTimer);
    $('#preview-status').textContent = '等待更新預覽…';
    previewTimer = window.setTimeout(refreshPreview, delay);
  }

  async function refreshPreview() {
    syncCanonicalFromActiveEditor();
    const sequence = ++previewSequence;
    try {
      const result = await sanitizedPreview();
      if (sequence !== previewSequence) return;
      lastPreview = result;
      renderPreviewFrame(result);
      $('#preview-status').textContent = `安全預覽已更新 · ${new Intl.DateTimeFormat('zh-TW', { timeStyle: 'medium' }).format(new Date())}`;
    } catch (error) {
      if (sequence !== previewSequence) return;
      $('#preview-status').textContent = error.message;
    }
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  }

  function renderPreviewFrame(preview) {
    const toc = preview.toc?.length
      ? `<nav class="toc" aria-label="文章目錄"><strong>目錄</strong><ol>${preview.toc.map((item) => `<li class="level-${item.level}"><a href="#${escapeHtml(item.id)}">${escapeHtml(item.text)}</a></li>`).join('')}</ol></nav>`
      : '<p class="empty">加入 H2 / H3 小標題後，這裡會自動產生目錄。</p>';
    const previewStyles = `
      *{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;padding:clamp(16px,4vw,36px);color:#1f2937;background:#fff;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;line-height:1.8}.toc{margin-bottom:28px;padding:20px;border:1px solid #dbe1e8;border-radius:12px;background:#f8fafc}.toc strong{display:block;margin-bottom:8px}.toc ol{margin:0;padding-left:24px}.toc .level-3{margin-left:18px}.toc a{color:#155eef}.empty{padding:18px;border:1px dashed #cbd5e1;border-radius:10px;color:#64748b}.cms-article-content{max-width:72ch;margin:auto}.cms-article-content h2,.cms-article-content h3{line-height:1.35;margin-top:1.6em;color:#111827}.cms-article-content img{max-width:100%;height:auto;border-radius:10px}.cms-article-content blockquote{margin-left:0;padding-left:16px;border-left:4px solid #d39a20;color:#475569}.cms-article-content pre{max-width:100%;overflow:auto;padding:16px;border-radius:8px;color:#e5e7eb;background:#111827}.cms-article-content table{width:100%;border-collapse:collapse}.cms-article-content th,.cms-article-content td{padding:8px;border:1px solid #dbe1e8}
      ${preview.customCss || ''}
    `;
    if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
    if (previewStyleObjectUrl) URL.revokeObjectURL(previewStyleObjectUrl);
    previewStyleObjectUrl = URL.createObjectURL(new Blob([previewStyles], { type: 'text/css;charset=utf-8' }));
    const documentSource = `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base target="_blank"><link rel="stylesheet" href="${previewStyleObjectUrl}"></head><body>${toc}<article class="cms-article-content">${preview.html || ''}</article></body></html>`;
    previewObjectUrl = URL.createObjectURL(new Blob([documentSource], { type: 'text/html;charset=utf-8' }));
    $('#article-preview-frame').src = previewObjectUrl;
  }

  function init() {
    Object.entries(categories).forEach(([value, label]) => { const option = document.createElement('option'); option.value = value; option.textContent = label; $('#article-category').appendChild(option); });
    $('#login-form').addEventListener('submit', handleLogin);
    $('#password-form').addEventListener('submit', handlePasswordChange);
    $('#logout-button').addEventListener('click', logout);
    $('#new-article-button').addEventListener('click', newArticle);
    $('#article-form').addEventListener('submit', handleSave);
    $('#publish-button').addEventListener('click', publishArticle);
    $('#unpublish-button').addEventListener('click', unpublishArticle);
    $('#delete-button').addEventListener('click', deleteArticle);
    $('#upload-button').addEventListener('click', uploadCover);
    $('#add-faq-button').addEventListener('click', () => { $('#faq-list').appendChild(createRepeaterItem('faq')); markDirty(); });
    $('#add-source-button').addEventListener('click', () => { $('#source-list').appendChild(createRepeaterItem('source')); markDirty(); });
    $('#status-filter').addEventListener('change', loadArticles);
    let searchTimer;
    $('#article-search').addEventListener('input', () => { window.clearTimeout(searchTimer); searchTimer = window.setTimeout(loadArticles, 300); });
    $$('[data-editor-mode]').forEach((button) => button.addEventListener('click', () => switchEditorMode(button.dataset.editorMode)));
    $$('.rich-toolbar button').forEach((button) => button.addEventListener('click', () => runToolbarCommand(button)));
    $$('[data-preview-device]').forEach((button) => button.addEventListener('click', () => {
      const device = button.dataset.previewDevice;
      $('#preview-frame-shell').className = `preview-frame-shell ${device}`;
      $$('[data-preview-device]').forEach((item) => {
        const active = item === button;
        item.classList.toggle('active', active);
        item.setAttribute('aria-pressed', String(active));
      });
    }));
    $('#visual-editor').addEventListener('paste', handleVisualPaste);
    $$('[data-password-toggle]').forEach((button) => button.addEventListener('click', () => { const input = $(`#${button.dataset.passwordToggle}`); input.type = input.type === 'password' ? 'text' : 'password'; button.textContent = input.type === 'password' ? '顯示' : '隱藏'; }));
    $('#article-form').addEventListener('input', markDirty);
    window.addEventListener('beforeunload', (event) => {
      if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
      if (previewStyleObjectUrl) URL.revokeObjectURL(previewStyleObjectUrl);
      if (dirty) { event.preventDefault(); event.returnValue = ''; }
    });
    showView('login');
  }

  init();
})();
