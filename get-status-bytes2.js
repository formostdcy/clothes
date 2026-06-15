// 用更精确的乱码检测
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

// 真正的乱码：GBK->UTF-8 错解后产生的字符
// 这些字符在 CJK 统一表意文字基本平面，但都是 GBK 编码范围(B0-F7)内的字节对
// 用更宽松的检测：是否含 0x90-0xF7 之间的不常见字符
const isGarbled = s => {
  // 真实中文最常用字都在常用 3500 字以内
  // 乱码字符一般在 0x81-0xFE 范围（GBK 第二字节）但对应 Unicode 私有区
  // 简单方法：检查是否含 任何 GBK 乱码常见的 字符
  return /[鐎閿闆閺閼閸閻閿闁閸閺閻閿鐟闁闁閸闄闅闆閷閸閼閺閻閿]/.test(s);
};

// 如果上面没匹配，再用一个方法：单字都是 4 字节 GBK 字符模式
const isGarbled2 = s => {
  // GBK 错误解码后，每个"字符"实际是 2 个原始字节被错误地当成 UTF-8 解码
  // 表现为：每个字符的 Unicode 值在 0x4000-0xFFFD 范围内
  // 中文正常字符范围：0x4E00-0x9FFF（基本平面）
  // 乱码字符的 Unicode 范围：通常在 0xE000-0xFFFF 或 0x4000-0x4DFF
  // 更简单：连续的"奇怪"中文字符（不在常用 3500 字）
  for (const ch of s) {
    const code = ch.codePointAt(0);
    // 非常用中文字符（乱码）
    if (code >= 0xE000 && code <= 0xFFFF) return true;
    if (code >= 0x4000 && code <= 0x4DFF) return true;
    // 一些特定乱码字符
    if ('鐎閿闆閺閼閸閻閿鐟闁闄闅閷閰閱閲閳閴閵閶閷閸閹閺閻閼閽閾閿'.includes(ch)) return true;
  }
  return false;
};

for (const f of walk('d:/校服小程序0/cloudfunctions')) {
  const text = fs.readFileSync(f, 'utf8');
  const lines = text.split('\n');
  lines.forEach((line, i) => {
    const re = /status\s*[:=]+\s*['"]([^'"]+)['"]/g;
    let m;
    while ((m = re.exec(line)) !== null) {
      if (isGarbled2(m[1])) {
        const bytes = Buffer.from(m[1], 'utf8');
        console.log(`${path.basename(path.dirname(f))}:${i+1}  '${m[1]}'  hex=${bytes.toString('hex')}`);
      }
    }
  });
}
