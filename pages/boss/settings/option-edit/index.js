const { callCloud } = require('../../../../utils/request.js');
const pageGuard = require('../../../../utils/page-guard.js');

pageGuard({
  moduleKey: 'boss',
  data: {
    id: '',
    name: '',
    value: '',
    sort: 0
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ id: options.id });
      this.loadOption();
    }
    if (options.type) {
      this.setData({ type: options.type });
    }
  },

  loadOption() {
    callCloud('option-detail', { id: this.data.id }).then(res => {
      this.setData(res);
    });
  },

  onNameInput(e) {
    this.setData({ name: e.detail.value });
  },

  onValueInput(e) {
    this.setData({ value: e.detail.value });
  },

  onSortInput(e) {
    this.setData({ sort: e.detail.value });
  },

  onSubmit() {
    const { name, value, sort, id, type } = this.data;
    if (!name) {
      wx.showToast({ title: '请输入选项名称', icon: 'none' });
      return;
    }
    const data = { name, value, sort: parseInt(sort) || 0 };
    if (id) data._id = id;
    if (type) data.type = type;
    callCloud('option-update', data).then(() => {
      wx.showToast({ title: '保存成功' });
      setTimeout(() => wx.navigateBack(), 1500);
    }).catch(() => {});
  }
});
