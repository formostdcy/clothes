const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 鍘熸潗鏂?- 鍑哄簱鍗曞垪琛? */

exports.main = async (event, context) => {
  const db = cloud.database();
  const { page = 1, pageSize = 20, status = '', keyword = '' } = event;

  try {
    let where = { status: { $ne: -1 } };
    if (status) where.status = status;
    if (keyword) {
      where.order_no = db.RegExp({ regexp: keyword, options: 'i' });
    }

    const res = await db.collection('raw_outbound_order') .where(where)
      .orderBy('created_at', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get();

    const countRes = await db.collection('raw_outbound_order').where(where).count();

    return {
      success: true,
      data: { list: res.data, total: countRes.total, page, pageSize },
    };
  } catch (e) {
    console.error('鍑哄簱鍗曞垪琛ㄦ煡璇㈠け璐?', e);
    return { success: false, error: '鏌ヨ澶辫触' };
  }
};
