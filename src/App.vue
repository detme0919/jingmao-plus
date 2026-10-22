<script>
import { refreshKqDaily } from '@/utils/kq.js'

let refreshTimer = null

function cleanupRemovedUtilityData() {
  ;['jm_utility_elec', 'jm_utility_ac', 'jm_ac_room', 'jm_ac_amount'].forEach((key) => {
    try {
      uni.removeStorageSync(key)
    } catch (e) { /* 忽略 */ }
  })
}

export default {
  onLaunch() {
    cleanupRemovedUtilityData()
  },
  onShow() {
    if (refreshTimer) clearTimeout(refreshTimer)
    // 每天首次进入前台时静默续期考勤凭证（仅保存过账号密码时生效）
    refreshTimer = setTimeout(() => {
      refreshTimer = null
      refreshKqDaily()
    }, 3000)
  },
  onHide() {
    if (refreshTimer) {
      clearTimeout(refreshTimer)
      refreshTimer = null
    }
  }
}
</script>

<style>
/* 全局公共样式 */
page {
  background-color: #f6f7f9;
  color: #1f2937;
  font-size: 28rpx;
  -webkit-font-smoothing: antialiased;
}
</style>
