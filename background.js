// background.js

// 1. 拡張機能インストール時の初期化処理
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install") {
    const defaultState = {
      activeContextId: "context-default",
      contexts: [
        {
          id: "context-default",
          name: "Default",
          color: "blue",
          tabs: []
        }
      ],
      archiveList: [],
      settings: {
        autoArchiveMinutes: 60,
        maxTabBudget: 15,
        ignoreAudioTabs: true
      }
    };
    await chrome.storage.local.set(defaultState);
    console.log("FocusOrbit: Initial state saved.");
  }
  
  // 1分ごとにアイドルタブをチェックするアラームを登録
  chrome.alarms.create("checkIdleTabs", { periodInMinutes: 1 });
});

// 2. メッセージリスナー（Popupからの操作を受け取る）
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.action) return false;

  switch (message.action) {
    case "SWITCH_CONTEXT":
      handleSwitchContext(message.payload, sendResponse);
      return true; // 非同期処理を行うために必要

    case "CREATE_CONTEXT":
      handleCreateContext(message.payload, sendResponse);
      return true;

    case "DELETE_CONTEXT":
      handleDeleteContext(message.payload, sendResponse);
      return true;

    case "RESTORE_ARCHIVE":
      handleRestoreArchive(message.payload, sendResponse);
      return true;

    default:
      return false;
  }
});

// 3. アラームリスナー（自動アーカイブ実行）
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "checkIdleTabs") {
    autoArchiveTabs();
  }
});

// ==========================================
// 各種アクションハンドラー
// ==========================================

async function handleSwitchContext(payload, sendResponse) {
  try {
    const { targetContextId } = payload;
    const data = await chrome.storage.local.get(["activeContextId", "contexts"]);
    const activeContextId = data.activeContextId;
    let contexts = data.contexts || [];

    if (activeContextId === targetContextId) {
      sendResponse({ success: true });
      return;
    }

    const allCurrentTabs = await chrome.tabs.query({ lastFocusedWindow: true });
    const tabsToSave = [];
    const oldTabIds = [];

    allCurrentTabs.forEach(tab => {
      if (tab.pinned) return;
      const url = tab.url || "";
      if (url.startsWith("chrome://") || url.startsWith("edge://") || url.startsWith("about:")) return;

      tabsToSave.push({
        url: tab.url,
        title: tab.title,
        favIconUrl: tab.favIconUrl
      });
      oldTabIds.push(tab.id);
    });

    const currentIdx = contexts.findIndex(c => c.id === activeContextId);
    if (currentIdx !== -1) contexts[currentIdx].tabs = tabsToSave;

    const targetContext = contexts.find(c => c.id === targetContextId);
    if (!targetContext) throw new Error("Target context not found.");

    await chrome.storage.local.set({ activeContextId: targetContextId, contexts });

    const newTabIds = [];
    if (targetContext.tabs.length === 0) {
      const newTab = await chrome.tabs.create({ active: false });
      newTabIds.push(newTab.id);
    } else {
      for (const t of targetContext.tabs) {
        const newTab = await chrome.tabs.create({ url: t.url, active: false });
        newTabIds.push(newTab.id);
      }
    }

    if (oldTabIds.length > 0) await chrome.tabs.remove(oldTabIds);
    if (newTabIds.length > 0) await chrome.tabs.update(newTabIds[0], { active: true });

    sendResponse({ success: true });
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

async function handleCreateContext(payload, sendResponse) {
  try {
    const { name } = payload;
    const data = await chrome.storage.local.get(["contexts"]);
    const contexts = data.contexts || [];
    const colors = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899'];
    
    contexts.push({
      id: `context-${crypto.randomUUID()}`,
      name: name,
      color: colors[Math.floor(Math.random() * colors.length)],
      tabs: []
    });

    await chrome.storage.local.set({ contexts });
    sendResponse({ success: true });
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

async function handleDeleteContext(payload, sendResponse) {
  try {
    const { contextId } = payload;
    const data = await chrome.storage.local.get(["contexts", "activeContextId"]);
    if (contextId === data.activeContextId || contextId === "context-default") {
      throw new Error("Cannot delete active or default context.");
    }
    const contexts = data.contexts.filter(c => c.id !== contextId);
    await chrome.storage.local.set({ contexts });
    sendResponse({ success: true });
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

async function handleRestoreArchive(payload, sendResponse) {
  try {
    const { archiveId } = payload;
    const data = await chrome.storage.local.get(["archiveList"]);
    let archiveList = data.archiveList || [];
    const item = archiveList.find(a => a.id === archiveId);
    if (item) {
      await chrome.tabs.create({ url: item.url });
      archiveList = archiveList.filter(a => a.id !== archiveId);
      await chrome.storage.local.set({ archiveList });
    }
    sendResponse({ success: true });
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}

async function autoArchiveTabs() {
  try {
    const data = await chrome.storage.local.get(["settings", "archiveList"]);
    const threshold = (data.settings?.autoArchiveMinutes || 60) * 60 * 1000;
    let archiveList = data.archiveList || [];
    const now = Date.now();
    const idleTabs = await chrome.tabs.query({ active: false });

    const toRemove = [];
    for (const tab of idleTabs) {
      if (tab.pinned || tab.audible || !tab.lastAccessed) continue;
      if (now - tab.lastAccessed > threshold) {
        archiveList.push({
          id: `archive-${crypto.randomUUID()}`,
          url: tab.url,
          title: tab.title,
          favIconUrl: tab.favIconUrl,
          closedAt: now
        });
        toRemove.push(tab.id);
      }
    }

    if (toRemove.length > 0) {
      if (archiveList.length > 500) archiveList = archiveList.slice(-500);
      await chrome.storage.local.set({ archiveList });
      await chrome.tabs.remove(toRemove);
    }
  } catch (e) { console.error(e); }
}