const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 鍘熸潗鏂?- 搴撳瓨鎬婚噺缁熻
 */

exports.main = async (event, context) => {
  const db = cloud.database();

  try {
    const res = await db.collection('raw_material_stock').get();

    // 鎸変竴绾у垎绫荤粺璁?    const byCategory = {};
    let total = 0;
    for (const item of res.data) {
      const cat = item.category_one || '鍏朵粬';
      if (!byCategory[cat]) byCategory[cat] = 0;
      byCategory[cat] += item.total_quantity || 0;
      total += item.total_quantity || 0;
    }

    return { success: true, data: { total, byCategory } };
  } catch (e) {
    console.error('搴撳瓨鎬婚噺鏌ヨ澶辫触:', e);
    return { success: false, error: '鏌ヨ澶辫触' };
  }
};
