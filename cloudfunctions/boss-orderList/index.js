// cloudfunctions/boss-orderList/index.js
// 老板 - 订单记录列表
// 支持：模块筛选、状态筛选、关键词搜索、时间范围筛选
// 返回：{ list, total, page, pageSize }
// 每条 list item: { _id, order_no, module, moduleLabel, status, statusClass, created_at, created_at_label, operator_name, summary }

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// 关键修复：服务端 role 校验（防止越权）
const ALLOWED_ROLES = ['老板'];
async function requireRole(event, allowed) {
  const role = event.current_user_role || event.role;
  if (!role) {
    return { ok: false, error: '未提供用户角色（请通过前端登录态传入 current_user_role）' };
  }
  if (!allowed.includes(role)) {
    return { ok: false, error: `当前角色【${role}】无权调用此接口（仅限：${allowed.join('、')}）` };
  }
  return { ok: true };
}


// 模块配置
const MODULES = {
  raw_inbound:     { col: 'raw_inbound_order',     label: '原材料入库', order_no_prefix: 'RK' },
  raw_outbound:    { col: 'raw_outbound_order',    label: '原材料出库', order_no_prefix: 'CK' },
  cutting:         { col: 'cutting_order',         label: '裁剪',       order_no_prefix: 'CJ' },
  processing:      { col: 'processing_order',      label: '加工',       order_no_prefix: 'JG' },
  finished_outbound: { col: 'finished_outbound_order', label: '成品出库', order_no_prefix: 'CC' },
};

// 状态配色（前端用 CSS 类）
const STATUS_CLASS_MAP = {
  '已入库':   'status-success',
  '已出库':   'status-success',
  '已确认':   'status-success',
  '已裁剪':   'status-success',
  '已加工':   'status-success',
  '已完成':   'status-success',
  '已取消':   'status-cancel',
  '有问题':   'status-warning',
  '待确认':   'status-pending',
};

// 操作人字段：每个模块可能不一样
function getOperatorId(item, module) {
  if (!item) return '';
  switch (module) {
    case 'raw_inbound':
    case 'raw_outbound':
    case 'cutting':
    case 'finished_outbound':
      return item.creator_id || '';
    case 'processing':
      return item.workshop_admin_id || item.creator_id || '';
    default:
      return item.creator_id || '';
  }
}

// 订单概要：从原始记录里抽几个字段给老板一眼看到
function getSummary(item, module) {
  if (!item) return '';
  try {
    switch (module) {
      case 'raw_inbound':
      case 'raw_outbound': {
        const details = item.material_details || item.details || [];
        if (Array.isArray(details) && details.length > 0) {
          const first = details[0];
          return `${first.name || first.material_name || ''} × ${first.quantity || first.qty || ''}`.trim();
        }
        return '';
      }
      case 'cutting':
      case 'processing': {
        const q = item.actual_quantity || item.plan_quantity || [];
        if (Array.isArray(q) && q.length > 0) {
          const total = q.reduce((s, x) => s + (Number(x && x.count) || 0), 0);
          return `${item.gender || ''} ${item.style || ''} ${item.school || ''}  共 ${total} 件`.trim();
        }
        return `${item.gender || ''} ${item.style || ''} ${item.school || ''}`.trim();
      }
      case 'finished_outbound': {
        const d = item.outbound_details || [];
        if (Array.isArray(d) && d.length > 0) {
          const total = d.reduce((s, x) => s + (Number(x && x.quantity) || 0), 0);
          return `${item.destination || ''}  共 ${total} 件`.trim();
        }
        return item.destination || '';
      }
      default:
        return '';
    }
  } catch (e) {
    return '';
  }
}

exports.main = async (event, context) => {
  // 关键修复：服务端 role 校验
  const guard = await requireRole(event, ALLOWED_ROLES);
  if (!guard.ok) return { success: false, error: guard.error };

  const db = cloud.database();
  const _ = db.command;
  const {
    page = 1,
    pageSize = 20,
    module = '',
    status = '',
    keyword = '',
    timeFrom = '',
    timeTo = '',
  } = event;

  try {
    let list = [];
    let total = 0;

    // ============ 1) 构造 where ============
    function buildWhere() {
      const where = {};
      if (status) where.status = status;
      if (keyword) where.order_no = db.RegExp({ regexp: keyword, options: 'i' });
      // 时间范围筛选
      if (timeFrom || timeTo) {
        where.created_at = {};
        if (timeFrom) where.created_at._gte = new Date(timeFrom);
        if (timeTo) where.created_at._lte = new Date(timeTo);
      }
      return where;
    }

    // ============ 2) 单模块查询 ============
    if (module && MODULES[module]) {
      const { col } = MODULES[module];
      const where = buildWhere();
      const res = await db.collection(col)
        .where(where)
        .orderBy('created_at', 'desc')
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .get();
      const countRes = await db.collection(col).where(where).count();
      list = res.data;
      total = countRes.total;
    } else {
      // ============ 3) 全模块查询：每个模块各拉 pageSize 条，合并排序分页 ============
      const all = [];
      for (const key of Object.keys(MODULES)) {
        const { col } = MODULES[key];
        const where = buildWhere();
        const res = await db.collection(col)
          .where(where)
          .orderBy('created_at', 'desc')
          .limit(pageSize)
          .get();
        (res.data || []).forEach(item => {
          all.push({ ...item, _module: key });
        });
      }
      all.sort((a, b) => {
        const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
        const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
        return tb - ta;
      });
      total = all.length;
      list = all.slice((page - 1) * pageSize, page * pageSize);
    }

    // ============ 4) 收集所有 operator_id，一次性查 employee 集合 ============
    const operatorIds = [...new Set(list.map(it => getOperatorId(it, it._module || module)).filter(Boolean))];
    const employeeMap = {};
    if (operatorIds.length > 0) {
      try {
        // 云数据库单次 in 限制 1000 个
        const empRes = await db.collection('employee')
          .where({ _id: _.in(operatorIds) })
          .field({ _id: true, name: true, account: true })
          .limit(operatorIds.length)
          .get();
        (empRes.data || []).forEach(emp => {
          employeeMap[emp._id] = emp.name || emp.account || '';
        });
      } catch (e) {
        console.error('[boss-orderList] 查 employee 失败:', e);
      }
    }

    // ============ 5) 构造返回 ============
    const result = list.map(item => {
      const mod = item._module || module;
      const operatorId = getOperatorId(item, mod);
      const operatorName = employeeMap[operatorId] || '';
      return {
        _id: item._id,
        order_no: item.order_no || '',
        module: mod,
        moduleLabel: (MODULES[mod] && MODULES[mod].label) || mod,
        status: item.status || '',
        statusClass: STATUS_CLASS_MAP[item.status] || 'status-default',
        created_at: item.created_at,
        operator_id: operatorId,
        operator_name: operatorName,
        summary: getSummary(item, mod),
      };
    });

    return { success: true, data: { list: result, total, page, pageSize } };
  } catch (e) {
    console.error('[boss-orderList] 查询失败:', e);
    return { success: false, error: '查询失败：' + (e.message || String(e)) };
  }
};
