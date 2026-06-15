const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 供应商管理 - 编辑
 */

/**
 * 服务端校验电话格式（手机号 / 座机 / 400 / 800）
 */
function isValidPhone(phone) {
  if (!phone) return false;
  const s = String(phone).trim();
  if (/^1[3-9]\d{9}$/.test(s)) return true;
  if (/^0\d{2,3}-?\d{7,8}$/.test(s)) return true;
  if (/^400-?\d{3}-?\d{4}$/.test(s)) return true;
  if (/^800-?\d{3}-?\d{4}$/.test(s)) return true;
  return false;
}

exports.main = async (event, context) => {
  const db = cloud.database();
  const { _id, name, contact_name, contact_phone } = event;

  if (!_id) return { success: false, error: 'ID不能为空' };
  if (contact_phone && !isValidPhone(contact_phone)) {
    return { success: false, error: '电话格式不正确' };
  }

  try {
    const updateData = { updated_at: db.serverDate() };
    if (name) updateData.name = String(name).trim();
    if (contact_name !== undefined) updateData.contact_name = contact_name;
    if (contact_phone !== undefined) updateData.contact_phone = contact_phone;

    await db.collection('supplier').doc(_id).update({ data: updateData });
    return { success: true };
  } catch (e) {
    console.error('编辑供应商失败', e);
    return { success: false, error: '编辑失败' };
  }
};
