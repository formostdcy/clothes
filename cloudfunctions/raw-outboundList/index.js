/**
 * 原材料 - 出库单列表
 * 关键：支持 date_from / date_to 区间过滤（用于老板今日出库快捷入口）
 * 同时支持 status / keyword / page / pageSize
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  const db = cloud.database();
  const { page = 1, pageSize = 20, status = '', keyword = '', date_from = '', date_to = '', exclude_status = '' } = event;

  try {
    // 关键：status 和 exclude_status 互斥
    // - 优先用 status 精确匹配
    // - 否则用 exclude_status 排除某状态
    let where = {};
    if (status) {
      where.status = status;
    } else if (exclude_status) {
      // 排除某状态（用于老板"今日出库"快捷入口，和 boss-overview 口径一致）
      where.status = db.command.neq(exclude_status);
    } else {
      // 默认排除已删除的（status = -1）
      where.status = db.command.neq(-1);
    }
    if (keyword) {
      where.order_no = db.RegExp({ regexp: keyword, options: 'i' });
    }
    // 关键：日期区间过滤（用链式 .and 组合 gte + lte，避免后写覆盖前写）
    if (date_from) {
      where.created_at = db.command.gte(new Date(date_from));
    }
    if (date_to) {
      if (where.created_at && where.created_at.and) {
        where.created_at = where.created_at.and(db.command.lte(new Date(date_to)));
      } else {
        where.created_at = db.command.lte(new Date(date_to));
      }
    }

    const res = await db.collection('raw_outbound_order') .where(where)
      .orderBy('created_at', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get();

    const countRes = await db.collection('raw_outbound_order').where(where).count();

    return {
      success: true,
      data: { list: res.data, total: countRes.total, page, pageSize },
    };
  } catch (e) {
    console.error('出库单列表查询失败:', e);
    return { success: false, error: '查询失败' };
  }
};
