// pages/boss/settings/option-edit/index.js
const { callCloud } = require('../../../../utils/request.js');
const pageGuard = require('../../../../utils/page-guard.js');

// 7 种选项类型 + 中文标签 + 顺序
const TYPE_LIST = [
  { key: 'school',        label: '学校' },
  { key: 'style',         label: '款式' },
  { key: 'season',        label: '季节' },
  { key: 'size',          label: '尺码' },
  { key: 'gender',        label: '性别' },
  { key: 'destination',   label: '出货目的地' },
  { key: 'category_two',  label: '原材料分类' },
  { key: 'workshop',      label: '车间' },
];

// 一级分类（原材料专用）
const CATEGORY_ONE_OPTIONS = [
  { key: '布料', label: '布料' },
  { key: '辅料', label: '辅料' },
];

pageGuard({
  moduleKey: 'boss',
  data: {
    typeList: TYPE_LIST,
    activeType: 'school',
    activeTypeLabel: '学校',

    list: [],
    filteredList: [],
    keyword: '',
    loading: false,

    // 编辑弹层
    showEditModal: false,
    editingId: '',
    form: {
      name: '',
      value: '',
      sort: 0,
      category_one: '',
    },

    // 一级分类选择
    showCategoryPicker: false,
    categoryOneList: CATEGORY_ONE_OPTIONS,
  },

  onLoad(options) {
    // 允许从外部传入 type，例如 ?type=size
    if (options.type && TYPE_LIST.find(t => t.key === options.type)) {
      this.setData({
        activeType: options.type,
        activeTypeLabel: TYPE_LIST.find(t => t.key === options.type).label,
      });
    }
    this.loadList();
  },

  onShow() {
    // 从其他页面返回时刷新
    if (this.data.list.length > 0 || this.data._hasLoaded) {
      this.loadList();
    }
  },

  // ============== Tab 切换 ==============
  onTypeChange(e) {
    const key = e.currentTarget.dataset.key;
    if (key === this.data.activeType) return;
    const label = TYPE_LIST.find(t => t.key === key).label;
    this.setData({ activeType: key, activeTypeLabel: label, keyword: '' });
    this.loadList();
  },

  // ============== 搜索 ==============
  onSearchInput(e) {
    const keyword = e.detail.value || '';
    this.setData({ keyword });
    this.applyFilter();
  },

  applyFilter() {
    const { list, keyword } = this.data;
    const kw = keyword.trim().toLowerCase();
    if (!kw) {
      this.setData({ filteredList: list });
      return;
    }
    const filtered = list.filter(item => {
      const name = (item.name || '').toLowerCase();
      const value = (item.value || '').toLowerCase();
      return name.includes(kw) || value.includes(kw);
    });
    this.setData({ filteredList: filtered });
  },

  // ============== 加载列表 ==============
  loadList() {
    this.setData({ loading: true });
    this.data._hasLoaded = true;

    // 车间 Tab 特殊：去员工表拉"车间管理员"
    // 其他 Tab 走 option-list
    const promise = this.data.activeType === 'workshop'
      ? callCloud('workshop-list', {}, { silent: true }).then(data => {
          // workshop-list 返回 { _id, name, account }，需要映射成 { _id, name }
          const arr = Array.isArray(data) ? data : [];
          return arr.map(w => ({
            _id: w._id,
            name: w.name || w.account || '(未命名)',
            value: w.account || '',
          }));
        })
      : callCloud('option-list', { type: this.data.activeType }, { silent: true });

    promise
      .then(data => {
        const arr = Array.isArray(data) ? data : [];
        // 排序：sort 升序，相同时按 created_at
        arr.sort((a, b) => {
          const sa = parseInt(a.sort) || 0;
          const sb = parseInt(b.sort) || 0;
          if (sa !== sb) return sa - sb;
          return 0;
        });
        this.setData({ list: arr, loading: false }, () => {
          this.applyFilter();
        });
      })
      .catch(() => this.setData({ loading: false }));
  },

  // ============== 新增 / 编辑 ==============
  onAdd() {
    // 车间 Tab 不允许新增（账号由管理员后台创建）
    if (this.data.activeType === 'workshop') return;
    this.setData({
      showEditModal: true,
      editingId: '',
      form: { name: '', value: '', sort: 0, category_one: '' },
    });
  },

  onEdit(e) {
    // 车间 Tab 不允许编辑
    if (this.data.activeType === 'workshop') return;
    const id = e.currentTarget.dataset.id;
    callCloud('option-detail', { id }, { silent: true }).then(res => {
      const item = res || {};
      this.setData({
        showEditModal: true,
        editingId: id,
        form: {
          name: item.name || '',
          value: item.value || '',
          sort: parseInt(item.sort) || 0,
          category_one: item.category_one || '',
        },
      });
    }).catch(() => {
      wx.showToast({ title: '加载失败', icon: 'none' });
    });
  },

  closeModal() {
    this.setData({ showEditModal: false });
  },

  noop() {},

  onFormNameInput(e) {
    this.setData({ 'form.name': e.detail.value });
  },

  onFormValueInput(e) {
    this.setData({ 'form.value': e.detail.value });
  },

  onFormSortInput(e) {
    this.setData({ 'form.sort': e.detail.value });
  },

  onFormSubmit() {
    const { editingId, form, activeType, activeTypeLabel } = this.data;
    const name = (form.name || '').trim();
    if (!name) {
      wx.showToast({ title: '请输入选项名称', icon: 'none' });
      return;
    }
    if (name.length > 30) {
      wx.showToast({ title: '选项名称不超过 30 字', icon: 'none' });
      return;
    }
    // 原材料分类必填一级分类
    if (activeType === 'category_two' && !form.category_one) {
      wx.showToast({ title: '请选择一级分类', icon: 'none' });
      return;
    }

    const payload = {
      _id: editingId || undefined,
      type: activeType,
      name,
      value: (form.value || '').trim(),
      sort: parseInt(form.sort) || 0,
    };
    if (activeType === 'category_two') {
      payload.category_one = form.category_one;
    }

    wx.showLoading({ title: '保存中...', mask: true });
    callCloud('option-update', payload, { silent: true })
      .then(() => {
        wx.hideLoading();
        wx.showToast({ title: editingId ? '保存成功' : '添加成功', icon: 'success' });
        this.setData({ showEditModal: false });
        this.loadList();
      })
      .catch(err => {
        wx.hideLoading();
        const msg = (err && err.error) || '保存失败';
        wx.showToast({ title: msg, icon: 'none' });
      });
  },

  // ============== 删除 ==============
  onDelete(e) {
    // 车间 Tab 不允许删除（账号由管理员后台管理）
    if (this.data.activeType === 'workshop') return;
    const { id, name } = e.currentTarget.dataset;
    wx.showModal({
      title: '确认删除',
      content: `确定删除"${name}"吗？\n删除后可能影响使用此选项的业务数据。`,
      confirmColor: '#EA4335',
      success: res => {
        if (res.confirm) {
          callCloud('option-delete', { _id: id }, { silent: true })
            .then(() => {
              wx.showToast({ title: '已删除', icon: 'success' });
              this.loadList();
            })
            .catch(err => {
              const msg = (err && err.error) || '删除失败';
              wx.showToast({ title: msg, icon: 'none' });
            });
        }
      },
    });
  },

  // ============== 一级分类选择 ==============
  onPickCategoryOne() {
    this.setData({ showCategoryPicker: true });
  },

  onCategoryOneSelect(e) {
    const label = e.currentTarget.dataset.label;
    this.setData({
      'form.category_one': label,
      showCategoryPicker: false,
    });
  },

  closeCategoryPicker() {
    this.setData({ showCategoryPicker: false });
  },
});
