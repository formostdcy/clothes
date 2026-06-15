// 检查所有 wxss 是否有硬编码色值（应该用 var(--xxx)）
const fs = require('fs');
const path = require('path');

function walk(p) {
  const out = [];
  for (const item of fs.readdirSync(p, { withFileTypes: true })) {
    const full = path.join(p, item.name);
    if (item.isDirectory()) out.push(...walk(full));
    else if (item.name.endsWith('.wxss')) out.push(full);
  }
  return out;
}

const isHex = s => /#[0-9a-fA-F]{3,8}/.test(s);
// 排除特殊情况
const OK = [
  'rgba(', 'linear-gradient', 'transparent', 'currentColor', 'inherit', 'none',
  '#000', '#fff', '#FFF', '#000000', '#FFFFFF',
  '0 1rpx', '0 2rpx', '0 4rpx', '0 8rpx', // 阴影里的 0
];

const issues = [];
for (const f of walk('d:/校服小程序0/pages')) {
  const text = fs.readFileSync(f, 'utf8');
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    // 找 #xxxxxx 颜色（4-8位hex）
    const matches = line.matchAll(/#[0-9a-fA-F]{3,8}\b/g);
    for (const m of matches) {
      const v = m[0];
      // 排除允许的
      if (OK.includes(v)) continue;
      if (v.match(/^#[0-9a-f]{1,2}$/i)) continue; // #0, #1 等
      issues.push({ file: f, line: i + 1, value: v, content: line.trim() });
    }
  });
}

console.log('=== 硬编码色值（应该用 var()） ===');
for (const it of issues.slice(0, 50)) {
  console.log(`  ${it.file}:${it.line}  ${it.value}  // ${it.content.substring(0, 100)}`);
}
if (issues.length > 50) console.log(`  ... 还有 ${issues.length - 50} 处`);
console.log(`\n共 ${issues.length} 处`);
