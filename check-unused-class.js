// 检查 wxss 定义的类是否在 wxml 中使用
const fs = require('fs');
const path = require('path');

function walk(p) {
  const out = [];
  for (const item of fs.readdirSync(p, { withFileTypes: true })) {
    const full = path.join(p, item.name);
    if (item.isDirectory()) out.push(...walk(full));
    else if (item.name === 'index.wxss' || item.name === 'index.wxml') out.push(full);
  }
  return out;
}

// 全局类（app.wxss）
const appWxss = 'd:/校服小程序0/app.wxss';
const appText = fs.existsSync(appWxss) ? fs.readFileSync(appWxss, 'utf8') : '';
const globalClasses = new Set();
const appRe = /\.\s*([a-zA-Z_][\w-]*)\s*[\s,{:>]/g;
let m;
while ((m = appRe.exec(appText)) !== null) {
  if (m[1].length > 1) globalClasses.add(m[1]);
}

const issues = [];
for (const dir of walk('d:/校服小程序0/pages')) {
  // 仅 wxss
  if (!dir.endsWith('.wxss')) continue;
  const wxmlFile = dir.replace(/\.wxss$/, '.wxml');
  if (!fs.existsSync(wxmlFile)) continue;
  const wxssText = fs.readFileSync(dir, 'utf8');
  const wxmlText = fs.readFileSync(wxmlFile, 'utf8');

  // 找 wxss 中定义的所有 .class
  const definedClasses = new Set();
  const re = /^\s*\.([a-zA-Z_][\w-]*)\s*[\s,{>]/gm;
  while ((m = re.exec(wxssText)) !== null) {
    definedClasses.add(m[1]);
  }

  // 找 wxml 中使用的 class（不精确，但启发式）
  const usedClasses = new Set();
  const classRe = /class\s*=\s*["']([^"']+)["']/g;
  while ((m = classRe.exec(wxmlText)) !== null) {
    m[1].split(/\s+/).forEach(c => {
      // 处理动态 class
      const parts = c.split(/[{}]/);
      usedClasses.add(parts[0]);
    });
  }

  // 找 wxml 中 wxss-class 之类的
  for (const c of definedClasses) {
    // 排除被全局 app.wxss 包含的
    if (globalClasses.has(c)) continue;
    // 如果 wxml 中没用，并且不是以 -- 开头（BEM修饰符）
    let used = false;
    for (const u of usedClasses) {
      if (u === c) { used = true; break; }
      // 处理 wxml 中 item-class 引用（基于数据动态 class）
      if (u && u.includes(c)) { used = true; break; }
    }
    if (!used) {
      // 进一步：找 wxml 中字符串里有 c 的（动态 class）
      if (wxmlText.includes(`'${c}'`) || wxmlText.includes(`"${c}"`) || wxmlText.includes(`-${c}`) || wxmlText.includes(`${c} `)) {
        used = true;
      }
    }
    if (!used) {
      issues.push({ file: dir, class: c });
    }
  }
}

console.log('=== wxss 定义但 wxml 未直接引用的类（前 30） ===');
for (const it of issues.slice(0, 30)) {
  console.log(`  ${it.file}  --  .${it.class}`);
}
console.log(`\n共 ${issues.length} 个潜在未使用类（仅参考，可能用于动态 class）`);
