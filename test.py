import cv2
import numpy as np
from PIL import Image
import torch
from ultralytics import YOLO

model = YOLO("best.pt")  # 替換成你的模型權重檔案


def recognize_plate_yolo(image_path):
    # 讀取圖片
    img = cv2.imread(image_path)
    if img is None:
        print("Error: 無法讀取圖片")
        return

    # 轉換為 BGR 格式
    img_bgr = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)

    # 調整圖片大小為 320x320
    img_resized = cv2.resize(img_bgr, (320, 320))

    # 添加 batch 維度
    img_input = np.expand_dims(img_resized, axis=0)

    # 將圖片轉換為 Tensor
    img_input = torch.from_numpy(img_input).float() / 255.0  # 正規化
    # 將圖像維度從 (batch, height, width, channels) 轉換為 (batch, channels, height, width)
    img_input = img_input.permute(0, 3, 1, 2)

    # 使用 YOLO 模型進行預測
    results = model(img_input)

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

    cv2.imshow('Detected Plate', img_resized)
    print(plate_number)
    cv2.waitKey(0)


# 測試函數（請替換圖片路徑）
if __name__ == "__main__":
    recognize_plate_yolo('uploads/temp.jpg')
