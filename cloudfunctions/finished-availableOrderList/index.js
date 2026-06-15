const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 成品 - 可出库的加工单列表
 * 返回: { data: [ ...processing_order status=已完成 ] }
 */
exports.main = async (event, context) => {
  const db = cloud.database();
  try {
    const res = await db.collection('processing_order') .where({ status: '已完成' })
      .orderBy('created_at', 'desc')
      .limit(50)
      .get();
    return { success: true, data: res.data };
  } catch (e) {
    console.error('成品-可出库列表查询失败:', e);
    return { success: false, error: '查询失败' };
  }
};
