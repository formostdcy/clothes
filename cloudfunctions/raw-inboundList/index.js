const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 閸樼喐娼楅弬?- 閸忋儱绨遍崡鏇炲灙鐞�? */

exports.main = async (event, context) => {
  const db = cloud.database();
  const { page = 1, pageSize = 20, status = '', keyword = '' } = event;

  try {
    let where = { status: { $ne: -1 } };
    if (status) where.status = status;
    if (keyword) {
      where.order_no = db.RegExp({ regexp: keyword, options: 'i' });
    }

    const res = await db.collection('raw_inbound_order') .where(where)
      .orderBy('created_at', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get();

    const countRes = await db.collection('raw_inbound_order').where(where).count();

    // 鐞涖儱鍘栨笟娑樼安閸熷棗鎮曠粔?
    const list = await Promise.all(res.data.map(async (item) => {
      if (item.supplier_id) {
        try {
          const supplier = await db.collection('supplier').doc(item.supplier_id).get();
          item.supplier_name = supplier.data ? supplier.data.name : '';
        } catch (e) {
          item.supplier_name = '';
        }
      }
      return item;
    }));

    return {
      success: true,
      data: { list, total: countRes.total, page, pageSize },
    };
  } catch (e) {
    console.error('閸忋儱绨遍崡鏇炲灙鐞涖劍鐓＄拠銏犮亼鐠�?', e);
    return { success: false, error: '閺屻儴顕楁径杈Е' };
  }
};
