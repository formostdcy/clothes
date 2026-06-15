// pages/raw/settings/option-edit/index.js
const { callCloud } = require('../../../../utils/request.js');
const pageGuard = require('../../../../utils/page-guard.js');

pageGuard({
  moduleKey: 'raw',
  data: {
    id: '',
    name: '',
    value: '',
    sort: 0,
    category_one: '布料',
    cat1List: ['布料', '辅料'],
    cat1Index: 0,
    saving: false
  },

  onLoad(options) {
    if (options.id) {
      wx.setNavigationBarTitle({ title: '编辑分类' });
      this.setData({ id: options.id });
      this.loadOption();
    } else {
      wx.setNavigationBarTitle({ title: '新增分类' });
      if (options.category_one) {
        const idx = this.data.cat1List.indexOf(options.category_one);
        if (idx >= 0) {
          this.setData({ category_one: options.category_one, cat1Index: idx });
        }
      }
    }
  },

  loadOption() {
    callCloud('option-detail', { id: this.data.id }, { silent: true }).then(res => {
      const idx = this.data.cat1List.indexOf(res.category_one || '布料');
      this.setData({
        name: res.name || '',
        value: res.value || '',
        sort: res.sort || 0,
        category_one: res.category_one || '布料',
        cat1Index: idx >= 0 ? idx : 0,
      });
    });
  },

  onCat1Change(e) {
    const idx = parseInt(e.detail.value);
    this.setData({ cat1Index: idx, category_one: this.data.cat1List[idx] });
  },

  onNameInput(e) { this.setData({ name: e.detail.value }); },
  onValueInput(e) { this.setData({ value: e.detail.value }); },
  onSortInput(e) { this.setData({ sort: e.detail.value }); },

  onSave() {
    const { id, name, value, sort, category_one, saving } = this.data;
    if (saving) return;
    if (!name || !name.trim()) {
      wx.showToast({ title: '请输入分类名称', icon: 'none' });
      return;
    }
    this.setData({ saving: true });
    const data = {
      name: name.trim(),
      value: (value || '').trim(),
      category_one,
      type: 'category_two',
      sort: parseInt(sort) || 0,
    };
    if (id) data._id = id;
    // 用 option-update 同时支持 add/update（云函数是 upsert）
    callCloud('option-update', data).then(() => {
      wx.showToast({ title: id ? '已更新' : '已添加' });
      setTimeout(() => wx.navigateBack(), 800);
    }).catch(() => this.setData({ saving: false }));
  }
});
