document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('searchInput');
    const resultsUl = document.getElementById('results');
    let items = [];
    let filtered = [];
    let cursor = 0;

    chrome.runtime.sendMessage({ action: 'getData' }, (res) => {
        if (!res) return;
        const live = res.liveTabs.filter(t => t.url.startsWith('http')).map(t => ({...t, type: 'LIVE'}));
        const arch = res.archive.map(a => ({...a, type: 'ARCHIVE'}));
        items = [...live, ...arch];
        renderList('');
    });

    function renderList(query) {
        const q = query.toLowerCase();
        filtered = items.filter(i => (i.title && i.title.toLowerCase().includes(q)) || (i.url && i.url.toLowerCase().includes(q)));
        
        resultsUl.innerHTML = '';
        filtered.forEach((item, idx) => {
            const li = document.createElement('li');
            li.className = `p-3 mb-1 rounded cursor-pointer flex flex-col gap-1 ${idx === cursor ? 'bg-blue-50 border-l-4 border-blue-500' : 'hover:bg-gray-50 border-l-4 border-transparent'}`;
            const badge = item.type === 'LIVE' 
                ? '<span class="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded">Live</span>' 
                : '<span class="px-2 py-0.5 bg-gray-200 text-gray-600 text-xs rounded">Archive</span>';
            
            li.innerHTML = `<div class="flex items-center gap-2"><div class="truncate text-sm font-medium text-gray-800">${badge} ${item.title || item.url}</div></div>`;
            li.onclick = () => activate(item);
            resultsUl.appendChild(li);
        });
    }

    function activate(item) {
        if (item.type === 'LIVE') {
            chrome.windows.update(item.windowId, { focused: true });
            chrome.tabs.update(item.id, { active: true });
        } else {
            chrome.tabs.create({ url: item.url });
        }
        window.close();
    }

    input.addEventListener('input', (e) => { cursor = 0; renderList(e.target.value); });
    window.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') { cursor = (cursor + 1) % filtered.length; renderList(input.value); }
        if (e.key === 'ArrowUp') { cursor = (cursor - 1 + filtered.length) % filtered.length; renderList(input.value); }
        if (e.key === 'Enter') activate(filtered[cursor]);
        if (e.key === 'Escape') window.close();
    });
    input.focus();
});