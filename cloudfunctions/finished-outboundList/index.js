const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 成品 - 出库记录列表（支持目的地 + 时间范围筛选）
 */
exports.main = async (event, context) => {
  const db = cloud.database();
  const { page = 1, pageSize = 20, status, keyword, destination, startDate, endDate } = event;

  try {
    let where = {};
    if (status) where.status = status;
    if (keyword) {
      where.order_no = db.RegExp({ regexp: keyword, options: 'i' });
    }
    if (destination) {
      where.destination = destination;
    }
    if (startDate || endDate) {
      where.created_at = {};
      if (startDate) {
        // startDate 是 YYYY-MM-DD，转当天 00:00:00
        const start = new Date(startDate + 'T00:00:00+08:00');
        where.created_at.$gte = start;
      }
      if (endDate) {
        // endDate 是 YYYY-MM-DD，转当天 23:59:59
        const end = new Date(endDate + 'T23:59:59+08:00');
        where.created_at.$lte = end;
      }
    }

    const res = await db.collection('finished_outbound_order')
      .where(where)
      .orderBy('created_at', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get();

    const countRes = await db.collection('finished_outbound_order').where(where).count();

    return {
      success: true,
      data: { list: res.data, total: countRes.total, page, pageSize },
    };
  } catch (e) {
    console.error('成品出库记录查询失败:', e);
    return { success: false, error: e.message || '查询失败' };
  }
};
