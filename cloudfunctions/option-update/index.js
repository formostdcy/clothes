const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 字典项 - 新增或更新
 *
 * 入参：{ _id?, name, value?, category_one?, type, sort? }
 * - 有 _id：update
 * - 无 _id：add（type 必填）
 */
exports.main = async (event, context) => {
  const db = cloud.database();
  const { _id, name, value, category_one, type, sort } = event;

  if (!name || !name.trim()) {
    return { success: false, error: '请填写选项名称' };
  }

  const data = {
    name: name.trim(),
    value: (value || '').trim(),
    sort: parseInt(sort) || 0,
    updated_at: db.serverDate(),
  };
  if (category_one) data.category_one = category_one;
  if (type) data.type = type;

  try {
    if (_id) {
      // 更新
      await db.collection('system_option').doc(_id).update({ data });
      return { success: true, _id };
    } else {
      // 新增
      data.created_at = db.serverDate();
      const res = await db.collection('system_option').add({ data });
      return { success: true, _id: res._id };
    }
  } catch (e) {
    console.error('字典 upsert 失败:', e);
    return { success: false, error: '字典保存失败：' + e.message };
  }
};
