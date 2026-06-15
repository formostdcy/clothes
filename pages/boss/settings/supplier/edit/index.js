// pages/boss/settings/supplier/edit/index.js
const { callCloud } = require('../../../../../utils/request.js');
const { isValidPhone } = require('../../../../../utils/util.js');
const pageGuard = require('../../../../../utils/page-guard.js');

pageGuard({
  moduleKey: 'boss',
  data: {
    id: '',
    name: '',
    contact_name: '',
    contact_phone: '',
    phoneError: '',
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
    // 实时输入时只允许数字 / 短横线 / 括号
    let value = String(e.detail.value || '')
      .replace(/[^\d\-()]/g, '')
      .slice(0, 20);

    // 实时校验：有内容但格式错误时，给出错误提示
    const phoneError = value && !isValidPhone(value) ? '电话格式不正确，请输入正确的手机号或座机' : '';

    this.setData({ contact_phone: value, phoneError });
  },

  onSubmit() {
    const { id, name, contact_name, contact_phone } = this.data;
    if (!name || !name.trim()) {
      wx.showToast({ title: '请输入供应商名称', icon: 'none' });
      return;
    }
    if (!contact_name || !contact_name.trim()) {
      wx.showToast({ title: '请输入联系人', icon: 'none' });
      return;
    }
    if (!contact_phone || !contact_phone.trim()) {
      this.setData({ phoneError: '请输入联系电话' });
      wx.showToast({ title: '请输入联系电话', icon: 'none' });
      return;
    }
    if (!isValidPhone(contact_phone)) {
      this.setData({ phoneError: '电话格式不正确，请输入正确的手机号或座机' });
      wx.showToast({ title: '电话格式不正确', icon: 'none' });
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
