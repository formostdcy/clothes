const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 鏉烇箓妫� - 閸欏秹顩梻顕€顣介敍鍫モ偓姘辩叀閸樼喐娼楅弬娆戭吀閻炲棗鎲抽敍? */

exports.main = async (event, context) => {
  const db = cloud.database();
  const { _id, problem_desc } = event;

  if (!_id) return { success: false, error: 'ID娑撳秷鍏樻稉铏光敄' };
  if (!problem_desc) return { success: false, error: '闂傤噣顣介幓蹇氬牚娑撳秷鍏樻稉铏光敄' };

  try {
    await db.collection('workshop_incoming_confirm').doc(_id).update({
      data: {
        status: '有问题',
        problem_desc,
        updated_at: db.serverDate(),
      },
    });

    await db.collection('notification').add({
      data: {
        receiver_id: null,
        role: '车间管理员',
        type: 'workshop_problem',
        title: '鏉烇箓妫块弶銉︽灐閺堝妫舵０',
        content: `鏉烇箓妫跨粻锛勬倞閸涙ê寮芥＃鍫熸降閺傛瑦婀侀梻顕€顣介敍灞藉斧閸ョ媴绱�${problem_desc}`,
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
