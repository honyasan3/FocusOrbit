// background.js

// 拡張機能インストール時の初期化処理
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install") {
    // 設計書のデータスキーマに基づき、初期状態をStorageに保存
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
    console.log("FocusOrbit: Initial state saved to storage.");
  }
});

// UI (Popup / Content Script) からのメッセージを受け取るルーティング
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.action) return false;

  // async関数を呼び出すため、非同期でsendResponseを返すことを示す `return true;` を使用
  switch (message.action) {
    case "SWITCH_CONTEXT":
      handleSwitchContext(message.payload, sendResponse);
      return true;

    case "CREATE_CONTEXT":
      handleCreateContext(message.payload, sendResponse);
      return true;

    case "RESTORE_ARCHIVE":
      handleRestoreArchive(message.payload, sendResponse);
      return true;

    case "SEARCH_TABS":
      handleSearchTabs(message.payload, sendResponse);
      return true;

    default:
      console.warn(`FocusOrbit: Unknown action received - ${message.action}`);
      return false;
  }
});

// ==========================================
// Action Handlers (スケルトン)
// ==========================================

async function handleSwitchContext(payload, sendResponse) {
  try {
    const { targetContextId } = payload;
    console.log(`[Action] SWITCH_CONTEXT: target = ${targetContextId}`);
    
    // TODO: 【Phase 2】コンテキスト切り替えロジックを実装
    // 1. chrome.tabs.query で現在のタブを取得・選別
    // 2. chrome.storage.local に状態保存
    // 3. chrome.tabs.create で新しいタブを生成（active: false）
    // 4. chrome.tabs.remove で古いタブを削除
    
    sendResponse({ success: true });
  } catch (error) {
    console.error("Error in SWITCH_CONTEXT:", error);
    sendResponse({ success: false, error: error.message });
  }
}

async function handleCreateContext(payload, sendResponse) {
  try {
    const { name } = payload;
    const data = await chrome.storage.local.get(["contexts"]);
    const contexts = data.contexts || [];
    
    // 視認性を高めるため、ランダムなテーマカラーを割り当て
    const colors = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899'];
    const randomColor = colors[Math.floor(Math.random() * colors.length)];

    const newContext = {
      id: `context-${crypto.randomUUID()}`,
      name: name,
      color: randomColor,
      tabs: [] // 初期状態はタブゼロ
    };

    contexts.push(newContext);
    
    // Storageに新しい配列を保存
    await chrome.storage.local.set({ contexts: contexts });

    console.log(`FocusOrbit: Created new context "${name}"`);
    sendResponse({ success: true });
  } catch (error) {
    console.error("Error in CREATE_CONTEXT:", error);
    sendResponse({ success: false, error: error.message });
  }
}

async function handleRestoreArchive(payload, sendResponse) {
  try {
    const { archiveId } = payload;
    console.log(`[Action] RESTORE_ARCHIVE: archiveId = ${archiveId}`);
    
    // TODO: アーカイブからURLを取得し、新しいタブとして復元
    
    sendResponse({ success: true });
  } catch (error) {
    console.error("Error in RESTORE_ARCHIVE:", error);
    sendResponse({ success: false, error: error.message });
  }
}

async function handleSearchTabs(payload, sendResponse) {
  try {
    const { query } = payload;
    console.log(`[Action] SEARCH_TABS: query = ${query}`);
    
    // TODO: Storage内のtabsとarchiveListからあいまい検索を実行
    
    sendResponse({ success: true, results: [] });
  } catch (error) {
    console.error("Error in SEARCH_TABS:", error);
    sendResponse({ success: false, error: error.message });
  }
}

// background.js 内に追記・修正

async function handleSwitchContext(payload, sendResponse) {
  try {
    const { targetContextId } = payload;
    
    // Storageから現在の状態を取得
    const data = await chrome.storage.local.get(["activeContextId", "contexts"]);
    const activeContextId = data.activeContextId;
    let contexts = data.contexts || [];

    // すでに同じコンテキストにいる場合はスキップ
    if (activeContextId === targetContextId) {
      sendResponse({ success: true, message: "Already in the target context." });
      return;
    }

    // ==========================================
    // 手順1. 取得と除外 (現在のタブを取得し、対象外をフィルタリング)
    // ==========================================
    // 【重要修正】Service Workerには Window が無いため lastFocusedWindow を使用する
    const allCurrentTabs = await chrome.tabs.query({ lastFocusedWindow: true });
    
    const tabsToSave = [];
    const oldTabIds = [];

    allCurrentTabs.forEach(tab => {
      if (tab.pinned) return;
      
      const url = tab.url || "";
      if (url.startsWith("chrome://") || url.startsWith("edge://") || url.startsWith("about:")) {
        return;
      }

      tabsToSave.push({
        url: tab.url,
        title: tab.title,
        favIconUrl: tab.favIconUrl,
        pinned: tab.pinned
      });
      oldTabIds.push(tab.id);
    });

    // ==========================================
    // 手順2. 状態保存 (取得したタブデータをStorageに上書き保存)
    // ==========================================
    const currentContextIndex = contexts.findIndex(c => c.id === activeContextId);
    
    if (currentContextIndex !== -1) {
      contexts[currentContextIndex].tabs = tabsToSave;
    } else {
      // 【安全装置】万が一 activeContextId が見つからなかった場合、
      // 迷子のタブデータが消えないように新しいコンテキストとして救済保存する
      contexts.push({
        id: activeContextId || `context-recovered-${Date.now()}`,
        name: "Recovered",
        color: "#6b7280",
        tabs: tabsToSave
      });
    }

    const targetContext = contexts.find(c => c.id === targetContextId);
    if (!targetContext) {
      throw new Error(`Target context (${targetContextId}) not found.`);
    }

    // 切り替え後の状態をStorageに保存
    await chrome.storage.local.set({
      activeContextId: targetContextId,
      contexts: contexts
    });

    // ==========================================
    // 手順3. 新規タブ生成 (対象コンテキストのタブを active: false で生成)
    // ==========================================
    const targetTabs = targetContext.tabs || [];
    const newTabIds = [];

    if (targetTabs.length === 0) {
      const newTab = await chrome.tabs.create({ active: false });
      newTabIds.push(newTab.id);
    } else {
      for (const tabData of targetTabs) {
        const newTab = await chrome.tabs.create({ url: tabData.url, active: false });
        newTabIds.push(newTab.id);
      }
    }

    // ==========================================
    // 手順4. 旧タブ削除とアクティブ化
    // ==========================================
    if (oldTabIds.length > 0) {
      await chrome.tabs.remove(oldTabIds);
    }

    if (newTabIds.length > 0) {
      await chrome.tabs.update(newTabIds[0], { active: true });
    }

    console.log(`FocusOrbit: Successfully switched to ${targetContextId}`);
    sendResponse({ success: true });

  } catch (error) {
    console.error("FocusOrbit: Error in handleSwitchContext:", error);
    sendResponse({ success: false, error: error.message });
  }
}

// ---------------------------------------------------------
// 1. インストール時・起動時のアラーム登録処理
// ---------------------------------------------------------
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install") {
    // Phase 1で実装したStorageの初期化コード
    const defaultState = { /* ... */ };
    await chrome.storage.local.set(defaultState);
  }
  
  // 1分ごとに発火するアラームを登録
  chrome.alarms.create("checkIdleTabs", { periodInMinutes: 1 });
  console.log("FocusOrbit: Alarm 'checkIdleTabs' created.");
});

// Chrome起動時にService Workerが立ち上がった際にもアラームを再確認・登録
chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.get("checkIdleTabs", (alarm) => {
    if (!alarm) {
      chrome.alarms.create("checkIdleTabs", { periodInMinutes: 1 });
    }
  });
});

// ---------------------------------------------------------
// 2. アラームのイベントリスナー
// ---------------------------------------------------------
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "checkIdleTabs") {
    autoArchiveTabs();
  }
});

// ---------------------------------------------------------
// 3. 自動アーカイブロジック
// ---------------------------------------------------------
async function autoArchiveTabs() {
  try {
    const data = await chrome.storage.local.get(["settings", "archiveList"]);
    // 設定値の取得（デフォルト60分）
    const autoArchiveMinutes = data.settings?.autoArchiveMinutes || 60;
    let archiveList = data.archiveList || [];

    const autoArchiveMs = autoArchiveMinutes * 60 * 1000;
    const now = Date.now();

    // アクティブなタブはアーカイブしないため active: false のみ取得
    const idleTabs = await chrome.tabs.query({ active: false });

    const tabsToArchive = [];
    const tabIdsToRemove = [];

    for (const tab of idleTabs) {
      // 【絶対条件】ピン留めタブと音声・動画再生中のタブは除外
      if (tab.pinned || tab.audible) continue;

      // ブラウザの内部ページ等は除外
      const url = tab.url || "";
      if (url.startsWith("chrome://") || url.startsWith("edge://") || url.startsWith("about:")) {
        continue;
      }

      // 最終アクセス時刻 (Chromeネイティブのプロパティ)
      // 取得できない場合は安全のためスキップ
      if (!tab.lastAccessed) continue;

      const idleTime = now - tab.lastAccessed;

      // 設定したアイドル時間を超過しているか判定
      if (idleTime > autoArchiveMs) {
        tabsToArchive.push({
          id: `archive-${crypto.randomUUID()}`,
          url: tab.url,
          title: tab.title || "No Title",
          favIconUrl: tab.favIconUrl || "",
          closedAt: now
        });
        tabIdsToRemove.push(tab.id);
      }
    }

    // アーカイブ対象がある場合のみ処理を実行
    if (tabsToArchive.length > 0) {
      // Storageの配列に追記
      archiveList.push(...tabsToArchive);

      // 【エラーハンドリング仕様】 500件を超えたら古いものから削除 (FIFO)
      if (archiveList.length > 500) {
        archiveList = archiveList.slice(archiveList.length - 500);
      }

      // Storageを更新してから、タブを一括で閉じる
      await chrome.storage.local.set({ archiveList });
      await chrome.tabs.remove(tabIdsToRemove);

      console.log(`FocusOrbit: Auto-archived ${tabIdsToRemove.length} tabs.`);
    }

  } catch (error) {
    console.error("FocusOrbit: Error in autoArchiveTabs:", error);
  }
}