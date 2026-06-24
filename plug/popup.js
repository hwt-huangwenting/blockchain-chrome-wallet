document.addEventListener('DOMContentLoaded', async () => {
    // 获取DOM元素
    const initPage = document.getElementById('initPage');
    const mainPage = document.getElementById('mainPage');
    const privateKeyDialog = document.getElementById('privateKeyDialog');
    const sendTxDialog = document.getElementById('sendTxDialog');
    const accountList = document.getElementById('accountList');
    const initButton = document.getElementById('initButton');
    const generateAccountButton = document.getElementById('generateAccount');
    const confirmPasswordButton = document.getElementById('confirmPasswordButton');
    const cancelButton = document.getElementById('cancelButton');
    const privateKeyContainer = document.getElementById('privateKeyContainer');
    const loginPage = document.getElementById('loginPage');
    const timerDisplay = document.getElementById('timerDisplay');

    let selectedAccount = null;
    let autoLockTimer = null;
    let countdownInterval = null;

    // 自动锁定时间（5分钟）
    const AUTO_LOCK_TIME = 5 * 60 * 1000;

    // ─── 倒计时 ────────────────────────────────────────────────────
    function updateTimerDisplay(remainingTime) {
        const minutes = Math.floor(remainingTime / 60000);
        const seconds = Math.floor((remainingTime % 60000) / 1000);
        timerDisplay.textContent = `自动锁定倒计时: ${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    function startAutoLockTimer() {
        if (autoLockTimer) clearTimeout(autoLockTimer);
        if (countdownInterval) clearInterval(countdownInterval);

        const endTime = Date.now() + AUTO_LOCK_TIME;
        updateTimerDisplay(AUTO_LOCK_TIME);

        countdownInterval = setInterval(() => {
            const remaining = endTime - Date.now();
            if (remaining <= 0) {
                clearInterval(countdownInterval);
                lockWallet();
            } else {
                updateTimerDisplay(remaining);
            }
        }, 1000);

        autoLockTimer = setTimeout(lockWallet, AUTO_LOCK_TIME);
    }

    // ─── 页面切换 ──────────────────────────────────────────────────
    function lockWallet() {
        if (autoLockTimer) clearTimeout(autoLockTimer);
        if (countdownInterval) clearInterval(countdownInterval);
        showLoginPage();
    }

    // 所有页面 ID
    const allPages = ['loginPage','initPage','mainPage','privateKeyDialog','sendTxDialog'];

    function showPage(pageId) {
        allPages.forEach(id => {
            document.getElementById(id).style.display = 'none';
        });
        document.getElementById(pageId).style.display = 'block';
        // navbar 只在主页面和对话框页面显示
        const navbar = document.getElementById('navbar');
        navbar.style.display = ['mainPage','privateKeyDialog','sendTxDialog'].includes(pageId) ? 'flex' : 'none';
    }

    function showLoginPage() {
        showPage('loginPage');
        document.getElementById('loginPassword').value = '';
        document.getElementById('loginError').textContent = '';
    }

    function showInitPage() {
        showPage('initPage');
    }

    function showMainPage() {
        showPage('mainPage');
        startAutoLockTimer();
    }

    // ─── 通用解密函数：自动判断 keystore 类型 ────────────────────────
    // geth 格式 → 交给 server 解密
    // ethers 格式 → 本地用 ethers.Wallet.fromEncryptedJson 解密
    async function decryptWallet(account, password) {
        if (account.keystoreType === 'geth') {
            // geth keystore：发给 server 用 Node crypto 解密
            const res = await fetch('http://localhost:3000/api/decryptKeystore', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ keystoreJson: account.keystore, password })
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.error || '密码错误');
            return new ethers.Wallet(data.privateKey);
        } else {
            // ethers keystore：本地解密
            return await ethers.Wallet.fromEncryptedJson(account.keystore, password);
        }
    }

    // ─── 初始化检查 ────────────────────────────────────────────────
    async function checkInitialization() {
        const data = await chrome.storage.local.get(['walletData']);
        if (data.walletData) {
            showLoginPage();
        } else {
            showInitPage();
        }
    }

    // ─── 渲染账户列表 ──────────────────────────────────────────────
    const avatarColors = ['#f6851b','#037dd6','#28a745','#6f4cd2','#0d7377','#d73847'];

    function renderAccounts(accounts) {
        accountList.innerHTML = '';

        if (accounts.length === 0) {
            accountList.innerHTML = '<div style="text-align:center;color:#9fa6b2;font-size:12px;padding:20px 0;">暂无账户，请先生成或导入账户</div>';
            return;
        }

        accounts.forEach((account, index) => {
            const card = document.createElement('div');
            card.className = 'account-card';
            const color = avatarColors[index % avatarColors.length];
            const shortAddr = account.address.slice(0,6) + '...' + account.address.slice(-4);

            card.innerHTML = `
                <div class="account-top">
                    <div class="account-name-row">
                        <div class="account-avatar" style="background:${color};">${index + 1}</div>
                        <span class="account-name">账户 ${index + 1}</span>
                    </div>
                    <span style="font-size:11px;color:#9fa6b2;">${shortAddr}</span>
                </div>
                <div class="account-balance" id="balance-${index}">-- ETH</div>
                <div class="account-balance-sub">以太坊私链</div>
                <div class="account-address">${account.address}</div>
                <div class="account-actions">
                    <button class="btn btn-primary act-send">📤 发送</button>
                    <button class="btn btn-ghost act-key">🔑 私钥</button>
                    <button class="btn btn-ghost act-select">✓ 选择</button>
                    <button class="btn btn-ghost act-refresh">↻ 刷新</button>
                </div>
            `;
            accountList.appendChild(card);

            // 查询并刷新余额
            function refreshBalance() {
                const el = document.getElementById(`balance-${index}`);
                if (el) el.textContent = '查询中...';
                fetch(`http://localhost:3000/api/balance/${account.address}`)
                    .then(r => r.json())
                    .then(data => {
                        if (el) el.textContent = `${parseFloat(data.balance).toFixed(4)} ETH`;
                    })
                    .catch(() => { if (el) el.textContent = '-- ETH'; });
            }
            refreshBalance(); // 进入主页面时自动查询一次

            // 绑定按钮
            card.querySelector('.act-send').addEventListener('click', () => handleSendTx(account.address));
            card.querySelector('.act-key').addEventListener('click', () => handleShowPrivateKey(account.address));
            card.querySelector('.act-refresh').addEventListener('click', refreshBalance);
            card.querySelector('.act-select').addEventListener('click', async () => {
                try {
                    await fetch('http://localhost:3000/api/account', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ address: account.address })
                    });
                    document.querySelectorAll('.account-card').forEach(c => c.classList.remove('selected'));
                    card.classList.add('selected');
                } catch (e) { console.error(e); }
            });

            // 发交易成功后自动刷新余额
            // 监听 txResult 变化（发交易对话框关闭时刷新）
            refreshBalance();
        });
    }


    // ─── 初始化钱包（改造点①：改用 keystore 加密） ────────────────
    initButton.addEventListener('click', async () => {
        const password = document.getElementById('initPassword').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        const errorElement = document.getElementById('initError');

        if (password.length < 6) {
            errorElement.textContent = '密码长度必须至少为6个字符！';
            return;
        }
        if (password !== confirmPassword) {
            errorElement.textContent = '两次输入的密码不匹配！';
            return;
        }

        try {
            // ★ 改造点①：不再明文存密码，只存一个空账户列表
            // 密码的正确性通过能否解密 keystore 来验证，不存原文
            await chrome.storage.local.set({
                walletData: {
                    accounts: []   // 不存 password 字段
                }
            });
            showLoginPage();
        } catch (error) {
            errorElement.textContent = '初始化钱包失败，请重试。';
        }
    });

    // ─── 登录（改造点①：用第一个 keystore 验证密码） ─────────────
    document.getElementById('loginButton').addEventListener('click', async () => {
        const password = document.getElementById('loginPassword').value;
        const errorElement = document.getElementById('loginError');

        try {
            const data = await chrome.storage.local.get(['walletData']);
            const accounts = data.walletData.accounts || [];

            if (accounts.length === 0) {
                // 没有账户时无法验证，直接进入
                showMainPage();
                renderAccounts([]);
                return;
            }

            // 尝试解密第一个账户来验证密码
            errorElement.textContent = '验证中，请稍候...';
            await decryptWallet(accounts[0], password);

            showMainPage();
            renderAccounts(accounts);
        } catch (error) {
            errorElement.textContent = '密码错误！';
        }
    });

    // ─── 生成新账户（由 server 生成并加密，避免 ethers v6 兼容问题） ──
    generateAccountButton.addEventListener('click', async () => {
        const password = document.getElementById('keystorePassword').value;
        const statusEl = document.getElementById('generateStatus');

        if (!password) {
            statusEl.textContent = '请先输入密码';
            return;
        }

        statusEl.textContent = '生成中，请稍候...';

        try {
            // 交给 server 生成随机账户并用 ethers 加密为 keystore
            const res = await fetch('http://localhost:3000/api/generateAccount', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password })
            });
            const result = await res.json();

            if (!result.success) {
                statusEl.textContent = `生成失败：${result.error}`;
                return;
            }

            const newAccount = {
                address: result.address,
                keystore: result.keystore
                // 不设 keystoreType，走 ethers 本地解密流程
            };

            const data = await chrome.storage.local.get(['walletData']);
            const updatedAccounts = [...(data.walletData.accounts || []), newAccount];

            await chrome.storage.local.set({
                walletData: { ...data.walletData, accounts: updatedAccounts }
            });

            statusEl.textContent = `✓ 生成成功！${result.address.slice(0,10)}...`;
            renderAccounts(updatedAccounts);
            startAutoLockTimer();
        } catch (error) {
            statusEl.textContent = `生成失败：${error.message}`;
            console.error(error);
        }
    });

    // ─── 导入私钥（新增） ────────────────────────────────────────
    document.getElementById('importAccount').addEventListener('click', async () => {
        const privateKey = document.getElementById('importPrivateKey').value.trim();
        const password = document.getElementById('importPassword').value;
        const statusEl = document.getElementById('importStatus');

        if (!privateKey || !password) {
            statusEl.textContent = '请填写私钥和密码';
            return;
        }

        // 私钥格式检查：必须是 0x 开头的 66 位字符串
        if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
            statusEl.textContent = '私钥格式错误，请检查是否完整';
            return;
        }

        statusEl.textContent = '加密中，请稍候...';

        try {
            // 先用 ethers 在本地推导地址（不涉及加密，v6 没问题）
            const wallet = new ethers.Wallet(privateKey);

            // 检查是否已经导入过同一个地址
            const data = await chrome.storage.local.get(['walletData']);
            const existing = (data.walletData.accounts || []).find(
                acc => acc.address.toLowerCase() === wallet.address.toLowerCase()
            );
            if (existing) {
                statusEl.textContent = '该账户已存在，无需重复导入';
                return;
            }

            // 加密操作交给 server 处理
            const res = await fetch('http://localhost:3000/api/generateAccount', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password, privateKey })
            });
            const result = await res.json();

            if (!result.success) {
                statusEl.textContent = `导入失败：${result.error}`;
                return;
            }

            const newAccount = {
                address: result.address,
                keystore: result.keystore
            };

            const updatedAccounts = [...(data.walletData.accounts || []), newAccount];
            await chrome.storage.local.set({
                walletData: { ...data.walletData, accounts: updatedAccounts }
            });

            statusEl.textContent = `✓ 导入成功！${wallet.address.slice(0, 10)}...`;
            document.getElementById('importPrivateKey').value = '';
            document.getElementById('importPassword').value = '';
            renderAccounts(updatedAccounts);
            startAutoLockTimer();
        } catch (error) {
            statusEl.textContent = `导入失败：${error.message}`;
            console.error(error);
        }
    });

    // ─── 导入 keystore 文件（新增） ──────────────────────────────
    document.getElementById('importKeystoreFile').addEventListener('click', async () => {
        const fileInput = document.getElementById('keystoreFile');
        const password = document.getElementById('keystoreFilePassword').value;
        const statusEl = document.getElementById('importKeystoreStatus');

        if (!fileInput.files || fileInput.files.length === 0) {
            statusEl.textContent = '请先选择 keystore 文件';
            return;
        }
        if (!password) {
            statusEl.textContent = '请输入 keystore 文件的密码';
            return;
        }

        statusEl.textContent = '读取文件中...';

        try {
            // 读取 JSON 文件内容
            const file = fileInput.files[0];
            const keystoreJson = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target.result);
                reader.onerror = () => reject(new Error('文件读取失败'));
                reader.readAsText(file);
            });

            // 去掉 BOM 头（Windows 记事本保存的文件可能带有）再解析
            const cleanJson = keystoreJson.replace(/^﻿/, '').trim();
            const ksObj = JSON.parse(cleanJson);
            const keystoreJsonClean = cleanJson;

            statusEl.textContent = '发送至 server 解密中（scrypt 需要几秒）...';

            // ★ 由 server 用 Node.js crypto 解密 geth scrypt keystore
            // 插件端 Web Crypto API 不支持 scrypt，所以交给 server 处理
            const decryptRes = await fetch('http://localhost:3000/api/decryptKeystore', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ keystoreJson: keystoreJsonClean, password })
            });
            const decryptData = await decryptRes.json();

            if (!decryptData.success) {
                statusEl.textContent = decryptData.error === '密码错误'
                    ? '密码错误，请重新输入'
                    : `解密失败：${decryptData.error}`;
                return;
            }

            // 用解密出的私钥构造 ethers 钱包，拿到标准地址
            const wallet = new ethers.Wallet(decryptData.privateKey);

            // 检查是否已导入过
            const data = await chrome.storage.local.get(['walletData']);
            const existing = (data.walletData.accounts || []).find(
                acc => acc.address.toLowerCase() === wallet.address.toLowerCase()
            );
            if (existing) {
                statusEl.textContent = '该账户已存在，无需重复导入';
                return;
            }

            // ★ 直接存原始 geth keystore + 标记为 geth 格式
            // 不重新加密，避免 ethers v6 兼容问题
            // 发交易和查看私钥时由 server 负责解密
            const newAccount = {
                address: wallet.address,
                keystore: keystoreJsonClean,
                keystoreType: 'geth'   // 标记：需要走 server 解密
            };

            const updatedAccounts = [...(data.walletData.accounts || []), newAccount];
            await chrome.storage.local.set({
                walletData: { ...data.walletData, accounts: updatedAccounts }
            });

            statusEl.textContent = `✓ 导入成功！${wallet.address.slice(0, 10)}...`;
            fileInput.value = '';
            document.getElementById('keystoreFilePassword').value = '';
            renderAccounts(updatedAccounts);
            startAutoLockTimer();

        } catch (error) {
            console.error('导入 keystore 详细错误:', error);
            if (error.message.includes('fetch') || error.message.includes('NetworkError')) {
                statusEl.textContent = '无法连接 server，请确认 node server.js 已启动';
            } else if (error.message.includes('Unexpected') || error.message.includes('SyntaxError')) {
                statusEl.textContent = '文件内容不是合法 JSON，请确认选择了正确的 keystore 文件';
            } else {
                statusEl.textContent = `导入失败：${error.message}`;
            }
        }
    });


    // ─── 显示私钥（改造点①：解密 keystore 后才能看到私钥） ───────
    async function handleShowPrivateKey(address) {
        const data = await chrome.storage.local.get(['walletData']);
        selectedAccount = data.walletData.accounts.find(acc => acc.address === address);
        if (selectedAccount) {
            showPage('privateKeyDialog');
            privateKeyContainer.style.display = 'none';
            document.getElementById('passwordInput').value = '';
            document.getElementById('decryptStatus').textContent = '';
        }
    }

    confirmPasswordButton.addEventListener('click', async () => {
        const password = document.getElementById('passwordInput').value;
        const statusEl = document.getElementById('decryptStatus');
        statusEl.textContent = '解密中...';

        try {
            const wallet = await decryptWallet(selectedAccount, password);

            privateKeyContainer.style.display = 'block';
            privateKeyContainer.innerHTML = `
                <div style="margin-bottom:10px;color:red;">请勿将私钥分享给任何人！</div>
                <div>${wallet.privateKey}</div>
            `;
            statusEl.textContent = '';
            document.getElementById('passwordInput').value = '';
            startAutoLockTimer();
        } catch (error) {
            statusEl.textContent = error.message.includes('密码') ? '密码错误！' : `错误: ${error.message}`;
        }
    });

    cancelButton.addEventListener('click', () => {
        showPage('mainPage');
        privateKeyContainer.style.display = 'none';
        document.getElementById('passwordInput').value = '';
        document.getElementById('decryptStatus').textContent = '';
        selectedAccount = null;
        startAutoLockTimer();
    });

    // ─── 发送交易（改造点②+③） ────────────────────────────────────
    async function handleSendTx(address) {
        const data = await chrome.storage.local.get(['walletData']);
        selectedAccount = data.walletData.accounts.find(acc => acc.address === address);
        if (selectedAccount) {
            showPage('sendTxDialog');
            document.getElementById('txTo').value = '';
            document.getElementById('txValue').value = '';
            document.getElementById('txPassword').value = '';
            document.getElementById('txStatus').textContent = '';
            document.getElementById('txResult').style.display = 'none';
        }
    }

    document.getElementById('sendTxButton').addEventListener('click', async () => {
        const to = document.getElementById('txTo').value.trim();
        const valueEth = document.getElementById('txValue').value.trim();
        const password = document.getElementById('txPassword').value;
        const statusEl = document.getElementById('txStatus');
        const resultEl = document.getElementById('txResult');

        if (!to || !valueEth || !password) {
            statusEl.textContent = '请填写所有字段';
            return;
        }

        statusEl.textContent = '解密私钥中...';
        resultEl.style.display = 'none';

        try {
            const wallet = await decryptWallet(selectedAccount, password);

            statusEl.textContent = '构造并签名交易中...';

            // ★ 改造点②：向 server 询问 nonce 和 gasPrice
            const infoResponse = await fetch('http://localhost:3000/api/txInfo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ from: selectedAccount.address })
            });
            const txInfo = await infoResponse.json();

            // ★ 改造点②：在插件端本地构造交易并签名（私钥不离开插件）
            const tx = {
                to: to,
                value: ethers.parseEther(valueEth),
                nonce: Number(txInfo.nonce),
                gasLimit: 21000,
                gasPrice: BigInt(txInfo.gasPrice),
                chainId: Number(txInfo.chainId)
            };

            const signedTx = await wallet.signTransaction(tx);

            statusEl.textContent = '广播交易中...';

            // ★ 改造点②③：把签名后的原始交易发给 server，由 server 用 web3 广播
            const sendResponse = await fetch('http://localhost:3000/api/sendTransaction', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rawTransaction: signedTx })
            });
            const sendResult = await sendResponse.json();

            if (sendResult.txHash) {
                statusEl.textContent = '交易发送成功！';
                resultEl.style.display = 'block';
                resultEl.innerHTML = `
                    <div style="color:green;margin-bottom:5px;">✓ 交易已广播</div>
                    <div style="font-size:11px;word-break:break-all;">
                        TxHash: ${sendResult.txHash}
                    </div>
                    <div style="font-size:11px;color:#6a737d;margin-top:4px;">
                        返回主页后点击 ↻ 刷新 查看最新余额
                    </div>
                `;
                startAutoLockTimer();
            } else {
                statusEl.textContent = `发送失败: ${sendResult.error}`;
            }
        } catch (error) {
            statusEl.textContent = `错误: ${error.message}`;
            console.error(error);
        }
    });

    document.getElementById('cancelTxButton').addEventListener('click', () => {
        showPage('mainPage');
        selectedAccount = null;
        startAutoLockTimer();
    });

    // ─── Tab 切换 ─────────────────────────────────────────────────
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            // 所有按钮取消 active
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            // 所有面板隐藏
            document.querySelectorAll('.tab-panel').forEach(p => p.style.display = 'none');
            // 当前按钮激活，对应面板显示
            btn.classList.add('active');
            document.getElementById(btn.dataset.tab).style.display = 'block';
        });
    });

    // 手动锁定
    document.getElementById('lockButton').addEventListener('click', lockWallet);

    // 初始化
    checkInitialization();
});