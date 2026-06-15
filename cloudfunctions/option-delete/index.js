const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 系统选项 - 删除
 * 入参：{ _id }
 * 返回：{ success: true }
 */
exports.main = async (event, context) => {
  const db = cloud.database();
  const { _id } = event;

  if (!_id) {
    return { success: false, error: 'ID不能为空' };
  }

  try {
    // 删除前先确认存在
    const existRes = await db.collection('system_option').doc(_id).get();
    if (!existRes.data) {
      return { success: false, error: '选项不存在' };
    }
    await db.collection('system_option').doc(_id).remove();
    return { success: true };
  } catch (e) {
    console.error('删除选项失败:', e);
    return { success: false, error: '删除失败：' + e.message };
  }
};
