const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 闁瑰瓨鍔曢幖锟� - 缁绢収鍠涢濠氬礂閵夈儳姘�
 * 闁圭ǹ顦伴埀顑啫鐒�+婵炲棙鍎崇槐锟�+閻庢冻闄勯悧锟�+閻忓繗娅ｉ悥婊呯磼閺夋垵顔婇柛蹇嬪劚缁ㄩ亶鏁嶇仦钘夋倯閻庡湱顢婇惌鎯ь嚗閸戯拷/閻犱警鍨扮欢婵�
 */

exports.main = async (event, context) => {
  const db = cloud.database();
  const { _id, finished_admin_id, actual_quantity } = event;

  if (!_id) return { success: false, error: 'ID濞戞挸绉烽崗妯荤▔閾忓厜鏁�' };

  try {
    await db.runTransaction(async (transaction) => {
      const confirmRes = await transaction.collection('finished_product_confirm').doc(_id).get();
      if (!confirmRes.data) throw new Error('缁绢収鍠涢濠氬础閺囨氨鐟濋悗娑櫭﹢锟�');
      const confirm = confirmRes.data;

      // 闁哄洤鐡ㄩ弻濠勬兜椤旀鍚囬柛妤佹礈婵悂骞€?
      await transaction.collection('finished_product_confirm').doc(_id)          .update({
            data: {
              status: '已入库',
              actual_quantity: actual_quantity || confirm.processing_order?.actual_quantity || [],
              confirm_time: db.serverDate(),
              updated_at: db.serverDate(),
            },
          });

      // 溯源：查加工单，取得车间管理员 ID（入库时记录来源，方便 4.4.2 按车间筛选库存）
      const processingRes = await transaction.collection('processing_order').doc(confirm.processing_order_id).get();
      const processing = processingRes.data || {};
      const workshopAdminId = processing.workshop_admin_id || '';

      const quantities = actual_quantity || processing.actual_quantity || [];

      // 闁瑰瓨鍔曢幖褎鎯旈幘宕囨憼缂侀硸鍨版慨锟�
      for (const item of quantities) {
        const { size, quantity } = item;
        if (!quantity || quantity <= 0) continue;

        // 闁哄被鍎撮妤呭及椤栨碍鍎婇悗娑櫭﹢顏嗘嫚椤ф┅U閹煎瓨鎸搁悺锟�
        const stockRes = await transaction.collection('finished_product_stock') .where({
            gender: processing.gender || '',
            style: processing.style || '',
            school: processing.school || '',
            size: size || '',
          })
          .limit(1)
          .get();

        if (stockRes.data.length > 0) {
          await transaction.collection('finished_product_stock') .doc(stockRes.data[0]._id)
            .update({
              data: {
                quantity: db.command.inc(quantity),
                workshop_admin_id: workshopAdminId,
                updated_at: db.serverDate(),
              },
            });
        } else {
          await transaction.collection('finished_product_stock').add({
            data: {
              gender: processing.gender || '',
              style: processing.style || '',
              school: processing.school || '',
              size: size || '',
              quantity,
              workshop_admin_id: workshopAdminId,
              updated_at: db.serverDate(),
            },
          });
        }
      }
    });

    return { success: true };
  } catch (e) {
    console.error('缁绢収鍠涢濠氬礂閵夈儳姘ㄥ鎯扮簿鐟欙拷:', e);
    return { success: false, error: e.message || '闁瑰灝绉崇紞鏃€寰勬潏顐バ�' };
  }
};
