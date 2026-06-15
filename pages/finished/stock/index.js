// pages/finished/stock/index.js
const { callCloud } = require('../../../utils/request.js');
const pageGuard = require('../../../utils/page-guard.js');

pageGuard({
  moduleKey: 'finished',
  data: {
    list: [],
    schoolList: [],
    styleList: [],
    genderList: ['全部', '男', '女', '通用'],
    workshopList: [],        // 车间筛选列表
    selectedSchool: null,
    selectedStyle: null,
    selectedWorkshop: null,
    genderIndex: 0,
    page: 1,
    pageSize: 20,
    total: 0,
    totalQuantity: 0,        // 当前页总件数
    loading: false
  },

  onLoad() {
    this.loadOptions();
    this.loadList();
  },

  onShow() {
    // 每次回到页面刷新（出库后库存变了）
    this.setData({ page: 1, list: [] });
    this.loadList();
  },

  onReachBottom() {
    if (this.data.loading) return;
    if (this.data.list.length >= this.data.total) return;
    this.setData({ page: this.data.page + 1 });
    this.loadList(true);
  },

  onPullDownRefresh() {
    this.setData({ page: 1, list: [] });
    this.loadList().finally(() => wx.stopPullDownRefresh());
  },

  loadOptions() {
    Promise.all([
      callCloud('option-list', { type: 'school' }),
      callCloud('option-list', { type: 'style' }),
      callCloud('role-list', { role: '车间管理员' })  // 车间列表
    ]).then(([schoolRes, styleRes, wsRes]) => {
      const sc = Array.isArray(schoolRes) ? schoolRes : (schoolRes && schoolRes.data) || [];
      const st = Array.isArray(styleRes) ? styleRes : (styleRes && styleRes.data) || [];
      // role-list 返回的结构是 { data: [{ _id, name, account, role }] } 或直接数组
      const ws = Array.isArray(wsRes) ? wsRes : (wsRes && wsRes.data) || [];
      this.setData({ schoolList: sc, styleList: st, workshopList: ws });
    }).catch(() => {});
  },

  loadList(concat = false) {
    const { selectedSchool, selectedStyle, selectedWorkshop, genderIndex, genderList } = this.data;
    const params = {
      page: this.data.page,
      pageSize: this.data.pageSize
    };
    if (selectedSchool) params.school = selectedSchool.name || selectedSchool.value || '';
    if (selectedStyle) params.style = selectedStyle.name || selectedStyle.value || '';
    if (genderIndex > 0) params.gender = genderList[genderIndex];
    if (selectedWorkshop) params.workshop_admin_id = selectedWorkshop._id || '';

    this.setData({ loading: true });
    return callCloud('finished-stockList', params).then(res => {
      const rawList = res.list || [];
      // 把 sizeText 字段（性别/款式/学校/尺码 拼成展示文本）补上
      const list = rawList.map(item => ({
        ...item,
        sizeText: [item.gender, item.style, item.school, item.size].filter(Boolean).join(' / ') || '—'
      }));
      const newList = concat ? [...this.data.list, ...list] : list;
      const totalQuantity = newList.reduce((s, x) => s + (Number(x.quantity) || 0), 0);
      this.setData({ list: newList, total: res.total || 0, totalQuantity, loading: false });
    }).catch(() => {
      this.setData({ loading: false });
    });
  },

  onSchoolChange(e) {
    const index = e.detail.value;
    this.setData({ selectedSchool: this.data.schoolList[index], page: 1, list: [] });
    this.loadList();
  },

  onStyleChange(e) {
    const index = e.detail.value;
    this.setData({ selectedStyle: this.data.styleList[index], page: 1, list: [] });
    this.loadList();
  },

  onGenderChange(e) {
    this.setData({ genderIndex: e.detail.value, page: 1, list: [] });
    this.loadList();
  },

  onWorkshopChange(e) {
    const index = e.detail.value;
    this.setData({ selectedWorkshop: this.data.workshopList[index], page: 1, list: [] });
    this.loadList();
  },

  onExport() {
    // 用当前筛选条件调导出云函数
    const { selectedSchool, selectedStyle, selectedWorkshop, genderList, genderIndex } = this.data;
    const params = { page: 1, pageSize: 1000 }; // 一次拉全部用于导出
    if (selectedSchool) params.school = selectedSchool.name || selectedSchool.value || '';
    if (selectedStyle) params.style = selectedStyle.name || selectedStyle.value || '';
    if (genderIndex > 0) params.gender = genderList[genderIndex];
    if (selectedWorkshop) params.workshop_admin_id = selectedWorkshop._id || '';

    wx.showLoading({ title: '生成 Excel 中...' });
    callCloud('finished-stockExport', params).then(res => {
      wx.hideLoading();
      if (res && res.fileID) {
        // 提示用户下载
        wx.cloud.downloadFile({ fileID: res.fileID }).then(dlRes => {
          wx.openDocument({
            filePath: dlRes.tempFilePath,
            showMenu: true,
            fileType: 'xlsx',
            success: () => wx.showToast({ title: '已打开 Excel' }),
            fail: () => wx.showToast({ title: '请用文件管理器查看', icon: 'none' })
          });
        }).catch(err => {
          console.error('下载失败:', err);
          wx.showToast({ title: '下载失败', icon: 'none' });
        });
      } else {
        wx.showToast({ title: '导出失败：' + ((res && res.error) || '无数据'), icon: 'none' });
      }
    }).catch(err => {
      wx.hideLoading();
      wx.showToast({ title: '导出失败：' + (err && err.message ? err.message : err), icon: 'none' });
    });
  }
});
