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

    contexts.forEach(context => {
      const li = document.createElement('li');
      const isActive = context.id === activeContextId;

      // CSSのクラス名でスタイリングを適用
      li.className = `context-item ${isActive ? 'active' : ''}`;

      li.innerHTML = `
        <div class="context-left">
          <span class="color-dot" style="background-color: ${context.color || '#3b82f6'}"></span>
          <span class="context-name">${context.name}</span>
        </div>
        ${isActive ? '<span class="badge-active">Active</span>' : ''}
      `;

      li.addEventListener('click', () => {
        if (isActive) return;

        li.style.opacity = '0.5';
        li.style.pointerEvents = 'none';

        chrome.runtime.sendMessage({
          action: "SWITCH_CONTEXT",
          payload: { targetContextId: context.id }
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.error("FocusOrbit Message Error:", chrome.runtime.lastError);
            li.style.opacity = '1';
            li.style.pointerEvents = 'auto';
            return;
          }

          if (response && response.success) {
            window.close();
          } else {
            console.error("FocusOrbit Context Switch Failed:", response?.error);
            li.style.opacity = '1';
            li.style.pointerEvents = 'auto';
          }
        });
      });

      contextList.appendChild(li);
    });
    

  } catch (error) {
    console.error("FocusOrbit Popup Error:", error);
    contextList.innerHTML = '<li class="msg-error">Failed to load contexts.</li>';
  }
});

// --- popup.js の既存コードの下に追記 ---
  
  const inputName = document.getElementById('new-context-name');
  const btnCreate = document.getElementById('btn-create');

  // Enterキーでも追加できるようにする
  inputName.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') btnCreate.click();
  });

  btnCreate.addEventListener('click', () => {
    const name = inputName.value.trim();
    if (!name) return;

    btnCreate.disabled = true;
    btnCreate.innerText = '...';

    // Backgroundへ作成指示を送信
    chrome.runtime.sendMessage({
      action: "CREATE_CONTEXT",
      payload: { name: name }
    }, (response) => {
      if (chrome.runtime.lastError || !response?.success) {
        console.error("FocusOrbit: Create Context Failed");
        btnCreate.disabled = false;
        btnCreate.innerText = 'Add';
        return;
      }
      
      // 成功したらポップアップのHTMLをリロードしてリストを更新
      window.location.reload();
    });
  });