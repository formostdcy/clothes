// 检查列表页是否缺少 onReachBottom
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

const listFnCalls = new Set(['supplier-list', 'employee-list', 'cutting-incomingList', 'cutting-orderList',
  'finished-confirmList', 'finished-outboundList', 'finished-stockList',
  'notification-list', 'raw-inboundList', 'raw-outboundList', 'raw-stockList',
  'workshop-incomingList', 'workshop-pendingList', 'workshop-processingList']);

for (const f of walk('d:/校服小程序0/pages')) {
  const text = fs.readFileSync(f, 'utf8');
  // 是否调用 list 类云函数
  const uses = [...text.matchAll(/callCloud\s*\(\s*['"]([\w-]+)['"]/g)].map(m => m[1]).some(n => listFnCalls.has(n));
  if (!uses) continue;
  // 是否有 onReachBottom
  const hasReachBottom = /onReachBottom\s*\(/.test(text);
  // 是否有 page 状态
  const hasPage = /page\s*:\s*\d+/.test(text);
  if (uses && hasPage && !hasReachBottom) {
    console.log(`缺 onReachBottom: ${f}`);
  }
}
