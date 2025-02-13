const socket = io.connect('http://127.0.0.1:5000')

socket.on('connect', function () {
    console.log('✅ WebSocket 已連線')
})

socket.on('update_records', function (data) {
    console.log('📢 收到新紀錄更新')
    updateRecordsTable(data)
})

function updateRecordsTable(records) {
    const tableBody = document.getElementById('records-table') // 確保這是您表格的正確 ID
    tableBody.innerHTML = '' // 清空表格

    // 檢查 records 是否為陣列並且包含資料
    if (Array.isArray(records) && records.length > 0) {
        records.forEach((record) => {
            const row = document.createElement('tr')
            row.id = 'record-' + record.id // 設置唯一 ID 以便刪除

            const imageElement = record.plate_number
                ? `<img src="static/plates/${record.plate_number}.jpg" alt="車輛圖片" width="100" height="auto">`
                : '無圖片'

            row.innerHTML = `
                <td>${imageElement}</td> <!-- 顯示車輛圖片 -->
                <td>${record.plate_number}</td>
                <td>${record.entry_time}</td>
                <td>${record.exit_time || '尚未離場'}</td>
                <td>${record.fee || '尚未計算'}</td>
                <td><button onclick="vehicleExit(${record.id})">離場</button></td>
                <td><button onclick="deleteRecord(${record.id})">刪除</button></td>
            `
            tableBody.appendChild(row)
        })
    } else {
        tableBody.innerHTML = '<tr><td colspan="7">無車輛紀錄</td></tr>' // 更新 colspan
    }
}

// 進場請求
function vehicleEntry() {
    let plateNumber = $('#entry-plate').val()
    if (!plateNumber) {
        alert('請輸入車牌號碼！')
        return
    }

    $.ajax({
        url: '/entry',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ plate_number: plateNumber }),
        success: function (response) {
            alert(response.message)
            loadRecords() // 重新載入紀錄
        },
        error: function (response) {
            alert(response.responseJSON.message)
        },
    })
}

// 離場請求
function vehicleExit(recordId) {
    $.ajax({
        url: '/exit/' + recordId,
        method: 'POST',
        success: function (response) {
            // 檢查 response 和 response.record 是否存在
            if (response && response.record) {
                const fee = response.record.fee || '尚未計算' // 若 fee 不存在，顯示 '尚未計算'
                alert('車輛已離場，停車費用：' + fee + ' 元')
                loadRecords() // 重新載入紀錄
            } else {
                alert('無法獲取車輛資料或費用')
            }
        },
        error: function () {
            alert('離場失敗，請稍後再試！')
        },
    })
}

// 取得手機鏡頭畫面
navigator.mediaDevices
    .getUserMedia({ video: { facingMode: 'environment' } })
    .then((stream) => {
        document.getElementById('video').srcObject = stream
    })
    .catch((error) => console.error('無法開啟攝影機', error))

// 拍攝影像並傳送到後端辨識
function captureImage() {
    let video = document.getElementById('video')
    let canvas = document.getElementById('canvas')
    let context = canvas.getContext('2d')

    // 設定畫布尺寸與擷取影像
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    context.drawImage(video, 0, 0, canvas.width, canvas.height)

    // 轉換成 Base64
    let imageData = canvas.toDataURL('image/jpeg')

    // 傳送影像到 Flask 後端
    fetch('/yolo_plate_recognition', {
        method: 'POST',
        body: JSON.stringify({ image: imageData }),
        headers: { 'Content-Type': 'application/json' },
    })
        .then((response) => response.json())
        .then((data) => {
            if (data.plate_number) {
                document.getElementById('yolo-recognized-plate').innerText = '辨識車牌：' + data.plate_number
                document.getElementById('entry-plate').value = data.plate_number
            } else {
                alert('未能成功辨識車牌')
            }
        })
        .catch(() => alert('上傳失敗'))
}

// 刪除紀錄
function deleteRecord(recordId) {
    if (recordId === undefined || recordId === null) {
        alert('無效的記錄 ID！')
        return
    }

    if (confirm('確定要刪除這筆記錄嗎？')) {
        $.ajax({
            url: '/delete_record/' + recordId,
            type: 'DELETE',
            success: function (response) {
                alert(response.message)
                $('#record-' + recordId).remove() // 從畫面移除該行
            },
            error: function (response) {
                alert('刪除失敗：' + (response.responseJSON.message || '未知錯誤'))
            },
        })
    }
}

// 頁面載入時自動載入紀錄
$(document).ready(() => {
    loadRecords()
})

function loadRecords() {
    $.ajax({
        url: '/get_records',
        method: 'GET',
        success: function (response) {
            updateRecordsTable(response)
        },
        error: function () {
            alert('無法載入紀錄，請稍後再試！')
        },
    })
}
