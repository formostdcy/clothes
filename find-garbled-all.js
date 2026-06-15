// 全面扫描云函数中所有乱码 status 字符串
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
// 找所有 '...' 字符串（包括 status, role, type, title, content 等）
const re = /'([^']{1,80})'/g;

const issues = {};
for (const f of walk('d:/校服小程序0/cloudfunctions')) {
  const text = fs.readFileSync(f, 'utf8');
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    let m;
    const re2 = /'([^']{1,80})'/g;
    while ((m = re2.exec(line)) !== null) {
      if (isGarbled(m[1])) {
        const fn = path.basename(path.dirname(f));
        if (!issues[fn]) issues[fn] = [];
        issues[fn].push({ line: i + 1, value: m[1] });
      }
    }
  });
}

for (const fn of Object.keys(issues)) {
  console.log(`\n=== ${fn} ===`);
  for (const it of issues[fn]) {
    console.log(`  line ${it.line}: '${it.value}'`);
  }
}
console.log(`\n共 ${Object.values(issues).flat().length} 处乱码`);
