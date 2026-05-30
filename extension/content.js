chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'getSelection') {
        const selectedText = window.getSelection().toString().trim();
        if (!selectedText) {
            showToast('请先选中要保存的文字', 'info');
            return;
        }
        chrome.runtime.sendMessage({ action: 'saveNote', content: selectedText });
    }

    if (message.action === 'showNotification') {
        showToast(message.message, message.type);
    }
});

function showToast(message, type) {
    const existing = document.getElementById('__life-manager-toast__');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = '__life-manager-toast__';

    const colors = {
        success: '#27ae60',
        error: '#e74c3c',
        info: '#667eea',
        warning: '#f39c12'
    };

    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 14px 20px;
        border-radius: 10px;
        color: #fff;
        font-size: 14px;
        font-weight: 500;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        box-shadow: 0 4px 16px rgba(0,0,0,0.15);
        z-index: 2147483647;
        background: ${colors[type] || colors.info};
        transition: opacity 0.3s, transform 0.3s;
        transform: translateX(0);
        opacity: 1;
        max-width: 320px;
        word-break: break-word;
    `;

    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(20px)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}
