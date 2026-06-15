// 找出 WXML 中引用的 item.XXX 字段，对比云函数实际返回的字段
const fs = require('fs');
const path = require('path');

function walk(p) {
  const out = [];
  for (const item of fs.readdirSync(p, { withFileTypes: true })) {
    const full = path.join(p, item.name);
    if (item.isDirectory()) out.push(...walk(full));
    else if (item.name.endsWith('.wxml')) out.push(full);
  }
  return out;
}

// WXML 中 item.xxx 引用
const itemRefs = new Map();
for (const f of walk('d:/校服小程序0/pages')) {
  const text = fs.readFileSync(f, 'utf8');
  const refs = new Set();
  // 匹配 {{item.xxx}} 或 {{item.xxx|filter}}
  const re = /\{\{\s*item\.([a-zA-Z_][\w]*)/g;
  let m;
  while ((m = re.exec(text)) !== null) refs.add(m[1]);
  // 匹配 data-id="{{item.xxx}}"
  const re2 = /item\.([a-zA-Z_][\w]*)/g;
  while ((m = re2.exec(text)) !== null) refs.add(m[1]);
  if (refs.size > 0) itemRefs.set(f, refs);
}

console.log('WXML 中 item 引用统计：');
for (const [f, refs] of itemRefs) {
  const fields = [...refs].sort().join(', ');
  console.log(`${f.replace('d:/校服小程序0/', '')}\n  ${fields}\n`);
}
