const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

/**
 * 鐠併倛鐦夊Ο鈥虫健 - 閼惧嘲褰囬悽銊﹀煕娣団剝浼�
 */

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const db = cloud.database();
  const { userId } = event;

  if (!userId) {
    return { success: false, error: '閻€劍鍩汭D娑撳秷鍏樻稉铏光敄' };
  }

  try {
    const res = await db.collection('employee') .doc(userId)
      .field({
        password: false, // 閹烘帡娅庣€靛棛鐖滅€涙顔�
      })
      .get();

    if (res.data.length === 0) {
      return { success: false, error: '閻€劍鍩涙稉宥呯摠閸�'};
    }

    return { success: true, data: res.data[0] };
  } catch (e) {
    console.error('閼惧嘲褰囬悽銊﹀煕娣団剝浼呮径杈Е:', e);
    return { success: false, error: '閼惧嘲褰囬悽銊﹀煕娣団剝浼呮径杈Е' };
  }
};
