const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 鐟佷礁澹€ - 閸欏秹顩梻顕€顣介敍鍫モ偓姘辩叀閸樼喐娼楅弬娆戭吀閻炲棗鎲抽敍? */

exports.main = async (event, context) => {
  const db = cloud.database();
  const { _id, problem_desc } = event;

  if (!_id) return { success: false, error: 'ID娑撳秷鍏樻稉铏光敄' };
  if (!problem_desc) return { success: false, error: '闂傤噣顣介幓蹇氬牚娑撳秷鍏樻稉铏光敄' };

  try {
    await db.collection('cutting_incoming_confirm').doc(_id).update({
      data: {
        status: '有问题',
        problem_desc,
        updated_at: db.serverDate(),
      },
    });

    // 閸掓稑缂撻柅姘辩叀鐠佹澘缍�
    await db.collection('notification').add({
      data: {
        receiver_id: null,
        role: '车间管理员',
        type: 'cutting_problem',
        title: '鐟佷礁澹€閺夈儲鏋￠張澶愭６妫�',
        content: `鐟佷礁澹€缁狅紕鎮婇崨妯哄冀妫ｅ牊娼甸弬娆愭箒闂傤噣顣介敍灞藉斧閸ョ媴绱�${problem_desc}`,
        related_order_id: _id,
        is_read: 0,
        created_at: db.serverDate(),
      },
    });

    return { success: true };
  } catch (e) {
    console.error('閸欏秹顩梻顕€顣芥径杈Е:', e);
    return { success: false, error: '閹垮秳缍旀径杈Е' };
  }
};
