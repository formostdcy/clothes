const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 供应商管理 - 新增
 */

/**
 * 服务端校验电话格式（同时支持手机号、座机、400/800）
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
  const { name, contact_name, contact_phone } = event;

  if (!name || !String(name).trim()) {
    return { success: false, error: '请填写供应商名称' };
  }
  if (contact_phone && !isValidPhone(contact_phone)) {
    return { success: false, error: '电话格式不正确' };
  }

  try {
    const res = await db.collection('supplier').add({
      data: {
        name: name.trim(),
        contact_name: contact_name || '',
        contact_phone: contact_phone || '',
        created_at: db.serverDate(),
        updated_at: db.serverDate(),
      },
    });
    return { success: true, data: { _id: res._id } };
  } catch (e) {
    console.error('新增供应商失败', e);
    return { success: false, error: '新增失败' };
  }
};
