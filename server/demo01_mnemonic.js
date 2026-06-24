/**
 * 演示脚本 01 — 助记词与 HD 钱包
 * 运行方式：在 server 目录下执行 node demo01_mnemonic.js
 *
 * 本脚本演示：
 *   1. 生成 BIP39 助记词（12个单词）
 *   2. 从助记词推导出 HD 钱包根密钥
 *   3. 按 BIP44 路径派生多个子账户（地址+私钥）
 *   4. 验证：同一套助记词每次都能还原出完全相同的地址
 */

const { ethers } = require('ethers');

console.log('='.repeat(60));
console.log('  演示 01：助记词与 HD 钱包（BIP39 / BIP44）');
console.log('='.repeat(60));

// ── 第一步：生成助记词 ────────────────────────────────────────
console.log('\n【第一步】生成 12 个助记词');
console.log('原理：从密码学安全的随机数生成 128 位熵，');
console.log('      映射到 BIP39 词库中的 12 个英文单词\n');

const mnemonic = ethers.Mnemonic.entropyToPhrase(
    ethers.randomBytes(16)   // 128 位 = 16 字节 → 12个单词
);
console.log('助记词：');
console.log('  ' + mnemonic);
console.log('\n⚠ 真实使用时，助记词必须离线保存，泄露即资产全损！');

// ── 第二步：从助记词推导 HD 钱包根节点 ────────────────────────
console.log('\n' + '-'.repeat(60));
console.log('【第二步】从助记词创建 HD 钱包根节点');
console.log('原理：助记词 → PBKDF2 → 512位种子 → BIP32 主密钥\n');

// ✅ 修复点：第三个参数传 "m"，确保拿到深度为 0 的真正根节点
// ethers v6 的 fromPhrase 默认会派生到 m/44'/60'/0'/0/0（深度5）
// 传入 "m" 则停在根节点（深度0），后续才能用完整路径派生子账户
const hdWallet = ethers.HDNodeWallet.fromPhrase(mnemonic, null, "m");

console.log('HD 钱包根节点创建成功');
console.log('根节点扩展公钥（xpub）前缀：', hdWallet.extendedKey.slice(0, 20) + '...');

// ── 第三步：按 BIP44 路径派生多个子账户 ──────────────────────
console.log('\n' + '-'.repeat(60));
console.log('【第三步】按 BIP44 路径派生子账户');
console.log('BIP44 标准路径格式：m / 44\' / 60\' / 0\' / 0 / index');
console.log('  44\'  = BIP44 规范');
console.log('  60\'  = 以太坊币种编号');
console.log('  0\'   = 第 0 个账户');
console.log('  0    = 外部地址（接收用）');
console.log('  index = 第几个地址（0、1、2...）\n');

console.log('派生出的 5 个子账户：');
console.log('  索引   地址                                          私钥（前20位）');
console.log('  ' + '-'.repeat(80));

const accounts = [];
for (let i = 0; i < 5; i++) {
    const path = `m/44'/60'/0'/0/${i}`;
    const child = hdWallet.derivePath(path);
    accounts.push({ path, address: child.address, privateKey: child.privateKey });
    console.log(`  账户${i}  ${child.address}  ${child.privateKey.slice(0, 22)}...`);
}

// ── 第四步：验证可重复性 ──────────────────────────────────────
console.log('\n' + '-'.repeat(60));
console.log('【第四步】验证可重复性——用同一套助记词重新推导');
console.log('结论：只要助记词相同，每次推导出的地址必然完全一致\n');

// ✅ 同样需要传 "m" 参数，否则默认派生到深度5
const hdWallet2 = ethers.HDNodeWallet.fromPhrase(mnemonic, null, "m");
const account0_again = hdWallet2.derivePath("m/44'/60'/0'/0/0");

console.log('第一次推导的账户0地址：', accounts[0].address);
console.log('第二次推导的账户0地址：', account0_again.address);
console.log('两次结果一致：', accounts[0].address === account0_again.address ? '✓ 是' : '✗ 否');

// ── 课堂思考 ──────────────────────────────────────────────────
console.log('\n' + '='.repeat(60));
console.log('  课堂思考');
console.log('='.repeat(60));
console.log('Q1: MetaMask 为什么备份助记词而不是备份私钥？');
console.log('    提示：一套助记词可以还原多少个账户？');
console.log('');
console.log('Q2: 如果只导出了账户0的私钥，账户1还能恢复吗？');
console.log('    提示：私钥和助记词的信息量哪个更大？');
console.log('');
console.log('Q3: 为什么路径中有些数字带撇号（\'），有些没有？');
console.log('    提示：搜索"BIP32 hardened derivation"');