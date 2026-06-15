const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 渚涘簲鍟嗙鐞?- 鍒楄〃
 */

exports.main = async (event, context) => {
  const db = cloud.database();
  const { page = 1, pageSize = 20, keyword = '' } = event;

  try {
    let where = {};
    if (keyword) {
      where.name = db.RegExp({ regexp: keyword, options: 'i' });
    }

    const res = await db.collection('supplier') .where(where)
      .orderBy('created_at', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get();

    const countRes = await db.collection('supplier').where(where).count();

    return {
      success: true,
      data: {
        list: res.data,
        total: countRes.total,
      },
    };
  } catch (e) {
    console.error('渚涘簲鍟嗗垪琛ㄦ煡璇㈠け璐?', e);
    return { success: false, error: '鏌ヨ澶辫触' };
  }
};
