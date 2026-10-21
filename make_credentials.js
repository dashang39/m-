// 生成内置凭据（AES-256-GCM 加密后写入 credentials.enc.js）
// 用法：node make_credentials.js <邮箱> <密码>
const fs = require('fs');
const crypto = require('crypto');

const acc = process.argv[2];
const pwd = process.argv[3];
if (!acc || !pwd) {
  console.error('用法: node make_credentials.js <登录邮箱> <密码>');
  process.exit(1);
}

const KEY = crypto.createHash('sha256').update('mji-local-credential-2026').digest();
const iv = crypto.randomBytes(12);
const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
const plain = Buffer.from(JSON.stringify({ account: acc, password: pwd }), 'utf8');
const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
const tag = cipher.getAuthTag();
const data = Buffer.concat([iv, tag, ct]).toString('base64');

const out = `// 加密凭据（构建产物，勿提交到公开仓库）
module.exports = { v: 1, data: '${data}' };
`;
fs.writeFileSync('F:/workspace/lanerc/pc/credentials.enc.js', out, 'utf8');
console.log('credentials.enc.js 已生成，账号：' + acc + '（密码已加密）');
