from ultralytics import YOLO
import cv2

# 加載 YOLOv8 訓練好的車牌辨識模型
model = YOLO("best.pt")  # 你的模型權重檔案


def recognize_sorted_plate(image_path):
    # 讀取影像
    image = cv2.imread(image_path)

    # 使用 YOLO 偵測車牌字元
    results = model(image)

    detected_chars = []  # 儲存 (字元, x1) 位置

    for result in results:
        for box in result.boxes:
            x1, y1, x2, y2 = map(int, box.xyxy[0])  # 取得座標
            char_label = result.names[int(box.cls[0])]  # 取得 YOLO 預測的字元

            detected_chars.append((char_label, x1))  # 儲存字元與 x 座標

    # 根據 x 座標排序（從左到右）
    detected_chars.sort(key=lambda c: c[1])

    # 組合成完整車牌號碼
    plate_number = "".join([char[0] for char in detected_chars])

    return plate_number


# 測試圖片
image_path = "uploads/temp.jpg"  # 替換成你的測試圖片
plate = recognize_sorted_plate(image_path)
print(f"辨識出的車牌號碼：{plate}")
