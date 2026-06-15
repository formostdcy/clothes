// 调试
const fs = require('fs');
const text = fs.readFileSync('d:/校服小程序0/cloudfunctions/boss-overview/index.js', 'utf8');
const lines = text.split('\n');
console.log('Line 19 bytes:', Buffer.from(lines[18], 'utf8').toString('hex').substring(0, 200));
// 匹配 status: 后的引号内容
const m = lines[18].match(/status\s*:\s*'([^']+)'/);
console.log('Match:', m);
if (m) console.log('Value:', m[1], 'isGarbled:', /[闁閸閻閺閿]/.test(m[1]));

// 用 global
const re = /status\s*:\s*'([^']+)'/g;
let mm;
while ((mm = re.exec(lines[18])) !== null) {
  console.log('Global match:', mm[1], 'isGarbled:', /[闁閸閻閺閿]/.test(mm[1]));
}
