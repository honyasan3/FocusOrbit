document.addEventListener('DOMContentLoaded', () => {
    const workButton = document.getElementById('workButton');
    const personalButton = document.getElementById('personalButton');

    workButton.addEventListener('click', () => {
        // Send a message to the background script to switch to 'Work' context
        chrome.runtime.sendMessage({ action: 'switchContext', targetContext: 'Work' });
        window.close(); // Close the popup after sending the message
    });

    personalButton.addEventListener('click', () => {
        // Send a message to the background script to switch to 'Personal' context
        chrome.runtime.sendMessage({ action: 'switchContext', targetContext: 'Personal' });
        window.close(); // Close the popup after sending the message
    });
});