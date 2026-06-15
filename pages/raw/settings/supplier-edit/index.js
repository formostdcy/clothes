// pages/raw/settings/supplier-edit/index.js
const { callCloud } = require('../../../../utils/request.js');
const pageGuard = require('../../../../utils/page-guard.js');

pageGuard({
  moduleKey: 'raw',
  data: {
    id: '',
    name: '',
    contact_name: '',
    contact_phone: '',
    saving: false
  },

  onLoad(options) {
    if (options.id) {
      wx.setNavigationBarTitle({ title: '编辑供应商' });
      this.setData({ id: options.id });
      this.loadSupplier();
    } else {
      wx.setNavigationBarTitle({ title: '新增供应商' });
    }
  },

  loadSupplier() {
    callCloud('supplier-list', { page: 1, pageSize: 500 }, { silent: true }).then(res => {
      const item = (res.list || []).find(s => s._id === this.data.id);
      if (item) {
        this.setData({
          name: item.name || '',
          contact_name: item.contact_name || '',
          contact_phone: item.contact_phone || '',
        });
      }
    });
  },

  onNameInput(e) { this.setData({ name: e.detail.value }); },
  onContactNameInput(e) { this.setData({ contact_name: e.detail.value }); },
  onContactPhoneInput(e) { this.setData({ contact_phone: e.detail.value }); },

  onSave() {
    const { id, name, contact_name, contact_phone, saving } = this.data;
    if (saving) return;
    if (!name || !name.trim()) {
      wx.showToast({ title: '请输入供应商名称', icon: 'none' });
      return;
    }
    this.setData({ saving: true });
    const fn = id ? 'supplier-update' : 'supplier-add';
    const data = { name: name.trim(), contact_name: contact_name.trim(), contact_phone: contact_phone.trim() };
    if (id) data._id = id;
    callCloud(fn, data).then(() => {
      wx.showToast({ title: id ? '已更新' : '已添加' });
      setTimeout(() => wx.navigateBack(), 800);
    }).catch(() => this.setData({ saving: false }));
  }
});
