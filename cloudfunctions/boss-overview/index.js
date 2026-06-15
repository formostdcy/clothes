const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 老板 - 数据总览（今日动态/待确认/库存/本月出库）
 */
exports.main = async (event, context) => {
  const db = cloud.database();

  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000 - 1);

    // 今日入库数量
    // 原材料入库单写入的 status 实际是 '已入库'（见 cloudfunctions/raw-inboundAdd）
    const inboundRes = await db.collection('raw_inbound_order')
      .where({
        status: '已入库',
        created_at: db.command.gte(todayStart).and(db.command.lte(todayEnd)),
      })
      .get();
    let todayInboundCount = 0;
    inboundRes.data.forEach(item => {
      (item.material_details || []).forEach(m => { todayInboundCount += m.quantity || 0; });
    });

    // 今日出库数量（排除已取消）
    const outboundRes = await db.collection('raw_outbound_order')
      .where({
        status: db.command.neq('已取消'),
        created_at: db.command.gte(todayStart).and(db.command.lte(todayEnd)),
      })
      .get();
    let todayOutboundCount = 0;
    outboundRes.data.forEach(item => {
      (item.material_details || []).forEach(m => { todayOutboundCount += m.quantity || 0; });
    });

    // 待确认数量
    const [cuttingPending, workshopPending, finishedPending] = await Promise.all([
      db.collection('cutting_incoming_confirm').where({ status: '待确认' }).count(),
      db.collection('workshop_incoming_confirm').where({ status: '待确认' }).count(),
      db.collection('finished_product_confirm').where({ status: '待确认' }).count(),
    ]);

    // 当前库存
    const [rawStock, finishedStock] = await Promise.all([
      db.collection('raw_material_stock').get(),
      db.collection('finished_product_stock').get(),
    ]);
    let rawTotal = 0, finishedTotal = 0;
    rawStock.data.forEach(item => { rawTotal += item.total_quantity || 0; });
    finishedStock.data.forEach(item => { finishedTotal += item.quantity || 0; });

    // 本月成品出库数量
    // 成品出库单写入的 status 实际是 '已出库'（见 cloudfunctions/finished-outboundAdd），
    // 与原材料出库保持一致：排除 '已取消'，其余视为已出库
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthOutbound = await db.collection('finished_outbound_order').where({
        status: db.command.neq('已取消'),
        created_at: db.command.gte(monthStart),
      })
      .get();
    let monthOutboundTotal = 0;
    monthOutbound.data.forEach(item => {
      (item.outbound_details || []).forEach(d => { monthOutboundTotal += d.quantity || 0; });
    });

    return {
      success: true,
      data: {
        todayInboundCount,
        todayOutboundCount,
        cuttingPendingCount: cuttingPending.total,
        workshopPendingCount: workshopPending.total,
        finishedPendingCount: finishedPending.total,
        rawTotal,
        finishedTotal,
        monthOutboundTotal,
      },
    };
  } catch (e) {
    console.error('数据总览查询失败:', e);
    return { success: false, error: '查询失败' };
  }
};
