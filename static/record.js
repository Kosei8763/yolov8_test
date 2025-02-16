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
            <td>
                ${record.exit_time ? '' : `<button onclick="vehicleExit(${record.id})">離場</button>`}
                <button onclick="deleteRecord(${record.id})">刪除</button>
            </td>
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
    if (recordId === undefined || recordId === null) {
        alert('無效的記錄 ID！')
        return
    }
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
