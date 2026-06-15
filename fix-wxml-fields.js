// 批量修改 WXML 字段名引用
// 后端实际字段 -> WXML 引用名
// 由于每个 WXML 引用模式可能不同，逐个文件做精准替换

const fs = require('fs');
const path = require('path');

function walk(p) {
  const out = [];
  for (const item of fs.readdirSync(p, { withFileTypes: true })) {
    const full = path.join(p, item.name);
    if (item.isDirectory()) out.push(...walk(full));
    else if (item.name === 'index.wxml') out.push(full);
  }
  return out;
}

const fixes = [
  // cutting/incoming/list/index.wxml
  {
    file: 'd:/校服小程序0/pages/cutting/incoming/list/index.wxml',
    replacements: [
      ['item.incomingNo', 'item.outbound_order_id'],
      ['item.materialName', 'item.category_two'],
      ['item.createTime', 'item.created_at'],
      // item.quantity 已经是 quantity
      // item.unit 已经是 unit
      // item.id -> item._id
      ['wx:key="id"', 'wx:key="_id"'],
      ['data-id="{{item.id}}"', 'data-id="{{item._id}}"'],
    ],
  },
  // cutting/record
  {
    file: 'd:/校服小程序0/pages/cutting/record/index.wxml',
    replacements: [
      ['item.orderNo', 'item.order_no'],
      ['item.materialName', 'item.target_workshop'],  // 显示目标车间
      ['item.workshopName', 'item.target_workshop'],
      ['item.createTime', 'item.created_at'],
      ['item.statusText', 'item.status'],
      ['item.planCount', '(item.plan_clothes_detail && item.plan_clothes_detail[0] && item.plan_clothes_detail[0].count) || 0'],
      ['wx:key="id"', 'wx:key="_id"'],
      ['data-id="{{item.id}}"', 'data-id="{{item._id}}"'],
    ],
  },
  // workshop/incoming/list
  {
    file: 'd:/校服小程序0/pages/workshop/incoming/list/index.wxml',
    replacements: [
      ['item.incomingNo', 'item.outbound_order_id'],
      ['item.materialName', 'item.category_two'],
      ['item.createTime', 'item.created_at'],
      ['wx:key="id"', 'wx:key="_id"'],
      ['data-id="{{item.id}}"', 'data-id="{{item._id}}"'],
    ],
  },
  // workshop/pending/list
  {
    file: 'd:/校服小程序0/pages/workshop/pending/list/index.wxml',
    replacements: [
      ['item.orderNo', 'item.order_no'],
      ['item.materialName', 'item.category_two'],
      ['item.createTime', 'item.created_at'],
      ['item.planCount', '(item.plan_clothes_detail && item.plan_clothes_detail[0] && item.plan_clothes_detail[0].count) || 0'],
      ['item.sourceText', '(item.source_type === "cutting" ? "裁剪单" : item.source_type === "workshop" ? "加工单" : (item.source_type || ""))'],
      ['wx:key="id"', 'wx:key="_id"'],
      ['data-id="{{item.id}}"', 'data-id="{{item._id}}"'],
    ],
  },
  // workshop/record
  {
    file: 'd:/校服小程序0/pages/workshop/record/index.wxml',
    replacements: [
      ['item.orderNo', 'item.order_no'],
      ['item.materialName', 'item.category_two'],
      ['item.createTime', 'item.created_at'],
      ['item.statusText', 'item.status'],
      ['item.actualCount', '(item.actual_quantity && item.actual_quantity[0] && item.actual_quantity[0].quantity) || 0'],
      ['item.sourceText', '(item.source_type === "cutting" ? "裁剪单" : item.source_type === "workshop" ? "加工单" : (item.source_type || ""))'],
      ['wx:key="id"', 'wx:key="_id"'],
      ['data-id="{{item.id}}"', 'data-id="{{item._id}}"'],
    ],
  },
  // finished/confirm/list
  {
    file: 'd:/校服小程序0/pages/finished/confirm/list/index.wxml',
    replacements: [
      ['item.orderNo', 'item.processing_order_id'],
      ['item.materialName', 'item.category_two'],
      ['item.createTime', 'item.created_at'],
      ['item.count', '(item.actual_quantity && item.actual_quantity[0] && item.actual_quantity[0].quantity) || 0'],
      ['item.sourceText', '(item.source_type === "cutting" ? "裁剪单" : item.source_type === "workshop" ? "加工单" : (item.source_type || ""))'],
      ['wx:key="id"', 'wx:key="_id"'],
      ['data-id="{{item.id}}"', 'data-id="{{item._id}}"'],
    ],
  },
  // finished/outbound/record
  {
    file: 'd:/校服小程序0/pages/finished/outbound/record/index.wxml',
    replacements: [
      ['item.outboundNo', 'item.order_no'],
      ['item.outboundTime', 'item.created_at'],
      ['item.statusText', 'item.status'],
      ['item.destinationName', 'item.destination'],
      ['item.productName', '(item.outbound_details && item.outbound_details[0] && (item.outbound_details[0].product_name || item.outbound_details[0].category_two)) || ""'],
      ['item.count', '(item.outbound_details && item.outbound_details[0] && item.outbound_details[0].quantity) || 0'],
      ['wx:key="id"', 'wx:key="_id"'],
      ['data-id="{{item.id}}"', 'data-id="{{item._id}}"'],
    ],
  },
  // finished/stock
  {
    file: 'd:/校服小程序0/pages/finished/stock/index.wxml',
    replacements: [
      ['item.productName', 'item.category_two'],
      ['item.schoolName', 'item.school'],
      ['item.styleName', 'item.style'],
      ['item.stock', 'item.quantity'],
      ['wx:key="id"', 'wx:key="_id"'],
    ],
  },
  // index (首页)
  {
    file: 'd:/校服小程序0/pages/index/index.wxml',
    replacements: [
      ['item.time', 'item.created_at'],
      ['wx:key="_id"', 'wx:key="_id"'],  // 已经是 _id
    ],
  },
  // notification/list
  {
    file: 'd:/校服小程序0/pages/notification/list/index.wxml',
    replacements: [
      ['item.time', 'item.created_at'],
    ],
  },
];

let count = 0;
for (const fix of fixes) {
  let text = fs.readFileSync(fix.file, 'utf8');
  let changed = false;
  for (const [oldS, newS] of fix.replacements) {
    if (text.includes(oldS)) {
      text = text.split(oldS).join(newS);
      changed = true;
    }
  }
  if (changed) {
    fs.writeFileSync(fix.file, text);
    count++;
    console.log('Fixed: ' + fix.file.replace('d:/校服小程序0/', ''));
  } else {
    console.log('NO CHANGES: ' + fix.file.replace('d:/校服小程序0/', ''));
  }
}
console.log(`\n共修改 ${count} 个文件`);
