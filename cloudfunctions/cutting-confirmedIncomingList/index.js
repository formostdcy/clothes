const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 裁剪 - 裁剪下单时获取已确认的裁剪原料列表
 * 关键：返回的 material_details[i].stock 字段为剩余可用量（remaining || quantity）
 * 这样前端可以按"剩余库存"做使用量校验，避免多次使用同一来料时超扣
 */
exports.main = async (event, context) => {
  const db = cloud.database();
  try {
    const res = await db.collection('cutting_incoming_confirm').where({ status: '已确认' })
      .orderBy('created_at', 'desc')
      .limit(50)
      .get();
    const data = (res.data || []).map(item => {
      const details = item.material_details || [];
      // 关键：把 remaining（或 quantity）转成 stock 给前端
      const material_details = details.length > 0
        ? details.map(d => ({
            ...d,
            // 剩余量：优先用 remaining，没有则用 quantity（兼容老数据）
            stock: (d.remaining != null) ? d.remaining : (d.quantity || 0),
          }))
        : undefined;
      return {
        ...item,
        // 老结构兼容（部分记录可能没有 material_details）
        material_details,
        // 顶层 stock 也保留（兼容只有单物料的旧数据）
        stock: material_details && material_details.length > 0
          ? material_details[0].stock
          : (item.quantity || 0),
      };
    });
    return { success: true, data };
  } catch (e) {
    console.error('裁剪已确认原料列表查询失败:', e);
    return { success: false, error: '查询失败' };
  }
};
