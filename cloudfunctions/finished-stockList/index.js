const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 成品 - 库存明细（多维筛选）
 * 支持按 gender/style/school/size/workshop_admin_id 筛选
 */
exports.main = async (event, context) => {
  const db = cloud.database();
  const { page = 1, pageSize = 50, gender, style, school, size, workshop_admin_id } = event;

  try {
    let where = {};
    if (gender) where.gender = gender;
    if (style) where.style = style;
    if (school) where.school = school;
    if (size) where.size = size;
    if (workshop_admin_id) {
      // 有车间筛选时，只查该车间的库存
      where.workshop_admin_id = workshop_admin_id;
    }
    // 注意：workshop_admin_id 为空时（"全部车间"），不设筛选条件，
    // 返回所有库存（含之前入库时未记录车间的历史数据）

    const res = await db.collection('finished_product_stock')
      .where(where)
      .orderBy('school', 'asc')
      .orderBy('style', 'asc')
      .orderBy('size', 'asc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get();

    const countRes = await db.collection('finished_product_stock').where(where).count();
    const totalQuantity = res.data.reduce((s, item) => s + (item.quantity || 0), 0);

    return {
      success: true,
      data: {
        list: res.data,
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
