const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 车间 - 裁剪已确认订单列表(供车间下单选)
 * 返回: { data: [ ...cutting_order status=已裁剪 ] }
 */
exports.main = async (event, context) => {
  const db = cloud.database();
  try {
    const res = await db.collection('cutting_order') .where({ status: '已裁剪' })
      .orderBy('created_at', 'desc')
      .limit(50)
      .get();
    return { success: true, data: res.data };
  } catch (e) {
    console.error('车间-裁剪已确认列表查询失败:', e);
    return { success: false, error: '查询失败' };
  }
};
