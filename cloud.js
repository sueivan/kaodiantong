/* 考点通 · 纯离线占位层
 * v1 为纯本机离线版：题库、刷题进度、AI 考点分析全部在手机/电脑本地完成，无需任何后端。
 * 云端同步（多设备、换手机不丢失）列为后续付费功能；届时只需用官方云 SDK 覆盖 window.Cloud 即可，
 * 本文件保证在无网络、无外部脚本的情况下，App 仍可完整运行（不会因缺少 Cloud 而报错）。
 */
(function (global) {
  'use strict';

  // 若已加载真实云 SDK（window.Cloud 具备 isReady 函数），则不覆盖，沿用真实实现。
  if (global.Cloud && typeof global.Cloud.isReady === 'function') return;

  const disabled = () => Promise.reject(new Error('云端同步为后续付费功能，当前为纯离线版'));

  global.Cloud = {
    isReady: function () { return false; },
    currentUser: function () { return null; },
    init: function () { return false; },
    refreshSession: function () { return Promise.resolve(null); },
    signOut: function () { return Promise.resolve(); },
    goAuth: function () {},
    sendEmailCode: disabled,
    signInPassword: disabled,
    verifyEmailOtp: disabled,
    resetPassword: disabled,
  };
})(window);
