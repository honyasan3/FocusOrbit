document.addEventListener('DOMContentLoaded', async () => {
    const searchInput = document.getElementById('search-input');
    const resultsList = document.getElementById('results-list');

    let allItems = []; // Combined list of live tabs and archived items
    let filteredItems = [];
    let selectedIndex = -1;

    // Function to fetch all tabs and archived items from background script
    async function fetchPaletteData() {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: 'getPaletteData' }, (response) => {
                if (response) {
                    // Combine and sort items (e.g., live tabs first, then archived)
                    allItems = [...response.tabs, ...response.archived];
                    // Optionally sort by title or last accessed for initial display
                    allItems.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
                }
                resolve();
            });
        });
    }

    // Function to render results based on search query
    function renderResults(query = '') {
        resultsList.innerHTML = '';
        selectedIndex = -1;

        if (query) {
            // Simple fuzzy search: check if query is included in title or URL
            filteredItems = allItems.filter(item =>
                (item.title && item.title.toLowerCase().includes(query.toLowerCase())) ||
                (item.url && item.url.toLowerCase().includes(query.toLowerCase()))
            );
        } else {
            filteredItems = [...allItems]; // Show all if no query
        }

        if (filteredItems.length === 0) {
            const li = document.createElement('li');
            li.textContent = 'No results found.';
            resultsList.appendChild(li);
            return;
        }

        filteredItems.forEach((item, index) => {
            const li = document.createElement('li');
            const favIcon = item.favIconUrl ? `<img src="${item.favIconUrl}" style="width:16px;height:16px;vertical-align:middle;margin-right:5px;">` : '';
            li.innerHTML = `${favIcon}<strong>${item.title || item.url}</strong><br><small>${item.url}</small>`;
            li.dataset.index = index;
            li.addEventListener('click', () => activateItem(item));
            resultsList.appendChild(li);
        });

        if (filteredItems.length > 0) {
            selectedIndex = 0;
            resultsList.children[selectedIndex].classList.add('selected');
        }
    }

    // Function to activate a selected item
    function activateItem(item) {
        chrome.runtime.sendMessage({ action: 'activatePaletteItem', item: item });
        window.close(); // Close the palette after activation
    }

    // Event Listeners
    searchInput.addEventListener('input', (event) => {
        renderResults(event.target.value);
    });

    searchInput.addEventListener('keydown', (event) => {
        if (filteredItems.length === 0) return;

        const currentSelected = resultsList.children[selectedIndex];
        if (currentSelected) {
            currentSelected.classList.remove('selected');
        }

        if (event.key === 'ArrowDown') {
            event.preventDefault(); // Prevent cursor movement in input
            selectedIndex = (selectedIndex + 1) % filteredItems.length;
        } else if (event.key === 'ArrowUp') {
            event.preventDefault(); // Prevent cursor movement in input
            selectedIndex = (selectedIndex - 1 + filteredItems.length) % filteredItems.length;
        } else if (event.key === 'Enter') {
            event.preventDefault();
            if (selectedIndex !== -1) {
                activateItem(filteredItems[selectedIndex]);
            }
            return;
        } else if (event.key === 'Escape') {
            window.close(); // Close the palette
            return;
        }

        const newSelected = resultsList.children[selectedIndex];
        if (newSelected) {
            newSelected.classList.add('selected');
            newSelected.scrollIntoView({ block: 'nearest' }); // Scroll to selected item
        }
    });

    // Initial load
    await fetchPaletteData();
    renderResults();
    searchInput.focus(); // Focus the search input on open
});