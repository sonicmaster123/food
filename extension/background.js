const DEFAULT_SERVER = 'http://localhost:3000';

chrome.commands.onCommand.addListener(async (command) => {
    if (command === 'save-to-notes') {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab) {
            chrome.tabs.sendMessage(tab.id, { action: 'getSelection' });
        }
    }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'saveNote') {
        saveNote(message.content, sender.tab?.id);
    }
    if (message.action === 'login') {
        login(message.server, message.username, message.password).then(sendResponse);
        return true;
    }
    if (message.action === 'getConfig') {
        chrome.storage.local.get(['server', 'token', 'username'], sendResponse);
        return true;
    }
});

async function saveNote(content, tabId) {
    const { server, token } = await chrome.storage.local.get(['server', 'token']);
    const baseUrl = server || DEFAULT_SERVER;

    if (!token) {
        notify(tabId, '请先在扩展弹窗中登录', 'error');
        return;
    }

    try {
        const res = await fetch(`${baseUrl}/api/notes`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': token
            },
            body: JSON.stringify({ content })
        });

        if (res.status === 401) {
            chrome.storage.local.remove(['token', 'username']);
            notify(tabId, '登录已过期，请重新登录', 'error');
            return;
        }

        if (!res.ok) {
            const data = await res.json();
            notify(tabId, data.error || '保存失败', 'error');
            return;
        }

        notify(tabId, '已保存到随记', 'success');
    } catch (e) {
        notify(tabId, '网络错误，请检查服务器地址', 'error');
    }
}

async function login(server, username, password) {
    try {
        const res = await fetch(`${server}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (!res.ok) {
            return { success: false, error: data.error || '登录失败' };
        }
        await chrome.storage.local.set({
            server,
            token: data.token,
            username: data.username
        });
        return { success: true, username: data.username };
    } catch (e) {
        return { success: false, error: '网络错误，请检查服务器地址' };
    }
}

function notify(tabId, message, type) {
    if (tabId) {
        chrome.tabs.sendMessage(tabId, { action: 'showNotification', message, type });
    }
}
