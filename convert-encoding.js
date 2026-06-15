const fs = require('fs');
const files = require('glob').sync('d:/校服小程序0/cloudfunctions/**/index.js');

// 对每个文件: 用 GBK 解码 (这才是文件原始编码), 然后转 UTF-8
// 思路: 文件是 GBK 编码, 被误存成"UTF-8", 实际是 GBK 字节
// 我们的代码需要: GBK 字节 -> 正确的中文 -> 写成 UTF-8

const iconvLite = require('iconv-lite');

for (const f of files) {
  const buf = fs.readFileSync(f);
  // 验证: 用 GBK 解码应该成功
  try {
    const text = iconvLite.decode(buf, 'gbk');
    // 同时用 UTF-8 解码看看是否也成功
    try {
      const utf8Text = buf.toString('utf8');
      if (text === utf8Text) {
        // 真正是 UTF-8, 不动
        continue;
      }
    } catch (e) {}
    // 是 GBK 文件, 转 UTF-8 写回
    const utf8 = iconvLite.encode(text, 'utf8');
    fs.writeFileSync(f, utf8);
    console.log('转换 GBK->UTF-8:', f);
  } catch (e) {
    console.log('无法处理:', f, e.message);
  }
}
