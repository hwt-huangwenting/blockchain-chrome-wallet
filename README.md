# ChromePlugWallet

基于以太坊私链的 Chrome 钱包插件，配套本地 Node.js 后端服务。

课程：区块链原理 · 第二次实训

---

## 项目结构

```
ChromePlugWallet/
├── plug/                  # Chrome 插件本体
│   ├── manifest.json      # 插件配置（Manifest V3）
│   ├── popup.html         # 插件弹窗 UI
│   ├── popup.js           # 插件逻辑
│   └── ethers.min.js      # ethers.js v6（本地引入）
└── server/                # 本地后端服务
    ├── server.js          # Express + Socket.io 服务器
    ├── demo01_mnemonic.js # 演示：HD钱包与助记词（BIP39/BIP44）
    ├── demo02_signature.js# 演示：消息签名与 ecrecover 验证
    └── public/index.html  # 前端页面（WebSocket 实时显示当前账户）
```

---

## 功能特性

- **创建钱包**：设置密码，密码不明文存储，通过 keystore 解密验证
- **生成账户**：服务端随机生成密钥对，ethers.js 加密为 keystore 存储在 Chrome Storage
- **导入私钥**：支持直接粘贴 `0x` 开头的私钥导入
- **导入 Keystore 文件**：兼容 geth 生成的 UTC-- 格式文件（scrypt 解密由服务端处理）
- **查询余额**：连接本地 geth 私链实时查询 ETH 余额
- **发送交易**：私钥在插件端本地签名，服务端只负责广播已签名的原始交易（rawTransaction），私钥不离开插件
- **查看私钥**：需重新输入密码解密 keystore 后才能显示
- **自动锁定**：5 分钟无操作自动锁定，附倒计时显示
- **WebSocket 推送**：选中账户时通过 Socket.io 实时同步到 `public/index.html`

---

## 运行环境

- Node.js >= 16
- Chrome 浏览器
- geth 以太坊私链（监听 `localhost:8545`）

---

## 快速开始

### 1. 启动 geth 私链

```bash
geth --datadir ./data --networkid 1337 --http --http.port 8545 \
     --http.corsdomain "*" --http.api eth,net,web3,personal \
     --allow-insecure-unlock console
```

### 2. 启动后端服务器

```bash
cd server
npm install
node server.js
```

服务启动后访问 [http://localhost:3000](http://localhost:3000) 可查看当前选中账户。

### 3. 加载 Chrome 插件

1. 打开 Chrome，进入 `chrome://extensions/`
2. 开启右上角「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择项目中的 `plug/` 目录

加载成功后点击 Chrome 右上角插件图标即可使用。

---

## 演示脚本

两个独立的学习脚本，在 `server/` 目录下运行：

```bash
# 演示1：BIP39 助记词生成、BIP44 路径推导多账户、可重复性验证
node demo01_mnemonic.js

# 演示2：消息签名（ECDSA）、ecrecover 还原签名者地址
# 注意：该脚本使用 ES Module 语法，需确保 server/package.json 中含 "type": "module"
node demo02_signature.js
```

---

## 安全说明

- 私钥始终以 keystore 密文形式存储在 Chrome Storage，不存明文
- 发送交易时私钥仅在插件内存中短暂存在，服务端只接收已签名的 rawTransaction
- geth keystore 文件的 scrypt 解密由服务端处理（Chrome 扩展 Web Crypto API 不支持 scrypt）
- 本项目仅连接本地私链，不接触主网，适合学习和实验使用

---

## 技术栈

| 模块 | 技术 |
|------|------|
| Chrome 插件 | Manifest V3、Chrome Storage API |
| 前端加密 | ethers.js v6 |
| 后端 | Node.js、Express、Socket.io |
| 链交互 | web3.js v4、geth 私链 |
| keystore 解密 | Node.js 内置 crypto（scrypt + AES-128-CTR） |
