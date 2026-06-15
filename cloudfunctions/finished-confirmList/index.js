const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 成品 - 待确认列表（默认只查"待确认"）
 * 4.4.1 车间订单确认页面调用
 */
exports.main = async (event, context) => {
  const db = cloud.database();
  // 不传 status 时默认只显示"待确认"（排除已入库/有问题的历史记录）
  const { page = 1, pageSize = 20, status = '待确认' } = event;

  try {
    const where = {};
    if (status) where.status = status;

    const res = await db.collection('finished_product_confirm')
      .where(where)
      .orderBy('created_at', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get();

    const countRes = await db.collection('finished_product_confirm').where(where).count();

    return {
      success: true,
      data: { list: res.data, total: countRes.total, page, pageSize },
    };
  } catch (e) {
    console.error('成品待确认列表查询失败:', e);
    return { success: false, error: e.message || '查询失败' };
  }
};
