import os
import cv2
import numpy as np
from flask import Flask, request, render_template, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from datetime import datetime
from ultralytics import YOLO
import torch

app = Flask(__name__)

# 設定 SQLite 資料庫連線資訊
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///parking.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)
# 設定圖片上傳資料夾
UPLOAD_FOLDER = './uploads'
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# 確保上傳資料夾存在
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

CORS(app)  # 啟用 CORS


# 車輛進出記錄表
class ParkingRecord(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    plate_number = db.Column(db.String(20), nullable=False)
    entry_time = db.Column(db.DateTime, default=datetime.utcnow)
    exit_time = db.Column(db.DateTime, nullable=True)
    fee = db.Column(db.Float, default=0.0)


# 初始化資料庫
with app.app_context():
    db.create_all()


# 加載 YOLOv8 訓練好的模型
model = YOLO("best.pt")  # 替換成你的模型權重檔案

# 使用 YOLO 偵測車牌並辨識車牌號碼


def recognize_plate_yolo(image_path):
    # 讀取圖片
    img = cv2.imread(image_path)
    if img is None:
        print("Error: 無法讀取圖片")
        return

    # 轉換為 BGR 格式
    img_bgr = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)

    # 調整圖片大小為 640x640
    img_resized = cv2.resize(img_bgr, (640, 640))

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

    return plate_number

# 上傳圖片並處理


@app.route('/yolo_plate_recognition', methods=['POST'])
def recognize_plate_api():
    if 'file' not in request.files:
        return jsonify({"error": "未提供影像檔案"}), 400

    file = request.files['file']
    file_path = "uploads/temp.jpg"
    file.save(file_path)

    plate_number = recognize_plate_yolo(file_path)

    if plate_number:
        return jsonify({"plate_number": plate_number})
    else:
        return jsonify({"error": "未辨識到車牌"}), 400


@app.route('/')
def home():
    return render_template("index.html")


@app.route('/calculate_fee_page')
def calculate_fee_page():
    return render_template("calculate_fee.html")


@app.route('/entry', methods=['POST'])
def vehicle_entry():
    data = request.json
    plate_number = data.get("plate_number")

    if not plate_number:
        return jsonify({"error": "車牌號碼不能為空"}), 400

    # 檢查車牌是否已經進場
    existing_record = ParkingRecord.query.filter_by(
        plate_number=plate_number, exit_time=None).first()
    if existing_record:
        return jsonify({"success": False, "message": "該車輛已經進場，無法重複進場！"}), 400

    record = ParkingRecord(plate_number=plate_number)
    db.session.add(record)
    db.session.commit()

    return jsonify({"message": "車輛進場成功", "plate_number": plate_number})


# 車輛離場 API

@app.route('/exit/<int:record_id>', methods=['POST'])
def vehicle_exit(record_id):
    record = ParkingRecord.query.get(record_id)
    if not record:
        return jsonify({"success": False, "message": "找不到該車輛的紀錄"}), 404

    if record.exit_time:
        return jsonify({"success": False, "message": "該車輛已經離場"}), 400

    if not record.entry_time:
        return jsonify({"success": False, "message": "進場時間缺失，無法計算費用"}), 400

    # 設定離場時間
    record.exit_time = datetime.utcnow()

    # 計算停車費用
    duration = (record.exit_time -
                record.entry_time).total_seconds() / 3600  # 小時數
    fee_per_hour = 50  # 每小時 50 元
    record.fee = round(duration * fee_per_hour, 2)

    db.session.commit()

    return jsonify({
        "success": True,
        "message": "車輛已成功離場",
        "record": {
            "id": record.id,
            "plate_number": record.plate_number,
            "entry_time": record.entry_time.strftime("%Y-%m-%d %H:%M:%S"),
            "exit_time": record.exit_time.strftime("%Y-%m-%d %H:%M:%S"),
            "fee": record.fee
        }
    }), 200


@app.route('/calculate_fee', methods=['POST'])
def calculate_fee():
    data = request.json
    plate_number = data.get("plate_number")

    record = ParkingRecord.query.filter_by(
        plate_number=plate_number, exit_time=None).first()

    if not record:
        return jsonify({"error": "未找到該車輛進場紀錄"}), 404

    current_time = datetime.utcnow()
    duration = (current_time - record.entry_time).total_seconds() / \
        3600  # 轉換為小時
    estimated_fee = round(duration * 50, 2)  # 每小時 50 元

    return jsonify({"plate_number": plate_number, "entry_time": record.entry_time, "estimated_fee": estimated_fee})

# 取得所有車牌記錄的 API


@app.route('/records', methods=['GET'])
def get_records():
    records = ParkingRecord.query.all()
    return jsonify([{
        'id': record.id,
        'plate_number': record.plate_number,
        'entry_time': record.entry_time,
        'exit_time': record.exit_time,
        'fee': record.fee
    } for record in records])

# 刪除車牌記錄的 API


@app.route('/delete_record/<int:record_id>', methods=['DELETE'])
def delete_record(record_id):
    print(f"Trying to delete record with ID: {record_id}")  # 這行日誌可幫助調試
    record = ParkingRecord.query.get(record_id)
    if record:
        db.session.delete(record)
        db.session.commit()
        return jsonify({"success": True, "message": "刪除成功"}), 200
    return jsonify({"success": False, "message": "找不到記錄"}), 404


if __name__ == '__main__':
    app.run(debug=True)
