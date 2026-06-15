const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 杞﹂棿 - 鏉ユ枡纭鍒楄〃锛堣矾寰凚锛? */

exports.main = async (event, context) => {
  const db = cloud.database();
  const { page = 1, pageSize = 20, status = '' } = event;

  try {
    let where = {};
    if (status) where.status = status;

    const res = await db.collection('workshop_incoming_confirm') .where(where)
      .orderBy('created_at', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get();

    const countRes = await db.collection('workshop_incoming_confirm').where(where).count();

    return {
      success: true,
      data: { list: res.data, total: countRes.total, page, pageSize },
    };
  } catch (e) {
    console.error('杞﹂棿鏉ユ枡鍒楄〃鏌ヨ澶辫触:', e);
    return { success: false, error: '鏌ヨ澶辫触' };
  }
};
