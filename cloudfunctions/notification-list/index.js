const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 閫氱煡 - 閫氱煡鍒楄〃
 */

exports.main = async (event, context) => {
  const db = cloud.database();
  const { page = 1, pageSize = 20, user_id = '', role = '' } = event;

  try {
    // 鏌ヨ鏉′欢锛氭帴鏀朵汉鍖归厤 鎴?瑙掕壊鍖归厤
    const res = await db.collection('notification') .where(
        db.command.or(
          { receiver_id: user_id },
          { role: role }
        )
      )
      .orderBy('created_at', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get();

    const countRes = await db.collection('notification') .where(
        db.command.or(
          { receiver_id: user_id },
          { role: role }
        )
      )
      .count();

    return {
      success: true,
      data: { list: res.data, total: countRes.total, page, pageSize },
    };
  } catch (e) {
    console.error('閫氱煡鍒楄〃鏌ヨ澶辫触:', e);
    return { success: false, error: '鏌ヨ澶辫触' };
  }
};
