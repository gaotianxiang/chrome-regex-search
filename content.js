(() => {
  let searchBar = null;
  let shadowRoot = null;
  let matchGroups = []; // Each entry is an array of <mark> elements forming one logical match
  let currentIndex = -1;
  let debounceTimer = null;
  let lastToggle = 0;

  const SKIP_TAGS = new Set([
    'SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'OBJECT', 'EMBED',
    'TEXTAREA', 'INPUT', 'SELECT',
  ]);

  // ── Keyboard fallback ────────────────────────────────────────────────
  // chrome.commands.suggested_key is not guaranteed to bind.
  // This listener acts as a reliable fallback.
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.code === 'KeyF') {
      e.preventDefault();
      e.stopPropagation();
      toggleSearch();
    }
  }, true);

  // ── Toggle guard ─────────────────────────────────────────────────────
  // Both chrome.commands and the keyboard listener may fire for the same
  // keystroke. The guard prevents a double-toggle within 300 ms.
  function toggleSearch() {
    const now = Date.now();
    if (now - lastToggle < 300) return;
    lastToggle = now;

    if (searchBar) {
      closeSearch();
    } else {
      createSearchBar();
    }
  }

  // ── DOM helpers ──────────────────────────────────────────────────────
  function isBlockDisplay(el) {
    const display = window.getComputedStyle(el).display;
    return !display.startsWith('inline') && display !== 'contents' && display !== 'ruby';
  }

  function isVisible(el) {
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }

  // Collect text nodes grouped into "inline runs".
  // A new run starts/ends at every block-level element boundary.
  function collectTextRuns(root) {
    const runs = [];
    let currentRun = [];

    function flush() {
      if (currentRun.length > 0) {
        runs.push(currentRun);
        currentRun = [];
      }
    }

    function walk(node) {
      if (node === searchBar) return;
      if (node.id === 'regex-search-container') return;

      if (node.nodeType === Node.TEXT_NODE) {
        if (node.textContent.length > 0) {
          currentRun.push(node);
        }
        return;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) return;
      if (SKIP_TAGS.has(node.tagName)) return;
      if (!isVisible(node)) return;

      const block = isBlockDisplay(node);
      if (block) flush();

      for (const child of node.childNodes) {
        walk(child);
      }

      if (block) flush();
    }

    walk(root);
    flush();
    return runs;
  }

  // ── Search bar UI ────────────────────────────────────────────────────
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

  // ── Search logic ─────────────────────────────────────────────────────
  function performSearch(pattern) {
    clearHighlights();
    matchGroups = [];
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

    // Walk the DOM and highlight
    const runs = collectTextRuns(document.body);
    for (const textNodes of runs) {
      highlightRun(textNodes, regex);
    }

    if (matchGroups.length > 0) {
      currentIndex = 0;
      updateCurrentHighlight();
      countEl.textContent = `1 of ${matchGroups.length}`;
    } else {
      countEl.textContent = '0 of 0';
    }
  }

  // Highlight all regex matches within one inline text run.
  // A run is an array of adjacent text nodes (separated only by inline elements).
  // Concatenating them lets us match across element boundaries just like
  // the native Cmd+F does.
  function highlightRun(textNodes, regex) {
    // 1. Build concatenated text + offset map
    let fullText = '';
    const nodeRanges = [];

    for (const node of textNodes) {
      const start = fullText.length;
      fullText += node.textContent;
      nodeRanges.push({ node, start, end: fullText.length });
    }

    // 2. Find all matches in the concatenated text
    regex.lastIndex = 0;
    const matchRanges = [];
    let match;
    while ((match = regex.exec(fullText)) !== null) {
      if (match[0].length === 0) { regex.lastIndex++; continue; }
      matchRanges.push([match.index, match.index + match[0].length]);
    }

    if (matchRanges.length === 0) return;

    // 3. One mark-group per regex match (a match may span multiple text nodes)
    const matchMarks = matchRanges.map(() => []);

    // 4. Project matches onto individual text nodes and replace
    for (const { node, start, end } of nodeRanges) {
      const nodeText = node.textContent;
      const fragments = [];
      let pos = 0; // cursor within nodeText

      for (let mIdx = 0; mIdx < matchRanges.length; mIdx++) {
        const [mStart, mEnd] = matchRanges[mIdx];

        // Clamp to this node's range
        const localStart = Math.max(mStart - start, 0);
        const localEnd = Math.min(mEnd - start, nodeText.length);

        // Skip non-overlapping matches
        if (localStart >= localEnd || localStart >= nodeText.length || localEnd <= 0) continue;
        if (localStart < pos) continue;

        // Text before the matched slice
        if (localStart > pos) {
          fragments.push({ type: 'text', text: nodeText.slice(pos, localStart) });
        }

        fragments.push({ type: 'mark', text: nodeText.slice(localStart, localEnd), matchIdx: mIdx });
        pos = localEnd;
      }

      // Nothing to replace in this node
      if (fragments.length === 0) continue;

      // Remaining text after last match
      if (pos < nodeText.length) {
        fragments.push({ type: 'text', text: nodeText.slice(pos) });
      }

      // Replace the original text node with fragments
      const parent = node.parentNode;
      for (const frag of fragments) {
        if (frag.type === 'text') {
          parent.insertBefore(document.createTextNode(frag.text), node);
        } else {
          const mark = document.createElement('mark');
          mark.className = 'regex-search-highlight';
          mark.textContent = frag.text;
          parent.insertBefore(mark, node);
          matchMarks[frag.matchIdx].push(mark);
        }
      }
      parent.removeChild(node);
    }

    // 5. Register non-empty groups
    for (const marks of matchMarks) {
      if (marks.length > 0) {
        matchGroups.push(marks);
      }
    }
  }

  // ── Highlight management ─────────────────────────────────────────────
  function clearHighlights() {
    const marks = document.querySelectorAll(
      'mark.regex-search-highlight, mark.regex-search-highlight-current'
    );
    for (const mark of marks) {
      const parent = mark.parentNode;
      parent.replaceChild(document.createTextNode(mark.textContent), mark);
      parent.normalize();
    }
    matchGroups = [];
    currentIndex = -1;
  }

  function navigateMatch(direction) {
    if (matchGroups.length === 0) return;

    currentIndex = (currentIndex + direction + matchGroups.length) % matchGroups.length;
    updateCurrentHighlight();

    const countEl = shadowRoot.querySelector('.count');
    countEl.textContent = `${currentIndex + 1} of ${matchGroups.length}`;
  }

  function updateCurrentHighlight() {
    for (const group of matchGroups) {
      for (const m of group) {
        m.className = 'regex-search-highlight';
      }
    }
    if (currentIndex >= 0 && currentIndex < matchGroups.length) {
      const group = matchGroups[currentIndex];
      for (const m of group) {
        m.className = 'regex-search-highlight-current';
      }
      group[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
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

  // ── Message from background service worker ───────────────────────────
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'toggle-search') {
      toggleSearch();
    }
  });
})();
