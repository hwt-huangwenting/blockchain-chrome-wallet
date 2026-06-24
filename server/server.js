const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const { Web3 } = require('web3');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ★ 改造点③：连接本地 geth 私链
const web3 = new Web3('http://localhost:8545');

// 存储当前选中账号
let currentAccount = '';

// ─── WebSocket ────────────────────────────────────────────────────
io.on('connection', (socket) => {
    console.log('客户端已连接');
    socket.emit('accountUpdate', currentAccount);
    socket.on('disconnect', () => console.log('客户端已断开'));
});

// ─── 选择账户接口（原有） ──────────────────────────────────────────
app.post('/api/account', (req, res) => {
    const { address } = req.body;
    currentAccount = address;
    io.emit('accountUpdate', { selectedAccount: address });
    res.json({ success: true });
});

// ─── 改造点③：查询交易所需信息接口（新增） ────────────────────────
// 插件在签名前需要知道：nonce、gasPrice、chainId
app.post('/api/txInfo', async (req, res) => {
    const { from } = req.body;

    if (!from) {
        return res.status(400).json({ error: '缺少 from 地址' });
    }

    try {
        // 从 geth 获取当前 nonce（该地址已发出的交易数）
        const nonce = await web3.eth.getTransactionCount(from, 'pending');

        // 从 geth 获取当前建议 gasPrice
        const gasPrice = await web3.eth.getGasPrice();

        // 从 geth 获取链 ID（私链默认为 1337）
        const chainId = await web3.eth.getChainId();

        // web3 v4 返回的是 BigInt，JSON.stringify 无法序列化，全部转 string
        res.json({
            nonce: nonce.toString(),
            gasPrice: gasPrice.toString(),
            chainId: chainId.toString()
        });
    } catch (error) {
        console.error('获取交易信息失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// ─── 改造点③：广播签名交易接口（新增） ───────────────────────────
// 接收插件发来的 rawTransaction（已由私钥在插件端签名）
// 用 web3 广播到 geth 私链
app.post('/api/sendTransaction', async (req, res) => {
    const { rawTransaction } = req.body;

    if (!rawTransaction) {
        return res.status(400).json({ error: '缺少 rawTransaction' });
    }

    try {
        // ★ 改造点③：广播已签名的原始交易
        // 注意：这里用 Promise 方式，只等待交易哈希，不等待确认
        const txHash = await new Promise((resolve, reject) => {
            web3.eth.sendSignedTransaction(rawTransaction)
                .on('transactionHash', (hash) => {
                    resolve(hash);
                })
                .on('error', (error) => {
                    reject(error);
                });
        });

        console.log('交易已广播，TxHash:', txHash);

        // 通过 WebSocket 把 txHash 推送给所有连接的网页
        io.emit('txBroadcast', { txHash, from: currentAccount });

        res.json({ success: true, txHash });
    } catch (error) {
        console.error('广播交易失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// ─── 查询余额接口 ─────────────────────────────────────────────────
app.get('/api/balance/:address', async (req, res) => {
    try {
        const balanceWei = await web3.eth.getBalance(req.params.address);
        console.log('balanceWei raw:', balanceWei, 'type:', typeof balanceWei);
        console.log('balanceWei.toString():', balanceWei.toString());
        // web3 v4 getBalance 返回 BigInt，需转成字符串再做单位换算
        const balanceEth = web3.utils.fromWei(balanceWei.toString(), 'ether');
        console.log('balanceEth:', balanceEth);
        res.json({ address: req.params.address, balance: balanceEth });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ─── 解密 geth keystore 文件（新增）────────────────────────────────
// 插件无法用 scrypt 解密 geth keystore，由 server 用 Node crypto 来做
app.post('/api/decryptKeystore', async (req, res) => {
    const { keystoreJson, password } = req.body;
    if (!keystoreJson || !password) {
        return res.status(400).json({ error: '缺少参数' });
    }

    try {
        const nodeCrypto = require('crypto');

        // 解析 keystore，兼容 geth 的 crypto / Crypto 两种写法
        const ks = JSON.parse(keystoreJson);
        const cryptoField = ks.crypto || ks.Crypto;
        if (!cryptoField) {
            return res.status(400).json({ error: 'keystore 格式错误：找不到 crypto 字段' });
        }

        const kdfparams = cryptoField.kdfparams;
        console.log('开始解密，kdf 参数:', JSON.stringify(kdfparams));

        // 用 Node.js 原生 scrypt 派生密钥
        const derivedKey = await new Promise((resolve, reject) => {
            nodeCrypto.scrypt(
                Buffer.from(password),
                Buffer.from(kdfparams.salt, 'hex'),
                kdfparams.dklen,
                { N: kdfparams.n, r: kdfparams.r, p: kdfparams.p },
                (err, key) => err ? reject(err) : resolve(key)
            );
        });

        // 验证 MAC
        // ★ 修复：Node.js crypto 不支持 sha3-256，需用第三方或手动实现 keccak256
        // web3 已经引入，直接用 web3.utils.keccak256 来计算
        const ciphertext = Buffer.from(cryptoField.ciphertext, 'hex');
        const macData = Buffer.concat([derivedKey.slice(16, 32), ciphertext]);
        const computedMac = web3.utils.keccak256(macData).slice(2); // 去掉 0x 前缀

        console.log('计算 MAC:', computedMac);
        console.log('文件 MAC:', cryptoField.mac);

        if (computedMac !== cryptoField.mac) {
            return res.status(400).json({ error: '密码错误' });
        }

        // 用 AES-128-CTR 解密私钥
        const iv = Buffer.from(cryptoField.cipherparams.iv, 'hex');
        const decipher = nodeCrypto.createDecipheriv('aes-128-ctr', derivedKey.slice(0, 16), iv);
        const privateKey = '0x' + Buffer.concat([
            decipher.update(ciphertext),
            decipher.final()
        ]).toString('hex');

        console.log('解密成功，地址:', '0x' + ks.address);
        res.json({ success: true, privateKey });

    } catch (error) {
        console.error('解密 keystore 失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// ─── 生成新账户（server 端用 ethers 生成并加密）────────────────────
app.post('/api/generateAccount', async (req, res) => {
    const { password, privateKey } = req.body;
    if (!password) return res.status(400).json({ error: '缺少密码' });

    try {
        const { ethers } = require('ethers');
        // 有私钥就用传入的，没有就随机生成
        const wallet = privateKey
            ? new ethers.Wallet(privateKey)
            : ethers.Wallet.createRandom();
        const keystoreJson = await wallet.encrypt(password);
        res.json({
            success: true,
            address: wallet.address,
            keystore: keystoreJson
        });
    } catch (error) {
        console.error('生成/导入账户失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// ─── 静态页面 ─────────────────────────────────────────────────────
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`服务器运行在 http://localhost:${PORT}`);
    // 启动时检测 geth 连接
    web3.eth.getBlockNumber()
        .then(block => console.log(`已连接 geth 私链，当前区块高度: ${block}`))
        .catch(() => console.warn('警告：无法连接 geth，请确保 geth 已启动在 8545 端口'));
});