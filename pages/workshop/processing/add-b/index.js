// pages/workshop/processing/add-b/index.js
const { callCloud } = require('../../../../utils/request.js');
const { mapWorkshopIncoming } = require('../../../../utils/field-map.js');
const pageGuard = require('../../../../utils/page-guard.js');
const app = getApp();

pageGuard({
  moduleKey: 'workshop',
  data: {
    incomingList: [],
    selectedIncoming: null,
    planCount: '',
    actualCount: '',
    genderIndex: 0,
    genderList: ['男', '女', '通用'],
    styleList: [],
    selectedStyle: null,
    seasonList: [],
    selectedSeason: null,
    schoolList: [],
    selectedSchool: null
  },

  onLoad() {
    this.loadIncomingList();
    this.loadOptions();
  },

  loadIncomingList() {
    callCloud('workshop-confirmedIncomingList').then(res => {
      const list = (res || []).map(item => mapWorkshopIncoming(item));
      this.setData({ incomingList: list });
    });
  },

  loadOptions() {
    Promise.all([
      callCloud('option-list', { type: 'style' }),
      callCloud('option-list', { type: 'season' }),
      callCloud('option-list', { type: 'school' })
    ]).then(([styleRes, seasonRes, schoolRes]) => {
      const s  = Array.isArray(styleRes)  ? styleRes  : (styleRes  && styleRes.data)  || [];
      const sn = Array.isArray(seasonRes) ? seasonRes : (seasonRes && seasonRes.data) || [];
      const sc = Array.isArray(schoolRes) ? schoolRes : (schoolRes && schoolRes.data) || [];
      this.setData({ styleList: s, seasonList: sn, schoolList: sc });
    }).catch(() => {});
  },

  onIncomingChange(e) {
    const index = e.detail.value;
    this.setData({ selectedIncoming: this.data.incomingList[index] });
  },

  onPlanCountInput(e) {
    this.setData({ planCount: e.detail.value });
  },

  onActualCountInput(e) {
    this.setData({ actualCount: e.detail.value });
  },

  onGenderChange(e) {
    this.setData({ genderIndex: e.detail.value });
  },

  onStyleChange(e) {
    const index = e.detail.value;
    this.setData({ selectedStyle: this.data.styleList[index] });
  },

  onSeasonChange(e) {
    const index = e.detail.value;
    this.setData({ selectedSeason: this.data.seasonList[index] });
  },

  onSchoolChange(e) {
    const index = e.detail.value;
    this.setData({ selectedSchool: this.data.schoolList[index] });
  },

  onSubmit() {
    const { selectedIncoming, planCount, actualCount, genderIndex, selectedStyle, selectedSeason, selectedSchool } = this.data;
    if (!selectedIncoming || !planCount || !actualCount) {
      wx.showToast({ title: '请填写完整信息', icon: 'none' });
      return;
    }
    if (!selectedStyle) {
      return wx.showToast({ title: '请选择款式', icon: 'none' });
    }
    if (!selectedSeason) {
      return wx.showToast({ title: '请选择季节', icon: 'none' });
    }
    if (!selectedSchool) {
      return wx.showToast({ title: '请选择学校', icon: 'none' });
    }
    const userInfo = app.getUserInfo() || {};
    const planNum = parseInt(planCount) || 0;
    const actualNum = parseInt(actualCount) || 0;
    callCloud('workshop-processingAdd', {
      source_type: 'workshop',
      workshop_incoming_confirm_id: selectedIncoming.id,
      workshop_admin_id: userInfo._id || '',
      plan_quantity: [{ count: planNum }],
      actual_quantity: [{ count: actualNum }],
      loss_rate: [],
      accessory_usage: [],
      gender: this.data.genderList[genderIndex],
      style:  selectedStyle  ? (selectedStyle.name  || selectedStyle.value  || '') : '',
      season: selectedSeason ? (selectedSeason.name || selectedSeason.value || '') : '',
      school: selectedSchool ? (selectedSchool.name || selectedSchool.value || '') : ''
    }).then(() => {
      wx.showToast({ title: '提交成功' });
      setTimeout(() => wx.navigateBack(), 1500);
    });
  }
});
