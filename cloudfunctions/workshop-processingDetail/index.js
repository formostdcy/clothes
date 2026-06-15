const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 车间 - 加工单详情
 *
 * 入参：{ id: '加工单 _id' }
 * 出参：{ success, data: { ...processing_order, source_order_no, target_workshop_name } } | { success, error }
 *
 * 与 workshop-processingList 风格一致：
 *  - 关联 cutting_order（通过 workshop_confirm_id）取来源单号与目标工厂 _id
 *  - 再批量映射到 employee 取出工厂名（车间管理员的 name）
 *  - 最后合并到加工单对象上
 */

exports.main = async (event, context) => {
  const db = cloud.database();
  const { id } = event || {};

  if (!id) {
    return { success: false, error: '缺少 id 参数' };
  }

  try {
    const orderRes = await db.collection('processing_order').doc(id).get();
    const order = orderRes.data;
    if (!order) {
      return { success: false, error: '加工单不存在' };
    }

    // 关联 cutting_order：拿 source_order_no + target_workshop(_id)
    let cutting = {};
    if (order.workshop_confirm_id) {
      const cRes = await db.collection('cutting_order')
        .doc(order.workshop_confirm_id)
        .field({ _id: true, order_no: true, target_workshop: true })
        .get();
      cutting = cRes.data || {};
    }

    // 映射 target_workshop(_id) → 员工 name
    let workshopName = '';
    if (cutting.target_workshop) {
      const empRes = await db.collection('employee')
        .doc(cutting.target_workshop)
        .field({ name: true, role: true })
        .get();
      // 仅当该员工确实是车间管理员时使用其名称（与列表逻辑保持一致）
      workshopName = (empRes.data && empRes.data.role === '车间管理员')
        ? empRes.data.name
        : '';
    }

    return {
      success: true,
      data: {
        ...order,
        source_order_no: cutting.order_no || '',
        target_workshop: cutting.target_workshop || '',
        target_workshop_name: workshopName,
      }
    };
  } catch (e) {
    console.error('加工单详情查询失败:', e);
    return { success: false, error: '查询失败' };
  }
};
