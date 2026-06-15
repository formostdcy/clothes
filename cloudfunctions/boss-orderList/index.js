const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 閼颁焦婢� - 閸忋劍膩閸ф顓归崡鏇熺叀鐠�? */

exports.main = async (event, context) => {
  const db = cloud.database();
  const { page = 1, pageSize = 20, module = '', status = '', keyword = '' } = event;

  try {
    let list = [];
    let total = 0;

    // 閺嶈宓佸Ο鈥虫健閺屻儴顕楃€电懓绨查梿鍡楁値
    const collections = {
      'raw_inbound': { col: 'raw_inbound_order', order_no_prefix: 'RK' },
      'raw_outbound': { col: 'raw_outbound_order', order_no_prefix: 'CK' },
      'cutting': { col: 'cutting_order', order_no_prefix: 'CJ' },
      'processing': { col: 'processing_order', order_no_prefix: 'JG' },
      'finished_outbound': { col: 'finished_outbound_order', order_no_prefix: 'CC' },
    };

    if (module && collections[module]) {
      const { col } = collections[module];
      let where = {};
      if (status) where.status = status;
      if (keyword) where.order_no = db.RegExp({ regexp: keyword, options: 'i' });

      const res = await db.collection(col)
        .where(where)
        .orderBy('created_at', 'desc')
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .get();

      const countRes = await db.collection(col).where(where).count();
      list = res.data;
      total = countRes.total;
    } else {
      // 閸忋劍膩閸ф鐓＄拠顫窗閸欐牕鎮囧Ο鈥虫健閺堚偓閺傛媽顔囪ぐ?
      const rawInbound = await db.collection('raw_inbound_order')
        .orderBy('created_at', 'desc').limit(5).get();
      const rawOutbound = await db.collection('raw_outbound_order') .orderBy('created_at', 'desc').limit(5).get();
      const cutting = await db.collection('cutting_order') .orderBy('created_at', 'desc').limit(5).get();
      const processing = await db.collection('processing_order') .orderBy('created_at', 'desc').limit(5).get();
      const finished = await db.collection('finished_outbound_order') .orderBy('created_at', 'desc').limit(5).get();

      // 閸氬牆鑻熼獮鑸靛瘻閺冨爼妫块幒鎺戠碍
      list = [...rawInbound.data, ...rawOutbound.data, ...cutting.data, ...processing.data, ...finished.data]
        .sort((a, b) => {
          const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
          const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
          return tb - ta;
        })
        .slice((page - 1) * pageSize, page * pageSize);

      total = rawInbound.data.length + rawOutbound.data.length + cutting.data.length +
              processing.data.length + finished.data.length;
    }

    return { success: true, data: { list, total, page, pageSize } };
  } catch (e) {
    console.error('鐠併垹宕熼弻銉嚄婢惰精瑙�:', e);
    return { success: false, error: '閺屻儴顕楁径杈Е' };
  }
};
