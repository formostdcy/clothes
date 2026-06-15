// 列出所有 status 比较的乱码（eq/neq/=== 等）
const fs = require('fs');
const path = require('path');

function walk(p) {
  const out = [];
  for (const item of fs.readdirSync(p, { withFileTypes: true })) {
    const full = path.join(p, item.name);
    if (item.isDirectory()) out.push(...walk(full));
    else if (item.name === 'index.js') out.push(full);
  }
  return out;
}

const isGarbled = s => /[闁閸閻閺閿闄闅闆閷閸閼閺閻閿]/.test(s);
// 匹配: status: 'XX', status: db.command.neq('XX'), { status: 'XX' }, status === 'XX', status !== 'XX'
const re1 = /status\s*:\s*'([^']+)'/g;
const re2 = /neq\(\s*'([^']+)'\s*\)/g;
const re3 = /status\s*===\s*'([^']+)'/g;
const re4 = /status\s*!==\s*'([^']+)'/g;
const re5 = /\bstatus\s*\?/g;  // 三元中的 status 字符串

for (const f of walk('d:/校服小程序0/cloudfunctions')) {
  const text = fs.readFileSync(f, 'utf8');
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    [re1, re2, re3, re4].forEach(re => {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(line)) !== null) {
        if (isGarbled(m[1])) {
          const bytes = Buffer.from(m[1], 'utf8');
          console.log(`${path.basename(path.dirname(f))}:${i+1}  '${m[1]}'  hex=${bytes.toString('hex')}`);
        }
      }
    });
  });
}
