document.addEventListener('DOMContentLoaded', () => {
    const loginSection = document.getElementById('login-section');
    const loggedSection = document.getElementById('logged-section');
    const errorMsg = document.getElementById('error-msg');
    const statusText = document.getElementById('status-text');

    chrome.runtime.sendMessage({ action: 'getConfig' }, (config) => {
        if (config && config.token) {
            showLoggedIn(config.username);
        }
    });

    document.getElementById('btn-login').addEventListener('click', async () => {
        const server = document.getElementById('server').value.trim().replace(/\/$/, '');
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value;

        if (!server || !username || !password) {
            showError('请填写所有字段');
            return;
        }

        errorMsg.style.display = 'none';
        document.getElementById('btn-login').textContent = '登录中...';

        chrome.runtime.sendMessage(
            { action: 'login', server, username, password },
            (response) => {
                document.getElementById('btn-login').textContent = '登录';
                if (response && response.success) {
                    showLoggedIn(response.username);
                } else {
                    showError(response?.error || '登录失败');
                }
            }
        );
    });

    document.getElementById('btn-logout').addEventListener('click', () => {
        chrome.storage.local.remove(['token', 'username'], () => {
            loginSection.style.display = 'block';
            loggedSection.style.display = 'none';
        });
    });

    document.getElementById('password').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') document.getElementById('btn-login').click();
    });

    function showLoggedIn(username) {
        loginSection.style.display = 'none';
        loggedSection.style.display = 'block';
        statusText.textContent = `已登录：${username}`;
    }

    function showError(msg) {
        errorMsg.textContent = msg;
        errorMsg.style.display = 'block';
    }
});
