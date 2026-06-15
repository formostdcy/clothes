// pages/cutting/cutting/add/index.js
const { callCloud } = require('../../../../utils/request.js');
const { mapCuttingIncoming, safe } = require('../../../../utils/field-map.js');
const pageGuard = require('../../../../utils/page-guard.js');
const app = getApp();

/**
 * 裁剪加工单 新建/详情
 *
 * viewMode=false: 新建模式
 *   1. 加载已确认的来料列表
 *   2. 加载字典（学校/款式/尺码/性别/车间）
 *   3. 用户选择来料 → 自动填充物料明细
 *   4. 用户填写物料使用量 + 多选尺码 + 性别/款式/学校 + 各尺码件数
 *   5. 选择目标车间 + 备注
 *   6. 提交 → cutting-orderAdd
 *
 * viewMode=true (?id=xxx): 详情模式
 *   1. order-detail 拉详情
 *   2. 字典加载用于回显名称
 *   3. 全部字段只读
 */
pageGuard({
  moduleKey: 'cutting',
  data: {
    // 字典
    schoolList: [],
    styleList: [],
    sizeList: [],
    genderList: [],
    workshopList: [],

    // 已确认来料
    incomingList: [],
    selectedIncoming: null,

    // 物料使用量（多物料）
    materialList: [],

    // 计划衣服信息
    selectedSchool: null,
    selectedStyle: null,
    selectedGender: null,
    selectedSizes: [],   // 已选的尺码 name 数组
    planRows: [],        // [{ size, count }]

    // 目标车间
    selectedWorkshop: null,

    // 备注
    remark: '',

    // 详情模式
    viewMode: false,
    recordId: '',
    detail: null,
    statusClass: '',
  },

  onLoad(options) {
    if (options && options.id) {
      this.setData({ viewMode: true, recordId: options.id });
    }
    // 字典和车间任何模式都要加载（详情要拿名称回显）
    this.loadDictionaries();
    this.loadWorkshopList();
    if (this.data.viewMode) {
      this.loadDetail();
    } else {
      this.loadIncomingList();
    }
  },

  // ============ 加载 ============
  async loadDictionaries() {
    try {
      const [school, style, size, gender] = await Promise.all([
        callCloud('option-list', { type: 'school' }, { silent: true }),
        callCloud('option-list', { type: 'style' }, { silent: true }),
        callCloud('option-list', { type: 'size' }, { silent: true }),
        callCloud('option-list', { type: 'gender' }, { silent: true }),
      ]);
      this.setData({
        schoolList: school || [],
        styleList: style || [],
        sizeList: size || [],
        genderList: gender || [],
      });
    } catch (e) {
      console.error('加载字典失败:', e);
    }
  },

  loadWorkshopList() {
    callCloud('workshop-list', {}, { silent: true }).then(res => {
      this.setData({ workshopList: res || [] }, () => {
        // 详情模式下如果 detail 已加载，重新匹配车间
        if (this.data.viewMode && this.data.detail && this.data.detail.target_workshop) {
          const matched = (this.data.workshopList || []).find(w => w._id === this.data.detail.target_workshop);
          if (matched) this.setData({ selectedWorkshop: matched });
        }
      });
    });
  },

  loadIncomingList() {
    callCloud('cutting-confirmedIncomingList', {}, { silent: true }).then(res => {
      const list = (res || []).map(item => mapCuttingIncoming(item));
      this.setData({ incomingList: list });
    });
  },

  loadDetail() {
    callCloud('order-detail', { id: this.data.recordId }, { silent: true }).then(res => {
      if (!res) return;
      // 1. 物料明细（用于只读展示）
      const materialList = (res.material_actual_usage || []).map(m => ({
        category_one: m.category_one || '',
        category_two: m.category_two || '',
        spec: m.spec || '',
        // 详情模式无 stock 概念（已裁完），存 null
        stock: null,
        usage: m.quantity != null ? String(m.quantity) : '',
        unit: m.unit || '',
      }));

      // 2. 计划明细：[{ size, count, school, style, gender }]
      const planRows = (res.plan_clothes_detail || []).map(p => ({
        size: p.size || '',
        count: p.count != null ? String(p.count) : '',
        school: p.school || '',
        style: p.style || '',
        gender: p.gender || '',
      }));
      const selectedSizes = planRows.map(p => p.size).filter(Boolean);
      // 从 planRows[0] 拿学校/款式/性别
      const firstPlan = planRows[0] || {};

      // 3. 匹配字典
      const selectedSchool = (this.data.schoolList || []).find(s => s.name === firstPlan.school) || null;
      const selectedStyle  = (this.data.styleList  || []).find(s => s.name === firstPlan.style)  || null;
      const selectedGender = (this.data.genderList || []).find(s => s.name === firstPlan.gender) || null;

      // 4. 车间
      const selectedWorkshop = (this.data.workshopList || []).find(w => w._id === res.target_workshop) || null;

      // 5. 来料（用 incomingNo 模拟一个 selectedIncoming）
      const selectedIncoming = res.outbound_order_id ? {
        id: res.incoming_confirm_id || '',
        incomingNo: res.outbound_order_id || '',
      } : null;

      this.setData({
        detail: res,
        statusClass: this.statusToClass(res.status),
        materialList,
        planRows,
        selectedSizes,
        selectedSchool,
        selectedStyle,
        selectedGender,
        selectedWorkshop,
        selectedIncoming,
        remark: res.remark || '',
      });
    }).catch(() => {});
  },

  statusToClass(status) {
    if (!status) return '';
    if (status === '已确认') return 'confirmed';
    if (status === '已裁剪') return 'cut';
    if (status === '已加工' || status === '已完成' || status === '完成') return 'done';
    if (status === '有问题') return 'issue';
    return 'pending';
  },

  // ============ 交互 ============
  onIncomingChange(e) {
    if (this.data.viewMode) return;
    const index = e.detail.value;
    const inc = this.data.incomingList[index];
    if (!inc) return;
    // 填充物料明细（从 material_details 拷贝）
    const materialDetails = (inc.material_details && inc.material_details.length > 0)
      ? inc.material_details
      : [{ category_one: '', category_two: inc.materialName || '', spec: '', quantity: inc.quantity, unit: inc.unit }];
    const materialList = materialDetails.map(m => ({
      category_one: m.category_one || '',
      category_two: m.category_two || '',
      spec: m.spec || '',
      // 关键：把来料的剩余库存存为 stock（云函数优先返回 stock，否则用 quantity 兜底）
      // 这是"用户能使用的最大值"，多次裁剪后会随 remaining 字段递减
      stock: (m.stock != null) ? m.stock : (m.quantity != null ? m.quantity : null),
      usage: '',  // 默认空，必填
      unit: m.unit || '',
    }));
    this.setData({
      selectedIncoming: inc,
      materialList,
      // 重置计划信息
      selectedSchool: null,
      selectedStyle: null,
      selectedGender: null,
      selectedSizes: [],
      planRows: [],
    });
  },

  onMaterialUsageChange(e) {
    const { index } = e.currentTarget.dataset;
    const val = e.detail.value;
    const list = this.data.materialList.slice();
    if (list[index]) {
      // 关键：实时算 overStock，输入超过库存时标红
      const stock = list[index].stock;
      const v = parseFloat(val);
      const overStock = stock != null && !isNaN(v) && v > stock;
      list[index] = { ...list[index], usage: val, overStock };
      this.setData({ materialList: list });
    }
  },

  onMaterialUsageBlur(e) {
    // 关键：失去焦点时如果超库存，自动截到 stock 上限
    const { index } = e.currentTarget.dataset;
    const list = this.data.materialList.slice();
    if (!list[index]) return;
    const m = list[index];
    const stock = m.stock;
    const v = parseFloat(m.usage);
    if (stock != null && !isNaN(v) && v > stock) {
      list[index] = { ...m, usage: String(stock), overStock: false };
      this.setData({ materialList: list });
      wx.showToast({ title: `已自动截到库存上限 ${stock}${m.unit}`, icon: 'none' });
    }
  },

  onSchoolChange(e) {
    if (this.data.viewMode) return;
    const i = e.detail.value;
    this.setData({ selectedSchool: this.data.schoolList[i] || null });
  },
  onStyleChange(e) {
    if (this.data.viewMode) return;
    const i = e.detail.value;
    this.setData({ selectedStyle: this.data.styleList[i] || null });
  },
  onGenderChange(e) {
    if (this.data.viewMode) return;
    const i = e.detail.value;
    this.setData({ selectedGender: this.data.genderList[i] || null });
  },

  onToggleSize(e) {
    if (this.data.viewMode) return;
    const { name } = e.currentTarget.dataset;
    let { selectedSizes, planRows } = this.data;
    if (selectedSizes.includes(name)) {
      selectedSizes = selectedSizes.filter(s => s !== name);
      planRows = planRows.filter(r => r.size !== name);
    } else {
      selectedSizes = [...selectedSizes, name];
      planRows = [...planRows, { size: name, count: '' }];
    }
    this.setData({ selectedSizes, planRows });
  },

  isSizeSelected(name) {
    return this.data.selectedSizes.indexOf(name) > -1;
  },

  onPlanCountChange(e) {
    if (this.data.viewMode) return;
    const { size } = e.currentTarget.dataset;
    const val = e.detail.value;
    const planRows = this.data.planRows.map(r =>
      r.size === size ? { ...r, count: val } : r
    );
    this.setData({ planRows });
  },

  onWorkshopChange(e) {
    if (this.data.viewMode) return;
    const i = e.detail.value;
    this.setData({ selectedWorkshop: this.data.workshopList[i] || null });
  },

  onRemarkInput(e) {
    if (this.data.viewMode) return;
    this.setData({ remark: e.detail.value });
  },

  onPreviewPhoto(e) {
    const { urls, current } = e.currentTarget.dataset;
    wx.previewImage({ urls, current });
  },

  // ============ 提交 ============
  onSubmit() {
    if (this.data.viewMode) {
      wx.navigateBack();
      return;
    }
    const {
      selectedIncoming, materialList,
      selectedSchool, selectedStyle, selectedGender, planRows,
      selectedWorkshop, remark,
    } = this.data;

    if (!selectedIncoming) {
      return wx.showToast({ title: '请选择来料确认单', icon: 'none' });
    }
    if (!materialList || materialList.length === 0) {
      return wx.showToast({ title: '该来料没有物料明细', icon: 'none' });
    }
    // 物料使用量校验
    for (const m of materialList) {
      const v = parseFloat(m.usage);
      if (!m.usage || isNaN(v) || v <= 0) {
        return wx.showToast({ title: `请填写【${m.category_two}】使用量`, icon: 'none' });
      }
      // 关键：使用量不能超过来料库存
      if (m.stock != null && v > m.stock) {
        return wx.showToast({ title: `【${m.category_two}】使用量不能超过库存 ${m.stock}${m.unit}`, icon: 'none' });
      }
    }
    // 学校/款式/性别
    if (!selectedSchool) return wx.showToast({ title: '请选择学校', icon: 'none' });
    if (!selectedStyle)  return wx.showToast({ title: '请选择款式', icon: 'none' });
    if (!selectedGender) return wx.showToast({ title: '请选择性别', icon: 'none' });
    // 尺码+件数
    if (!planRows || planRows.length === 0) {
      return wx.showToast({ title: '请至少选择一个尺码', icon: 'none' });
    }
    for (const r of planRows) {
      const v = parseInt(r.count, 10);
      if (!r.count || isNaN(v) || v <= 0) {
        return wx.showToast({ title: `请填写【${r.size}】的计划件数`, icon: 'none' });
      }
    }
    // 车间
    if (!selectedWorkshop) return wx.showToast({ title: '请选择目标车间', icon: 'none' });

    // ============ 组装 payload ============
    const userInfo = app.getUserInfo() || {};
    const material_actual_usage = materialList.map(m => ({
      category_one: m.category_one || '',
      category_two: m.category_two || '',
      spec: m.spec || '',
      quantity: parseFloat(m.usage) || 0,
      unit: m.unit || '',
    }));
    const plan_clothes_detail = planRows.map(r => ({
      size: r.size,
      count: parseInt(r.count, 10) || 0,
      school: selectedSchool.name,
      style:  selectedStyle.name,
      gender: selectedGender.name,
    }));

    callCloud('cutting-orderAdd', {
      incoming_confirm_id: selectedIncoming.id,
      outbound_order_id:   selectedIncoming.incomingNo || '',
      cutting_admin_id:    userInfo._id || '',
      material_actual_usage,
      plan_clothes_detail,
      target_workshop: selectedWorkshop._id,
      remark: remark || '',
    }).then(() => {
      wx.showToast({ title: '提交成功', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 1200);
    }).catch(() => {
      // 错误已由 request.js 弹 toast
    });
  }
});
