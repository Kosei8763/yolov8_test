const socket = io.connect('http://127.0.0.1:5000')

socket.on('connect', function () {
    console.log('✅ WebSocket 已連線')
})
socket.on('disconnect', function () {
    console.warn('⚠️ WebSocket 連線中斷，嘗試重新連線...')
})
socket.on('update_parking_spaces', function (data) {
    console.log('📢 收到新車位更新')
    updateParkingSpacesTable(data)
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

$(document).ready(function () {
    loadParkingSpaces() // 頁面載入時自動載入車位列表

    // 載入車位資料
    function loadParkingSpaces() {
        $.ajax({
            url: '/get_spaces',
            method: 'GET',
            success: function (response) {
                updateParkingSpacesTable(response)
            },
            error: function () {
                alert('無法載入車位資料，請稍後再試！')
            },
        })
    }

    function toggleOccupied(spaceId, isOccupied) {
        if (isOccupied) {
            // **釋放車位(離場)**: 發送離場請求給後端
            $.ajax({
                url: `/exit/${spaceId}`, // 這裡的路由應該根據後端設計調整
                method: 'POST',
                contentType: 'application/json',
                success: function (response) {
                    alert(response.message)
                    updateParkingStatus(spaceId, null, false) // 標記車位已釋放
                    loadParkingSpaces() // 重新載入車位資料
                },
                error: function (response) {
                    alert('離場失敗：' + (response.responseJSON.message || '未知錯誤'))
                },
            })
        } else {
            // **佔用車位(進場)**: 發送進場請求給後端
            let plateNumber = $('#entry-plate').val()
            if (!plateNumber) {
                alert('請輸入車牌號碼！')
                return
            }
            $.ajax({
                url: `/entry/${spaceId}`, // 這裡的路由應該根據後端設計調整
                method: 'POST',
                contentType: 'application/json',
                data: JSON.stringify({ plate_number: plateNumber }),
                success: function (response) {
                    alert(response.message)
                    updateParkingStatus(spaceId, plateNumber, true) // 標記車位已佔用
                    loadParkingSpaces() // 重新載入車位資料
                },
                error: function (response) {
                    alert('進場失敗：' + (response.responseJSON.message || '未知錯誤'))
                },
            })
        }
    }

    function updateParkingStatus(spaceId, plateNumber, isOccupied) {
        // 這個函數用來更新前端顯示的車位狀態
        let spaceElement = $('#space-' + spaceId) // 假設每個車位都有對應的 ID
        if (isOccupied) {
            spaceElement.text('佔用: ' + plateNumber)
            spaceElement.addClass('occupied')
        } else {
            spaceElement.text('可用')
            spaceElement.removeClass('occupied')
        }
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

    // 註冊進場函數到全域變數，方便後續使用
    window.toggleOccupied = toggleOccupied
    window.toggleCharging = toggleCharging
})
