const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 车间 - 确认加工裁剪单
 *
 * 关键修复：
 *   之前更新的是空的 workshop_order_confirm 集合。
 *   现在改为直接更新 cutting_order 集合：status '已确认' → '已裁剪'，
 *   并向裁剪管理员发通知。
 *
 * 入参：{ _id: cutting_order._id }
 */

exports.main = async (event, context) => {
  const db = cloud.database();
  const { _id } = event;
  if (!_id) return { success: false, error: 'ID不能为空' };

  try {
    const orderRes = await db.collection('cutting_order').doc(_id).get();
    if (!orderRes.data) return { success: false, error: '裁剪单不存在' };
    if (orderRes.data.status !== '已确认') {
      return { success: false, error: '当前状态非"已确认"，不可操作（当前：' + orderRes.data.status + '）' };
    }

    // 推进 cutting_order.status
    await db.collection('cutting_order').doc(_id).update({
      data: {
        status: '已裁剪',
        workshop_confirm_time: db.serverDate(),
        updated_at: db.serverDate(),
      },
    });

    // 通知裁剪管理员
    try {
      await db.collection('notification').add({
        data: {
          receiver_id: null,
          role: '裁剪管理员',
          type: 'workshop_confirmed',
          title: '车间已确认裁剪单',
          content: `车间已确认裁剪单（${orderRes.data.order_no || ''}），请后续跟进`,
          related_order_id: _id,
          is_read: 0,
          created_at: db.serverDate(),
        },
      });
    } catch (notifErr) {
      console.error('确认通知失败:', notifErr);
    }

    return { success: true };
  } catch (e) {
    console.error('车间确认裁剪单失败:', e);
    return { success: false, error: '操作失败' };
  }
};
