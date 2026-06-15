const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 车间 - 加工记录列表
 *
 * 关键修复：
 *  关联 cutting_order 取出 target_workshop（员工 _id），
 *  并将 _id 批量映射为员工 name，最终返回 target_workshop_name 给前端展示。
 */

exports.main = async (event, context) => {
  const db = cloud.database();
  const { page = 1, pageSize = 20, status = '' } = event;

  try {
    let where = {};
    if (status) where.status = status;

    const res = await db.collection('processing_order').where(where)
      .orderBy('created_at', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get();

    const countRes = await db.collection('processing_order').where(where).count();

    // 关联 cutting_order 拿 source_order_no + target_workshop（员工 _id）
    const sourceIds = Array.from(new Set(
      (res.data || []).map(d => d.workshop_confirm_id).filter(Boolean)
    ));
    let cuttingMap = {};
    if (sourceIds.length > 0) {
      const chunkSize = 100;
      for (let i = 0; i < sourceIds.length; i += chunkSize) {
        const chunk = sourceIds.slice(i, i + chunkSize);
        const cRes = await db.collection('cutting_order')
          .where({ _id: db.command.in(chunk) })
          .field({ _id: true, order_no: true, target_workshop: true })
          .get();
        (cRes.data || []).forEach(c => { cuttingMap[c._id] = c; });
      }
    }

    // 批量把 target_workshop(_id) 映射为员工 name
    const workshopIds = Array.from(new Set(
      Object.values(cuttingMap).map(c => c.target_workshop).filter(Boolean)
    ));
    let workshopNameMap = {};
    if (workshopIds.length > 0) {
      const chunkSize = 100;
      for (let i = 0; i < workshopIds.length; i += chunkSize) {
        const chunk = workshopIds.slice(i, i + chunkSize);
        const empRes = await db.collection('employee')
          .where({ _id: db.command.in(chunk), role: '车间管理员' })
          .field({ _id: true, name: true })
          .get();
        (empRes.data || []).forEach(emp => { workshopNameMap[emp._id] = emp.name; });
      }
    }

    const list = (res.data || []).map(d => {
      const cutting = cuttingMap[d.workshop_confirm_id] || {};
      return {
        ...d,
        source_order_no: cutting.order_no || '',                          // 来源裁剪单号
        target_workshop: cutting.target_workshop || '',                    // 工厂 _id
        target_workshop_name: workshopNameMap[cutting.target_workshop] || '', // 工厂名称
      };
    });

    return {
      success: true,
      data: { list, total: countRes.total, page, pageSize },
    };
  } catch (e) {
    console.error('加工记录查询失败:', e);
    return { success: false, error: '查询失败' };
  }
};
