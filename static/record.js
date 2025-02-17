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
    tableBody.innerHTML = '' // 清空表格內容

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
                <button onclick="deleteRecord(${record.id})">刪除</button>
            </td>
        `
    })
}

//刪除紀錄
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
                loadRecords() // 重新載入紀錄
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
