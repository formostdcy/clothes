const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 车间 - 退回裁剪单
 *
 * 关键修复：
 *   退回时把 cutting_order.status 退回"已确认"，
 *   并给裁剪管理员发通知。
 *
 * 入参：{ _id: cutting_order._id, return_reason: 退回原因 }
 */

exports.main = async (event, context) => {
  const db = cloud.database();
  const { _id, return_reason } = event;

  if (!_id) return { success: false, error: 'ID不能为空' };
  if (!return_reason) return { success: false, error: '请填写退回原因' };

  // 关键修复：先幂等创建依赖集合（解决首次部署 -502005）
  await ensureCollections();

  try {
    const orderRes = await db.collection('cutting_order').doc(_id).get();
    if (!orderRes.data) return { success: false, error: '裁剪单不存在' };
    if (orderRes.data.status !== '已确认') {
      return { success: false, error: '当前状态非"已确认"，不可退回（当前：' + orderRes.data.status + '）' };
    }

    await db.collection('cutting_order').doc(_id).update({
      data: {
        status: '已确认', // 退回后仍为"已确认"（待裁剪管理员重新处理），但加退回原因与退回时间
        return_reason,
        workshop_return_time: db.serverDate(),
        updated_at: db.serverDate(),
      },
    });

    // 通知裁剪管理员
    try {
      await db.collection('notification').add({
        data: {
          receiver_id: null,
          role: '裁剪管理员',
          type: 'cutting_return',
          title: '车间退回裁剪单',
          content: `车间退回了裁剪单（${orderRes.data.order_no || ''}），原因：${return_reason}`,
          related_order_id: _id,
          is_read: 0,
          created_at: db.serverDate(),
        },
      });
    } catch (notifErr) {
      console.error('退回通知失败:', notifErr);
    }

    return { success: true };
  } catch (e) {
    console.error('车间退回裁剪单失败:', e);
    return { success: false, error: '操作失败' };
  }
};

/**
 * 幂等创建依赖集合
 * - 解决首次部署时 -502005 collection not exists
 */
async function ensureCollections() {
  const collections = ['cutting_order', 'notification'];
  for (const name of collections) {
    try {
      await cloud.database().createCollection(name);
      console.log(`[ensureCollections] 已创建集合 ${name}`);
    } catch (e) {
      const msg = (e && (e.errMsg || e.message)) || '';
      if (/already exists|ResourceExists/i.test(msg)) continue;
      console.error(`[ensureCollections] 创建集合 ${name} 失败:`, e);
    }
  }
}
