package com.jingmaoplus.app

import android.Manifest
import android.app.Activity
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale

/**
 * iBeacon 扫描器（打卡定位用）。
 * 解析标准 iBeacon 广播（Apple 0x004C，前缀 02 15），收集 UUID/Major/Minor/RSSI。
 */
object BeaconScanner {
    const val REQ_CODE = 0x4B51

    private var scanning = false
    private var callback: ScanCallback? = null
    private var lastActivity: Activity? = null
    private val found = LinkedHashMap<String, MutableMap<String, Any>>()

    private fun adapter(activity: Activity): BluetoothAdapter? =
        (activity.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter

    private fun requiredPermissions(): Array<String> =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            arrayOf(Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT)
        } else {
            arrayOf(Manifest.permission.ACCESS_FINE_LOCATION)
        }

    @JvmStatic
    fun hasPermissions(activity: Activity): Boolean =
        requiredPermissions().all {
            ContextCompat.checkSelfPermission(activity, it) == PackageManager.PERMISSION_GRANTED
        }

    /** 0=扫描已开始 1=已弹出权限请求 2=蓝牙未开启 3=设备不支持 */
    @JvmStatic
    fun start(activity: Activity): Int {
        lastActivity = activity
        if (!activity.packageManager.hasSystemFeature(PackageManager.FEATURE_BLUETOOTH_LE)) return 3
        val adapter = try {
            adapter(activity)
        } catch (_: SecurityException) {
            null
        } ?: return 3
        if (!hasPermissions(activity)) {
            ActivityCompat.requestPermissions(activity, requiredPermissions(), REQ_CODE)
            return 1
        }
        val enabled = try {
            adapter.isEnabled
        } catch (_: SecurityException) {
            false
        }
        if (!enabled) return 2
        if (scanning) return 0
        val scanner = try {
            adapter.bluetoothLeScanner
        } catch (_: SecurityException) {
            null
        } ?: return 3
        synchronized(found) { found.clear() }
        val cb = object : ScanCallback() {
            override fun onScanResult(callbackType: Int, result: ScanResult) {
                parse(result)
            }

            override fun onBatchScanResults(results: MutableList<ScanResult>) {
                results.forEach { parse(it) }
            }
        }
        callback = cb
        val settings = ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
            .setReportDelay(0)
            .build()
        try {
            scanner.startScan(null, settings, cb)
        } catch (_: SecurityException) {
            callback = null
            return 3
        }
        scanning = true
        return 0
    }

    /** 停止扫描并返回 JSON 数组（按 RSSI 从强到弱） */
    @JvmStatic
    fun stop(): String {
        val activity = lastActivity
        try {
            if (scanning && activity != null && hasPermissions(activity)) {
                val adapter = adapter(activity)
                callback?.let { adapter?.bluetoothLeScanner?.stopScan(it) }
            }
        } catch (_: Exception) {
        }
        scanning = false
        callback = null
        val arr = JSONArray()
        synchronized(found) {
            found.values.sortedByDescending { (it["rssi"] as? Int) ?: -999 }.forEach { m ->
                arr.put(JSONObject(m))
            }
            found.clear()
        }
        return arr.toString()
    }

    @JvmStatic
    fun isScanning(): Boolean = scanning

    /** 权限弹窗返回后调用：已授权则自动开始扫描 */
    @JvmStatic
    fun onPermissionResult() {
        val activity = lastActivity ?: return
        if (hasPermissions(activity)) {
            scanning = false
            start(activity)
        }
    }

    private fun parse(result: ScanResult) {
        val record = result.scanRecord ?: return
        val data = record.getManufacturerSpecificData(0x004C) ?: return
        if (data.size < 23) return
        if ((data[0].toInt() and 0xFF) != 0x02 || (data[1].toInt() and 0xFF) != 0x15) return
        val bytes = data.copyOfRange(2, 18)
        val sb = StringBuilder()
        for (i in bytes.indices) {
            if (i == 4 || i == 6 || i == 8 || i == 10) sb.append('-')
            sb.append(String.format(Locale.US, "%02x", bytes[i].toInt() and 0xFF))
        }
        val major = ((data[18].toInt() and 0xFF) shl 8) or (data[19].toInt() and 0xFF)
        val minor = ((data[20].toInt() and 0xFF) shl 8) or (data[21].toInt() and 0xFF)
        val address = try {
            result.device.address ?: ""
        } catch (_: SecurityException) {
            ""
        }
        val item = mutableMapOf<String, Any>(
            "uuid" to sb.toString(),
            "major" to major,
            "minor" to minor,
            "rssi" to result.rssi,
            "txpower" to data[22].toInt(),
            "address" to address,
            "name" to (record.deviceName ?: "")
        )
        synchronized(found) {
            found[sb.toString() + "|" + major + "|" + minor] = item
        }
    }
}
