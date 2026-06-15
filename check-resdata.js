// 检查 res.data 错访问（云函数返回 { list, total } 但前端用 res.data）
const fs = require('fs');
const path = require('path');

// 已知返回 { list, total, ... } 的云函数
const listFns = new Set([
  'boss-orderList', 'cutting-incomingList', 'cutting-orderList', 'employee-list',
  'finished-confirmList', 'finished-outboundList', 'finished-stockList',
  'notification-list', 'raw-inboundList', 'raw-outboundList', 'raw-stockList',
  'supplier-list', 'workshop-incomingList', 'workshop-pendingList', 'workshop-processingList',
]);

function walk(p) {
  const out = [];
  for (const item of fs.readdirSync(p, { withFileTypes: true })) {
    const full = path.join(p, item.name);
    if (item.isDirectory()) out.push(...walk(full));
    else if (item.name.endsWith('.js')) out.push(full);
  }
  return out;
}

const issues = [];
for (const f of walk('d:/校服小程序0/pages')) {
  const text = fs.readFileSync(f, 'utf8');
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    // 匹配 callCloud('listFn', ...) 之后的 res.data 访问
    // 但 res.data.list / res.data && res.data.list / res.data.xxx 都算正确
    const m1 = line.match(/callCloud\s*\(\s*['"]([\w-]+)['"]/);
    if (m1 && listFns.has(m1[1])) {
      // 找同一行或后面 5 行的 res.data 访问
      const block = lines.slice(i, i + 5).join('\n');
      if (/res\.data\.list\b/.test(block) || /res\.data\s*&&/.test(block) || /res\.data\s*\?\?/.test(block) || /res\.data\[/.test(block)) {
        // OK
      } else if (/\.then\s*\(/.test(block) && /res\.data\b/.test(block) && !/\.data\./.test(block)) {
        // 用了 res.data 但没 res.data.list
        issues.push({ file: f, line: i + 1, fn: m1[1] });
      }
    }
  });
}

console.log('可能 res.data 错访问：');
for (const it of issues) {
  console.log(`  ${it.file}:${it.line}  ${it.fn}`);
}
console.log(`\n共 ${issues.length} 处`);
