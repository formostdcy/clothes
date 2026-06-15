const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 闂佸憡岣块崰鎰缚濡ゅ懎妫�?- 闂佸憡鐟﹂悧妤冪矓閻戣棄绀勯柛婵嗗濮樸劑鏌涢敓锟�? * 闂佸憡鍑归崑鍕姳鏉堚斁鍋撳☉娅亜煤閺嵮€鍫慨妯虹亪閸嬫捇寮拌箛鏇炵
 */

exports.main = async (event, context) => {
  const db = cloud.database();
  const { _id } = event;

  if (!_id) return { success: false, error: '闂佸憡鍨甸幖顐よ姳闁秴纭€闁哄啰绋樻繛鎴炴尭缁夌兘宕楀Ο鑽も枖闁惧繐鍘滈弫锟�' };

  try {
    await db.runTransaction(async (transaction) => {
      const orderRes = await transaction.collection('raw_outbound_order').doc(_id).get();
      if (!orderRes.data) throw new Error('订单状态不正确，无法操作');
      const order = orderRes.data;

      if (order.status === '已取消') throw new Error('订单状态不正确，无法操作');
      if (order.status === '已出库') throw new Error('订单状态不正确，无法操作');

      // 闁圭厧鐡ㄩ幐鎼佹偤閵娾晛鐐婇柣鎰嚟濞夛拷
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
                total_quantity: db.command.inc(quantity),
                updated_at: db.serverDate(),
              },
            });
        }
      }

      await transaction.collection('raw_outbound_order').doc(_id).update({
        data: { status: '已取消', updated_at: db.serverDate() },
      });
    });

    return { success: true };
  } catch (e) {
    console.error('闂佸憡鐟﹂悧妤冪矓閻戣棄绀勯柛婵嗗濮樸劑鏌涘Δ浣圭闁靛洦鍨归幏锟�?', e);
    return { success: false, error: e.message || '闂佸憡鐟﹂悧妤冪矓闁垮绶為弶鍫亯琚�' };
  }
};
