function loadRecords() {
    $.get("/records", function(data) {
        let tableBody = $("#records-table");
        tableBody.empty(); // 清空表格內容

        if (data.length === 0) {
            tableBody.append(`<tr><td colspan="7">目前沒有紀錄</td></tr>`);
            return;
        }

        data.forEach(record => {
            // 確保 exit_time 和 fee 有正確值
            let exitTime = record.exit_time ? new Date(record.exit_time).toLocaleString() : "尚未離場";
            let fee = record.fee ? record.fee.toFixed(2) + " 元" : "尚未計費";

            // 動態生成表格行
            tableBody.append(`
                <tr id="record-${record.id}">
                    <td>${record.id}</td>
                    <td>${record.plate_number}</td>
                    <td>${new Date(record.entry_time).toLocaleString()}</td>
                    <td>${exitTime}</td>
                    <td>${fee}</td>
                    <td>
                        ${!record.exit_time ? `<button onclick="vehicleExit(${record.id})">離場</button>` : ''}
                    </td>  
                    <td>  
                        <button onclick="deleteRecord(${record.id})">刪除</button>
                    </td>
                </tr>
            `);
        });
    }).fail(function() {
        alert("載入紀錄失敗，請稍後再試！");
    });
}


// 上傳 YOLO 車牌圖片並辨識
function uploadYoloPlateImage() {
    let fileInput = document.getElementById("yolo-plate-image");
    if (fileInput.files.length === 0) {
        alert("請選擇一張車牌圖片！");
        return;
    }

    let formData = new FormData();
    formData.append("file", fileInput.files[0]);

    fetch("/yolo_plate_recognition", {
        method: "POST",
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        if (data.plate_number) {
            document.getElementById("yolo-recognized-plate").innerText = "辨識車牌：" + data.plate_number;
            document.getElementById("entry-plate").value = data.plate_number;
        } else {
            alert("未能成功辨識車牌");
        }
    })
    .catch(() => alert("上傳失敗"));
}

// 進場請求
function vehicleEntry() {
    let plateNumber = $("#entry-plate").val();
    if (!plateNumber) {
        alert("請輸入車牌號碼！");
        return;
    }

    $.ajax({
        url: "/entry",
        method: "POST",
        contentType: "application/json",
        data: JSON.stringify({ plate_number: plateNumber }),
        success: function(response) {
            alert(response.message);
            loadRecords();  // 重新載入紀錄
        },
        error: function(response) {
            alert(response.responseJSON.message);
        }
    });
}

// 離場請求
function vehicleExit(recordId) {
    $.ajax({
        url: "/exit/" + recordId,
        method: "POST",
        success: function(response) {
            alert("車輛已離場，停車費用：" + response.record.fee + " 元");
            loadRecords();  // 重新載入紀錄
        },
        error: function() {
            alert("離場失敗，請稍後再試！");
        }
    });
}

// 刪除紀錄
function deleteRecord(recordId) {
    if (recordId === undefined || recordId === null) {
        alert("無效的記錄 ID！");
        return;
    }

    if (confirm("確定要刪除這筆記錄嗎？")) {
        $.ajax({
            url: "/delete_record/" + recordId,
            type: "DELETE",
            success: function(response) {
                alert(response.message);
                $("#record-" + recordId).remove(); // 從畫面移除該行
            },
            error: function(response) {
                alert("刪除失敗：" + (response.responseJSON.message || "未知錯誤"));
            }
        });
    }
}

// 頁面載入時自動載入紀錄
$(document).ready(() => {
    loadRecords();
});
