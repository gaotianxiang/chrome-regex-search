(() => {
  let searchBar = null;
  let shadowRoot = null;
  let matches = [];
  let currentIndex = -1;
  let debounceTimer = null;

  function createSearchBar() {
    if (searchBar) return;

    searchBar = document.createElement('div');
    searchBar.id = 'regex-search-container';
    shadowRoot = searchBar.attachShadow({ mode: 'closed' });

    shadowRoot.innerHTML = `
      <style>
        :host {
          all: initial;
          position: fixed;
          top: 8px;
          right: 8px;
          z-index: 2147483647;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 13px;
        }
        .search-box {
          display: flex;
          align-items: center;
          gap: 4px;
          background: #fff;
          border: 1px solid #ccc;
          border-radius: 6px;
          padding: 6px 8px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        }
        input {
          border: 1px solid #ddd;
          border-radius: 4px;
          padding: 4px 8px;
          font-size: 13px;
          font-family: monospace;
          width: 240px;
          outline: none;
        }
        input:focus {
          border-color: #4a90d9;
        }
        input.error {
          border-color: #e55;
          background: #fff0f0;
        }
        .count {
          color: #666;
          font-size: 12px;
          min-width: 56px;
          text-align: center;
          user-select: none;
        }
        button {
          background: none;
          border: 1px solid #ccc;
          border-radius: 4px;
          cursor: pointer;
          padding: 3px 8px;
          font-size: 13px;
          color: #333;
          line-height: 1;
        }
        button:hover {
          background: #f0f0f0;
        }
        button:active {
          background: #e0e0e0;
        }
      </style>
      <div class="search-box">
        <input type="text" placeholder="Regex pattern" spellcheck="false" autocomplete="off" />
        <span class="count"></span>
        <button class="prev" title="Previous match (Shift+Enter)">&#x25B2;</button>
        <button class="next" title="Next match (Enter)">&#x25BC;</button>
        <button class="close" title="Close (Escape)">&#x2715;</button>
      </div>
    `;

    document.documentElement.appendChild(searchBar);

    const input = shadowRoot.querySelector('input');
    const prevBtn = shadowRoot.querySelector('.prev');
    const nextBtn = shadowRoot.querySelector('.next');
    const closeBtn = shadowRoot.querySelector('.close');

    input.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => performSearch(input.value), 200);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) {
          navigateMatch(-1);
        } else {
          navigateMatch(1);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeSearch();
      }
    });

    prevBtn.addEventListener('click', () => navigateMatch(-1));
    nextBtn.addEventListener('click', () => navigateMatch(1));
    closeBtn.addEventListener('click', () => closeSearch());

    input.focus();
  }

  function performSearch(pattern) {
    clearHighlights();
    matches = [];
    currentIndex = -1;

    const input = shadowRoot.querySelector('input');
    const countEl = shadowRoot.querySelector('.count');

    if (!pattern) {
      input.classList.remove('error');
      countEl.textContent = '';
      return;
    }

    let regex;
    try {
      regex = new RegExp(pattern, 'g');
      input.classList.remove('error');
    } catch (e) {
      input.classList.add('error');
      countEl.textContent = 'Invalid';
      return;
    }

    highlightMatches(regex);

    if (matches.length > 0) {
      currentIndex = 0;
      updateCurrentHighlight();
      countEl.textContent = `1 of ${matches.length}`;
    } else {
      countEl.textContent = '0 of 0';
    }
  }

  function highlightMatches(regex) {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          // Skip our own search bar and hidden elements
          if (searchBar && searchBar.contains(node)) return NodeFilter.FILTER_REJECT;
          if (node.parentElement && node.parentElement.closest('#regex-search-container')) return NodeFilter.FILTER_REJECT;

          const style = window.getComputedStyle(node.parentElement);
          if (style.display === 'none' || style.visibility === 'hidden') {
            return NodeFilter.FILTER_REJECT;
          }

          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    const textNodes = [];
    while (walker.nextNode()) {
      textNodes.push(walker.currentNode);
    }

    for (const node of textNodes) {
      const text = node.textContent;
      if (!text) continue;

      // Reset regex lastIndex for each node
      regex.lastIndex = 0;

      const fragments = [];
      let lastIndex = 0;
      let match;

      while ((match = regex.exec(text)) !== null) {
        if (match[0].length === 0) {
          // Avoid infinite loop on zero-length matches
          regex.lastIndex++;
          continue;
        }

        if (match.index > lastIndex) {
          fragments.push(document.createTextNode(text.slice(lastIndex, match.index)));
        }

        const mark = document.createElement('mark');
        mark.className = 'regex-search-highlight';
        mark.textContent = match[0];
        fragments.push(mark);
        matches.push(mark);

        lastIndex = regex.lastIndex;
      }

      if (fragments.length > 0) {
        if (lastIndex < text.length) {
          fragments.push(document.createTextNode(text.slice(lastIndex)));
        }

        const parent = node.parentNode;
        for (const frag of fragments) {
          parent.insertBefore(frag, node);
        }
        parent.removeChild(node);
      }
    }
  }

  function clearHighlights() {
    const marks = document.querySelectorAll('mark.regex-search-highlight, mark.regex-search-highlight-current');
    for (const mark of marks) {
      const parent = mark.parentNode;
      const text = document.createTextNode(mark.textContent);
      parent.replaceChild(text, mark);
      parent.normalize();
    }
    matches = [];
    currentIndex = -1;
  }

  function navigateMatch(direction) {
    if (matches.length === 0) return;

    currentIndex = (currentIndex + direction + matches.length) % matches.length;
    updateCurrentHighlight();

    const countEl = shadowRoot.querySelector('.count');
    countEl.textContent = `${currentIndex + 1} of ${matches.length}`;
  }

  function updateCurrentHighlight() {
    for (const m of matches) {
      m.className = 'regex-search-highlight';
    }
    if (currentIndex >= 0 && currentIndex < matches.length) {
      matches[currentIndex].className = 'regex-search-highlight-current';
      matches[currentIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function closeSearch() {
    clearHighlights();
    if (searchBar) {
      searchBar.remove();
      searchBar = null;
      shadowRoot = null;
    }
  }

  function toggleSearch() {
    if (searchBar) {
      closeSearch();
    } else {
      createSearchBar();
    }
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'toggle-search') {
      toggleSearch();
    }
  });
})();
