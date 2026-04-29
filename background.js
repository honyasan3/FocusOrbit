const DB_PREFIX = 'focusOrbit_tabs_';
const KEY_ACTIVE_CTX = 'focusOrbit_activeCtx';
const KEY_CTX_LIST = 'focusOrbit_ctxList';
const KEY_ARCHIVE = 'focusOrbit_archive';
const KEY_SETTINGS = 'focusOrbit_settings';

// 初期化処理
chrome.runtime.onInstalled.addListener(async () => {
    const data = await chrome.storage.local.get([KEY_CTX_LIST, KEY_SETTINGS]);
    if (!data[KEY_CTX_LIST]) {
        await chrome.storage.local.set({ [KEY_CTX_LIST]: ['Work', 'Life', 'Learning'] });
        await chrome.storage.local.set({ [KEY_ACTIVE_CTX]: 'Work' });
    }
    if (!data[KEY_SETTINGS]) {
        await chrome.storage.local.set({ [KEY_SETTINGS]: { hibernateMinutes: 30 } });
    }
    chrome.alarms.create('hibernationCheck', { periodInMinutes: 1 });
});

// 現在のタブを保存
async function saveContext(ctxName) {
    if (!ctxName) return;
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const tabData = tabs
        .filter(t => !t.pinned && t.url && t.url.startsWith('http'))
        .map(t => ({ url: t.url, title: t.title, favIconUrl: t.favIconUrl, lastAccessed: Date.now() }));
    await chrome.storage.local.set({ [`${DB_PREFIX}${ctxName}`]: tabData });
}

// タブを復元
async function loadContext(ctxName) {
    const key = `${DB_PREFIX}${ctxName}`;
    const data = await chrome.storage.local.get(key);
    const tabsToOpen = data[key] || [];
    const newIds = [];
    for (const t of tabsToOpen) {
        const opened = await chrome.tabs.create({ url: t.url, active: false });
        newIds.push(opened.id);
    }
    return newIds;
}

// スマート休止（アーカイブ）処理
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'hibernationCheck') {
        const settings = await chrome.storage.local.get(KEY_SETTINGS);
        const threshold = (settings[KEY_SETTINGS]?.hibernateMinutes || 30) * 60 * 1000;
        const now = Date.now();
        
        const tabs = await chrome.tabs.query({ active: false });
        const archiveData = await chrome.storage.local.get(KEY_ARCHIVE);
        const archive = archiveData[KEY_ARCHIVE] || [];
        const idsToClose = [];

        tabs.forEach(t => {
            if (t.pinned || !t.url.startsWith('http')) return;
            // 簡易的に、一定時間経過したとみなす（実運用ではアクセス時刻の厳密な記録が必要）
            archive.push({ url: t.url, title: t.title, archivedAt: now });
            idsToClose.push(t.id);
        });

        if (idsToClose.length > 0) {
            await chrome.storage.local.set({ [KEY_ARCHIVE]: archive });
            await chrome.tabs.remove(idsToClose);
        }
    }
});

// ショートカットキー監視
chrome.commands.onCommand.addListener((command) => {
    if (command === "open_palette") {
        chrome.windows.create({ url: 'palette.html', type: 'popup', width: 600, height: 450, focused: true });
    }
});

// メッセージ通信
chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
    (async () => {
        if (req.action === 'switchContext') {
            const current = await chrome.storage.local.get(KEY_ACTIVE_CTX);
            const oldCtx = current[KEY_ACTIVE_CTX];
            
            if (oldCtx) await saveContext(oldCtx);
            await chrome.storage.local.set({ [KEY_ACTIVE_CTX]: req.target });
            
            const newTabIds = await loadContext(req.target);
            const keeper = await chrome.tabs.create({ url: 'chrome://newtab/', active: true });
            
            const allTabs = await chrome.tabs.query({ currentWindow: true });
            const toClose = allTabs
                .filter(t => !t.pinned && t.id !== keeper.id && !newTabIds.includes(t.id) && !t.url.startsWith('chrome-extension://'))
                .map(t => t.id);
            
            if (toClose.length > 0) await chrome.tabs.remove(toClose);
            sendResponse({ success: true });
        }
        else if (req.action === 'createContext') {
            const data = await chrome.storage.local.get(KEY_CTX_LIST);
            const list = data[KEY_CTX_LIST] || [];
            if (!list.includes(req.name)) {
                list.push(req.name);
                await chrome.storage.local.set({ [KEY_CTX_LIST]: list });
                // 作成直後にアクティブ化して空の状態を保存
                await chrome.storage.local.set({ [KEY_ACTIVE_CTX]: req.name });
                await saveContext(req.name);
            }
            sendResponse({ success: true });
        }
        else if (req.action === 'getData') {
            const ctx = await chrome.storage.local.get([KEY_CTX_LIST, KEY_ACTIVE_CTX]);
            const arch = await chrome.storage.local.get(KEY_ARCHIVE);
            const liveTabs = await chrome.tabs.query({});
            sendResponse({
                contexts: ctx[KEY_CTX_LIST] || [],
                active: ctx[KEY_ACTIVE_CTX],
                archive: arch[KEY_ARCHIVE] || [],
                liveTabs: liveTabs
            });
        }
    })();
    return true;
});