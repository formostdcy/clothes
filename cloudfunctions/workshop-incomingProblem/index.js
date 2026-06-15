const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 鏉烇箓妫� - 閸欏秹顩梻顕€顣介敍鍫モ偓姘辩叀閸樼喐娼楅弬娆戭吀閻炲棗鎲抽敍? */

exports.main = async (event, context) => {
  const db = cloud.database();
  const { _id, problem_desc } = event;

  if (!_id) return { success: false, error: 'ID不能为空' };
  if (!problem_desc || !problem_desc.trim()) return { success: false, error: '问题描述不能为空' };
  const trimmedDesc = problem_desc.trim();

  try {
    await db.collection('workshop_incoming_confirm').doc(_id).update({
      data: {
        status: '有问题',
        problem_desc: trimmedDesc,
        updated_at: db.serverDate(),
      },
    });

    await db.collection('notification').add({
      data: {
        receiver_id: null,
        role: '车间管理员',
        type: 'workshop_problem',
        title: '原料入库有问题',
        content: `原料入库存在问题：${trimmedDesc}`,
        related_order_id: _id,
        is_read: 0,
        created_at: db.serverDate(),
      },
    });

    return { success: true };
  } catch (e) {
    console.error('原料入库问题反馈失败:', e);
    return { success: false, error: '操作失败' };
  }
};
