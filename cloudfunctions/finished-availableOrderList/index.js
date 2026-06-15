const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 成品 - 可出库的加工单列表
 *
 * 返回: { data: [ ...processing_order status=已完成 且至少有一个尺码 count > 0 ] }
 *
 * 注意：云数据库的 where 没法直接表达 "actual_quantity[] 中至少有一个 count > 0"，
 * 所以先按 status 拉回来，在内存里再过滤一次。
 * limit 上限 50，避免一次拉太多。
 */
exports.main = async (event, context) => {
  const db = cloud.database();
  try {
    const res = await db.collection('processing_order')
      .where({ status: '已完成' })
      .orderBy('created_at', 'desc')
      .limit(100) // 拉多一点（最多 100），前端再分页或全显示
      .get();

    // 过滤：actual_quantity 至少有一个尺码 count > 0
    const filtered = (res.data || []).filter(item => {
      const aq = item && item.actual_quantity;
      if (!Array.isArray(aq) || aq.length === 0) return false;
      return aq.some(a => Number(a && a.count) > 0);
    });

    return { success: true, data: filtered };
  } catch (e) {
    console.error('成品-可出库列表查询失败:', e);
    return { success: false, error: '查询失败' };
  }
};
