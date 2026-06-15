const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 成品 - 确认列表（待确认 / 已完成 / 有问题）
 *
 * 查询参数：
 *   - page, pageSize: 分页
 *   - status:    单状态，例如 "待确认" / "已入库" / "有问题"
 *   - statuses:  状态数组，例如 ["已入库", "有问题"] 用于"已完成" Tab
 *   - tab:       便捷参数，"todo" | "done" | "all"
 *
 * 默认只显示"待确认"。
 */
exports.main = async (event, context) => {
  const db = cloud.database();
  const _ = db.command;
  const {
    page = 1,
    pageSize = 20,
    status,
    statuses,
    tab,
  } = event;

  try {
    const where = {};

    // 1) 优先用 tab 推导 statuses
    let useStatuses = null;
    if (tab === 'todo') {
      useStatuses = ['待确认'];
    } else if (tab === 'done') {
      useStatuses = ['已入库', '有问题'];
    } else if (tab === 'all') {
      useStatuses = null;
    } else if (Array.isArray(statuses) && statuses.length > 0) {
      useStatuses = statuses;
    } else if (status) {
      useStatuses = [status];
    } else {
      useStatuses = ['待确认'];
    }

    if (useStatuses && useStatuses.length === 1) {
      where.status = useStatuses[0];
    } else if (useStatuses && useStatuses.length > 1) {
      where.status = _.in(useStatuses);
    }

    const res = await db.collection('finished_product_confirm')
      .where(where)
      .orderBy('created_at', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get();

    const countRes = await db.collection('finished_product_confirm').where(where).count();

    return {
      success: true,
      data: { list: res.data, total: countRes.total, page, pageSize },
    };
  } catch (e) {
    console.error('成品确认列表查询失败:', e);
    return { success: false, error: e.message || '查询失败' };
  }
};
