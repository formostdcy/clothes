// pages/cutting/incoming/detail/index.js
const { callCloud } = require('../../../../utils/request.js');
const { mapCuttingIncomingDetail } = require('../../../../utils/field-map.js');
const { formatDate } = require('../../../../utils/util.js');
const pageGuard = require('../../../../utils/page-guard.js');

pageGuard({
  moduleKey: 'cutting',
  data: {
    id: '',
    incomingNo: '',
    supplierName: '',
    materialName: '',
    spec: '',
    quantity: 0,
    unit: '',
    incomingTime: '',
    status: 0,
    statusText: '',
    remark: ''
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ id: options.id });
      this.loadDetail();
    }
  },

  loadDetail() {
    callCloud('cutting-incomingDetail', { id: this.data.id }).then(res => {
      const mapped = mapCuttingIncomingDetail(res) || {};
      mapped.incomingTime = formatDate(mapped.incomingTime, 'YYYY-MM-DD HH:mm');
      this.setData(mapped);
    });
  }
});
