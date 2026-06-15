const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 瑁佸壀 - 瑁佸壀璁板綍鍒楄〃
 */

exports.main = async (event, context) => {
  const db = cloud.database();
  const { page = 1, pageSize = 20, status = '', excludeStatus = '' } = event;

  try {
    let where = {};
    if (status) where.status = status;
    if (excludeStatus) {
      // 排除某种状态（如 "进行中" = 排除 "已完成"）
      where.status = db.command.neq(excludeStatus);
    }

    const res = await db.collection('cutting_order').where(where)
      .orderBy('created_at', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get();

    const countRes = await db.collection('cutting_order').where(where).count();

    // 关键：将 target_workshop（员工 _id）批量映射为员工 name
    const workshopIds = Array.from(new Set(
      (res.data || []).map(d => d.target_workshop).filter(Boolean)
    ));
    let workshopMap = {};
    if (workshopIds.length > 0) {
      try {
        // 微信云开发单次 _id 批量查询上限 100，分段处理
        const chunkSize = 100;
        for (let i = 0; i < workshopIds.length; i += chunkSize) {
          const chunk = workshopIds.slice(i, i + chunkSize);
          const empRes = await db.collection('employee')
            .where({ _id: db.command.in(chunk), role: '车间管理员' })
            .field({ _id: true, name: true })
            .get();
          (empRes.data || []).forEach(emp => {
            workshopMap[emp._id] = emp.name;
          });
        }
      } catch (e) {
        console.error('workshop name map failed:', e);
      }
    }

    // 给每条记录附上 target_workshop_name（不动原始 target_workshop）
    const list = (res.data || []).map(d => ({
      ...d,
      target_workshop_name: workshopMap[d.target_workshop] || '',
    }));

    return {
      success: true,
      data: { list, total: countRes.total, page, pageSize },
    };
  } catch (e) {
    console.error('裁剪记录列表查询失败:', e);
    return { success: false, error: '查询失败' };
  }
};
