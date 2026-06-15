const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 闂備礁鎲″玻鍧楀窗閹邦兗缂氭俊銈呮噹濡拷?- 闂佸湱鍘ч悺銊╁箰閹间焦鍋ら柕濞炬櫅缁€鍡樼節闂堟稒锛嶆繛鍏碱殜閺屾盯鏁撻敓锟`? * 闂備胶鍎甸崑鎾诲礉鐎ｎ剝濮虫い鎺嶈兌閳绘柨鈹戦悩鎻掝仼婵炲牏濞€閺屾盯骞樺畷鍥嗭絽顭跨憴鍕诞闁哄苯鐭佺粻娑㈠箻閸撲絿顓㈡⒑缁嬭法绠為柛搴ㄤ憾瀹曞綊宕归锝呭伎闁诲函缍嗘禍鐐差潩閵娾晜鍊垫繛鎴炵懕閸忣剛绱掓潏銊х疄妤犵偛顑夊浠嬪Ω閵夘喗顥滈梻鍌欑劍瑜板啰鎹㈤幇閭︽晪闂侇剙绉寸粈鍌炴煏婢跺牆鍔氶柛褍锕弻娑樷枎韫囨挾楠囬梺鍝勬閸犳牠鐛敓锟`? */

exports.main = async (event, context) => {
  const db = cloud.database();
  const { items, clear } = event; // items: [{category_one, category_two, total_quantity, unit, warning_threshold}]

  try {
    // 模式 1：传入 clear=true，清空所有库存
    if (clear === true) {
      const listRes = await db.collection('raw_material_stock').limit(1000).get();
      for (const item of listRes.data) {
        await db.collection('raw_material_stock').doc(item._id).update({
          data: { total_quantity: 0, updated_at: db.serverDate() }
        });
      }
      return { success: true, data: { cleared: listRes.data.length } };
    }

    // 模式 2：传入 items 数组，初始化/更新每条
    if (!items || items.length === 0) {
      return { success: false, error: '请传入 items 数组或 clear=true' };
    }

    await db.runTransaction(async (transaction) => {
      for (const item of items) {
        const { category_one, category_two, total_quantity, unit, warning_threshold } = item;

        const stockRes = await transaction.collection('raw_material_stock') .where({ category_one, category_two })
          .limit(1)
          .get();

        if (stockRes.data.length > 0) {
          await transaction.collection('raw_material_stock')
            .doc(stockRes.data[0]._id)
            .update({
              data: {
                total_quantity,
                unit: unit || (category_one === '布料' ? '米' : '个'),
                warning_threshold: warning_threshold || 0,
                updated_at: db.serverDate(),
              },
            });
        } else {
          await transaction.collection('raw_material_stock').add({
            data: {
              category_one,
              category_two,
              total_quantity,
              unit: unit || (category_one === '布料' ? '米' : '个'),
              warning_threshold: warning_threshold || 0,
              updated_at: db.serverDate(),
            },
          });
        }
      }
    });

    return { success: true };
  } catch (e) {
    console.error('原材料库存初始化失败:', e);
    return { success: false, error: e.message || '库存初始化失败' };
  }
};
