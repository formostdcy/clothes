const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 成品 - 确认有问题（退回车间）
 * 需求 4.4.1: 点击「有问题」→ 填问题描述 → 通知对应车间管理员
 */
exports.main = async (event, context) => {
  const db = cloud.database();
  const { _id, problem_desc } = event;

  if (!_id) return { success: false, error: '缺少确认单 ID' };
  if (!problem_desc || !problem_desc.trim()) return { success: false, error: '问题描述不能为空' };

  try {
    // 先查这条记录，得到车间管理员 ID
    const confirmRes = await db.collection('finished_product_confirm').doc(_id).get();
    if (!confirmRes.data) return { success: false, error: '确认单不存在' };

    const confirm = confirmRes.data;
    const targetWorkshopAdminId = confirm.workshop_admin_id || null;
    const orderNo = confirm.order_no || _id;

    // 更新状态
    await db.collection('finished_product_confirm').doc(_id).update({
      data: {
        status: '有问题',
        problem_desc: problem_desc.trim(),
        updated_at: db.serverDate(),
      },
    });

    // 发通知给该车间管理员（优先用 receiver_id 直发）
    await db.collection('notification').add({
      data: {
        receiver_id: targetWorkshopAdminId,
        role: '车间管理员',
        type: 'product_problem',
        title: '成品管理员反馈：加工单有问题',
        content: `加工单 ${orderNo} 在成品入库确认时被标记为有问题，请及时查看。\n问题描述：${problem_desc.trim()}`,
        related_order_id: _id,
        is_read: 0,
        created_at: db.serverDate(),
      },
    });

    return { success: true };
  } catch (e) {
    console.error('成品问题反馈失败:', e);
    return { success: false, error: e.message || '操作失败' };
  }
};
