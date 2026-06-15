const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 员工 - 员工详情
 * 参数: { id }
 * 返回: { data: { ...employee } }
 */
exports.main = async (event, context) => {
  const db = cloud.database();
  const { id } = event;
  if (!id) return { success: false, error: '参数错误' };
  try {
    const res = await db.collection('employee').doc(id).get();
    return { success: true, data: res.data };
  } catch (e) {
    console.error('员工详情查询失败:', e);
    return { success: false, error: '查询失败' };
  }
};
