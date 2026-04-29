// palette.js

let paletteHost = null;
let shadowRoot = null;
let isVisible = false;

// 1. Shadow DOMの初期化とUI構築
function initPalette() {
  if (paletteHost) return;

  paletteHost = document.createElement('div');
  paletteHost.id = 'focusorbit-palette-root';
  // ホストページの最前面に固定
  paletteHost.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    z-index: 2147483647; pointer-events: none; display: none;
  `;
  document.body.appendChild(paletteHost);

  shadowRoot = paletteHost.attachShadow({ mode: 'closed' });

  // CSS干渉を防ぐため、最低限のVanilla CSSを直書き
  shadowRoot.innerHTML = `
    <style>
      :host { all: initial; }
      .overlay {
        position: absolute; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0, 0, 0, 0.4); backdrop-filter: blur(2px);
        pointer-events: auto; display: flex; justify-content: center; align-items: flex-start;
        padding-top: 10vh; font-family: system-ui, -apple-system, sans-serif;
      }
      .palette {
        width: 100%; max-width: 600px; background: #fff; border-radius: 12px;
        box-shadow: 0 10px 25px rgba(0,0,0,0.2); overflow: hidden;
        display: flex; flex-direction: column;
      }
      .search-box {
        padding: 16px; border-bottom: 1px solid #eee; display: flex; align-items: center;
      }
      .search-box input {
        width: 100%; border: none; outline: none; font-size: 1.2rem;
        color: #333; background: transparent;
      }
      .results {
        max-height: 400px; overflow-y: auto; padding: 8px 0; margin: 0; list-style: none;
      }
      .result-item {
        padding: 12px 16px; display: flex; align-items: center; gap: 12px;
        cursor: pointer; border-bottom: 1px solid #f9f9f9;
      }
      .result-item:hover, .result-item.selected { background: #f0f7ff; }
      .result-icon { width: 16px; height: 16px; border-radius: 4px; flex-shrink: 0; }
      .result-text { flex-grow: 1; overflow: hidden; }
      .result-title { font-size: 0.9rem; color: #111; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 500;}
      .result-url { font-size: 0.75rem; color: #666; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .badge { font-size: 0.7rem; padding: 2px 6px; border-radius: 10px; font-weight: bold; }
      .badge.open { background: #e0f2fe; color: #2563eb; }
      .badge.archived { background: #f3f4f6; color: #4b5563; }
      .empty-state { padding: 24px; text-align: center; color: #999; font-size: 0.9rem; }
    </style>
    <div class="overlay" id="overlay">
      <div class="palette">
        <div class="search-box">
          <input type="text" id="search-input" placeholder="Search tabs and archives..." autocomplete="off">
        </div>
        <ul class="results" id="results-list"></ul>
      </div>
    </div>
  `;

  // イベントリスナーの登録
  const overlay = shadowRoot.getElementById('overlay');
  const input = shadowRoot.getElementById('search-input');

  // 背景クリックで閉じる
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closePalette();
  });

  // インクリメンタル検索 (Debounceなしの即時レスポンス版)
  input.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    if (query.length > 0) {
      performSearch(query);
    } else {
      clearResults();
    }
  });
}

// 2. 検索の実行 (Backgroundへの通信)
function performSearch(query) {
  chrome.runtime.sendMessage({ action: "SEARCH_TABS", payload: { query } }, (response) => {
    if (chrome.runtime.lastError || !response || !response.success) return;
    renderResults(response.results);
  });
}

// 3. 結果のレンダリング
function renderResults(results) {
  const list = shadowRoot.getElementById('results-list');
  list.innerHTML = '';

  if (results.length === 0) {
    list.innerHTML = '<div class="empty-state">No tabs found</div>';
    return;
  }

  results.forEach(item => {
    const li = document.createElement('li');
    li.className = 'result-item';
    
    // アイコンのフォールバック
    const iconSrc = item.favIconUrl || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23ccc"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v1.85c2.86 1.7 4.84 4.82 4.84 8.15 0 1.84-.52 3.55-1.44 4.96z"/></svg>';

    li.innerHTML = `
      <img src="${iconSrc}" class="result-icon" alt="">
      <div class="result-text">
        <div class="result-title">${item.title}</div>
        <div class="result-url">${item.url}</div>
      </div>
      <span class="badge ${item.type === 'open' ? 'open' : 'archived'}">${item.type === 'open' ? 'Open' : 'Archived'}</span>
    `;

    // クリック時の挙動
    li.addEventListener('click', () => {
      if (item.type === 'open') {
        // 既存のタブにフォーカス
        chrome.runtime.sendMessage({ action: "FOCUS_TAB", payload: { tabId: item.id, windowId: item.windowId } });
      } else {
        // アーカイブから復元
        chrome.runtime.sendMessage({ action: "RESTORE_ARCHIVE", payload: { archiveId: item.id } });
      }
      closePalette();
    });

    list.appendChild(li);
  });
}

function clearResults() {
  const list = shadowRoot.getElementById('results-list');
  if(list) list.innerHTML = '';
}

// 4. パレットの開閉制御
function openPalette() {
  initPalette();
  paletteHost.style.display = 'block';
  isVisible = true;
  const input = shadowRoot.getElementById('search-input');
  input.value = '';
  clearResults();
  setTimeout(() => input.focus(), 50); // DOMレンダリング待ち
}

function closePalette() {
  if (paletteHost) {
    paletteHost.style.display = 'none';
    isVisible = false;
  }
}

// 5. キーボードショートカットの監視 (Alt + Shift + K)
window.addEventListener('keydown', (e) => {
  // Alt(Option) + Shift + K でトグル
  if (e.altKey && e.shiftKey && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    isVisible ? closePalette() : openPalette();
  }

  // Escで閉じる
  if (e.key === 'Escape' && isVisible) {
    e.preventDefault();
    closePalette();
  }

// background.js に追記・修正

async function handleSearchTabs(payload, sendResponse) {
  try {
    const { query } = payload;
    const lowerQuery = query.toLowerCase();
    const results = [];

    // 1. 現在開いているタブの検索
    const openTabs = await chrome.tabs.query({});
    openTabs.forEach(tab => {
      const title = (tab.title || "").toLowerCase();
      const url = (tab.url || "").toLowerCase();
      if (title.includes(lowerQuery) || url.includes(lowerQuery)) {
        results.push({
          type: 'open',
          id: tab.id,
          windowId: tab.windowId,
          title: tab.title,
          url: tab.url,
          favIconUrl: tab.favIconUrl
        });
      }
    });

    // 2. Storage内のアーカイブの検索
    const data = await chrome.storage.local.get(["archiveList"]);
    const archiveList = data.archiveList || [];
    
    archiveList.forEach(archived => {
      const title = (archived.title || "").toLowerCase();
      const url = (archived.url || "").toLowerCase();
      if (title.includes(lowerQuery) || url.includes(lowerQuery)) {
        results.push({
          type: 'archived',
          id: archived.id,
          title: archived.title,
          url: archived.url,
          favIconUrl: archived.favIconUrl
        });
      }
    });

    sendResponse({ success: true, results });
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

async function handleRestoreArchive(payload, sendResponse) {
  try {
    const { archiveId } = payload;
    const data = await chrome.storage.local.get(["archiveList"]);
    let archiveList = data.archiveList || [];

    // アーカイブリストから対象を抽出
    const targetIndex = archiveList.findIndex(a => a.id === archiveId);
    if (targetIndex === -1) throw new Error("Archive not found.");

    const target = archiveList[targetIndex];
    
    // 【エラーハンドリング】無効なURLのチェック
    if (!target.url || target.url === "undefined") {
      throw new Error("Invalid URL in archive.");
    }

    // 新しいタブとして復元
    await chrome.tabs.create({ url: target.url, active: true });

    // リストから削除して保存
    archiveList.splice(targetIndex, 1);
    await chrome.storage.local.set({ archiveList });

    sendResponse({ success: true });
  } catch (error) {
    console.error("FocusOrbit: Restore failed -", error.message);
    sendResponse({ success: false, error: error.message });
  }
}

// パレットから「開いているタブ」がクリックされた時用に追加
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 既存のswitch文に以下を追加してください
  if (message.action === "FOCUS_TAB") {
    chrome.windows.update(message.payload.windowId, { focused: true });
    chrome.tabs.update(message.payload.tabId, { active: true });
    sendResponse({ success: true });
    return true;
  }
});
});