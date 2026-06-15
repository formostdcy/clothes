const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 绯荤粺閫夐」 - 鍒犻櫎
 */

exports.main = async (event, context) => {
  const db = cloud.database();
  const { _id } = event;

  if (!_id) return { success: false, error: 'ID涓嶈兘涓虹┖' };

  try {
    await db.collection('system_option').doc(_id).remove();
    return { success: true };
  } catch (e) {
    console.error('鍒犻櫎閫夐」澶辫触:', e);
    return { success: false, error: '鍒犻櫎澶辫触' };
  }
};
