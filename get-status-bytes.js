// 列出所有 status: '...' 乱码的实际字节
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

for (const f of walk('d:/校服小程序0/cloudfunctions')) {
  const text = fs.readFileSync(f, 'utf8');
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    // 匹配 status 字段
    const re = /status\s*[:=]+\s*'([^']+)'/g;
    let m;
    while ((m = re.exec(line)) !== null) {
      if (isGarbled(m[1])) {
        const bytes = Buffer.from(m[1], 'utf8');
        console.log(`${path.basename(path.dirname(f))}:${i+1}  '${m[1]}'  hex=${bytes.toString('hex')}`);
      }
    }
  });
}
