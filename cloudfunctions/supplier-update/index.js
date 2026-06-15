const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 渚涘簲鍟嗙鐞?- 缂栬緫
 */

exports.main = async (event, context) => {
  const db = cloud.database();
  const { _id, name, contact_name, contact_phone } = event;

  if (!_id) return { success: false, error: 'ID涓嶈兘涓虹┖' };

  try {
    const updateData = { updated_at: db.serverDate() };
    if (name) updateData.name = name.trim();
    if (contact_name !== undefined) updateData.contact_name = contact_name;
    if (contact_phone !== undefined) updateData.contact_phone = contact_phone;

    await db.collection('supplier').doc(_id).update({ data: updateData });
    return { success: true };
  } catch (e) {
    console.error('缂栬緫渚涘簲鍟嗗け璐?', e);
    return { success: false, error: '缂栬緫澶辫触' };
  }
};
