(function () {
  'use strict';

  var content = document.getElementById('article-content');
  var toc = document.getElementById('toc');
  if (content && toc) {
    var headings = Array.prototype.slice.call(content.querySelectorAll('h2, h3'));
    headings.forEach(function (heading, index) {
      if (!heading.id) heading.id = 'section-' + (index + 1);
      var link = document.createElement('a');
      link.href = '#' + heading.id;
      link.textContent = heading.textContent;
      link.className = heading.tagName === 'H3' ? 'toc-subitem' : '';
      toc.appendChild(link);
    });
    if (!headings.length) toc.parentElement.hidden = true;
  }

  var shareButton = document.getElementById('share-button');
  var copyButton = document.getElementById('copy-link');
  var status = document.getElementById('share-status');

  function setStatus(message) {
    if (!status) return;
    status.textContent = message;
    window.setTimeout(function () { status.textContent = ''; }, 3000);
  }

  if (shareButton) {
    if (!navigator.share) shareButton.hidden = true;
    shareButton.addEventListener('click', function () {
      navigator.share({ title: document.title, url: window.location.href }).catch(function () {});
    });
  }

  if (copyButton) {
    copyButton.addEventListener('click', function () {
      var fallback = function () {
        var input = document.createElement('textarea');
        input.value = window.location.href;
        document.body.appendChild(input);
        input.select();
        document.execCommand('copy');
        input.remove();
        setStatus('連結已複製');
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(window.location.href).then(function () { setStatus('連結已複製'); }).catch(fallback);
      } else fallback();
    });
  }
})();
