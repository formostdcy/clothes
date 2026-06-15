// 检查所有 callCloud 调用的云函数是否存在
const fs = require('fs');
const path = require('path');

// 1. 收集所有 callCloud 调用的函数名
const called = new Set();
function walkPages(p) {
  for (const item of fs.readdirSync(p, { withFileTypes: true })) {
    const full = path.join(p, item.name);
    if (item.isDirectory()) walkPages(full);
    else if (item.name.endsWith('.js')) {
      const text = fs.readFileSync(full, 'utf8');
      const matches = text.matchAll(/callCloud\s*\(\s*['"]([\w-]+)['"]/g);
      for (const m of matches) called.add(m[1]);
    }
  }
}
walkPages('d:/校服小程序0/pages');

// 2. 收集所有云函数名
const exist = new Set();
for (const item of fs.readdirSync('d:/校服小程序0/cloudfunctions', { withFileTypes: true })) {
  if (item.isDirectory()) exist.add(item.name);
}

// 3. 找出被调用但云函数不存在
console.log('=== 被调用但云函数不存在 ===');
for (const fn of called) {
  if (!exist.has(fn)) {
    console.log('  ' + fn);
  }
}

// 4. 找出存在但未使用
console.log('\n=== 云函数存在但未被调用 ===');
for (const fn of exist) {
  if (!called.has(fn)) {
    console.log('  ' + fn);
  }
}
