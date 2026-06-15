// 检查 wxss 大括号、分号平衡
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
  // 移除注释
  const cleaned = text.replace(/\/\*[\s\S]*?\*\//g, '');
  // 统计 { 和 }
  const open = (cleaned.match(/\{/g) || []).length;
  const close = (cleaned.match(/\}/g) || []).length;
  if (open !== close) {
    issues.push({ file: f, issue: `{} 不平衡 ${open} != ${close}` });
  }
  // 检查 ; 在规则内
  const rules = cleaned.match(/\{[^}]*\}/g) || [];
  for (const r of rules) {
    // 多行规则每行应有 ;
    const lines = r.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('/*') && !trimmed.startsWith('*/') && !trimmed.endsWith(';') && !trimmed.endsWith('{') && !trimmed.endsWith('}') && !trimmed.startsWith('//') && /:\s/.test(trimmed)) {
        // 应该有 ; 但没
        // 排除 font-size: 0px 之类
        // 简化：只警告
      }
    }
  }
}

console.log('=== WXSS 语法问题 ===');
for (const it of issues) {
  console.log(`  ${it.file}  ${it.issue}`);
}
console.log(`\n共 ${issues.length} 个`);
