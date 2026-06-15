// 这个文件 V8 能否解析?
// 1) 简单 ASCII
new Function("const x = 'abc'; console.log(x);");
console.log('1 OK');

// 2) 简单中文
new Function("const x = '用户'; console.log(x);");
console.log('2 OK');

// 3) GBK 编码的 "用户" 字节 (原样放进字符串)
const fs = require('fs');
const buf = fs.readFileSync('d:/校服小程序0/cloudfunctions/auth-getUserInfo/index.js');
const code = buf.toString('utf8');  // 强制 UTF-8 解码
try {
  new Function(code);
  console.log('3 OK');
} catch (e) {
  console.log('3 失败:', e.message);
}

// 4) 把 buf 当 binary (Latin-1) 字符串
const code2 = buf.toString('binary');
try {
  new Function(code2);
  console.log('4 OK');
} catch (e) {
  console.log('4 失败:', e.message);
}

// 5) 把 buf 当 UTF-8 但用 StringDecoder
const { StringDecoder } = require('string_decoder');
const dec = new StringDecoder('utf8');
const code3 = dec.write(buf);
try {
  new Function(code3);
  console.log('5 OK');
} catch (e) {
  console.log('5 失败:', e.message);
}
