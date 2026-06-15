const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 老板 - 成品统计
 * 入参:
 *   { type: 'stock' | 'outbound', groupBy: 'school' | 'style' | 'destination' }
 *
 *  - stock:   聚合 finished_product_stock (库存)
 *             groupBy=school/style 可直接 group；groupBy=destination 不可用
 *  - outbound: 聚合 finished_outbound_order.outbound_details[]
 *             groupBy=school/style 可用；groupBy=destination 直接 group 单据的 destination 字段
 *
 * 返回:
 *   {
 *     type, groupBy,
 *     total: 总件数,
 *     rows: [{ key, value, percent }],   // 聚合后的排名（按 value 倒序）
 *     details: [{ ... }],                // 明细列表（点击行后展开，按 groupBy 字段过滤）
 *     filters: { ... }                   // 可供下钻的其它维度（学校列表/款式列表/destination 列表）
 *   }
 */

function roundToInt(n) {
  return Math.round(n || 0);
}

// 库存聚合
async function aggregateStock(db, groupBy) {
  const all = await db.collection('finished_product_stock').limit(1000).get();
  // 云数据库单次最多 1000，库存 SKU 不会太多，足够
  const list = all.data || [];

  // 维度映射：库存表的字段直接是 school/style/season/size/gender
  const fieldMap = {
    school: 'school',
    style: 'style',
    season: 'season',
  };
  const field = fieldMap[groupBy];
  if (!field) {
    return { supported: false };
  }

  const buckets = new Map();
  let total = 0;
  for (const row of list) {
    const k = (row[field] || '未分类').toString().trim() || '未分类';
    const v = row.quantity || 0;
    buckets.set(k, (buckets.get(k) || 0) + v);
    total += v;
  }

  const rows = [...buckets.entries()]
    .map(([key, value]) => ({ key, value }))
    .sort((a, b) => b.value - a.value)
    .map(r => ({ ...r, percent: total > 0 ? Math.round((r.value / total) * 1000) / 10 : 0 }));

  // 明细：按 groupBy 排序，附带其它字段便于查看
  const details = list
    .map(r => ({
      key: (r[field] || '未分类').toString().trim() || '未分类',
      school: r.school || '',
      style: r.style || '',
      season: r.season || '',
      gender: r.gender || '',
      size: r.size || '',
      quantity: r.quantity || 0,
    }))
    .sort((a, b) => b.quantity - a.quantity);

  // 可选下钻维度
  const schools = [...new Set(list.map(r => r.school).filter(Boolean))];
  const styles = [...new Set(list.map(r => r.style).filter(Boolean))];
  const seasons = [...new Set(list.map(r => r.season).filter(Boolean))];

  return {
    supported: true,
    total,
    rows,
    details,
    filters: { schools, styles, seasons },
  };
}

// 出库量聚合
async function aggregateOutbound(db, groupBy) {
  // 出库单 + 取消的剔除
  const res = await db.collection('finished_outbound_order')
    .where({ status: db.command.neq('已取消') })
    .limit(1000)
    .get();
  const orders = res.data || [];

  // 按出库时间倒序
  orders.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

  let buckets = new Map();
  let total = 0;
  const details = [];

  if (groupBy === 'destination') {
    // 直接 group 单据上的 destination
    for (const order of orders) {
      const k = (order.destination || '未分类').toString().trim() || '未分类';
      let sum = 0;
      (order.outbound_details || []).forEach(d => { sum += d.quantity || 0; });
      buckets.set(k, (buckets.get(k) || 0) + sum);
      total += sum;
      details.push({
        key: k,
        orderNo: order.order_no || '',
        time: order.created_at || '',
        quantity: sum,
      });
    }
  } else if (groupBy === 'school' || groupBy === 'style' || groupBy === 'season') {
    const field = groupBy; // school / style / season
    for (const order of orders) {
      (order.outbound_details || []).forEach(d => {
        const k = (d[field] || '未分类').toString().trim() || '未分类';
        const v = d.quantity || 0;
        buckets.set(k, (buckets.get(k) || 0) + v);
        total += v;
        details.push({
          key: k,
          orderNo: order.order_no || '',
          school: d.school || '',
          style: d.style || '',
          season: d.season || '',
          gender: d.gender || '',
          size: d.size || '',
          quantity: v,
          time: order.created_at || '',
          destination: order.destination || '',
        });
      });
    }
    // 明细按数量倒序
    details.sort((a, b) => b.quantity - a.quantity);
  } else {
    return { supported: false };
  }

  const rows = [...buckets.entries()]
    .map(([key, value]) => ({ key, value }))
    .sort((a, b) => b.value - a.value)
    .map(r => ({ ...r, percent: total > 0 ? Math.round((r.value / total) * 1000) / 10 : 0 }));

  // 可选下钻维度
  const schools = new Set();
  const styles = new Set();
  const seasons = new Set();
  const destinations = new Set();
  orders.forEach(o => {
    if (o.destination) destinations.add(o.destination);
    (o.outbound_details || []).forEach(d => {
      if (d.school) schools.add(d.school);
      if (d.style) styles.add(d.style);
      if (d.season) seasons.add(d.season);
    });
  });

  return {
    supported: true,
    total,
    rows,
    details,
    filters: {
      schools: [...schools],
      styles: [...styles],
      seasons: [...seasons],
      destinations: [...destinations],
    },
  };
}

exports.main = async (event) => {
  const db = cloud.database();
  const { type = 'stock', groupBy = 'school' } = event;

  try {
    const result = type === 'outbound'
      ? await aggregateOutbound(db, groupBy)
      : await aggregateStock(db, groupBy);

    if (result.supported === false) {
      return {
        success: false,
        error: `库存不支持按 ${groupBy} 统计，请选择 school 或 style`,
      };
    }

    return {
      success: true,
      data: {
        type,
        groupBy,
        total: roundToInt(result.total),
        rows: result.rows,
        details: result.details,
        filters: result.filters,
      },
    };
  } catch (e) {
    console.error('成品统计失败:', e);
    // 不把 e.message 直接抛给客户端（可能是英文/内部栈信息），统一返回"统计失败"
    return { success: false, error: '统计失败' };
  }
};
