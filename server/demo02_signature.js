/**
 * 演示脚本 02 — 消息签名与 ecrecover 验证
 * 运行方式：在 server 目录下执行 node demo02_signature.js
 *
 * 修复说明：
 *   项目 package.json 含 "type":"module"，Node.js 将所有 .js 视为 ES Module。
 *   ES Module 不支持 require()，需改用 import。
 *   顶层 await 在 ES Module 中原生支持，无需额外包装。
 */

// ✅ 修复：require() → import
import { ethers } from 'ethers';

console.log('='.repeat(60));
console.log('  演示 02：消息签名与 ecrecover 验证');
console.log('='.repeat(60));

// ── 第一步：准备账户 ──────────────────────────────────────────
console.log('\n【第一步】创建一个测试账户');

const wallet = ethers.Wallet.createRandom();
console.log('账户地址：', wallet.address);
console.log('私钥（演示用）：', wallet.privateKey);

// ── 第二步：构造待签名的消息 ──────────────────────────────────
console.log('\n' + '-'.repeat(60));
console.log('【第二步】构造待签名消息');
console.log('原理：不直接签名原始消息，而是签名消息的哈希值');
console.log('      以太坊规范：在消息前加固定前缀防止误签交易\n');

const message = '我同意登录 DApp，时间戳：' + Date.now();
console.log('原始消息：', message);

// ethers.js 的 signMessage 会自动添加以太坊前缀：
// "\x19Ethereum Signed Message:\n" + 消息长度 + 消息内容
const messageHash = ethers.hashMessage(message);
console.log('加前缀后的哈希：', messageHash);

// ── 第三步：签名 ──────────────────────────────────────────────
console.log('\n' + '-'.repeat(60));
console.log('【第三步】用私钥签名（模拟插件端操作）');
console.log('原理：ECDSA 签名，生成 (r, s, v) 三个分量，合并为 65 字节\n');

// ✅ 顶层 await 在 ES Module 中原生支持，无需修改
const signature = await wallet.signMessage(message);
console.log('签名结果（65字节，十六进制）：');
console.log(signature);

// 拆解签名分量
const sig = ethers.Signature.from(signature);
console.log('\n签名分量：');
console.log('  r =', sig.r, '（椭圆曲线点的 x 坐标）');
console.log('  s =', sig.s, '（签名证明值）');
console.log('  v =', sig.v, '（恢复标识符，27 或 28）');

// ── 第四步：ecrecover 还原签名者 ──────────────────────────────
console.log('\n' + '-'.repeat(60));
console.log('【第四步】ecrecover 从签名还原签名者地址');
console.log('原理：ECDSA 数学性质保证签名+消息哈希可唯一还原公钥\n');

const recoveredAddress = ethers.verifyMessage(message, signature);
console.log('原始账户地址：  ', wallet.address);
console.log('还原出的地址：  ', recoveredAddress);
console.log('地址匹配验证：  ', wallet.address.toLowerCase() === recoveredAddress.toLowerCase() ? '✓ 签名有效' : '✗ 签名无效');

// ── 第五步：输出 geth 控制台验证命令 ─────────────────────────
console.log('\n' + '-'.repeat(60));
console.log('【第五步】在 geth 控制台验证（复制以下命令执行）\n');

console.log('// 方法一：用 eth.accounts.recover 验证');
console.log(`eth.accounts.recover("${message}", "${signature}")`);
console.log('// 预期输出：' + wallet.address.toLowerCase());

console.log('\n// 方法二：验证消息哈希后再 recover');
console.log(`var msgHash = web3.eth.accounts.hashMessage("${message}")`);
console.log(`web3.eth.accounts.recover(msgHash, "${signature}")`);

// ── 第六步：服务端验证示例 ────────────────────────────────────
console.log('\n' + '-'.repeat(60));
console.log('【第六步】server 端验证签名的代码示例');
console.log('应用场景：DApp 后端收到签名后，验证用户身份\n');

console.log(`
// server.js 中的验证接口示例
app.post('/api/verify', (req, res) => {
    const { message, signature, expectedAddress } = req.body;
    
    // 用 ethers.js 还原签名者地址
    import { ethers } from 'ethers';
    const recovered = ethers.verifyMessage(message, signature);
    
    // 比对地址（不区分大小写）
    if (recovered.toLowerCase() === expectedAddress.toLowerCase()) {
        res.json({ success: true, message: '身份验证通过' });
    } else {
        res.json({ success: false, message: '签名无效' });
    }
});
`);

// ── 课堂思考 ──────────────────────────────────────────────────
console.log('='.repeat(60));
console.log('  课堂思考');
console.log('='.repeat(60));
console.log('Q1: 消息签名和交易签名有什么区别？');
console.log('    提示：消息签名不消耗 Gas，交易签名会改变链上状态');
console.log('');
console.log('Q2: 为什么签名前要在消息前加以太坊前缀？');
console.log('    提示：如果不加前缀，签名一条消息可能等同于签名一笔交易');
console.log('');
console.log('Q3: ecrecover 能不能用于用户登录？有什么优缺点？');
console.log('    提示：想想传统密码登录和签名登录的区别');