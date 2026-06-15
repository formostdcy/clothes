const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 字典项 - 新增或更新
 *
 * 入参：{ _id?, name, value?, category_one?, type, sort? }
 * - 有 _id：update
 * - 无 _id：add（type 必填）
 *
 * 同一 type 下 name 不能重复
 */

const VALID_TYPES = ['school', 'category_two', 'size', 'style', 'workshop', 'destination', 'gender', 'season'];

exports.main = async (event, context) => {
  const db = cloud.database();
  const { _id, name, value, category_one, type, sort } = event;

  if (!name || !String(name).trim()) {
    return { success: false, error: '请填写选项名称' };
  }
  if (name.length > 30) {
    return { success: false, error: '选项名称不超过 30 字' };
  }
  if (!_id && !type) {
    return { success: false, error: '请选择选项类型' };
  }
  if (type && !VALID_TYPES.includes(type)) {
    return { success: false, error: '选项类型不合法' };
  }
  if (value && String(value).length > 50) {
    return { success: false, error: '选项值不超过 50 字' };
  }

  const data = {
    name: String(name).trim(),
    value: (value || '').toString().trim(),
    sort: parseInt(sort) || 0,
    updated_at: db.serverDate(),
  };
  if (category_one) data.category_one = category_one;
  if (type) data.type = type;

  try {
    // 同 type + 同 name 不能重复
    if (type) {
      const existRes = await db.collection('system_option')
        .where({ type, name: data.name })
        .limit(1)
        .get();
      if (existRes.data.length > 0 && existRes.data[0]._id !== _id) {
        return { success: false, error: '该类型下已存在同名选项' };
      }
    }

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
