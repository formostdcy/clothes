// 列出所有前端 callCloud 调用点和参数
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

for (const f of walk('d:/校服小程序0/pages')) {
  const text = fs.readFileSync(f, 'utf8');
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    const m = line.match(/callCloud\s*\(\s*['"]([\w-]+)['"]/);
    if (m) {
      console.log(`${path.relative('d:/校服小程序0/pages', f)}:${i+1}  callCloud('${m[1]}')`);
    }
  });
}
