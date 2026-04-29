document.addEventListener('DOMContentLoaded', () => {
    const listEl = document.getElementById('ctxList');
    const addBtn = document.getElementById('addCtxBtn');
    const input = document.getElementById('newCtxName');
    
    document.getElementById('optionsBtn').onclick = () => chrome.runtime.openOptionsPage();

    function render() {
        chrome.runtime.sendMessage({ action: 'getData' }, (res) => {
            if (!res) return;
            listEl.innerHTML = '';
            res.contexts.forEach(ctx => {
                const isActive = ctx === res.active;
                const btn = document.createElement('button');
                btn.className = `w-full text-left px-3 py-2 rounded-md border text-sm font-medium transition-colors duration-150 ${
                    isActive ? 'bg-blue-100 border-blue-400 text-blue-800' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-100'
                }`;
                btn.textContent = ctx;
                btn.onclick = () => {
                    chrome.runtime.sendMessage({ action: 'switchContext', target: ctx }, () => window.close());
                };
                listEl.appendChild(btn);
            });
        });
    }

    addBtn.onclick = () => {
        const val = input.value.trim();
        if (val) {
            chrome.runtime.sendMessage({ action: 'createContext', name: val }, () => {
                input.value = '';
                render();
            });
        }
    };
    render();
});