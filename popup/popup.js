document.addEventListener('DOMContentLoaded', async () => {
  const contextList = document.getElementById('context-list');

  try {
    const data = await chrome.storage.local.get(['contexts', 'activeContextId']);
    const contexts = data.contexts || [];
    const activeContextId = data.activeContextId;

    if (contexts.length === 0) {
      contextList.innerHTML = '<li class="msg-empty">No contexts found.</li>';
      return;
    }

    // アクティブなコンテキスト用に、現在ウィンドウで実際に開いているタブを取得
    const liveTabsRaw = await chrome.tabs.query({ lastFocusedWindow: true });
    const liveTabs = liveTabsRaw.filter(t => !t.pinned && !t.url.startsWith("chrome://") && !t.url.startsWith("edge://") && !t.url.startsWith("about:"));

    // 【修正】SVG内のダブルクォーテーションでHTMLが壊れるのを防ぐため、URLエンコード済みのSVGを使用
    const defaultIcon = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23ccc'%3E%3Cpath d='M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v1.85c2.86 1.7 4.84 4.82 4.84 8.15 0 1.84-.52 3.55-1.44 4.96z'/%3E%3C/svg%3E";

contexts.forEach(context => {
      const li = document.createElement('li');
      const isActive = context.id === activeContextId;
      const isDefault = context.id === 'context-default';
      
      const displayTabs = isActive ? liveTabs : (context.tabs || []);
      const tabCount = displayTabs.length;

      const maxIcons = 5;
      let iconsHtml = '';
      if (tabCount > 0) {
        iconsHtml += '<div class="favicon-list">';
        for (let i = 0; i < Math.min(tabCount, maxIcons); i++) {
          const iconUrl = displayTabs[i].favIconUrl || defaultIcon;
          const safeTitle = (displayTabs[i].title || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          iconsHtml += `<img src="${iconUrl}" class="favicon" title="${safeTitle}">`;
        }
        iconsHtml += '</div>';
        if (tabCount > maxIcons) {
          iconsHtml += `<span class="tab-count" style="margin-left: 4px;">+${tabCount - maxIcons}</span>`;
        }
      }

      li.className = `context-item ${isActive ? 'active' : ''}`;
      li.innerHTML = `
        <div class="context-info">
          <div class="context-left">
            <span class="color-dot" style="background-color: ${context.color || '#3b82f6'}"></span>
            <span class="context-name">${context.name}</span>
          </div>
          <div class="tab-preview">
            ${tabCount > 0 ? iconsHtml + `<span class="tab-count" style="margin-left:auto;">${tabCount} tabs</span>` : `<span class="tab-count">Empty</span>`}
          </div>
        </div>
        <div class="context-actions">
          ${isActive ? '<span class="badge-active">Active</span>' : ''}
          ${!isActive && !isDefault ? `
            <button class="btn-delete" title="Delete Context">
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
            </button>
          ` : ''}
        </div>
      `;

      // 削除ボタンのイベントリスナー
      const deleteBtn = li.querySelector('.btn-delete');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', (e) => {
          e.stopPropagation(); // 親要素(li)のクリックイベント(切り替え)が発火するのを防ぐ

          if (!confirm(`Are you sure you want to delete "${context.name}"?\nAll saved tabs in this context will be lost.`)) {
            return;
          }

          chrome.runtime.sendMessage({
            action: "DELETE_CONTEXT",
            payload: { contextId: context.id }
          }, (response) => {
            if (response && response.success) {
              window.location.reload(); // 削除成功でリロード
            } else {
              console.error("Delete Failed:", response?.error);
              alert("Failed to delete context.");
            }
          });
        });
      }

      // コンテキスト切り替えのイベントリスナー
      li.addEventListener('click', () => {
        if (isActive) return;
        li.style.opacity = '0.5';
        li.style.pointerEvents = 'none';

        chrome.runtime.sendMessage({
          action: "SWITCH_CONTEXT",
          payload: { targetContextId: context.id }
        }, (response) => {
          if (chrome.runtime.lastError || !response?.success) {
            console.error("Switch Failed:", chrome.runtime.lastError || response?.error);
            li.style.opacity = '1';
            li.style.pointerEvents = 'auto';
            return;
          }
          window.close();
        });
      });

      contextList.appendChild(li);
    });

  } catch (error) {
    console.error("FocusOrbit Popup Error:", error);
    contextList.innerHTML = '<li class="msg-error">Failed to load contexts.</li>';
  }

  // 新規コンテキスト追加処理
  const inputName = document.getElementById('new-context-name');
  const btnCreate = document.getElementById('btn-create');

  inputName.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') btnCreate.click();
  });

  btnCreate.addEventListener('click', () => {
    const name = inputName.value.trim();
    if (!name) return;

    btnCreate.disabled = true;
    btnCreate.innerText = '...';

    chrome.runtime.sendMessage({
      action: "CREATE_CONTEXT",
      payload: { name: name }
    }, (response) => {
      if (chrome.runtime.lastError || !response?.success) {
        console.error("Create Failed");
        btnCreate.disabled = false;
        btnCreate.innerText = 'Add';
        return;
      }
      window.location.reload();
    });
  });
});