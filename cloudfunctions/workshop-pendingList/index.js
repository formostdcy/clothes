const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 车间 - 待加工确认列表（来源：cutting_order）
 *
 * 关键修复：
 *   之前查的是空的 workshop_order_confirm 集合。
 *   现在改为查 cutting_order 集合 status='已确认' 的裁剪单（裁剪管理员刚提交的）。
 *   返回的字段尽量贴合前端 mapWorkshopPending 的预期（orderNo / materialName / planCount / createTime）。
 */

exports.main = async (event, context) => {
  const db = cloud.database();
  const { page = 1, pageSize = 20 } = event;

  try {
    const where = { status: '已确认' };

    const res = await db.collection('cutting_order').where(where)
      .orderBy('created_at', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get();

    const countRes = await db.collection('cutting_order').where(where).count();

    // 转成前端 mapWorkshopPending 能识别的格式
    const list = (res.data || []).map(d => {
      const plan = (d.plan_clothes_detail && d.plan_clothes_detail[0]) || {};
      const totalCount = (d.plan_clothes_detail || []).reduce((s, p) => s + (Number(p.count) || 0), 0);
      const sizes = Array.from(new Set((d.plan_clothes_detail || []).map(p => p.size).filter(Boolean)));
      return {
        ...d,
        // mapWorkshopPending 需要的字段
        order_no: d.order_no || '',
        plan_clothes_detail: d.plan_clothes_detail || [],
        category_two: d.category_two || plan.category_two || '',
        source_type: 'cutting',
        // 直接给友好字段，前端兼容
        orderNo: d.order_no || '',
        materialName: plan.category_two || d.category_two || '',
        planCount: totalCount,
        sizeText: sizes.join('/') || '',
        createTime: d.created_at || '',
      };
    });

    // 关键：返回结构必须匹配前端 pages/workshop/pending/list/index.js
    // request.js 在 success 时会把 res.result.data 返回给调用方，
    // 所以这里必须用 data 包裹，前端才能拿到 res.list / res.total。
    return {
      success: true,
      data: { list, total: countRes.total, page, pageSize },
    };
  } catch (e) {
    console.error('车间-待加工确认列表查询失败:', e);
    return { success: false, error: '查询失败' };
  }
};
