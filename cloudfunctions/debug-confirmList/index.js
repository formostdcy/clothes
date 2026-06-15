const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 调试：列出 finished_product_confirm 的所有记录
 * 上传后在云开发控制台 → 云函数 → 该函数 → 测试 中跑
 */
exports.main = async (event, context) => {
  const db = cloud.database();
  try {
    const countRes = await db.collection('finished_product_confirm').count();
    const allRes = await db.collection('finished_product_confirm')
      .orderBy('created_at', 'desc')
      .limit(50)
      .get();

    // 按状态统计
    const stat = { 待确认: 0, 已入库: 0, 有问题: 0, 其他: 0 };
    allRes.data.forEach(d => {
      const s = d.status || '其他';
      stat[s] = (stat[s] || 0) + 1;
    });

    return {
      success: true,
      data: {
        total: countRes.total,
        stat,
        records: allRes.data,
      },
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
};
