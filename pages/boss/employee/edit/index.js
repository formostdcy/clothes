// pages/boss/employee/edit/index.js
const { callCloud } = require('../../../../utils/request.js');
const pageGuard = require('../../../../utils/page-guard.js');

pageGuard({
  moduleKey: 'boss',
  data: {
    id: '',
    name: '',
    account: '',
    password: '',
    role: '',
    roleName: '',
    roleList: [],
    status: 1
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ id: options.id });
      this.loadEmployee();
    }
    this.loadRoleList();
  },

  loadEmployee() {
    callCloud('employee-detail', { id: this.data.id }).then(res => {
      const { name, account, role, status } = res;
      // 角色回显需要从 roleList 中匹配出对应的 name
      const matched = (this.data.roleList || []).find(r => r.id === role);
      this.setData({
        name,
        account,
        role,
        status,
        roleName: matched ? matched.name : role
      });
    });
  },

  loadRoleList() {
    callCloud('role-list').then(res => {
      this.setData({ roleList: res || [] }, () => {
        // 当员工已加载但 roleList 还没回来时，二次回显
        if (this.data.id && this.data.role) {
          const matched = (this.data.roleList || []).find(r => r.id === this.data.role);
          if (matched) this.setData({ roleName: matched.name });
        }
      });
    });
  },

  onNameInput(e) {
    this.setData({ name: e.detail.value });
  },

  onAccountInput(e) {
    this.setData({ account: e.detail.value });
  },

  onPasswordInput(e) {
    this.setData({ password: e.detail.value });
  },

  onRoleChange(e) {
    const index = e.detail.value;
    const role = this.data.roleList[index];
    this.setData({ role: role.id, roleName: role.name });
  },

  onStatusChange(e) {
    this.setData({ status: e.detail.value ? 1 : 0 });
  },

  onSubmit() {
    const { id, name, account, password, role, status } = this.data;
    if (!name || !account) {
      wx.showToast({ title: '请填写完整信息', icon: 'none' });
      return;
    }
    const data = { _id: id, name, account, role, status };
    if (password) data.password = password;
    callCloud('employee-update', data).then(() => {
      const tip = password ? '保存成功（密码已更新）' : '保存成功（密码未修改）';
      wx.showToast({ title: tip, icon: 'success' });
      setTimeout(() => wx.navigateBack(), 1500);
    });
  },

  onDelete() {
    wx.showModal({
      title: '确认删除',
      content: '确定要删除该员工吗？',
      success: res => {
        if (res.confirm) {
          callCloud('employee-delete', { _id: this.data.id }).then(() => {
            wx.showToast({ title: '删除成功' });
            setTimeout(() => wx.navigateBack(), 1500);
          });
        }
      }
    });
  }
});
