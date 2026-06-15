const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 诊断：查看 cutting_order 集合的 status 分布
 */
exports.main = async (event, context) => {
  const db = cloud.database();
  try {
    const total = await db.collection('cutting_order').count();

    const samples = await db.collection('cutting_order')
      .orderBy('created_at', 'desc')
      .limit(20)
      .get();

    const statusMap = {};
    (samples.data || []).forEach(d => {
      statusMap[d.status] = (statusMap[d.status] || 0) + 1;
    });

    return {
      success: true,
      total: total.total,
      sampleCount: samples.data.length,
      statusDistribution: statusMap,
      samples: (samples.data || []).map(d => ({
        _id: d._id,
        order_no: d.order_no,
        status: d.status,
        target_workshop: d.target_workshop,
        cutting_admin_id: d.cutting_admin_id,
        created_at: d.created_at,
        updated_at: d.updated_at,
        return_reason: d.return_reason || '',
      })),
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
};
