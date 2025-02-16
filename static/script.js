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

$(document).ready(function () {
    loadParkingSpaces() // 頁面載入時自動載入車位列表

    // 載入車位資料
    function loadParkingSpaces() {
        $.ajax({
            url: '/get_parking_spaces',
            method: 'GET',
            success: function (response) {
                updateParkingSpacesTable(response)
            },
            error: function () {
                alert('無法載入車位資料，請稍後再試！')
            },
        })
    }

    // 更新車位表格
    function updateParkingSpacesTable(spaces) {
        const tableBody = $('#parking-spaces-table')
        tableBody.empty() // 清空現有的表格內容

        spaces.forEach((space) => {
            const row = $('<tr></tr>')
            row.append(`<td>${space.space_number}</td>`)
            row.append(`<td>${space.occupied ? '已佔用' : '可用'}</td>`)
            row.append(`<td>${space.plate_number || '無'}</td>`)
            row.append(
                `<td><button onclick="toggleCharging(${space.id}, ${space.charging})">${
                    space.charging ? '關閉充電' : '開啟充電'
                }</button></td>`
            )
            row.append(`<td>${space.charging_cost} 元</td>`)
            row.append(
                `<td><button onclick="toggleOccupied(${space.id}, ${space.occupied})">${
                    space.occupied ? '釋放車位' : '佔用車位'
                }</button></td>`
            )
            tableBody.append(row)
        })
    }

    // **切換車位佔用狀態**
    function toggleOccupied(spaceId, isOccupied) {
        let plateNumber = prompt('請輸入車牌號碼：')
        if (!plateNumber) {
            alert('請輸入車牌號碼！')
            return
        }

        if (!isOccupied) {
            // **佔用車位時，自動執行進場**
            $.ajax({
                url: '/entry',
                method: 'POST',
                contentType: 'application/json',
                data: JSON.stringify({ plate_number: plateNumber }),
                success: function (response) {
                    alert(response.message)
                    updateParkingStatus(spaceId, plateNumber, true) // 標記車位已佔用
                },
                error: function (response) {
                    alert('進場失敗：' + (response.responseJSON.message || '未知錯誤'))
                },
            })
        } else {
            // **釋放車位時，先查找記錄並自動離場**
            $.ajax({
                url: `/find_record/${plateNumber}`,
                method: 'GET',
                success: function (response) {
                    if (response && response.record_id) {
                        // 發送離場請求
                        $.ajax({
                            url: `/exit/${response.record_id}`,
                            method: 'POST',
                            success: function (exitResponse) {
                                alert('車輛已離場，停車費用：' + (exitResponse.record.fee || '尚未計算') + ' 元')
                                updateParkingStatus(spaceId, null, false) // 標記車位可用
                            },
                            error: function () {
                                alert('離場失敗，請稍後再試！')
                            },
                        })
                    } else {
                        alert('未找到車輛記錄，無法離場')
                    }
                },
                error: function () {
                    alert('查詢車輛記錄失敗，請稍後再試！')
                },
            })
        }
    }

    // **更新車位狀態**
    function updateParkingStatus(spaceId, plateNumber, isOccupied) {
        $.ajax({
            url: `/toggle_occupied/${spaceId}`,
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify({ plate_number: plateNumber, is_occupied: isOccupied }),
            success: function (response) {
                alert(response.message)
                loadParkingSpaces() // 重新載入車位資料
            },
            error: function () {
                alert('車位狀態更新失敗，請稍後再試！')
            },
        })
    }

    // 切換充電服務
    function toggleCharging(spaceId, isCharging) {
        $.ajax({
            url: `/toggle_charging/${spaceId}`,
            method: 'POST',
            success: function (response) {
                alert(response.message)
                loadParkingSpaces() // 重新載入車位資料
            },
            error: function () {
                alert('操作失敗，請稍後再試！')
            },
        })
    }

    // 註冊進場函數
    window.vehicleEntry = vehicleEntry // 讓進場函數可以被 HTML 調用
    window.toggleOccupied = toggleOccupied
    window.toggleCharging = toggleCharging
})
