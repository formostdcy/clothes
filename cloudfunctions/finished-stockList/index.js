const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 成品 - 库存明细（多维筛选）
 * 支持按 gender/style/season/school/size/workshop_admin_id 筛选
 * SKU 五维：gender + style + season + school + size
 */
exports.main = async (event, context) => {
  const db = cloud.database();
  const { page = 1, pageSize = 50, gender, style, season, school, size, workshop_admin_id } = event;

  try {
    let where = {};
    if (gender) where.gender = gender;
    if (style)  where.style  = style;
    if (season) where.season = season;
    if (school) where.school = school;
    if (size)   where.size   = size;
    if (workshop_admin_id) {
      // 有车间筛选时，只查该车间的库存
      where.workshop_admin_id = workshop_admin_id;
    }
    // 注意：workshop_admin_id 为空时（"全部车间"），不设筛选条件，
    // 返回所有库存（含之前入库时未记录车间的历史数据）

    // 关键修复：orderBy 在没有对应索引时会失败，做 try-catch 兜底
    let res;
    try {
      res = await db.collection('finished_product_stock')
        .where(where)
        .orderBy('school', 'asc')
        .orderBy('style', 'asc')
        .orderBy('season', 'asc')
        .orderBy('size', 'asc')
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .get();
    } catch (orderErr) {
      // orderBy 失败（无索引）时回退到无排序查询
      console.warn('[finished-stockList] orderBy 失败，回退到无排序:', orderErr.message);
      res = await db.collection('finished_product_stock')
        .where(where)
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .get();
    }

    const countRes = await db.collection('finished_product_stock').where(where).count();
    const totalQuantity = (res.data || []).reduce((s, item) => s + (item.quantity || 0), 0);

    return {
      success: true,
      data: {
        list: res.data || [],
        total: countRes.total,
        totalQuantity,
        page,
        pageSize,
      },
    };
  } catch (e) {
    console.error('成品库存查询失败:', e);
    return { success: false, error: e.message || '查询失败' };
  }
};
