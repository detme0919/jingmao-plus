<template>
  <view class="page" :style="pageStyle">
    <view class="hero">
      <view class="hero-icon">
        <image class="hero-icon-img" src="/static/school-logo.png" mode="aspectFill" />
      </view>
      <view class="hero-title">经贸+</view>
      <view class="hero-sub">校园工具箱 · v{{ version }}</view>
    </view>

    <view class="card">
      <view class="section">
        <view class="section-title">关于本应用</view>
        <view class="para">
          「经贸+」是一款由个人独立开发的校园工具集合应用，用于把本人常用的学校在线服务集中到一个入口中。
        </view>
        <view class="para para--strong">
          本应用为个人作品，并非河南经贸职业学院官方发布，与学校及其下属部门不存在隶属、合作或授权关系。
        </view>
      </view>

      <view class="section">
        <view class="section-title">数据与隐私</view>
        <view class="bullet">应用内展示的学校数据来自学校官方系统；手动课程、主题等设置仅保存在本机；</view>
        <view class="bullet">统一认证密码不保存；考勤密码仅在主动勾选「记住密码」时，以混淆形式保存在本机（不是加密），可随时解绑清除；</view>
        <view class="bullet">登录凭证（token）仅保存在本机，用于免去重复登录；</view>
        <view class="bullet">卸载应用或在「我的 → 数据管理 → 清除本机全部数据」后，本地数据即被删除。</view>
      </view>

      <view class="section">
        <view class="section-title">使用须知</view>
        <view class="bullet">应用会按你的主动操作向学校系统提交离校申请、打卡等请求，不修改学校业务规则；</view>
        <view class="bullet">学校系统升级、调整或停用时，相关功能可能暂时失效；</view>
        <view class="bullet">一切信息请以学校官方通知为准，使用本应用产生的风险由使用者自行承担。</view>
      </view>

      <view class="section">
        <view class="section-title">更新计划</view>
        <view class="para">
          课程表、出校登记、打卡考勤已接入，更多校园服务持续更新中；水电/空调缴费暂缓。
        </view>
      </view>
    </view>

    <view class="footer">河南经贸职业学院 · 个人校园工具 · v{{ version }}</view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { getTheme, themeVars, applyNavTheme } from '@/utils/theme.js'

const version = '0.2.0'
const theme = ref(getTheme())
const pageStyle = computed(() => themeVars(theme.value))

onShow(() => {
  theme.value = getTheme()
  applyNavTheme(theme.value)
})
</script>

<style>
.page {
  min-height: 100vh;
  padding-bottom: 40rpx;
}

.hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 56rpx 40rpx 48rpx;
  background: linear-gradient(135deg, var(--brand-grad-from) 0%, var(--brand-grad-to) 100%);
  color: #ffffff;
}

.hero-icon {
  width: 128rpx;
  height: 128rpx;
  border-radius: 50%;
  background: #ffffff;
  overflow: hidden;
  box-shadow: 0 6rpx 20rpx rgba(15, 23, 42, 0.18);
}

.hero-icon-img {
  width: 100%;
  height: 100%;
  display: block;
}

.hero-title {
  margin-top: 20rpx;
  font-size: 40rpx;
  font-weight: 700;
}

.hero-sub {
  margin-top: 8rpx;
  font-size: 24rpx;
  opacity: 0.8;
}

.card {
  margin: 24rpx;
  padding: 8rpx 32rpx 12rpx;
  background: #ffffff;
  border-radius: 20rpx;
}

.section {
  padding: 28rpx 0;
  border-bottom: 1rpx solid #f3f4f6;
}

.section:last-child {
  border-bottom: none;
}

.section-title {
  font-size: 30rpx;
  font-weight: 600;
  color: var(--brand);
  margin-bottom: 16rpx;
}

.para {
  font-size: 26rpx;
  color: #4b5563;
  line-height: 1.75;
  margin-bottom: 12rpx;
}

.para--strong {
  color: #1f2937;
  font-weight: 600;
}

.bullet {
  position: relative;
  padding-left: 26rpx;
  margin-bottom: 10rpx;
  font-size: 26rpx;
  color: #4b5563;
  line-height: 1.7;
}

.bullet::before {
  content: '';
  position: absolute;
  left: 4rpx;
  top: 18rpx;
  width: 8rpx;
  height: 8rpx;
  border-radius: 50%;
  background: var(--brand);
}

.footer {
  padding: 32rpx 0 16rpx;
  text-align: center;
  font-size: 22rpx;
  color: #c0c4cc;
}
</style>
