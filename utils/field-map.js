// utils/field-map.js - 字段映射工具
// 将后端下划线字段映射为前端驼峰字段，仅作展示层适配，不改业务
// 不修改任何数据规则、计算逻辑与状态机

function safe(obj, path, fallback) {
  if (!obj) return fallback;
  const keys = path.split('.');
  let cur = obj;
  for (const k of keys) {
    if (cur == null) return fallback;
    cur = cur[k];
  }
  return (cur === undefined || cur === null) ? fallback : cur;
}

function mapCuttingIncoming(item) {
  if (!item) return item;
  return {
    ...item,
    id: item._id,
    // 改：cutting_incoming_confirm 表的入库单号字段是 order_no
    incomingNo: item.order_no || '',
    supplierName: item.supplier_name || '',
    creatorName: item.creator_name || '',
    materialName: safe(item, 'material_details.0.category_two', ''),
    materialSpec: safe(item, 'material_details.0.spec', ''),
    quantity: safe(item, 'material_details.0.quantity', 0),
    unit: safe(item, 'material_details.0.unit', ''),
    photos: item.photos || [],
    remark: item.remark || '',
    createTime: item.created_at || '',
  };
}

function mapCuttingIncomingDetail(item) {
  if (!item) return item;
  return {
    ...item,
    incomingNo: item.outbound_order_id || item.order_no || '',
    supplierName: item.supplier_name || '',
    materialName: safe(item, 'material_details.0.category_two', ''),
    spec: safe(item, 'material_details.0.spec', ''),
    quantity: safe(item, 'material_details.0.quantity', 0),
    unit: safe(item, 'material_details.0.unit', ''),
    incomingTime: item.created_at || '',
    statusText: item.status || '',
    statusClass: statusToClass(item.status),
    remark: item.remark || '',
  };
}

function mapWorkshopIncoming(item) {
  if (!item) return item;
  return {
    ...item,
    id: item._id,
    incomingNo: item.order_no || '',
    creatorName: item.creator_name || '',
    materialName: safe(item, 'material_details.0.category_two', ''),
    materialSpec: safe(item, 'material_details.0.spec', ''),
    quantity: safe(item, 'material_details.0.quantity', 0),
    unit: safe(item, 'material_details.0.unit', ''),
    photos: item.photos || [],
    remark: item.remark || '',
    createTime: item.created_at || '',
  };
}

function mapWorkshopPending(item) {
  if (!item) return item;
  // workshop_order_confirm 集合
  const planDetails = item.plan_clothes_detail || [];
  // 尺码明细（按尺码分组的件数）
  const sizeDetail = planDetails
    .filter(p => p && (p.size || p.count))
    .map(p => ({ size: p.size || '', count: Number(p.count) || 0 }));
  // 取首条作为款式/性别/学校的展示值（若多款式，这里只展示首个）
  const first = planDetails[0] || {};
  return {
    ...item,
    id: item._id,
    orderNo: item.order_no || '',
    materialName: safe(item, 'plan_clothes_detail.0.category_two', '') || item.category_two || '',
    planCount: planDetails.reduce((s, p) => s + (Number(p.count) || 0), 0),
    planSizes: sizeDetail,                                          // 尺码明细数组
    sizeText: sizeDetail.map(s => `${s.size}×${s.count}`).join(' / ') || '—', // 兜底字符串
    creatorName: item.creator_name || item.source_admin_name || '', // 来源裁剪管理员姓名
    gender: first.gender || item.gender || '',                      // 性别
    style: first.style || item.style || '',                          // 款式
    season: first.season || item.season || '',                       // 季节
    school: first.school || item.school || '',                      // 学校
    sourceText: item.source_type === 'cutting' ? '裁剪单' : item.source_type === 'workshop' ? '加工单' : (item.source_type || ''),
    createTime: item.created_at || '',
  };
}

function mapCuttingOrder(item) {
  if (!item) return item;
  const plan = (item.plan_clothes_detail && item.plan_clothes_detail[0]) || {};
  // 汇总总件数
  const totalCount = (item.plan_clothes_detail || []).reduce((s, p) => s + (Number(p.count) || 0), 0);
  // 尺码明细（按尺码分组的件数），与待加工确认一致
  const planDetails = item.plan_clothes_detail || [];
  const planSizes = planDetails
    .filter(p => p && (p.size || p.count))
    .map(p => ({ size: p.size || '', count: Number(p.count) || 0 }));
  // 尺码汇总（去重）保留原 sizeText 兜底
  const sizes = Array.from(new Set(planDetails.map(p => p.size).filter(Boolean)));
  return {
    ...item,
    id: item._id,
    orderNo: item.order_no || '',
    materialName: safe(item, 'material_actual_usage.0.category_two', '') || item.category_two || '',
    workshopName: item.target_workshop_name || item.target_workshop || '',
    planCount: totalCount,
    planSizes,                                  // 尺码明细数组（chip 用）
    sizeText: sizes.join('/') || '—',
    school: plan.school || '',
    style: plan.style || '',
    season: plan.season || '',
    gender: plan.gender || '',
    remark: item.remark || '',
    statusText: item.status || '',
    statusClass: statusToClass(item.status),
    createTime: item.created_at || '',
  };
}

function mapProcessingOrder(item) {
  if (!item) return item;
  // 计划/实际/损耗/辅料汇总
  const planCount = (item.plan_quantity || []).reduce((s, p) => s + (Number(p.count) || 0), 0);
  const actualCount = (item.actual_quantity || []).reduce((s, a) => s + (Number(a.count) || 0), 0);
  const lossRateVal = planCount > 0 ? +(((planCount - actualCount) / planCount * 100).toFixed(2)) : 0;
  // 尺码明细：[{ size, count }] - 与 pending 一致，前端可渲染成 chip
  const planSizes = (item.plan_quantity || []).map(p => ({
    size: p.size || '',
    count: Number(p.count) || 0
  })).filter(p => p.size);
  return {
    ...item,
    id: item._id,
    orderNo: item.order_no || '',
    materialName: safe(item, 'actual_quantity.0.category_two', '') || item.category_two || '',
    planCount,
    actualCount,
    planSizes,
    lossRate: lossRateVal,
    lossRateText: lossRateVal.toFixed(2) + '%',
    sourceOrderNo: item.source_order_no || '',                  // 来源裁剪单号
    targetWorkshopName: item.target_workshop_name || '',          // 目标工厂（车间）
    sourceText: item.source_type === 'cutting' ? '裁剪单' : item.source_type === 'workshop' ? '加工单' : (item.source_type || ''),
    statusText: item.status || '',
    statusClass: statusToClass(item.status),
    createTime: item.created_at || '',
  };
}

function mapFinishedConfirm(item) {
  if (!item) return item;
  // 实际件数 = actual_quantity[].count 求和
  const actualCount = (item.actual_quantity || []).reduce(
    (s, a) => s + (Number(a.count) || 0), 0
  );
  // 计划件数 = plan_quantity[].count 求和
  const planCount = (item.plan_quantity || []).reduce(
    (s, a) => s + (Number(a.count) || 0), 0
  );
  // 尺码明细（字符串）
  const sizeText = (item.actual_quantity || [])
    .filter(a => a && a.size)
    .map(a => `${a.size}×${Number(a.count) || 0}`)
    .join(' / ') || '';
  // 尺码明细（数组，用于 wxml 分行展示）
  const actualSizes = (item.actual_quantity || [])
    .filter(a => a && a.size)
    .map(a => ({ size: a.size, count: Number(a.count) || 0 }));
  // 损耗率明细
  const lossRate = (item.loss_rate || [])
    .filter(a => a && (a.size || a.value !== undefined))
    .map(a => a.size ? `${a.size} ${a.value || 0}%` : `${a.value || 0}%`)
    .join(' / ') || '';
  // 辅料使用明细
  const accessoryText = (item.accessory_usage || [])
    .filter(a => a && (a.name || a.category_two))
    .map(a => `${a.name || a.category_two}×${a.value || 0}${a.unit || ''}`)
    .join(' / ') || '';
  // 物料名：从 actual_quantity 拿不到 category_two（加工单只存 size+count），
  // 改为拿 gender+style+season+school 拼接一个"成品概要"
  const productSummary = [item.gender, item.style, item.season].filter(Boolean).join('-') || '';
  // 状态文案
  const statusText = ({
    '待确认': '待确认',
    '已入库': '已入库',
    '有问题': '有问题',
  })[item.status] || item.status || '';
  return {
    ...item,
    id: item._id,
    orderNo: item.order_no || item.processing_order_id || '',
    materialName: productSummary,
    count: actualCount,
    planCount,
    lossRate,
    sizeText,
    actualSizes,
    accessoryText,
    workshopAdminName: item.workshop_admin_name || '',
    school: item.school || '',
    gender: item.gender || '',
    style: item.style || '',
    season: item.season || '',
    sourceText: item.source_type === 'cutting' ? '裁剪单' : item.source_type === 'workshop' ? '加工单' : (item.source_type || ''),
    createTime: item.created_at || '',
    // 新增：状态、问题描述、确认时间（用于"已完成" Tab）
    status: item.status || '待确认',
    statusText,
    problemDesc: item.problem_desc || '',
    confirmTime: item.confirm_time || '',
  };
}

function mapFinishedOutbound(item) {
  if (!item) return item;
  return {
    ...item,
    id: item._id,
    outboundNo: item.order_no || '',
    productName: safe(item, 'outbound_details.0.product_name', '') || safe(item, 'outbound_details.0.category_two', ''),
    count: safe(item, 'outbound_details.0.quantity', 0),
    destinationName: item.destination || '',
    outboundTime: item.created_at || '',
    statusText: item.status || '',
    statusClass: statusToClass(item.status),
  };
}

function mapFinishedStock(item) {
  if (!item) return item;
  // 成品库存按 gender+style+season+school+size 五维分类
  // 拼一个"成品概要"作为主展示
  const productName = [item.gender, item.style, item.season].filter(Boolean).join('-') || '—';
  return {
    ...item,
    productName,
    schoolName: item.school || '',
    styleName: item.style || '',
    seasonName: item.season || '',
    genderName: item.gender || '',
    sizeName: item.size || '',
    stock: item.quantity || 0,
  };
}

function mapIndexTodo(item) {
  if (!item) return item;
  return {
    ...item,
    time: item.created_at || '',
  };
}

function mapNotification(item) {
  if (!item) return item;
  return {
    ...item,
    time: item.created_at || '',
  };
}

function mapBossOrder(item) {
  if (!item) return item;
  // 订单记录页面字段已是下划线（WXML 已对齐）
  return item;
}

// 裁剪加工单详情（WXML 使用 orderNo/createdAt/...）
function mapOrderDetail(item) {
  if (!item) return item;
  return {
    ...item,
    orderNo: item.order_no || '',
    createTime: item.created_at || '',
    statusText: item.status || '',
    materialName: safe(item, 'material_actual_usage.0.category_two', '') || item.category_two || '',
    planCount: safe(item, 'plan_clothes_detail.0.count', 0),
    items: [
      {
        name: safe(item, 'material_actual_usage.0.category_two', '') || item.category_two || '',
        spec: safe(item, 'material_actual_usage.0.spec', ''),
        count: safe(item, 'plan_clothes_detail.0.count', 0),
      },
    ],
  };
}

// 车间加工单（workshop-processingAdd 的源数据）
function mapProcessingSource(item) {
  if (!item) return item;
  const planDetails = item.plan_clothes_detail || [];
  // 尺码明细（按尺码分组的件数）—— 实际件数填报的依据
  const sizeDetail = planDetails
    .filter(p => p && (p.size || p.count))
    .map(p => ({ size: p.size || '', count: Number(p.count) || 0 }));
  const first = planDetails[0] || {};
  return {
    ...item,
    id: item._id,
    orderNo: item.order_no || '',
    materialName: safe(item, 'plan_clothes_detail.0.category_two', '') || item.category_two || '',
    planCount: planDetails.reduce((s, p) => s + (Number(p.count) || 0), 0),
    planSizes: sizeDetail,                                       // 尺码明细
    sizeText: sizeDetail.map(s => `${s.size}×${s.count}`).join(' / ') || '—',
    gender: first.gender || item.gender || '',
    style: first.style || item.style || '',
    season: first.season || item.season || '',
    school: first.school || item.school || '',
  };
}

// 成品出库可用的加工单（含 availableCount 兜底）
function mapAvailableProcessing(item) {
  if (!item) return item;
  // 实际字段是 count（不是 quantity），加工单 actual_quantity[] 元素是 { size, count, category_two }
  const count = safe(item, 'actual_quantity.0.count', 0);
  return {
    ...item,
    id: item._id,
    orderNo: item.order_no || (item._id ? String(item._id).slice(-6) : ''),
    productName: safe(item, 'actual_quantity.0.category_two', '') || item.category_two || '',
    availableCount: typeof item.availableCount === 'number' ? item.availableCount : count,
    gender: item.gender || '',
    style: item.style || '',
    season: item.season || '',
    school: item.school || '',
    size: item.size || safe(item, 'actual_quantity.0.size', ''),
  };
}

// 原材料入库单
function mapRawInbound(item) {
  if (!item) return item;
  return {
    ...item,
    orderNo: item.order_no || '',
    createTime: item.created_at || '',
  };
}

// 原材料出库单
function mapRawOutbound(item) {
  if (!item) return item;
  return {
    ...item,
    orderNo: item.order_no || '',
    createTime: item.created_at || '',
  };
}

// 原材料库存
function mapRawStock(item) {
  if (!item) return item;
  return {
    ...item,
    productName: item.category_two || '',
    stock: item.total_quantity || 0,
  };
}

// 状态文本 -> 状态样式 class（WXSS 不支持中文类名，故统一转英文）
const STATUS_CLASS_MAP = {
  '已完成': 'done',
  '已加工': 'done',
  '已出库': 'out',
  '已入库': 'in',
  '已确认': 'confirmed',
  '已裁剪': 'cut',
  '已退回': 'returned',
  '有问题': 'issue',
  '已取消': 'canceled',
  '待出库': 'pending-out',
  '待确认': 'pending-confirm',
};

function statusToClass(status) {
  if (!status) return '';
  return STATUS_CLASS_MAP[status] || '';
}

module.exports = {
  safe,
  statusToClass,
  STATUS_CLASS_MAP,
  mapCuttingIncoming,
  mapCuttingIncomingDetail,
  mapWorkshopIncoming,
  mapWorkshopPending,
  mapCuttingOrder,
  mapProcessingOrder,
  mapFinishedConfirm,
  mapFinishedOutbound,
  mapFinishedStock,
  mapIndexTodo,
  mapNotification,
  mapBossOrder,
  mapOrderDetail,
  mapProcessingSource,
  mapAvailableProcessing,
  mapRawInbound,
  mapRawOutbound,
  mapRawStock,
};
