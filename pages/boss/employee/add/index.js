// pages/boss/employee/add/index.js
const { callCloud } = require('../../../../utils/request.js');
const pageGuard = require('../../../../utils/page-guard.js');
const app = getApp();

pageGuard({
  moduleKey: 'boss',
  data: {
    form: { name: '', account: '', password: '', role: '' },
    roles: ['原材料管理员', '裁剪管理员', '车间管理员', '成品管理员', '老板'],
    roleIndex: -1,
    loading: false,
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [`form.${field}`]: e.detail.value });
  },

  onRoleChange(e) {
    const index = e.detail.value;
    this.setData({
      roleIndex: index,
      'form.role': this.data.roles[index],
    });
  },

  onSubmit() {
    const { name, account, password, role } = this.data.form;

    if (!name) return wx.showToast({ title: '请输入姓名', icon: 'none' });
    if (!account) return wx.showToast({ title: '请输入账号', icon: 'none' });
    if (!password) return wx.showToast({ title: '请输入密码', icon: 'none' });
    if (!role) return wx.showToast({ title: '请选择角色', icon: 'none' });

    this.setData({ loading: true });
    callCloud('employee-add', { ...this.data.form, creator_id: app.getUserInfo()._id })
      .then(() => {
        wx.showToast({ title: '添加成功', icon: 'success' });
        setTimeout(() => wx.navigateBack(), 1500);
      })
      .catch(() => {
        this.setData({ loading: false });
      });
  },
});
