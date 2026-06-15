// pages/boss/settings/supplier/edit/index.js
const { callCloud } = require('../../../../../utils/request.js');
const pageGuard = require('../../../../../utils/page-guard.js');

pageGuard({
  moduleKey: 'boss',
  data: {
    id: '',
    name: '',
    contact_name: '',
    contact_phone: ''
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ id: options.id });
      this.loadDetail();
      wx.setNavigationBarTitle({ title: '编辑供应商' });
    } else {
      wx.setNavigationBarTitle({ title: '新增供应商' });
    }
  },

  loadDetail() {
    // 列表接口也能拿到，这里直接复用
    callCloud('supplier-list', { page: 1, pageSize: 100 }).then(res => {
      const target = (res.list || []).find(s => s._id === this.data.id);
      if (target) {
        this.setData({
          name: target.name || '',
          contact_name: target.contact_name || '',
          contact_phone: target.contact_phone || ''
        });
      }
    });
  },

  onNameInput(e) {
    this.setData({ name: e.detail.value });
  },

  onContactNameInput(e) {
    this.setData({ contact_name: e.detail.value });
  },

  onContactPhoneInput(e) {
    this.setData({ contact_phone: e.detail.value });
  },

  onSubmit() {
    const { id, name, contact_name, contact_phone } = this.data;
    if (!name) {
      wx.showToast({ title: '请输入供应商名称', icon: 'none' });
      return;
    }
    if (id) {
      callCloud('supplier-update', { _id: id, name, contact_name, contact_phone }).then(() => {
        wx.showToast({ title: '保存成功', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 1500);
      });
    } else {
      callCloud('supplier-add', { name, contact_name, contact_phone }).then(() => {
        wx.showToast({ title: '添加成功', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 1500);
      });
    }
  }
});
