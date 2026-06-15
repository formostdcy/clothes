const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 车间列表 - 返回所有"车间管理员"账号
 * 用于成品库存的"车间"筛选项
 * 业务：成品库存按"从哪个车间发来"分类，所以筛选项就是车间管理员本人
 *
 * 返回: { success, data: [{ _id, name, account }] }
 */
exports.main = async (event, context) => {
  const db = cloud.database();
  try {
    const res = await db.collection('employee')
      .where({ role: '车间管理员' })
      .field({ _id: true, name: true, account: true })
      .orderBy('name', 'asc')
      .limit(200)
      .get();
    return { success: true, data: res.data || [] };
  } catch (e) {
    console.error('车间列表查询失败:', e);
    return { success: false, error: e.message || '查询失败' };
  }
};
