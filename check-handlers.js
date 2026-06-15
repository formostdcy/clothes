// 验证 wxml 事件绑定 与 js handler 完整
const fs = require('fs');
const path = require('path');

function walk(p) {
  const out = [];
  for (const item of fs.readdirSync(p, { withFileTypes: true })) {
    const full = path.join(p, item.name);
    if (item.isDirectory()) out.push(...walk(full));
    else if (item.isFile()) out.push(full);
  }
  return out;
}

const issues = [];
for (const dir of walk('d:/校服小程序0/pages')) {
  // 找 index.js / index.wxml
  const jsFile = path.join(dir, 'index.js');
  const wxmlFile = path.join(dir, 'index.wxml');
  if (!fs.existsSync(jsFile) || !fs.existsSync(wxmlFile)) continue;
  const jsText = fs.readFileSync(jsFile, 'utf8');
  const wxmlText = fs.readFileSync(wxmlFile, 'utf8');

  // 找 wxml 中所有 bind*: 后的名字
  const wxmlHandlers = new Set();
  const wxmlRe = /bind[a-z]+\s*=\s*["']([\w]+)["']/g;
  let m;
  while ((m = wxmlRe.exec(wxmlText)) !== null) {
    wxmlHandlers.add(m[1]);
  }
  // 找 catchtap
  const catchRe = /catch[a-z]+\s*=\s*["']([\w]+)["']/g;
  while ((m = catchRe.exec(wxmlText)) !== null) {
    wxmlHandlers.add(m[1]);
  }

  // 找 js 中所有 method
  const jsMethods = new Set();
  const jsRe = /^\s*([a-zA-Z_][\w]*)\s*\([^)]*\)\s*[{,]/gm;
  while ((m = jsRe.exec(jsText)) !== null) {
    jsMethods.add(m[1]);
  }
  // 去掉 Page() 内的 data/props 方法
  // 这里简化

  // 找 Page({ ... }) 中的 methods
  const pageMatch = jsText.match(/Page\s*\(\s*\{([\s\S]+?)\}\s*\)/);
  if (pageMatch) {
    const methods = [...pageMatch[1].matchAll(/^\s*([a-zA-Z_][\w]*)\s*\(/gm)];
    for (const m of methods) {
      const name = m[1];
      if (name !== 'Page' && name !== 'data' && name !== 'onLoad' && name !== 'onShow' && name !== 'onReady' && name !== 'onUnload') {
        jsMethods.add(name);
      }
    }
  }

  // 检查 wxml 中的 handler 是否在 js 中定义
  for (const h of wxmlHandlers) {
    // 排除标准生命周期
    if (['onLoad', 'onShow', 'onReady', 'onUnload', 'onPullDownRefresh', 'onReachBottom', 'onShareAppMessage', 'onPageScroll', 'onResize', 'onTabItemTap', 'onSaveExitState'].includes(h)) continue;
    if (!jsMethods.has(h)) {
      issues.push({ file: dir, handler: h });
    }
  }
}

console.log('wxml 绑定但 js 中未定义的方法：');
for (const it of issues) {
  console.log(`  ${it.file}  --  ${it.handler}`);
}
console.log(`\n共 ${issues.length} 个`);
