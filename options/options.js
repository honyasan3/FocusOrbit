document.addEventListener('DOMContentLoaded', async () => {
    const input = document.getElementById('timeInput');
    const data = await chrome.storage.local.get('focusOrbit_settings');
    input.value = data['focusOrbit_settings']?.hibernateMinutes || 30;

    document.getElementById('saveBtn').onclick = async () => {
        await chrome.storage.local.set({ 'focusOrbit_settings': { hibernateMinutes: parseInt(input.value) } });
        const msg = document.getElementById('msg');
        msg.classList.remove('hidden');
        setTimeout(() => msg.classList.add('hidden'), 2000);
    };
});