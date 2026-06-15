const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 閫氱煡 - 鏈鏁伴噺
 */

exports.main = async (event, context) => {
  const db = cloud.database();
  const { user_id = '', role = '' } = event;

  try {
    const res = await db.collection('notification') .where(
        db.command.and(
          db.command.or(
            { receiver_id: user_id },
            { role }
          ),
          { is_read: 0 }
        )
      )
      .count();

    return { success: true, data: { count: res.total } };
  } catch (e) {
    console.error('鏈鏁伴噺鏌ヨ澶辫触:', e);
    return { success: false, error: '鏌ヨ澶辫触' };
  }
};
