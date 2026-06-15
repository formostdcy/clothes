const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 閫氱煡 - 鏍囪宸茶
 */

exports.main = async (event, context) => {
  const db = cloud.database();
  const { _id } = event;

  if (!_id) return { success: false, error: '閫氱煡ID涓嶈兘涓虹┖' };

  try {
    await db.collection('notification').doc(_id).update({
      data: { is_read: 1 },
    });
    return { success: true };
  } catch (e) {
    console.error('鏍囪宸茶澶辫触:', e);
    return { success: false, error: '鎿嶄綔澶辫触' };
  }
};
