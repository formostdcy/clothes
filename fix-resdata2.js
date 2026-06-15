// 修复所有 res.data.* / res.data 错访问 -> res.* / res
// callCloud 已返回 res.result.data，所以后续 res 就是 data
const fs = require('fs');
const path = require('path');

function walk(p) {
  const out = [];
  for (const item of fs.readdirSync(p, { withFileTypes: true })) {
    const full = path.join(p, item.name);
    if (item.isDirectory()) out.push(...walk(full));
    else if (item.name.endsWith('.js')) out.push(full);
  }
  return out;
}

let total = 0;
const updatedFiles = [];
for (const f of walk('d:/校服小程序0/pages')) {
  const text = fs.readFileSync(f, 'utf8');
  // 1. 替换 res.data.list / res.data.total / res.data.X
  // 2. 替换 res.data 用于 destructure / setData 等
  // 不替换 res.data 后接 .push/.pop/.forEach/.filter（这些是数组方法，res.data 是数组）
  // 简单粗暴：所有 res.data 替换为 res
  // 但要排除 res.dataset (HTML dataset)
  // 排除 res.dataType (JSDoc)

  // 先标注要替换的位置
  let newText = '';
  let i = 0;
  while (i < text.length) {
    if (text.substring(i, i + 8) === 'res.data') {
      // 排除 res.dataset
      if (text[i + 8] && /[a-zA-Z]/.test(text[i + 8])) {
        newText += 'res.data';
        i += 8;
        continue;
      }
      // 替换为 res
      newText += 'res';
      i += 8;
    } else {
      newText += text[i];
      i++;
    }
  }

  if (newText !== text) {
    fs.writeFileSync(f, newText);
    total++;
    updatedFiles.push(f.replace('d:/校服小程序0/', ''));
  }
}
console.log(`共修改 ${total} 个文件`);
updatedFiles.forEach(f => console.log('  ' + f));
