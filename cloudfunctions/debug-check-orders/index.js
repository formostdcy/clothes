const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 诊断云函数：查看 cutting_incoming_confirm / workshop_incoming_confirm / raw_outbound_order 的数据
 */
exports.main = async (event, context) => {
  const db = cloud.database();
  const dbCmd = db.command;
  const result = {};

  try {
    // 1. cutting_incoming_confirm 总数 + 最近 5 条
    const cuttingTotal = await db.collection('cutting_incoming_confirm').count();
    const cuttingRes = await db.collection('cutting_incoming_confirm')
      .orderBy('created_at', 'desc').limit(5).get();
    result.cutting_incoming_confirm = {
      total: cuttingTotal.total,
      samples: cuttingRes.data,
    };
  } catch (e) {
    result.cutting_incoming_confirm = { error: e.message };
  }

  try {
    // 2. workshop_incoming_confirm
    const workshopTotal = await db.collection('workshop_incoming_confirm').count();
    const workshopRes = await db.collection('workshop_incoming_confirm')
      .orderBy('created_at', 'desc').limit(5).get();
    result.workshop_incoming_confirm = {
      total: workshopTotal.total,
      samples: workshopRes.data,
    };
  } catch (e) {
    result.workshop_incoming_confirm = { error: e.message };
  }

  try {
    // 3. raw_outbound_order 总数 + 最近 5 条
    const outboundTotal = await db.collection('raw_outbound_order').count();
    const outboundRes = await db.collection('raw_outbound_order')
      .orderBy('created_at', 'desc').limit(5).get();
    result.raw_outbound_order = {
      total: outboundTotal.total,
      samples: outboundRes.data,
    };
  } catch (e) {
    result.raw_outbound_order = { error: e.message };
  }

  return { success: true, data: result };
};
