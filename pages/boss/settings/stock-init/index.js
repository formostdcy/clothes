const { callCloud } = require('../../../../utils/request.js');
const pageGuard = require('../../../../utils/page-guard.js');

pageGuard({
  moduleKey: 'boss',
  onSubmit() {
    wx.showModal({
      title: '确认初始化',
      content: '确定要初始化库存吗？此操作不可逆！',
      success: res => {
        if (res.confirm) {
          wx.showLoading({ title: '处理中...' });
          callCloud('raw-stockInit', { clear: true }).then(() => {
            wx.hideLoading();
            wx.showToast({ title: '初始化成功' });
            setTimeout(() => wx.navigateBack(), 1500);
          }).catch(() => {
            wx.hideLoading();
          });
        }
      }
    });
  }
});
