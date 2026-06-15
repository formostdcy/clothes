const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 閼颁焦婢� - 鐠併垹宕熷ù浣芥祮閺冨爼妫挎潪? */

exports.main = async (event, context) => {
  const db = cloud.database();
  const { order_id, module } = event;

  if (!order_id || !module) return { success: false, error: '閸欏倹鏆熸稉宥呯暚閺�'};

  try {
    const timeline = [];

    switch (module) {
      case 'cutting': {
        // 鐟佷礁澹€閸楁洘妞傞梻纾嬮叡閿涙艾鍤惔鎾冲礋 閳�?閺夈儲鏋＄涵顔款吇 閳�?鐟佷礁澹€閸�?閳�?鏉烇箓妫跨涵顔款吇 閳�?閸旂姴浼愰崡?閳�?閹存劕鎼х涵顔款吇 閳�?閹存劕鎼ч崙鍝勭氨
        const cuttingRes = await db.collection('cutting_order').doc(order_id).get();
        if (cuttingRes.data) {
          timeline.push({ stage: '鐟佷礁澹€閸楁洖鍨卞', time: cuttingRes.data.created_at, data: cuttingRes.data });
        }
        break;
      }
      case 'processing': {
        const processingRes = await db.collection('processing_order').doc(order_id).get();
        if (processingRes.data) {
          timeline.push({ stage: '閸旂姴浼愰崡鏇炲灡瀵�', time: processingRes.data.created_at, data: processingRes.data });
          if (processingRes.data.confirm_time) {
            timeline.push({ stage: '閸旂姴浼愮€瑰本鍨�', time: processingRes.data.confirm_time });
          }
        }
        break;
      }
      default:
        break;
    }

    return { success: true, data: timeline };
  } catch (e) {
    console.error('閺冨爼妫挎潪瀛樼叀鐠囥垹銇戠拹?', e);
    return { success: false, error: '閺屻儴顕楁径杈Е' };
  }
};
