// pages/raw/outbound/add/index.js
const { callCloud } = require('../../../../utils/request.js');
const pageGuard = require('../../../../utils/page-guard.js');
const app = getApp();

pageGuard({
  moduleKey: 'raw',
  data: {
    form: { material_details: [], target_type: 'cutting', target_admin_id: '' },
    targetOptions: [],
    targetIndex: -1,
    cat1Options: ['布料', '辅料'],
    cat2OptionsByCat1: {
      '布料': [],
      '辅料': [],
    },
    // 库存数据：key = `${cat1}|${cat2}`，value = { stock: 100, unit: '米' }
    stockMap: {},
    loading: false,
  },

  onLoad() {
    // 根据当前角色自动判断 target_type：
    // - 裁剪管理员 → target_type='cutting'
    // - 车间管理员 → target_type='workshop'
    // - 原材料管理员 → 不自动设置，让用户选
    const userInfo = app.getUserInfo() || {};
    const role = userInfo.role || '';
    let defaultTargetType = '';
    if (role === '裁剪管理员') defaultTargetType = 'cutting';
    else if (role === '车间管理员') defaultTargetType = 'workshop';

    this.setData({ 'form.target_type': defaultTargetType });

    this.loadTargets();
    this.loadAllCat2Options();
    this.loadAllStock();
    this.onAddMaterial();
  },

  // 一次性加载所有库存（拉一次全量）
  loadAllStock() {
    callCloud('raw-stockList', { pageSize: 200 }, { silent: true }).then(res => {
      const arr = (res && res.list) || [];
      const stockMap = {};
      arr.forEach(item => {
        const key = `${item.category_one}|${item.category_two}`;
        stockMap[key] = {
          stock: item.total_quantity || 0,
          unit: item.unit || '',
          warning: item.warning_threshold || 0,
        };
      });
      this.setData({ stockMap });
      // 如果已经有物料行，重新计算显示
      this.refreshMaterialStockDisplay();
    }).catch(() => {});
  },

  // 工具：根据 cat1+cat2 查库存
  getStock(cat1, cat2) {
    if (!cat1 || !cat2) return null;
    return this.data.stockMap[`${cat1}|${cat2}`] || null;
  },

  // 当库存加载完/分类切换时，把每行物料的"stockDisplay"算出来
  refreshMaterialStockDisplay() {
    const details = this.data.form.material_details.map(m => {
      const s = this.getStock(m.category_one, m.category_two);
      return {
        ...m,
        stockQty: s ? s.stock : null,
        stockUnit: s ? s.unit : (m.unit || ''),
      };
    });
    this.setData({ 'form.material_details': details });
  },

  loadTargets() {
    callCloud('employee-list', {}).then(data => {
      // callCloud 已 unwrap result.data；可能直接是数组，也可能是 {list: []}
      const arr = Array.isArray(data) ? data : (data && data.list) || [];
      const userInfo = app.getUserInfo() || {};
      const role = userInfo.role || '';

      let targets = [];
      if (role === '裁剪管理员' || role === '车间管理员') {
        // 领料方视角：只显示自己
        targets = arr.filter(e => e._id === userInfo._id);
        // 强制把 target_admin_id 设为当前用户
        this.setData({
          targetOptions: targets,
          targetIndex: 0,
          'form.target_admin_id': userInfo._id,
        });
      } else {
        // 原材料管理员视角：列出所有裁剪+车间管理员
        targets = arr.filter(e => e.role === '裁剪管理员' || e.role === '车间管理员');
        this.setData({ targetOptions: targets });
      }
    }).catch(() => {});
  },

  loadAllCat2Options() {
    callCloud('option-list', { type: 'category_two' }).then(data => {
      const groups = { '布料': [], '辅料': [] };
      (data || []).forEach(item => {
        const cat1 = item.category_one || '';
        if (groups[cat1]) {
          groups[cat1].push(item);
        }
      });
      this.setData({ cat2OptionsByCat1: groups });
    }).catch(() => {});
  },

  onAddMaterial() {
    const details = [...this.data.form.material_details, {
      category_one: '',
      category_two: '',
      cat1Index: -1,
      cat2Index: -1,
      cat2Options: [],
      quantity: '',
      unit: '米'
    }];
    this.setData({ 'form.material_details': details });
  },

  onRemoveMaterial(e) {
    const details = this.data.form.material_details.filter((_, i) => i !== e.currentTarget.dataset.index);
    this.setData({ 'form.material_details': details });
  },

  onCat1Change(e) {
    const idx = e.currentTarget.dataset.index;
    const cat1 = this.data.cat1Options[e.detail.value];
    const details = [...this.data.form.material_details];
    details[idx].cat1Index = e.detail.value;
    details[idx].category_one = cat1;
    details[idx].unit = cat1 === '布料' ? '米' : '个';
    details[idx].category_two = '';
    details[idx].cat2Index = -1;
    details[idx].cat2Options = this.data.cat2OptionsByCat1[cat1] || [];
    // 重算库存显示
    const s = this.getStock(cat1, '');
    details[idx].stockQty = s ? s.stock : null;
    details[idx].stockUnit = s ? s.unit : (details[idx].unit || '');
    this.setData({ 'form.material_details': details });
  },

  onCat2Change(e) {
    const idx = e.currentTarget.dataset.index;
    const details = [...this.data.form.material_details];
    details[idx].cat2Index = e.detail.value;
    const opt = details[idx].cat2Options[e.detail.value];
    details[idx].category_two = opt ? (opt.name || '') : '';
    // 重算库存显示
    const s = this.getStock(details[idx].category_one, details[idx].category_two);
    details[idx].stockQty = s ? s.stock : null;
    details[idx].stockUnit = s ? s.unit : (details[idx].unit || '');
    this.setData({ 'form.material_details': details });
  },

  onMaterialInput(e) {
    const { index, field } = e.currentTarget.dataset;
    const details = [...this.data.form.material_details];
    details[index][field] = e.detail.value;
    this.setData({ 'form.material_details': details });
  },

  onTargetTypeChange(e) {
    this.setData({ 'form.target_type': e.currentTarget.dataset.type });
  },

  onTargetChange(e) {
    const target = this.data.targetOptions[e.detail.value];
    if (!target) return;
    this.setData({ targetIndex: e.detail.value, 'form.target_admin_id': target._id });
  },

  onSubmit() {
    const { material_details, target_type, target_admin_id } = this.data.form;
    let valid = material_details.filter(m => m.category_one && m.category_two && m.quantity);
    if (!valid.length) return wx.showToast({ title: '请完善物料明细', icon: 'none' });
    if (!target_admin_id) return wx.showToast({ title: '请选择目标管理员', icon: 'none' });

    // 库存校验：出库数量不能超过当前库存
    for (const m of valid) {
      const s = this.getStock(m.category_one, m.category_two);
      const stock = s ? s.stock : 0;
      const qty = parseInt(m.quantity);
      if (stock <= 0) {
        return wx.showToast({
          title: `【${m.category_two}】库存为 0，无法出库`,
          icon: 'none',
          duration: 2500,
        });
      }
      if (qty > stock) {
        return wx.showToast({
          title: `【${m.category_two}】库存仅 ${stock} ${m.unit}，出库 ${qty} 超出`,
          icon: 'none',
          duration: 2500,
        });
      }
    }

    this.setData({ loading: true });
    const userInfo = app.getUserInfo();
    callCloud('raw-outboundAdd', {
      material_details: valid.map(m => ({ category_one: m.category_one, category_two: m.category_two, quantity: parseInt(m.quantity), unit: m.unit })),
      target_type,
      target_admin_id,
      creator_id: userInfo._id,
    }).then(() => {
      wx.showToast({ title: '出库成功', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 1500);
    }).catch(err => {
      wx.showToast({ title: (err && err.error) || err || '出库失败', icon: 'none' });
      this.setData({ loading: false });
    });
  },
});
