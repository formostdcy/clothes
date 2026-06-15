const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 原材料 - 库存列表
 *
 * 关键修复：去掉 .orderBy('updated_at', 'desc')，避免没建索引时报错
 * 同时返回所有字段（含 _id、total_quantity、category_one/two、unit、warning_threshold）
 */

exports.main = async (event, context) => {
  const db = cloud.database();
  const { page = 1, pageSize = 50, category_one = '' } = event;

  try {
    let where = {};
    if (category_one) where.category_one = category_one;

    // 注意：不去 orderBy，避免没建索引时报错；pageSize 默认 50 满足辅料分类数量
    const res = await db.collection('raw_material_stock').where(where)
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get();

    const countRes = await db.collection('raw_material_stock').where(where).count();

    console.log('[raw-stockList] 查到记录数:', res.data.length, 'where:', JSON.stringify(where));

    return {
      success: true,
      data: { list: res.data, total: countRes.total, page, pageSize },
    };
  } catch (e) {
    console.error('[raw-stockList] 查询失败:', e);
    return { success: false, error: '查询失败' };
  }
};
