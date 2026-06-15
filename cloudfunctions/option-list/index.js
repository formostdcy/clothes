const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 绯荤粺閫夐」 - 鍒楄〃
 */

exports.main = async (event, context) => {
  const db = cloud.database();
  const { type = '' } = event;

  try {
    let where = {};
    if (type) where.type = type;

    const res = await db.collection('system_option') .where(where)
      .orderBy('created_at', 'asc')
      .get();

    return { success: true, data: res.data };
  } catch (e) {
    console.error('閫夐」鍒楄〃鏌ヨ澶辫触:', e);
    return { success: false, error: '鏌ヨ澶辫触' };
  }
};
