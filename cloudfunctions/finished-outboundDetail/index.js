const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 成品 - 出库单详情（含原始加工单信息）
 * 需求 4.4.4: 点击出库记录可查看详情（含原始加工单信息）
 */
exports.main = async (event, context) => {
  const db = cloud.database();
  const { _id } = event;

  if (!_id) return { success: false, error: '缺少出库单 ID' };

  try {
    const res = await db.collection('finished_outbound_order').doc(_id).get();
    if (!res.data) return { success: false, error: '出库单不存在' };

    const order = res.data;

    // 补全原始加工单信息（如果有关联）
    let processingInfo = null;
    if (order.processing_order_id) {
      try {
        const pRes = await db.collection('processing_order').doc(order.processing_order_id).get();
        processingInfo = pRes.data || null;
      } catch (e) {
        console.error('查原始加工单失败:', e);
      }
    }

    return {
      success: true,
      data: {
        ...order,
        // 拼原始加工单关键字段，方便前端展示
        sourceOrderNo: processingInfo ? processingInfo.order_no : '',
        sourceWorkshopName: processingInfo ? (processingInfo.workshop_admin_id || '') : '',
        sourceCreatedAt: processingInfo ? processingInfo.created_at : '',
      },
    };
  } catch (e) {
    console.error('出库单详情查询失败:', e);
    return { success: false, error: e.message || '查询失败' };
  }
};
