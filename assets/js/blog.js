(function () {
  'use strict';

  var grid = document.getElementById('post-grid');
  if (!grid) return;

  var search = document.getElementById('post-search');
  var category = document.getElementById('category-filter');
  var cards = Array.prototype.slice.call(grid.querySelectorAll('.post-card'));
  var count = document.getElementById('result-count');
  var empty = document.getElementById('empty-results');
  var pagination = document.getElementById('pagination');
  var previous = document.getElementById('previous-page');
  var next = document.getElementById('next-page');
  var pageStatus = document.getElementById('page-status');
  var pageSize = 9;
  var currentPage = 1;

  var params = new URLSearchParams(window.location.search);
  search.value = params.get('q') || '';
  category.value = params.get('category') || '';

  function normalize(value) {
    return String(value || '').trim().toLocaleLowerCase('zh-TW');
  }

  function updateUrl() {
    var query = new URLSearchParams();
    if (search.value.trim()) query.set('q', search.value.trim());
    if (category.value) query.set('category', category.value);
    var suffix = query.toString();
    history.replaceState(null, '', window.location.pathname + (suffix ? '?' + suffix : ''));
  }

  function render() {
    var term = normalize(search.value);
    var selectedCategory = category.value;
    var matches = cards.filter(function (card) {
      return (!term || normalize(card.dataset.search).indexOf(term) !== -1) &&
        (!selectedCategory || card.dataset.category === selectedCategory);
    });
    var totalPages = Math.max(1, Math.ceil(matches.length / pageSize));
    currentPage = Math.min(currentPage, totalPages);
    var start = (currentPage - 1) * pageSize;

    cards.forEach(function (card) { card.hidden = true; });
    matches.slice(start, start + pageSize).forEach(function (card) { card.hidden = false; });

    count.textContent = matches.length ? '共 ' + matches.length + ' 篇文章' : '';
    empty.hidden = matches.length !== 0;
    pagination.hidden = matches.length <= pageSize;
    previous.disabled = currentPage === 1;
    next.disabled = currentPage === totalPages;
    pageStatus.textContent = '第 ' + currentPage + ' / ' + totalPages + ' 頁';
    updateUrl();
  }

  function resetAndRender() { currentPage = 1; render(); }
  search.addEventListener('input', resetAndRender);
  category.addEventListener('change', resetAndRender);
  previous.addEventListener('click', function () { currentPage -= 1; render(); grid.scrollIntoView({ behavior: 'smooth' }); });
  next.addEventListener('click', function () { currentPage += 1; render(); grid.scrollIntoView({ behavior: 'smooth' }); });
  render();
})();
