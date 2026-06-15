// pages/finished/outbound/add/index.js
const { callCloud } = require('../../../../utils/request.js');
const { mapAvailableProcessing } = require('../../../../utils/field-map.js');
const pageGuard = require('../../../../utils/page-guard.js');
const app = getApp();

pageGuard({
  moduleKey: 'finished_outbound',
  data: {
    orderList: [],
    destinationList: [],
    selectedOrder: null,
    selectedDestination: null,
    // 各尺码明细：[{ size, orderQty, stockQty, outQty }]
    sizeBreakdown: [],
    // 加载状态：'' 正常 | 'loading' 加载中
    sizeLoading: '',
    count: '', // 兼容老字段（汇总值），保留展示用
    remark: ''
  },

  onLoad() {
    this.loadOrderList();
    this.loadDestinationList();
  },

  onShow() {
    // 从其他页面返回时（包括出库成功后回到首页再切回），重新拉订单列表
    // 确保 actual_quantity 是最新的（已扣减过出库件数）
    this.loadOrderList();
    this.loadDestinationList();
  },

  // 工具：算 sizeBreakdown 各列合计，写入 data
  _applyBreakdownTotals(breakdown) {
    const totalOrderQty = (breakdown || []).reduce((s, it) => s + (Number(it.orderQty) || 0), 0);
    const totalStockQty = (breakdown || []).reduce((s, it) => s + (Number(it.stockQty) || 0), 0);
    const totalOutQty = (breakdown || []).reduce((s, it) => s + (Number(it.outQty) || 0), 0);
    return { sizeBreakdown: breakdown, totalOrderQty, totalStockQty, totalOutQty };
  },

  loadOrderList() {
    wx.showLoading({ title: '加载中...' });
    callCloud('finished-availableOrderList').then(res => {
      const list = (res || [])
        .map(item => mapAvailableProcessing(item))
        // 过滤掉所有尺码 count 均为 0 的订单
        .filter(item => {
          const aq = item && item.actual_quantity;
          if (!Array.isArray(aq) || aq.length === 0) return false;
          return aq.some(a => Number(a && a.count) > 0);
        });
      this.setData({ orderList: list });
    }).finally(() => wx.hideLoading());
  },

  loadDestinationList() {
    callCloud('option-list', { type: 'destination' }).then(res => {
      const arr = Array.isArray(res) ? res : (res && res.data) || [];
      this.setData({ destinationList: arr });
    }).catch(() => {});
  },

  onOrderChange(e) {
    const index = e.detail.value;
    const order = this.data.orderList[index];
    // 关键修复：切换订单时立即设置占位 "加载中"，避免短暂显示 0 误以为没库存
    this.setData({
      selectedOrder: { ...order, availableCount: '加载中...' },
      sizeBreakdown: [],
      sizeLoading: 'loading',
      count: '',
    });
    if (order && order.gender && order.style && order.school) {
      this.loadSizeBreakdown(order);
    } else {
      this.setData({
        selectedOrder: { ...order, availableCount: 0 },
        sizeBreakdown: [],
        sizeLoading: '',
      });
    }
  },

  // 加载尺码明细：以"该加工单 actual_quantity[]" 为准
  // 用户需求：显示的是这个加工单里各尺码的件数（已完工的件数），
  //          不是 finished_product_stock 表里的成品总库存
  // 输出 [{ size, orderQty, stockQty, outQty }]，stockQty 同 orderQty
  //     （出库数量不能超过该加工单的件数）
  loadSizeBreakdown(order) {
    // 1. 从加工单的 actual_quantity[] 拿到所有尺码的件数
    const orderSizes = (order && order.actual_quantity) || [];
    const orderMap = {};
    let totalOrderQty = 0;
    orderSizes.forEach(a => {
      const sz = a && (a.size || '');
      const cnt = Number(a && a.count) || 0;
      if (sz) {
        orderMap[sz] = (orderMap[sz] || 0) + cnt;
        totalOrderQty += cnt;
      }
    });
    const orderSizeList = Object.keys(orderMap);

    // 2. 构建 sizeBreakdown：每个尺码一行
    //    orderQty = 加工单里该尺码件数（已完工）
    //    stockQty = 加工单里该尺码件数（用户视角：这就是该订单的"可出库库存"）
    //    outQty   = 0（默认）
    const breakdown = orderSizeList.map(sz => ({
      size: sz,
      orderQty: orderMap[sz] || 0,
      stockQty: orderMap[sz] || 0,
      outQty: 0,
    })).sort((a, b) => {
      // 数字尺码按数值排，否则字母排
      const na = parseFloat(a.size);
      const nb = parseFloat(b.size);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return String(a.size).localeCompare(String(b.size));
    });

    // 3. 更新 data
    //    availableCount = 该加工单的总数（订单总数，不是库存总数）
    const baseOrder = this.data.selectedOrder || order;
    this.setData({
      selectedOrder: { ...baseOrder, availableCount: totalOrderQty },
      ...this._applyBreakdownTotals(breakdown),
      sizeLoading: '',
    });
  },

  // 用户输入某个尺码的出库数量
  onSizeOutInput(e) {
    const idx = e.currentTarget.dataset.idx;
    const val = e.detail.value;
    const breakdown = (this.data.sizeBreakdown || []).map((it, i) => {
      if (i !== idx) return it;
      // 限制：不能超过该订单的件数（orderQty=stockQty），不能为负
      let n = parseInt(val) || 0;
      if (n < 0) n = 0;
      if (n > it.orderQty) n = it.orderQty;
      return { ...it, outQty: n };
    });
    this.setData({ ...this._applyBreakdownTotals(breakdown) });
  },

  // 快速填满：把订单里所有尺码填成"订单件数"
  onFillAll() {
    const breakdown = (this.data.sizeBreakdown || []).map(it => ({
      ...it,
      outQty: Number(it.orderQty) || 0,
    }));
    this.setData({ ...this._applyBreakdownTotals(breakdown) });
  },

  // 清空出库数量
  onClearAll() {
    const breakdown = (this.data.sizeBreakdown || []).map(it => ({ ...it, outQty: 0 }));
    this.setData({ ...this._applyBreakdownTotals(breakdown) });
  },

  // 调试：对比订单件数与成品库存，找出不一致的尺码
  onDebugCompare() {
    const { selectedOrder } = this.data;
    if (!selectedOrder) {
      wx.showToast({ title: '请先选择加工单', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '查询中...' });
    Promise.all([
      // 1) 查该加工单的 actual_quantity[]
      callCloud('finished-stockList', {
        gender: selectedOrder.gender,
        style: selectedOrder.style,
        season: selectedOrder.season,
        school: selectedOrder.school,
        page: 1,
        pageSize: 100,
      }, { silent: true, showLoading: false }).catch(() => ({ list: [] })),
      // 2) 查成品库存
      // 注意：finished-stockList 返回的 list 已经按 gender+style+season+school 分组了
    ]).then(([stockRes]) => {
      wx.hideLoading();
      const orderMap = {};
      let orderTotal = 0;
      (selectedOrder.actual_quantity || []).forEach(a => {
        const sz = a && (a.size || '');
        const cnt = Number(a && a.count) || 0;
        if (sz) {
          orderMap[sz] = (orderMap[sz] || 0) + cnt;
          orderTotal += cnt;
        }
      });
      const stockList = (stockRes && stockRes.list) || [];
      const stockMap = {};
      let stockTotal = 0;
      stockList.forEach(it => {
        const sz = it.size || '';
        const qty = Number(it.quantity) || 0;
        if (sz) {
          stockMap[sz] = qty;
          stockTotal += qty;
        }
      });
      const allSizes = new Set([...Object.keys(orderMap), ...Object.keys(stockMap)]);
      const lines = [];
      lines.push(`订单件数合计：${orderTotal}`);
      lines.push(`成品库存合计：${stockTotal}`);
      lines.push('');
      const arr = Array.from(allSizes).sort((a, b) => {
        const na = parseFloat(a);
        const nb = parseFloat(b);
        if (!isNaN(na) && !isNaN(nb)) return na - nb;
        return String(a).localeCompare(String(b));
      });
      arr.forEach(sz => {
        const oq = orderMap[sz] || 0;
        const sq = stockMap[sz] || 0;
        const mark = oq > sq ? '⚠️' : (oq < sq ? '📦' : '✓');
        lines.push(`${mark} 尺码 ${sz}: 订单 ${oq} / 库存 ${sq}`);
      });
      lines.push('');
      lines.push('⚠️ = 库存不足；📦 = 库存多于订单；✓ = 一致');
      wx.showModal({
        title: '数据对比',
        content: lines.join('\n'),
        showCancel: false,
      });
    }).catch(err => {
      wx.hideLoading();
      wx.showToast({ title: '查询失败', icon: 'none' });
    });
  },

  onDestinationChange(e) {
    const index = e.detail.value;
    this.setData({ selectedDestination: this.data.destinationList[index] });
  },

  onCountInput(e) {
    this.setData({ count: e.detail.value });
  },

  onRemarkInput(e) {
    this.setData({ remark: e.detail.value });
  },

  onAddDestination() {
    // 需求 4.4.3: 点击「新增目的地」输入名称
    wx.showModal({
      title: '新增出库目的地',
      content: '请输入新的目的地名称',
      editable: true,
      placeholderText: '例如: 滨江校区 / 萧山仓库',
      success: res => {
        if (res.confirm && res.content && res.content.trim()) {
          const name = res.content.trim();
          // 调云函数写 option 集合
          wx.showLoading({ title: '保存中...' });
          callCloud('option-add', { type: 'destination', name, value: name })
            .then(() => {
              wx.hideLoading();
              wx.showToast({ title: '已添加' });
              // 重新拉列表并自动选上新建的
              this.loadDestinationList();
              // 等列表刷新完后默认选最后一个（即新加的）
              setTimeout(() => {
                const list = this.data.destinationList;
                const idx = list.findIndex(x => (x.name || x.value) === name);
                if (idx >= 0) {
                  this.setData({ selectedDestination: list[idx] });
                } else {
                  // 后端 sort 后位置可能变了
                  this.setData({ selectedDestination: { name, value: name } });
                }
              }, 500);
            })
            .catch(err => {
              wx.hideLoading();
              wx.showToast({ title: '添加失败：' + (err && err.message ? err.message : err), icon: 'none' });
            });
        } else if (res.confirm) {
          wx.showToast({ title: '名称不能为空', icon: 'none' });
        }
      }
    });
  },

  onSubmit() {
    const { selectedOrder, selectedDestination, sizeBreakdown, remark } = this.data;
    if (!selectedOrder) {
      wx.showToast({ title: '请选择加工单', icon: 'none' });
      return;
    }
    if (!selectedDestination) {
      wx.showToast({ title: '请选择目的地', icon: 'none' });
      return;
    }

    // 收集所有 outQty > 0 的尺码作为出库明细（SKU 5 维：gender+style+season+school+size）
    const outboundDetails = (sizeBreakdown || [])
      .filter(it => Number(it.outQty) > 0)
      .map(it => ({
        gender: selectedOrder.gender || '',
        style:  selectedOrder.style  || '',
        season: selectedOrder.season || '',
        school: selectedOrder.school || '',
        size: it.size,
        quantity: Number(it.outQty) || 0,
      }));

    if (outboundDetails.length === 0) {
      wx.showToast({ title: '请至少填一个尺码的出库数量', icon: 'none' });
      return;
    }

    // 校验：每个尺码的 outQty 不超过该订单的件数（理论上输入时已限制，但兜底再校验一次）
    for (const it of outboundDetails) {
      const sz = sizeBreakdown.find(s => s.size === it.size);
      if (sz && it.quantity > sz.orderQty) {
        wx.showToast({ title: `尺码 ${it.size} 出库数量超过订单件数 ${sz.orderQty}`, icon: 'none' });
        return;
      }
    }

    const totalOut = outboundDetails.reduce((s, it) => s + it.quantity, 0);
    const userInfo = app.getUserInfo() || {};

    // 确认弹窗：让用户核对
    const detailText = outboundDetails
      .map(it => `${it.size} × ${it.quantity}`)
      .join('，');
    wx.showModal({
      title: `确认出库 ${totalOut} 件？`,
      content: detailText,
      success: modalRes => {
        if (!modalRes.confirm) return;
        // 静默模式：自己控制 loading 和 toast 避免重复
        callCloud('finished-outboundAdd', {
          processing_order_id: selectedOrder.id,
          outbound_details: outboundDetails,
          destination: selectedDestination.name || selectedDestination.value || '',
          photos: [],
          creator_id: userInfo._id || '',
          remark: remark || ''
        }, { silent: true, showLoading: true }).then(() => {
          wx.showToast({ title: '出库成功', icon: 'success' });
          // 提交成功后清空当前选择，避免快速回退看到旧的出库数
          this.setData({
            selectedOrder: null,
            sizeBreakdown: [],
            sizeLoading: '',
            count: '',
          });
          setTimeout(() => wx.switchTab({ url: '/pages/index/index' }), 1500);
        }).catch(err => {
          // 优先显示云函数返回的详细错误
          const failInfo = err && err.result && err.result.stockFailInfo;
          let msg = (err && err.message) ? err.message : '出库失败';
          // toast 长度限制 7 个汉字，把详细错误放到 modal
          if (failInfo) {
            const detail = `尺码 ${failInfo.size}：订单件数 ${failInfo.orderQty}，成品库存 ${failInfo.stockQty}，需要出 ${failInfo.needQty}。\n\n请联系管理员核对数据。`;
            wx.showModal({
              title: '出库失败',
              content: detail,
              showCancel: false,
            });
          } else {
            wx.showToast({ title: msg.length > 30 ? msg.slice(0, 30) + '...' : msg, icon: 'none', duration: 3000 });
          }
        });
      }
    });
  },

  onBackHome() {
    wx.switchTab({ url: '/pages/index/index' });
  }
});
