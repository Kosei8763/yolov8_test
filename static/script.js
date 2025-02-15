const socket = io.connect('http://127.0.0.1:5000')

socket.on('connect', function () {
    console.log('✅ WebSocket 已連線')
})
socket.on('disconnect', function () {
    console.warn('⚠️ WebSocket 連線中斷，嘗試重新連線...')
})
socket.on('update_records', function (data) {
    console.log('📢 收到新紀錄更新')
    updateRecordsTable(data)
})

let videoStream = null
let video = document.getElementById('video')
let canvas = document.createElement('canvas')
let context = canvas.getContext('2d')
let isRecognizing = false // 避免短時間內多次辨識

// 啟動攝影機
navigator.mediaDevices
    .getUserMedia({ video: { facingMode: 'environment' } })
    .then((stream) => {
        video.srcObject = stream
        videoStream = stream
        startContinuousRecognition() // 啟動持續辨識
    })
    .catch((error) => console.error('無法開啟攝影機', error))

// 持續擷取影像並送到後端
function startContinuousRecognition() {
    setInterval(() => {
        if (isRecognizing) return // 如果正在辨識，不要重複發送

        isRecognizing = true

        // 擷取影像
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        context.drawImage(video, 0, 0, canvas.width, canvas.height)
        let imageData = canvas.toDataURL('image/jpeg') // 轉 base64 格式

        console.log('發送影像資料:', imageData) // 印出 base64 以檢查資料

        // 發送至後端辨識車牌
        $.ajax({
            url: '/detect_license_plate',
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ image: imageData }),
            success: function (response) {
                if (response.plate_number) {
                    console.log('✅ 車牌辨識成功：', response.plate_number)
                    $('#entry-plate').val(response.plate_number) // 顯示到輸入框
                }
            },
            error: function () {
                console.warn('⚠️ 辨識失敗，稍後重試')
            },
            complete: function () {
                isRecognizing = false // 完成後允許下一次辨識
            },
        })
    }, 3000) // 每 3 秒擷取一次影像
}

function updateRecordsTable(records) {
    const tableBody = document.getElementById('records-table')

    // 建立現有記錄的索引（用於比對哪些要更新）
    const existingRows = {}
    tableBody.querySelectorAll('tr').forEach((row) => {
        const recordId = row.getAttribute('data-id')
        if (recordId) existingRows[recordId] = row
    })

    records.forEach((record) => {
        let row = existingRows[record.id]

        if (!row) {
            row = document.createElement('tr')
            row.setAttribute('data-id', record.id)
            tableBody.appendChild(row)
        }

        row.innerHTML = `
            <td>
                ${record.plate_number ? `<img src="static/plates/${record.plate_number}.jpg" width="100">` : '無圖片'}
            </td>
            <td>${record.plate_number}</td>
            <td>${record.entry_time}</td>
            <td>${record.exit_time || '尚未離場'}</td>
            <td>${record.fee || '尚未計算'}</td>
            <td><button onclick="vehicleExit(${record.id})">離場</button></td>
            <td><button onclick="deleteRecord(${record.id})">刪除</button></td>
        `
    })
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
