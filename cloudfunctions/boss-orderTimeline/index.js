// cloudfunctions/boss-orderTimeline/index.js
// 老板 - 订单流转时间轴
// 参数：{ order_id, module }
// 返回：{ timeline: [{ stage, stageLabel, time, timeLabel, operatorName, status, fields: [{ key, label, value }], photos: [] }] }
//
// fields：用于节点详情展示的友好字段，每条形如 { key, label, value }
// photos：节点关联的照片数组

const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const MODULES = {
  raw_inbound: { col: 'raw_inbound_order', label: '原材料入库' },
  raw_outbound: { col: 'raw_outbound_order', label: '原材料出库' },
  cutting: { col: 'cutting_order', label: '裁剪' },
  processing: { col: 'processing_order', label: '加工' },
  finished_outbound: { col: 'finished_outbound_order', label: '成品出库' },
};

function pad2(n) { return n < 10 ? '0' + n : String(n); }
function fmtTime(t) {
  if (!t) return '';
  try {
    const d = new Date(t);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  } catch (e) { return ''; }
}

async function resolveEmployee(db, ids) {
  if (!ids || ids.length === 0) return {};
  try {
    const _ = db.command;
    const res = await db.collection('employee')
      .where({ _id: _.in([...new Set(ids)].filter(Boolean)) })
      .field({ _id: true, name: true, account: true })
      .limit(100)
      .get();
    const map = {};
    (res.data || []).forEach(e => { map[e._id] = e.name || e.account || ''; });
    return map;
  } catch (e) {
    console.error('[boss-orderTimeline] resolveEmployee 失败:', e);
    return {};
  }
}

// ============ 字段格式化辅助函数 ============

// 物料明细数组 → 拼接成多行字符串
function formatMaterialDetails(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return '无';
  return arr.map((m, i) => {
    const cat1 = m.category_one || '';
    const cat2 = m.category_two || m.name || '';
    const qty = m.quantity != null ? m.quantity : (m.qty != null ? m.qty : '');
    const unit = m.unit || '';
    const used = m.used_quantity != null ? `（已用 ${m.used_quantity}${unit}）` : '';
    const remain = m.remaining != null ? `（剩余 ${m.remaining}${unit}）` : '';
    return `${i + 1}. ${cat1} - ${cat2}  ${qty}${unit}${used}${remain}`;
  }).join('\n');
}

// 尺码明细数组（plan_clothes_detail / actual_quantity 之类）→ 拼接成多行
function formatClothesDetails(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return '无';
  return arr.map((m, i) => {
    const size = m.size || m.尺码 || '';
    const count = m.count != null ? m.count : (m.quantity != null ? m.quantity : '');
    return `${size ? size + '码：' : ''}${count} 件`;
  }).join('\n');
}

// 辅料使用数组
function formatAccessoryUsage(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return '无';
  return arr.map((m, i) => {
    const name = m.name || m.category_two || '';
    const qty = m.quantity != null ? m.quantity : '';
    const unit = m.unit || '';
    return `${i + 1}. ${name}  ${qty}${unit}`;
  }).join('\n');
}

// 数字 + 单位的损耗率
function formatLossRate(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'number') return `${v}%`;
  return String(v);
}

// 通用 fromObj：跳过空值，跳过内部字段（如 _id, creator_id 这种）
const SKIP_KEYS = new Set([
  '_id', 'creator_id', 'creator_name', 'cancel_by',
  'cutting_admin_id', 'workshop_admin_id', 'finished_admin_id',
  'confirm_admin_id', 'target_admin_id',
  'updated_at', 'created_at', 'deleted_at',
  'incoming_confirm_id', 'outbound_order_id', 'workshop_confirm_id',
  'workshop_incoming_confirm_id', 'source_order_id', 'source_type',
  'processing_order_id', 'stock_rebuilt', 'stock_rebuilt_at', 'stock_rebuilt_by',
  'workshop_confirm_time', 'confirm_time',
  '__typename',
]);

function safeVal(v) {
  if (v == null) return '';
  if (typeof v === 'object') {
    try { return JSON.stringify(v); } catch (e) { return String(v); }
  }
  return String(v);
}

// ============ 主函数 ============
exports.main = async (event, context) => {
  const db = cloud.database();
  const { order_id, module } = event;

  if (!order_id || !module) {
    return { success: false, error: 'order_id 和 module 必填' };
  }
  if (!MODULES[module]) {
    return { success: false, error: '未知模块：' + module };
  }

  try {
    const { col } = MODULES[module];
    const orderRes = await db.collection(col).doc(order_id).get();
    const order = orderRes.data;
    if (!order) {
      return { success: false, error: '订单不存在' };
    }

    const timeline = [];
    const operatorIds = [];

    // ============ 模块 1：原材料入库 ============
    if (module === 'raw_inbound') {
      operatorIds.push(order.creator_id);
      const fields = [
        { key: 'order_no',        label: '入库单号',   value: order.order_no || '' },
        { key: 'supplier_name',   label: '供应商',     value: order.supplier_name || '无' },
        { key: 'material',        label: '物料明细',   value: formatMaterialDetails(order.material_details) },
        { key: 'remark',          label: '备注',       value: order.remark || '无' },
      ];
      timeline.push({
        stage: 'created',
        stageLabel: '原材料入库',
        time: order.created_at,
        timeLabel: fmtTime(order.created_at),
        operatorId: order.creator_id || '',
        operatorName: '',
        status: order.status || '',
        fields,
        photos: order.photos || [],
      });
      if (order.status === '已取消' && order.updated_at) {
        operatorIds.push(order.cancel_by || order.creator_id || '');
        timeline.push({
          stage: 'cancelled',
          stageLabel: '已取消入库',
          time: order.updated_at,
          timeLabel: fmtTime(order.updated_at),
          operatorId: order.cancel_by || order.creator_id || '',
          operatorName: '',
          status: '已取消',
          fields: [
            { key: 'order_no', label: '入库单号', value: order.order_no || '' },
            { key: 'remark',   label: '取消说明', value: '入库已取消，库存已回退' },
          ],
          photos: [],
        });
      }
    }

    // ============ 模块 2：原材料出库 ============
    if (module === 'raw_outbound') {
      operatorIds.push(order.creator_id);
      // target_type 转友好
      const targetTypeMap = { cutting: '裁剪管理员', workshop: '车间管理员' };
      const targetTypeLabel = targetTypeMap[order.target_type] || order.target_type || '未指定';

      timeline.push({
        stage: 'created',
        stageLabel: '原材料出库（创建）',
        time: order.created_at,
        timeLabel: fmtTime(order.created_at),
        operatorId: order.creator_id || '',
        operatorName: '',
        status: order.status || '',
        fields: [
          { key: 'order_no',      label: '出库单号',   value: order.order_no || '' },
          { key: 'target_type',   label: '收料方',     value: targetTypeLabel },
          { key: 'material',      label: '出库物料',   value: formatMaterialDetails(order.material_details || order.details) },
          { key: 'remark',        label: '备注',       value: order.remark || '无' },
        ],
        photos: order.photos || [],
      });

      const sourceOrderId = order._id;

      // 裁剪来料
      try {
        const incRes = await db.collection('cutting_incoming_confirm')
          .where({ source_order_id: sourceOrderId })
          .orderBy('created_at', 'desc').limit(1).get();
        if (incRes.data && incRes.data.length > 0) {
          const inc = incRes.data[0];
          const incOperator = inc.confirm_admin_id || inc.creator_id || '';
          operatorIds.push(incOperator);
          timeline.push({
            stage: 'incoming_pending',
            stageLabel: '裁剪待确认入库',
            time: inc.created_at,
            timeLabel: fmtTime(inc.created_at),
            operatorId: incOperator,
            operatorName: '',
            status: inc.status || '待确认',
            fields: [
              { key: 'incoming_no', label: '入库单号',   value: inc.order_no || '' },
              { key: 'material',    label: '入库物料',   value: formatMaterialDetails(inc.material_details) },
              { key: 'remark',      label: '出库备注',   value: inc.remark || '无' },
            ],
            photos: inc.photos || [],
          });
          if (inc.status === '已确认' && inc.confirm_time) {
            timeline.push({
              stage: 'incoming_confirmed',
              stageLabel: '裁剪已确认入库',
              time: inc.confirm_time,
              timeLabel: fmtTime(inc.confirm_time),
              operatorId: incOperator,
              operatorName: '',
              status: '已确认',
              fields: [
                { key: 'incoming_no', label: '入库单号', value: inc.order_no || '' },
                { key: 'result',      label: '确认结果', value: '物料已收纳入库' },
              ],
              photos: [],
            });
          } else if (inc.status === '有问题' && inc.confirm_time) {
            timeline.push({
              stage: 'incoming_problem',
              stageLabel: '裁剪确认异常',
              time: inc.confirm_time,
              timeLabel: fmtTime(inc.confirm_time),
              operatorId: incOperator,
              operatorName: '',
              status: '有问题',
              fields: [
                { key: 'incoming_no', label: '入库单号', value: inc.order_no || '' },
                { key: 'problem',     label: '异常说明', value: inc.remark || '收料方反馈有问题' },
              ],
              photos: inc.photos || [],
            });
          }
        }
      } catch (e) {
        console.error('[boss-orderTimeline] 查 cutting_incoming_confirm 失败:', e);
      }

      // 车间来料
      try {
        const incRes = await db.collection('workshop_incoming_confirm')
          .where({ source_order_id: sourceOrderId })
          .orderBy('created_at', 'desc').limit(1).get();
        if (incRes.data && incRes.data.length > 0) {
          const inc = incRes.data[0];
          const incOperator = inc.confirm_admin_id || inc.creator_id || '';
          operatorIds.push(incOperator);
          timeline.push({
            stage: 'incoming_pending',
            stageLabel: '车间待确认入库',
            time: inc.created_at,
            timeLabel: fmtTime(inc.created_at),
            operatorId: incOperator,
            operatorName: '',
            status: inc.status || '待确认',
            fields: [
              { key: 'incoming_no', label: '入库单号',   value: inc.order_no || '' },
              { key: 'material',    label: '入库物料',   value: formatMaterialDetails(inc.material_details) },
              { key: 'remark',      label: '出库备注',   value: inc.remark || '无' },
            ],
            photos: inc.photos || [],
          });
          if (inc.status === '已确认' && inc.confirm_time) {
            timeline.push({
              stage: 'incoming_confirmed',
              stageLabel: '车间已确认入库',
              time: inc.confirm_time,
              timeLabel: fmtTime(inc.confirm_time),
              operatorId: incOperator,
              operatorName: '',
              status: '已确认',
              fields: [
                { key: 'incoming_no', label: '入库单号', value: inc.order_no || '' },
                { key: 'result',      label: '确认结果', value: '物料已收纳入库' },
              ],
              photos: [],
            });
          } else if (inc.status === '有问题' && inc.confirm_time) {
            timeline.push({
              stage: 'incoming_problem',
              stageLabel: '车间确认异常',
              time: inc.confirm_time,
              timeLabel: fmtTime(inc.confirm_time),
              operatorId: incOperator,
              operatorName: '',
              status: '有问题',
              fields: [
                { key: 'incoming_no', label: '入库单号', value: inc.order_no || '' },
                { key: 'problem',     label: '异常说明', value: inc.remark || '收料方反馈有问题' },
              ],
              photos: inc.photos || [],
            });
          }
        }
      } catch (e) {
        console.error('[boss-orderTimeline] 查 workshop_incoming_confirm 失败:', e);
      }

      // 取消
      if (order.status === '已取消' && order.updated_at) {
        operatorIds.push(order.cancel_by || order.creator_id || '');
        timeline.push({
          stage: 'cancelled',
          stageLabel: '已取消出库',
          time: order.updated_at,
          timeLabel: fmtTime(order.updated_at),
          operatorId: order.cancel_by || order.creator_id || '',
          operatorName: '',
          status: '已取消',
          fields: [
            { key: 'order_no', label: '出库单号', value: order.order_no || '' },
            { key: 'remark',   label: '取消说明', value: '出库已取消，库存已回退' },
          ],
          photos: [],
        });
      }
    }

    // ============ 模块 3：裁剪 ============
    if (module === 'cutting') {
      operatorIds.push(order.cutting_admin_id || order.creator_id);
      timeline.push({
        stage: 'created',
        stageLabel: '创建裁剪单',
        time: order.created_at,
        timeLabel: fmtTime(order.created_at),
        operatorId: order.cutting_admin_id || order.creator_id || '',
        operatorName: '',
        status: order.status || '',
        fields: [
          { key: 'order_no',    label: '裁剪单号',     value: order.order_no || '' },
          { key: 'gender',      label: '性别',         value: order.gender || '无' },
          { key: 'style',       label: '款型',         value: order.style || '无' },
          { key: 'school',      label: '学校',         value: order.school || '无' },
          { key: 'plan',        label: '计划裁剪数量', value: formatClothesDetails(order.plan_clothes_detail) },
          { key: 'usage',       label: '物料使用量',   value: formatMaterialDetails(order.material_actual_usage) },
          { key: 'remark',      label: '备注',         value: order.remark || '无' },
        ],
        photos: [],
      });
      // 车间裁剪确认
      if (order.workshop_confirm_time) {
        try {
          const wpRes = await db.collection('workshop_processing')
            .where({ cutting_order_id: order_id })
            .orderBy('created_at', 'desc').limit(1).get();
          let opId = '';
          if (wpRes.data && wpRes.data.length > 0) {
            opId = wpRes.data[0].workshop_admin_id || wpRes.data[0].creator_id || '';
          }
          operatorIds.push(opId);
          timeline.push({
            stage: 'cut_done',
            stageLabel: '裁剪完成（车间确认）',
            time: order.workshop_confirm_time,
            timeLabel: fmtTime(order.workshop_confirm_time),
            operatorId: opId,
            operatorName: '',
            status: '已裁剪',
            fields: [
              { key: 'order_no',  label: '裁剪单号',   value: order.order_no || '' },
              { key: 'plan',      label: '计划裁剪数量', value: formatClothesDetails(order.plan_clothes_detail) },
              { key: 'result',    label: '裁剪结果',   value: '车间已确认裁剪完成' },
            ],
            photos: [],
          });
        } catch (e) {
          console.error('[boss-orderTimeline] 查 workshop_processing 失败:', e);
        }
      }
      // 标记问题
      if (order.status === '有问题' && order.updated_at) {
        operatorIds.push(order.creator_id || '');
        timeline.push({
          stage: 'problem',
          stageLabel: '裁剪异常',
          time: order.updated_at,
          timeLabel: fmtTime(order.updated_at),
          operatorId: order.creator_id || '',
          operatorName: '',
          status: '有问题',
          fields: [
            { key: 'order_no', label: '裁剪单号', value: order.order_no || '' },
            { key: 'remark',   label: '异常说明', value: order.remark || '裁剪过程中出现问题' },
          ],
          photos: [],
        });
      }
    }

    // ============ 模块 4：加工 ============
    if (module === 'processing') {
      operatorIds.push(order.workshop_admin_id || order.creator_id);
      timeline.push({
        stage: 'created',
        stageLabel: '创建加工单',
        time: order.created_at,
        timeLabel: fmtTime(order.created_at),
        operatorId: order.workshop_admin_id || order.creator_id || '',
        operatorName: '',
        status: order.status || '',
        fields: [
          { key: 'order_no',   label: '加工单号',     value: order.order_no || '' },
          { key: 'gender',     label: '性别',         value: order.gender || '无' },
          { key: 'style',      label: '款型',         value: order.style || '无' },
          { key: 'school',     label: '学校',         value: order.school || '无' },
          { key: 'plan',       label: '计划加工数量', value: formatClothesDetails(order.plan_quantity) },
          { key: 'remark',     label: '备注',         value: order.remark || '无' },
        ],
        photos: [],
      });
      // 加工完成
      if (order.confirm_time) {
        try {
          const procRes = await db.collection('workshop_processing')
            .where({ processing_order_id: order_id })
            .orderBy('created_at', 'desc').limit(1).get();
          if (procRes.data && procRes.data.length > 0) {
            const proc = procRes.data[0];
            const opId = proc.creator_id || proc.workshop_admin_id || '';
            operatorIds.push(opId);
            timeline.push({
              stage: 'processed',
              stageLabel: '加工完成',
              time: order.confirm_time,
              timeLabel: fmtTime(order.confirm_time),
              operatorId: opId,
              operatorName: '',
              status: '已加工',
              fields: [
                { key: 'order_no',    label: '加工单号',     value: order.order_no || '' },
                { key: 'actual',      label: '实际加工数量', value: formatClothesDetails(proc.actual_quantity) },
                { key: 'loss_rate',   label: '损耗率',       value: formatLossRate(proc.loss_rate) || '无' },
                { key: 'accessory',   label: '辅料使用',     value: formatAccessoryUsage(proc.accessory_usage) },
                { key: 'remark',      label: '加工备注',     value: proc.remark || '无' },
              ],
              photos: proc.photos || [],
            });
          }
        } catch (e) {
          console.error('[boss-orderTimeline] 查 workshop_processing 失败:', e);
        }
      }
      // 成品入库
      try {
        const cfRes = await db.collection('finished_product_confirm')
          .where({ processing_order_id: order_id })
          .orderBy('created_at', 'desc').limit(1).get();
        if (cfRes.data && cfRes.data.length > 0) {
          const cf = cfRes.data[0];
          const opId = cf.finished_admin_id || cf.creator_id || '';
          operatorIds.push(opId);
          timeline.push({
            stage: 'stock_in',
            stageLabel: '成品入库',
            time: cf.confirm_time || cf.updated_at || cf.created_at,
            timeLabel: fmtTime(cf.confirm_time || cf.updated_at || cf.created_at),
            operatorId: opId,
            operatorName: '',
            status: cf.status || '已入库',
            fields: [
              { key: 'cf_no',   label: '入库单号',     value: cf.order_no || '' },
              { key: 'actual',  label: '入库数量',     value: formatClothesDetails(cf.actual_quantity) },
              { key: 'remark',  label: '入库备注',     value: cf.remark || '无' },
            ],
            photos: cf.photos || [],
          });
        }
      } catch (e) {
        console.error('[boss-orderTimeline] 查 finished_product_confirm 失败:', e);
      }
      // 标记问题
      if (order.status === '有问题' && order.updated_at) {
        operatorIds.push(order.creator_id || '');
        timeline.push({
          stage: 'problem',
          stageLabel: '加工异常',
          time: order.updated_at,
          timeLabel: fmtTime(order.updated_at),
          operatorId: order.creator_id || '',
          operatorName: '',
          status: '有问题',
          fields: [
            { key: 'order_no', label: '加工单号', value: order.order_no || '' },
            { key: 'remark',   label: '异常说明', value: order.remark || '加工过程中出现问题' },
          ],
          photos: [],
        });
      }
    }

    // ============ 模块 5：成品出库 ============
    if (module === 'finished_outbound') {
      operatorIds.push(order.creator_id);
      // 关联加工单号
      let processingNo = '';
      if (order.processing_order_id) {
        try {
          const pRes = await db.collection('processing_order').doc(order.processing_order_id).get();
          if (pRes.data) processingNo = pRes.data.order_no || '';
        } catch (e) { /* ignore */ }
      }
      const outboundText = formatOutboundDetails(order.outbound_details);
      timeline.push({
        stage: 'created',
        stageLabel: '成品出库（创建即完成）',
        time: order.created_at,
        timeLabel: fmtTime(order.created_at),
        operatorId: order.creator_id || '',
        operatorName: '',
        status: order.status || '',
        fields: [
          { key: 'order_no',   label: '出库单号',     value: order.order_no || '' },
          { key: 'processing', label: '来源加工单',   value: processingNo || '无' },
          { key: 'destination',label: '出库去向',     value: order.destination || '无' },
          { key: 'detail',     label: '出库明细',     value: outboundText },
          { key: 'remark',     label: '备注',         value: order.remark || '无' },
        ],
        photos: order.photos || [],
      });
    }

    // ============ 解析操作人姓名 ============
    const empMap = await resolveEmployee(db, operatorIds);
    timeline.forEach(t => {
      t.operatorName = empMap[t.operatorId] || '未知';
    });

    // 按时间升序
    timeline.sort((a, b) => {
      const ta = a.time ? new Date(a.time).getTime() : 0;
      const tb = b.time ? new Date(b.time).getTime() : 0;
      return ta - tb;
    });

    return { success: true, data: { timeline, order } };
  } catch (e) {
    console.error('[boss-orderTimeline] 查询失败:', e);
    return { success: false, error: '查询失败：' + (e.message || String(e)) };
  }
};

// ============ 成品出库明细格式化 ============
function formatOutboundDetails(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return '无';
  return arr.map((m, i) => {
    const gender = m.gender || '';
    const style = m.style || '';
    const school = m.school || '';
    const size = m.size || '';
    const qty = m.quantity != null ? m.quantity : '';
    return `${i + 1}. ${gender} ${style} ${school} ${size ? size + '码 ' : ''}${qty} 件`.trim();
  }).join('\n');
}
