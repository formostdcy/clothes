const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 角色 - 角色列表
 * 返回: { data: [ { id, name } ] }
 */
exports.main = async (event, context) => {
  const db = cloud.database();
  try {
    const res = await db.collection('employee') .field({ role: true })
      .get();
    const set = new Set();
    res.data.forEach(e => e.role && set.add(e.role));
    const data = Array.from(set).map((name, idx) => ({ id: name, name }));
    return { success: true, data };
  } catch (e) {
    console.error('角色列表查询失败:', e);
    return { success: false, error: '查询失败' };
  }
};
