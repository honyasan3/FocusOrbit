const STORAGE_KEY_PREFIX = 'focusOrbit_tabs_';
const ACTIVE_CONTEXT_KEY = 'focusOrbit_activeContext';

// --- New constants for archiving ---
const ARCHIVE_LIST_KEY = 'focusOrbit_archiveList';
const LAST_ACTIVE_TIMES_KEY = 'focusOrbit_lastActiveTimes';
const ARCHIVE_CHECK_INTERVAL_MINUTES = 1; // Check every 1 minute
const INACTIVITY_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes in milliseconds

/**
 * Saves the URLs and titles of all currently open tabs in the active window for a given context.
 */
async function saveCurrentTabs(contextName) {
    if (!contextName) {
        console.warn("No context name provided to save tabs.");
        return;
    }

    const tabs = await chrome.tabs.query({ currentWindow: true });
    const tabData = tabs.map(tab => ({ url: tab.url, title: tab.title }));

    await chrome.storage.local.set({ [`${STORAGE_KEY_PREFIX}${contextName}`]: tabData });
    console.log(`Tabs for context '${contextName}' saved:`, tabData);

    const newBlankTab = await chrome.tabs.create({ url: 'chrome://newtab/', active: true });

    const tabIdsToClose = tabs.map(tab => tab.id).filter(id => id !== undefined && id !== newBlankTab.id);
    if (tabIdsToClose.length > 0) {
        await chrome.tabs.remove(tabIdsToClose);
        console.log(`Closed ${tabIdsToClose.length} original tabs.`);
    }
}

/**
 * Loads tabs for a given context.
 */
async function loadTabs(contextName) {
    if (!contextName) {
        console.warn("No context name provided to load tabs.");
        return;
    }

    const result = await chrome.storage.local.get(`${STORAGE_KEY_PREFIX}${contextName}`);
    const tabData = result[`${STORAGE_KEY_PREFIX}${contextName}`];

    if (tabData && tabData.length > 0) {
        for (const tab of tabData) {
            if (tab.url && (tab.url.startsWith('http') || tab.url.startsWith('chrome-extension://'))) {
                await chrome.tabs.create({ url: tab.url });
            } else {
                console.warn(`Skipping invalid URL for context '${contextName}': ${tab.url}`);
            }
        }
        console.log(`Tabs for context '${contextName}' loaded.`);
    } else {
        console.log(`No tabs found for context '${contextName}'. Opening a new tab.`);
        await chrome.tabs.create({ url: 'chrome://newtab/' });
    }
}

/**
 * Updates the last active timestamp for a given tab.
 */
async function updateTabActivity(tabId) {
    if (tabId === chrome.tabs.TAB_ID_NONE) return;

    const now = Date.now();
    try {
        const result = await chrome.storage.local.get(LAST_ACTIVE_TIMES_KEY);
        const lastActiveTimes = result[LAST_ACTIVE_TIMES_KEY] || {};
        lastActiveTimes[tabId] = now;
        await chrome.storage.local.set({ [LAST_ACTIVE_TIMES_KEY]: lastActiveTimes });
    } catch (error) {
        console.error("Error updating tab activity:", error);
    }
}

// --- Listeners for tab activity ---
chrome.tabs.onActivated.addListener(activeInfo => {
    updateTabActivity(activeInfo.tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
        updateTabActivity(tabId);
    }
});

chrome.tabs.onRemoved.addListener(async tabId => {
    try {
        const result = await chrome.storage.local.get(LAST_ACTIVE_TIMES_KEY);
        const lastActiveTimes = result[LAST_ACTIVE_TIMES_KEY] || {};
        if (lastActiveTimes[tabId]) {
            delete lastActiveTimes[tabId];
            await chrome.storage.local.set({ [LAST_ACTIVE_TIMES_KEY]: lastActiveTimes });
        }
    } catch (error) {
        console.error("Error cleaning up tab activity on removal:", error);
    }
});

/**
 * Checks for inactive tabs and archives them.
 */
async function archiveInactiveTabs() {
    console.log("Running archive check...");
    const now = Date.now();

    try {
        const [lastActiveTimesResult, archiveListResult] = await Promise.all([
            chrome.storage.local.get(LAST_ACTIVE_TIMES_KEY),
            chrome.storage.local.get(ARCHIVE_LIST_KEY)
        ]);

        const lastActiveTimes = lastActiveTimesResult[LAST_ACTIVE_TIMES_KEY] || {};
        let archiveList = archiveListResult[ARCHIVE_LIST_KEY] || [];
        const tabsToClose = [];
        const tabIdsToKeepActivity = new Set();

        const allTabs = await chrome.tabs.query({});

        for (const tab of allTabs) {
            if (tab.id === undefined) continue;

            if (tab.pinned || !tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
                tabIdsToKeepActivity.add(tab.id);
                continue;
            }

            const lastActive = lastActiveTimes[tab.id];

            if (lastActive && (now - lastActive > INACTIVITY_THRESHOLD_MS)) {
                archiveList.push({
                    url: tab.url,
                    title: tab.title || 'No Title',
                    archivedAt: now
                });
                tabsToClose.push(tab.id);
                console.log(`Archiving inactive tab: ${tab.title}`);
            } else {
                tabIdsToKeepActivity.add(tab.id);
            }
        }

        if (archiveList.length > 0) {
            await chrome.storage.local.set({ [ARCHIVE_LIST_KEY]: archiveList });
        }

        if (tabsToClose.length > 0) {
            await chrome.tabs.remove(tabsToClose);
            console.log(`Closed ${tabsToClose.length} inactive tabs.`);
        }

        const updatedLastActiveTimes = {};
        for (const tabId of tabIdsToKeepActivity) {
            if (lastActiveTimes[tabId]) {
                updatedLastActiveTimes[tabId] = lastActiveTimes[tabId];
            }
        }
        await chrome.storage.local.set({ [LAST_ACTIVE_TIMES_KEY]: updatedLastActiveTimes });

    } catch (error) {
        console.error("Error during archiveInactiveTabs:", error);
    }
}

// --- Alarms ---
chrome.alarms.create('archiveCheck', { periodInMinutes: ARCHIVE_CHECK_INTERVAL_MINUTES });
chrome.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === 'archiveCheck') {
        archiveInactiveTabs();
    }
});

// --- Commands ---
chrome.commands.onCommand.addListener(async (command) => {
    if (command === "open_palette") {
        await chrome.windows.create({
            url: chrome.runtime.getURL('palette/palette.html'),
            type: 'popup',
            width: 600,
            height: 400,
            focused: true
        });
    }
});

// --- Unified Message Listener ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Note: We use an async wrapper inside for Chrome compatibility with sendResponse
    (async () => {
        if (message.action === 'getPaletteData') {
            const allTabs = await chrome.tabs.query({});
            const archiveListResult = await chrome.storage.local.get(ARCHIVE_LIST_KEY);
            const archiveList = archiveListResult[ARCHIVE_LIST_KEY] || [];

            const displayTabs = allTabs.filter(tab => tab.url && (tab.url.startsWith('http') || tab.url.startsWith('chrome-extension://')));

            sendResponse({
                tabs: displayTabs.map(tab => ({
                    id: tab.id,
                    windowId: tab.windowId,
                    url: tab.url,
                    title: tab.title,
                    favIconUrl: tab.favIconUrl,
                    type: 'tab'
                })),
                archived: archiveList.map(item => ({
                    url: item.url,
                    title: item.title,
                    archivedAt: item.archivedAt,
                    type: 'archived'
                }))
            });
        } 
        
        else if (message.action === 'activatePaletteItem' && message.item) {
            const item = message.item;
            if (item.type === 'tab') {
                await chrome.windows.update(item.windowId, { focused: true });
                await chrome.tabs.update(item.id, { active: true });
            } else if (item.type === 'archived') {
                await chrome.tabs.create({ url: item.url });
            }
            if (sender.tab && sender.tab.windowId) {
                chrome.windows.remove(sender.tab.windowId);
            }
        } 
        
        else if (message.action === 'switchContext' && message.targetContext) {
            const targetContext = message.targetContext;
            const result = await chrome.storage.local.get(ACTIVE_CONTEXT_KEY);
            const currentContext = result[ACTIVE_CONTEXT_KEY];

            if (currentContext && currentContext !== targetContext) {
                await saveCurrentTabs(currentContext);
            } else if (!currentContext) {
                const tabs = await chrome.tabs.query({ currentWindow: true });
                const newBlankTab = await chrome.tabs.create({ url: 'chrome://newtab/', active: true });
                const tabIdsToClose = tabs.map(tab => tab.id).filter(id => id !== undefined && id !== newBlankTab.id);
                if (tabIdsToClose.length > 0) {
                    await chrome.tabs.remove(tabIdsToClose);
                }
            }

            await loadTabs(targetContext);
            await chrome.storage.local.set({ [ACTIVE_CONTEXT_KEY]: targetContext });
        }
    })();

    return true; // Keep the message channel open for async sendResponse
});