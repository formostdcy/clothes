const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 车间 - 已确认的来料列表(供车间添加成品)
 * 返回: { data: [ ...workshop_incoming_confirm status=已确认 ] }
 */
exports.main = async (event, context) => {
  const db = cloud.database();
  try {
    const res = await db.collection('workshop_incoming_confirm') .where({ status: '已确认' })
      .orderBy('created_at', 'desc')
      .limit(50)
      .get();
    return { success: true, data: res.data };
  } catch (e) {
    console.error('车间-已确认来料列表查询失败:', e);
    return { success: false, error: '查询失败' };
  }
};
