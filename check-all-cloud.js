const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function walk(p) {
  const out = [];
  for (const item of fs.readdirSync(p, { withFileTypes: true })) {
    const full = path.join(p, item.name);
    if (item.isDirectory()) out.push(...walk(full));
    else if (item.name === 'index.js') out.push(full);
  }
  return out;
}

let fail = 0;
for (const f of walk('d:/校服小程序0/cloudfunctions')) {
  // 检查文件是否为空
  const stat = fs.statSync(f);
  if (stat.size === 0) {
    console.log('EMPTY ' + f);
    fail++;
    continue;
  }
  try {
    execSync(`node --check "${f}"`, { stdio: 'pipe' });
  } catch (e) {
    console.log('FAIL ' + f + ': ' + e.stderr.toString().split('\n')[0]);
    fail++;
  }
}
console.log(`失败: ${fail}`);
