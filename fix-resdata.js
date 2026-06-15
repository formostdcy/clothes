// 修复所有 res.data.X 错访问 -> res.X
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
for (const f of walk('d:/校服小程序0/pages')) {
  const text = fs.readFileSync(f, 'utf8');
  // res.data.list/total/...  -> res.list/total/...
  // res.data.X （X 是普通字段） -> res.X
  // 排除 res.data.setData (wx API 不可能)
  // 排除 res.data.push/pop/...
  // 简单替换 res.data.list/total 等常见后缀

  let newText = text;
  // 特定模式：res.data.list / res.data.total
  newText = newText.replace(/res\.data\.list\b/g, 'res.list');
  newText = newText.replace(/res\.data\.total\b/g, 'res.total');
  newText = newText.replace(/res\.data\.page\b/g, 'res.page');
  newText = newText.replace(/res\.data\.pageSize\b/g, 'res.pageSize');
  newText = newText.replace(/res\.data\.page_size\b/g, 'res.pageSize');
  // 其它 res.data.X 引用——X 不是 .list/total 等，则 res.data 整体作 destructuring/解构
  // res.data 这时通常用作 {name, account, ...} = res.data （对象解构）
  // 在这种用法下，res.data 是 {name, account...} 而我们的 res 是 {name, account...}
  // 所以 res.data = res
  // 但 setData({ roleList: res.data }) 时，roleList 应该是 res（数组），不是 res.data
  // 综合：res.data 后接 [.{...}/[name]]/= 后 都是直接展开
  // 把所有 .then(res => { ... res.data }) 模式里的 res.data 改 res
  newText = newText.replace(/\.then\(\s*res\s*=>\s*\{([\s\S]*?)res\.data([\s\S]*?)\}\)/g, (m, p1, p2) => {
    // 替换 res.data -> res
    return `.then(res => {${p1}res${p2}})`;
  });

  if (newText !== text) {
    fs.writeFileSync(f, newText);
    total++;
    console.log('Updated: ' + f.replace('d:/校服小程序0/', ''));
  }
}
console.log(`\n共修改 ${total} 个文件`);
