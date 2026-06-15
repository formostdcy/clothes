// pages/workshop/processing/add/index.js
const { callCloud } = require('../../../../utils/request.js');
const { mapProcessingSource, safe } = require('../../../../utils/field-map.js');
const pageGuard = require('../../../../utils/page-guard.js');
const app = getApp();

pageGuard({
  moduleKey: 'workshop',
  data: {
    confirmedList: [],
    selectedOrder: null,
    // 多尺码实际件数：{ 'S': 50, 'M': 60, ... }
    actualBySize: {},
    // 兼容单值（无尺码明细时）
    actualCount: '',
    // 损耗率（自动计算，已保留 2 位小数）
    lossRate: '',
    lossRateText: '0.00%',
    lossRateClass: 'good',
    // 辅料使用量：{ '纽扣': 200, '拉链': 50, ... }
    accessoryUsage: {},
    // 辅料分类选项（从 option-list 拉的辅料二级分类）
    accessoryOptions: [],
    // 辅料库存：{ '纽扣': { stock: 200, unit: '个' }, '拉链': { stock: 50, unit: '条' } }
    accessoryStockMap: {},
    // 辅料超额标记：{ '纽扣': true, ... } 用于前端红框/红字提示
    accessoryWarn: {},
    // 详情模式
    viewMode: false,
    recordId: '',
    detail: null,
    accessoryDetailList: [],   // 详情模式用
  },

  onLoad(options) {
    // 并行拉取辅料分类（编辑模式不需拉）
    this.loadAccessoryOptions();
    this.loadAccessoryStock();
    if (options && options.id) {
      this.setData({ viewMode: true, recordId: options.id });
      this.loadDetail();
    } else {
      this.loadConfirmedList();
    }
  },

  // 每次页面回到前台时（含 navigateBack 从其他页面返回、tabBar 切回）刷新一次库存
  // 关键：用户上一次提交扣减了库存，返回时即可看到正确扣减后的数字
  onShow() {
    if (this.data.viewMode) return;  // 详情模式不拉
    this.loadAccessoryStock();
  },

  // 详情加载
  loadDetail() {
    callCloud('workshop-processingDetail', { id: this.data.recordId }).then(res => {
      // 优先用 plan_clothes_detail（裁剪单原始），否则用 plan_quantity（加工单）
      const planFromCutting = res.plan_clothes_detail || [];
      const planSizes = planFromCutting.length
        ? planFromCutting.map(p => ({ size: p.size || '', count: Number(p.count) || 0 }))
        : (res.plan_quantity || []).map(p => ({ size: p.size || '', count: Number(p.count) || 0 }));
      // 实际件数按尺码
      const actualBySize = {};
      (res.actual_quantity || []).forEach(a => {
        if (a && a.size) actualBySize[a.size] = a.count;
      });
      const planCount = planSizes.reduce((s, p) => s + p.count, 0);
      const actualCount = (res.actual_quantity || []).reduce((s, a) => s + (Number(a.count) || 0), 0);
      const lossRateVal = planCount > 0 ? ((planCount - actualCount) / planCount * 100) : 0;
      const accessoryDetail = (res.accessory_usage || []).map(a => ({
        name: a.category_two || a.name || '辅料',
        value: a.value || a.quantity || a.count || 0,
        unit: a.unit || ''
      }));
      this.setData({
        detail: res,
        selectedOrder: {
          orderNo: res.order_no || '',
          materialName: (res.actual_quantity && res.actual_quantity[0] && res.actual_quantity[0].category_two) || res.category_two || '',
          planCount,
          planSizes,
          school: res.school || '',
          style: res.style || '',
          gender: res.gender || '',
        },
        actualBySize,
        actualCount: String(actualCount || ''),
        lossRate: lossRateVal.toFixed(2),
        lossRateText: lossRateVal.toFixed(2) + '%',
        lossRateClass: lossRateVal > 5 ? 'warn' : (lossRateVal < 0 ? 'bad' : 'good'),
        accessoryDetailList: accessoryDetail,
      });
    }).catch(() => {
      // 兜底：从列表里查
      callCloud('workshop-processingList', { page: 1, pageSize: 50 }).then(r => {
        const target = (r.list || []).find(x => x._id === this.data.recordId);
        if (target) {
          const planSizes2 = (target.plan_quantity || []).map(p => ({ size: p.size || '', count: Number(p.count) || 0 }));
          this.setData({
            detail: target,
            selectedOrder: {
              orderNo: target.order_no || '',
              materialName: safe(target, 'actual_quantity.0.category_two', '') || target.category_two || '',
              planCount: planSizes2.reduce((s, p) => s + p.count, 0),
              planSizes: planSizes2,
              school: target.school || '',
              style: target.style || '',
              gender: target.gender || '',
            },
            actualCount: String((target.actual_quantity || []).reduce((s, a) => s + (Number(a.count) || 0), 0) || ''),
          });
        }
      });
    });
  },

  // 拉取已确认裁剪单（下拉用）
  loadConfirmedList() {
    callCloud('workshop-confirmedList').then(res => {
      const list = (res || []).map(item => mapProcessingSource(item));
      this.setData({ confirmedList: list });
    });
  },

  // 拉取辅料二级分类
  loadAccessoryOptions() {
    callCloud('option-list', { type: 'category_two' }, { silent: true }).then(data => {
      const arr = Array.isArray(data) ? data : [];
      const accessoryList = arr
        .filter(item => (item.category_one || '') === '辅料')
        .map(item => ({ _id: item._id, name: item.name || item.category_two || '', unit: item.unit || '' }));
      this.setData({ accessoryOptions: accessoryList });
    }).catch(() => {});
  },

  // 拉取辅料库存（按 category_one='辅料' 过滤）
  // 关键：读取的是「车间辅料库 workshop_stock」而不是「原材料库 raw_material_stock」
  // - 车间辅料库存 = 原材料出库到车间并经车间确认入库的辅料
  // - 新建生产单消耗的是车间辅料库存
  // - 必须按 workshop_admin_id 过滤，否则会把别的车间的库存也算进来
  loadAccessoryStock() {
    const userInfo = wx.getStorageSync('userInfo') || {};
    const workshopAdminId = userInfo._id || '';
    if (!workshopAdminId) {
      console.warn('[辅料库存] 缺少 workshop_admin_id，跳过拉取');
      return;
    }
    callCloud('workshop-stockList', {
      workshop_admin_id: workshopAdminId,
      page: 1,
      pageSize: 100
    }, { silent: true }).then(res => {
      console.log('[车间辅料库存] 拉取返回:', JSON.stringify(res));
      const list = (res && res.list) || [];
      console.log('[车间辅料库存] list 长度:', list.length, '内容:', JSON.stringify(list));
      const stockMap = {};
      list.forEach(item => {
        if (item && item.category_two) {
          stockMap[item.category_two] = {
            stock: Number(item.total_quantity) || 0,
            unit: item.unit || ''
          };
        }
      });
      console.log('[车间辅料库存] 解析后 stockMap:', JSON.stringify(stockMap));
      this.setData({ accessoryStockMap: stockMap });
    }).catch(err => {
      console.error('[车间辅料库存] 拉取失败:', err);
    });
  },

  // 选中裁剪单
  onOrderChange(e) {
    if (this.data.viewMode) return;
    const index = e.detail.value;
    const selected = this.data.confirmedList[index];
    // 重置多尺码件数 + 辅料 + 损耗率
    this.setData({
      selectedOrder: selected,
      actualBySize: {},
      actualCount: '0',
      lossRate: '0.00',
      lossRateText: '0.00%',
      lossRateClass: 'good',
      accessoryUsage: {},
      accessoryWarn: {},
    }, () => this.recalcLossRate());
  },

  // 多尺码实际件数输入
  onActualBySizeInput(e) {
    const size = e.currentTarget.dataset.size;
    const val = e.detail.value;
    const next = { ...this.data.actualBySize, [size]: val };
    this.setData({ actualBySize: next }, () => this.recalcLossRate());
  },

  // 单值件数输入（兜底）
  onActualCountInput(e) {
    this.setData({ actualCount: e.detail.value });
  },

  // 辅料使用量输入 + 实时超库存校验
  onAccessoryInput(e) {
    const name = e.currentTarget.dataset.name;
    const val = e.detail.value;
    const numVal = Number(val) || 0;
    // 检查是否超过库存
    const stockInfo = this.data.accessoryStockMap[name];
    const stock = stockInfo ? stockInfo.stock : Infinity;
    const warn = numVal > stock;
    this.setData({
      accessoryUsage: { ...this.data.accessoryUsage, [name]: val },
      accessoryWarn: { ...this.data.accessoryWarn, [name]: warn },
    });
  },

  // 自动重新计算损耗率
  recalcLossRate() {
    const plan = Number(this.data.selectedOrder && this.data.selectedOrder.planCount) || 0;
    let actual = 0;
    const sizes = (this.data.selectedOrder && this.data.selectedOrder.planSizes) || [];
    if (sizes.length) {
      sizes.forEach(s => {
        actual += Number(this.data.actualBySize[s.size]) || 0;
      });
    } else {
      actual = Number(this.data.actualCount) || 0;
    }
    let rate = 0;
    if (plan > 0) {
      rate = (plan - actual) / plan * 100;
    }
    const rateStr = rate.toFixed(2);
    const cls = rate > 5 ? 'warn' : (rate < 0 ? 'bad' : 'good');
    this.setData({
      actualCount: String(actual),
      lossRate: rateStr,
      lossRateText: rateStr + '%',
      lossRateClass: cls,
    });
  },

  onSubmit() {
    if (this.data.viewMode) {
      wx.navigateBack();
      return;
    }
    const { selectedOrder, actualBySize, actualCount, accessoryUsage, accessoryOptions } = this.data;
    if (!selectedOrder) {
      wx.showToast({ title: '请选择裁剪单', icon: 'none' });
      return;
    }
    const planCountFromOrder = selectedOrder.planCount || 0;
    const actualNum = parseInt(actualCount) || 0;
    if (actualNum <= 0) {
      wx.showToast({ title: '请填写实际件数', icon: 'none' });
      return;
    }
    // 校验多尺码必须填全
    const sizes = selectedOrder.planSizes || [];
    if (sizes.length) {
      const missing = sizes.filter(s => !actualBySize[s.size] || Number(actualBySize[s.size]) < 0);
      if (missing.length) {
        wx.showToast({ title: `请填写尺码 ${missing.map(m => m.size).join('/')} 的实际件数`, icon: 'none' });
        return;
      }
    }
    this._doSubmit();
  },

  // 真正提交
  // 关键：库存扣减、cutting_order 终态、加工单写入，全部由云函数事务保证
  // 前端不做"提交前重拉"——信任后端事务，失败时云函数会回滚并返回明确错误
  _doSubmit() {
    const { selectedOrder, actualBySize, actualCount, accessoryUsage, accessoryOptions } = this.data;
    const planCountFromOrder = selectedOrder.planCount || 0;
    const sizes = selectedOrder.planSizes || [];
    const actualNum = parseInt(actualCount) || 0;
    const userInfo = app.getUserInfo() || {};
    // 构造多尺码实际件数（用于入库）
    const actualQuantityList = sizes.length
      ? sizes.map(s => ({ size: s.size, count: Number(actualBySize[s.size]) || 0, category_two: selectedOrder.materialName || '' }))
      : [{ count: actualNum, category_two: selectedOrder.materialName || '' }];
    const planQuantityList = sizes.length
      ? sizes.map(s => ({ size: s.size, count: s.count }))
      : [{ count: planCountFromOrder }];
    // 构造辅料使用量数组
    const accessoryList = (accessoryOptions || [])
      .filter(opt => accessoryUsage[opt.name] && Number(accessoryUsage[opt.name]) > 0)
      .map(opt => ({
        category_two: opt.name,
        name: opt.name,
        value: Number(accessoryUsage[opt.name]) || 0,
        unit: opt.unit || ''
      }));
    callCloud('workshop-processingAdd', {
      source_type: 'cutting',
      workshop_confirm_id: selectedOrder.id,
      workshop_admin_id: userInfo._id || '',
      plan_quantity: planQuantityList,
      actual_quantity: actualQuantityList,
      loss_rate: [{ value: Number(this.data.lossRate) || 0 }],
      accessory_usage: accessoryList,
      gender: selectedOrder.gender || '',
      style: selectedOrder.style || '',
      school: selectedOrder.school || ''
    }).then(res => {
      // 关键：提交成功后立即本地乐观扣减，让用户在小字库存处看到数字变化
      // 这样用户再次进加工单页时 onLoad/onShow 拉到数据库最新值也保持一致
      const newStockMap = { ...this.data.accessoryStockMap };
      const usedSummary = [];
      accessoryList.forEach(a => {
        const name = a.name;
        const dec = Number(a.value) || 0;
        if (newStockMap[name]) {
          const before = newStockMap[name].stock;
          const after = Math.max(0, before - dec);
          newStockMap[name] = { ...newStockMap[name], stock: after };
          usedSummary.push(`${name} ${before}→${after}`);
        }
      });
      // 同步清掉已扣项的 warn（库存已变少，不再超额）
      const newWarn = { ...(this.data.accessoryWarn || {}) };
      accessoryList.forEach(a => delete newWarn[a.name]);
      this.setData({ accessoryStockMap: newStockMap, accessoryWarn: newWarn });
      console.log('[提交成功] 本地乐观扣减库存:', usedSummary.join('，'));
      // 提示扣减明细
      wx.showToast({
        title: usedSummary.length ? `已扣减：${usedSummary[0]}${usedSummary.length > 1 ? '...' : ''}` : '提交成功',
        icon: 'success',
        duration: 2000
      });
      setTimeout(() => wx.navigateBack(), 1800);
    });
  }
});
