const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 鐟佷礁澹€ - 绾喛顓婚弶銉︽灐
 */

exports.main = async (event, context) => {
  const db = cloud.database();
  const { _id, cutting_admin_id } = event;

  if (!_id) return { success: false, error: 'ID娑撳秷鍏樻稉铏光敄' };

  try {
    await db.collection('cutting_incoming_confirm').doc(_id).update({
      data: {
        status: '已确认',
        confirm_time: db.serverDate(),
        updated_at: db.serverDate(),
      },
    });
    return { success: true };
  } catch (e) {
    console.error('绾喛顓婚弶銉︽灐婢惰精瑙�:', e);
    return { success: false, error: '閹垮秳缍旀径杈Е' };
  }
};
