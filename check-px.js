// 检查样式中的硬编码 px（应改 rpx）
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

const issues = [];
for (const f of walk('d:/校服小程序0/pages')) {
  const text = fs.readFileSync(f, 'utf8');
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    // 找 px 数字
    const m = line.match(/\b\d+px\b/g);
    if (m) {
      // 排除 font-size: 0
      // 排除 1px 边框（hack）
      // 找出非 1px 或 0px 的
      for (const v of m) {
        if (v !== '1px' && v !== '0px' && v !== '2px' && v !== '3px' && v !== '4px') {
          issues.push({ file: f, line: i + 1, value: v, content: line.trim() });
        }
      }
    }
  });
}

console.log('=== 硬编码 px（> 4px 的需检查） ===');
for (const it of issues.slice(0, 30)) {
  console.log(`  ${it.file}:${it.line}  ${it.value}  // ${it.content.substring(0, 100)}`);
}
console.log(`\n共 ${issues.length} 处`);
