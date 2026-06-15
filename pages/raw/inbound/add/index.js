// pages/raw/inbound/add/index.js
const { callCloud } = require('../../../../utils/request.js');
const pageGuard = require('../../../../utils/page-guard.js');
const app = getApp();

pageGuard({
  moduleKey: 'raw',
  data: {
    form: {
      supplier_id: '',
      supplier_name: '',
      material_details: [],
      photos: [],
      remark: '',
    },
    suppliers: [],
    supplierIndex: -1,
    cat1Options: ['布料', '辅料'],
    cat2OptionsByCat1: {
      '布料': [],
      '辅料': [],
    },
    stockMap: {},
    loading: false,
  },

  onLoad() {
    this.loadSuppliers();
    this.loadAllCat2Options();
    this.loadAllStock();
    this.onAddMaterial();
  },

  loadAllStock() {
    callCloud('raw-stockList', { pageSize: 200 }, { silent: true }).then(res => {
      const arr = (res && res.list) || [];
      const stockMap = {};
      arr.forEach(item => {
        stockMap[`${item.category_one}|${item.category_two}`] = {
          stock: item.total_quantity || 0,
          unit: item.unit || '',
        };
      });
      this.setData({ stockMap });
      this.refreshMaterialStockDisplay();
    }).catch(() => {});
  },

  getStock(cat1, cat2) {
    if (!cat1 || !cat2) return null;
    return this.data.stockMap[`${cat1}|${cat2}`] || null;
  },

  refreshMaterialStockDisplay() {
    const details = this.data.form.material_details.map(m => {
      const s = this.getStock(m.category_one, m.category_two);
      return { ...m, stockQty: s ? s.stock : null, stockUnit: s ? s.unit : (m.unit || '') };
    });
    this.setData({ 'form.material_details': details });
  },

  loadSuppliers() {
    callCloud('supplier-list', { page: 1, pageSize: 200 }).then(data => {
      // callCloud 已 unwrap result.data
      const arr = Array.isArray(data) ? data.list || [] : (data && data.list) || [];
      this.setData({ suppliers: arr });
    }).catch(() => {});
  },

  // 一次性拉取所有二级分类，按 category_one 字段分组
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

  onSupplierChange(e) {
    const index = e.detail.value;
    const supplier = this.data.suppliers[index];
    if (!supplier) return;
    this.setData({
      supplierIndex: index,
      'form.supplier_id': supplier._id,
      'form.supplier_name': supplier.name,
    });
  },

  onAddMaterial() {
    const material_details = [...this.data.form.material_details, {
      category_one: '',
      category_two: '',
      cat1Index: -1,
      cat2Index: -1,
      cat2Options: [],
      quantity: '',
      unit: '米',
    }];
    this.setData({ 'form.material_details': material_details });
  },

  onRemoveMaterial(e) {
    const index = e.currentTarget.dataset.index;
    const material_details = this.data.form.material_details.filter((_, i) => i !== index);
    this.setData({ 'form.material_details': material_details });
  },

  onCat1Change(e) {
    const index = e.currentTarget.dataset.index;
    const cat1Index = e.detail.value;
    const cat1 = this.data.cat1Options[cat1Index];
    const material_details = [...this.data.form.material_details];
    material_details[index].cat1Index = cat1Index;
    material_details[index].category_one = cat1;
    material_details[index].unit = cat1 === '布料' ? '米' : '个';
    material_details[index].category_two = '';
    material_details[index].cat2Index = -1;
    material_details[index].cat2Options = this.data.cat2OptionsByCat1[cat1] || [];
    const s = this.getStock(cat1, '');
    material_details[index].stockQty = s ? s.stock : null;
    material_details[index].stockUnit = s ? s.unit : (material_details[index].unit || '');
    this.setData({ 'form.material_details': material_details });
  },

  onCat2Change(e) {
    const index = e.currentTarget.dataset.index;
    const cat2Index = e.detail.value;
    const material_details = [...this.data.form.material_details];
    const cat2 = material_details[index].cat2Options[cat2Index];
    material_details[index].cat2Index = cat2Index;
    material_details[index].category_two = cat2 ? (cat2.name || '') : '';
    const s = this.getStock(material_details[index].category_one, material_details[index].category_two);
    material_details[index].stockQty = s ? s.stock : null;
    material_details[index].stockUnit = s ? s.unit : (material_details[index].unit || '');
    this.setData({ 'form.material_details': material_details });
  },

  onMaterialInput(e) {
    const { index, field } = e.currentTarget.dataset;
    const material_details = [...this.data.form.material_details];
    material_details[index][field] = e.detail.value;
    this.setData({ 'form.material_details': material_details });
  },

  onAddPhoto() {
    if (this.data.form.photos.length >= 9) {
      wx.showToast({ title: '最多上传9张', icon: 'none' });
      return;
    }
    wx.chooseImage({
      count: 9 - this.data.form.photos.length,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: res => {
        const photos = [...this.data.form.photos, ...res.tempFilePaths];
        this.setData({ 'form.photos': photos });
      },
    });
  },

  onRemovePhoto(e) {
    const index = e.currentTarget.dataset.index;
    const photos = this.data.form.photos.filter((_, i) => i !== index);
    this.setData({ 'form.photos': photos });
  },

  onRemarkInput(e) {
    this.setData({ 'form.remark': e.detail.value });
  },

  onSubmit() {
    const { supplier_id, supplier_name, material_details, photos, remark } = this.data.form;

    if (!material_details.length) {
      return wx.showToast({ title: '请添加物料明细', icon: 'none' });
    }
    const validDetails = material_details.filter(m => m.category_one && m.category_two && m.quantity);
    if (!validDetails.length) {
      return wx.showToast({ title: '物料明细不完整', icon: 'none' });
    }

    this.setData({ loading: true });
    const userInfo = app.getUserInfo();
    callCloud('raw-inboundAdd', {
      supplier_id,
      supplier_name,
      material_details: validDetails.map(m => ({
        category_one: m.category_one,
        category_two: m.category_two,
        quantity: parseInt(m.quantity),
        unit: m.unit,
      })),
      photos,
      remark,
      creator_id: userInfo._id,
    }).then(() => {
      wx.showToast({ title: '入库成功', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 1500);
    }).catch(() => {
      this.setData({ loading: false });
    });
  },
});
