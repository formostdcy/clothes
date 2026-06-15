const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 裁剪 - 来料确认列表
 *
 * 集合：cutting_incoming_confirm
 * 关键字段：
 *   - order_no           入库单号（IN-xxx）
 *   - source_order_id    出库单 _id
 *   - source_type        raw_outbound
 *   - creator_name       出库人
 *   - photos             出库照片
 *   - remark             备注
 *   - material_details   物料数组
 *   - status             待确认 / 已确认 / 有问题
 */

exports.main = async (event, context) => {
  const db = cloud.database();
  const { page = 1, pageSize = 20, status = '', keyword = '' } = event;

  try {
    let where = {};
    if (status) where.status = status;
    if (keyword) {
      // 改：数据库字段是 order_no，不是 outbound_order_id
      where.order_no = db.RegExp({ regexp: keyword, options: 'i' });
    }

    const res = await db.collection('cutting_incoming_confirm').where(where)
      .orderBy('created_at', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get();

    const countRes = await db.collection('cutting_incoming_confirm').where(where).count();

    return {
      success: true,
      data: { list: res.data, total: countRes.total, page, pageSize },
    };
  } catch (e) {
    console.error('裁剪来料确认列表查询失败:', e);
    return { success: false, error: '查询失败' };
  }
};
