function calculateFee() {
    let plateNumber = $("#fee-plate").val();
    if (!plateNumber) {
        alert("請輸入車牌號碼！");
        return;
    }

    $.ajax({
        url: "/calculate_fee",
        method: "POST",
        contentType: "application/json",
        data: JSON.stringify({ plate_number: plateNumber }),
        success: function(response) {
            $("#fee-result").text(`車牌 ${response.plate_number} 停車費用預估：${response.estimated_fee} 元`);
        },
        error: function() {
            $("#fee-result").text("查無該車輛記錄或車輛已離場！");
        }
    });
}
