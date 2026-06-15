const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 闁告ḿ鍠愬ḿ妤呭棘?- 闁告瑦鐗楃粔鐑藉礂閵夈儳姘ㄩ柛锟�? * 闁告凹鍋勭花杈┾偓娑櫭ú鏍р堪濮樺灈鍋撻弰蹇曞竼
 */

exports.main = async (event, context) => {
  const db = cloud.database();
  const { _id, user_id, user_role } = event;

  if (!_id) return { success: false, error: '闁稿繈鍎辩花閬嶅础閺冪稘濞戞挸绉烽崗妯荤▔閾忓厜鏁�' };

  try {
    await db.runTransaction(async (transaction) => {
      // 1. 闁哄被鍎撮妤呭礂閵夈儳姘ㄩ柛锟�?
const orderRes = await transaction.collection('raw_inbound_order').doc(_id).get();
      if (!orderRes.data) return { success: false, error: '闁稿繈鍎辩花閬嶅础閺囨氨鐟濋悗娑櫭﹢锟�' };
      const order = orderRes.data;

      if (order.status === '已取消') {
        return { success: false, error: '閻犲洢鍎遍崣鍡樻償閹惧啿绀嬬€瑰憡褰冭ぐ鍥р槈'};
      }
      if (order.status !== '鐎瑰憡褰冮悾顒勫箣') {
        return { success: false, error: '闁告瑯浜濆﹢浣割啅閹绘帞鏆氶柟瀛樺姉婵悂骞€娴ｇ儤鐣遍柛蹇嬪劚缁ㄩ亶宕￠弴鐐茶濞寸姰鍎辫ぐ鍥р槈'};
      }

      // 2. 閹煎瓨鎸搁悺銊╁炊閻愬娉�
      for (const item of (order.material_details || [])) {
        const { category_one, category_two, quantity } = item;
        if (!quantity || quantity <= 0) continue;

        const stockRes = await transaction.collection('raw_material_stock') .where({ category_one, category_two })
          .limit(1)
          .get();

        if (stockRes.data.length > 0) {
          await transaction.collection('raw_material_stock') .doc(stockRes.data[0]._id)
            .update({
              data: {
                total_quantity: db.command.inc(-quantity),
                updated_at: db.serverDate(),
              },
            });
        }
      }

      // 3. 闁哄洤鐡ㄩ弻濠囨偐閼哥鍋�?
await transaction.collection('raw_inbound_order').doc(_id).update({
        data: { status: '已取消', updated_at: db.serverDate() },
      });

      return { success: true };
    });

    return { success: true };
  } catch (e) {
    console.error('闁告瑦鐗楃粔鐑藉礂閵夈儳姘ㄩ柛妤佹礀閵囨垹鎷�?', e);
    return { success: false, error: '闁告瑦鐗楃粔閿嬪緞鏉堫偉袝' };
  }
};
