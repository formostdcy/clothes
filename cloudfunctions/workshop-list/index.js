const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 裁剪 - 车间列表(供裁剪下拉选)
 * 返回: { data: [ { id, name } ] }
 */
exports.main = async (event, context) => {
  const db = cloud.database();
  try {
    const res = await db.collection('employee') .where({ role: '车间管理员', status: 1 })
      .field({ name: true })
      .get();
    const data = res.data.map(e => ({ _id: e._id, name: e.name }));
    return { success: true, data };
  } catch (e) {
    console.error('车间列表查询失败:', e);
    return { success: false, error: '查询失败' };
  }
};
