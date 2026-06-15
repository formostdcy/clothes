const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 鍛樺伐绠＄悊 - 鍒犻櫎鍛樺伐锛堣蒋鍒犻櫎锛? */

exports.main = async (event, context) => {
  const db = cloud.database();
  const { _id } = event;

  if (!_id) {
    return { success: false, error: '鍛樺伐ID涓嶈兘涓虹┖' };
  }

  try {
    // 杞垹闄わ細鏇存柊鐘舵€佷负-1
    await db.collection('employee').doc(_id).update({
      data: {
        status: -1,
        updated_at: db.serverDate(),
      },
    });
    return { success: true };
  } catch (e) {
    console.error('鍒犻櫎鍛樺伐澶辫触:', e);
    return { success: false, error: '鍒犻櫎澶辫触' };
  }
};
