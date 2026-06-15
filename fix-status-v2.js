// 修复所有 status 乱码（基于精确字节）
const fs = require('fs');

const fixes = [
  // '鐎瑰憡褰冮悾顒勫箣' -> '已完成' （4 处）
  {
    files: [
      'd:/校服小程序0/cloudfunctions/boss-overview/index.js',
      'd:/校服小程序0/cloudfunctions/workshop-processingAdd/index.js',
    ],
    oldHex: 'e9908ee791b0e686a1e8a4b0e586aee682bee9a192e58babe7aea3',
    newText: "'\u5df2\u5b8c\u6210'",  // 已完成
  },
  // boss-overview 行 42, 43, 44  '鐎垫澘鎳愰垾妯兼媼' -> '待确认'
  {
    file: 'd:/校服小程序0/cloudfunctions/boss-overview/index.js',
    oldHex: 'e9908ee59eabe6be98e98eb3e684b0e59ebee5a6afe585bce5aabc',
    newText: "'\u5f85\u786e\u8ba4'",  // 待确认
    replaceCount: 3,  // 3 处都是这个
  },
  // finished-confirmIn:24  '鐎规瓕灏欓垾妯兼媼' -> '已入库'
  {
    file: 'd:/校服小程序0/cloudfunctions/finished-confirmIn/index.js',
    oldHex: 'e9908ee8a784e79395e7818fe6ac93e59ebee5a6afe585bce5aabc',
    newText: "'\u5df2\u5165\u5e93'",  // 已入库
  },
  // raw-inboundCancel:21, 50  '鐎瑰憡褰冭ぐ鍥р槈' -> '已取消'
  {
    file: 'd:/校服小程序0/cloudfunctions/raw-inboundCancel/index.js',
    oldHex: 'e9908ee791b0e686a1e8a4b0e586ade38190e98da5d180e6a788',
    newText: "'\u5df2\u53d6\u6d88'",  // 已取消
    replaceCount: 2,
  },
];

for (const fix of fixes) {
  const files = fix.files || [fix.file];
  for (const f of files) {
    const buf = fs.readFileSync(f);
    const oldBytes = Buffer.from(fix.oldHex, 'hex');
    const newBytes = Buffer.from(fix.newText, 'utf8');
    let idx = buf.indexOf(oldBytes);
    let replaced = 0;
    while (idx >= 0) {
      const before = buf.subarray(0, idx);
      const after = buf.subarray(idx + oldBytes.length);
      fs.writeFileSync(f, Buffer.concat([before, newBytes, after]));
      const buf2 = fs.readFileSync(f);
      idx = buf2.indexOf(oldBytes);
      replaced++;
      if (fix.replaceCount && replaced >= fix.replaceCount) break;
    }
    console.log(`OK ${f} (${replaced} 处)`);
  }
}
console.log('Done');
