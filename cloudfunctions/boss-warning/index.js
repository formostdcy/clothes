const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 鑰佹澘 - 搴撳瓨棰勮鍒楄〃
 * 瀹氭椂浠诲姟瑙﹀彂锛屾壂鎻忔墍鏈夊師鏉愭枡搴撳瓨
 */

exports.main = async (event, context) => {
  const db = cloud.database();

  try {
    const res = await db.collection('raw_material_stock') .where({
        total_quantity: db.command.lte(db.command.expr('$warning_threshold')),
        warning_threshold: db.command.gt(0),
      })
      .get();

    return { success: true, data: res.data };
  } catch (e) {
    console.error('搴撳瓨棰勮鏌ヨ澶辫触:', e);
    return { success: false, error: '鏌ヨ澶辫触' };
  }
};
