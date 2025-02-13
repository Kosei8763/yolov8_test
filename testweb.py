import os
import cv2
import numpy as np
from flask import Flask, request, render_template, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from datetime import datetime
from ultralytics import YOLO
import torch
import base64
from flask_socketio import SocketIO

app = Flask(__name__)
socketio = SocketIO(app)

# 設定 SQLite 資料庫連線資訊
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///parking.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

# 設定圖片上傳資料夾
# 確保車牌圖片存放資料夾存在
PLATE_FOLDER = "static/plates"
if not os.path.exists(PLATE_FOLDER):
    os.makedirs(PLATE_FOLDER)

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
model = YOLO("car_plate.pt")  # 替換成你的模型權重檔案

# 使用 YOLO 偵測車牌並辨識車牌號碼


def recognize_plate_yolo(image):
    """處理 YOLO 車牌識別結果"""
    # 轉換 BGR 格式
    img_bgr = cv2.cvtColor(image, cv2.COLOR_RGB2BGR)

    # 調整大小至 320x320
    img_resized = cv2.resize(img_bgr, (320, 320))

    # 轉換為 Tensor
    img_input = torch.from_numpy(img_resized).float() / 255.0  # 正規化
    img_input = img_input.permute(2, 0, 1).unsqueeze(0)  # 調整維度

    # 進行 YOLO 預測
    results = model(img_input)

    detected_chars = []  # 儲存 (字元, x1)

    for result in results:
        for box in result.boxes:
            x1, _, x2, _ = map(int, box.xyxy[0])  # 取得座標
            char_label = result.names[int(box.cls[0])]  # 取得字元標籤
            detected_chars.append((char_label, x1))

    # 按照 x 座標排序
    detected_chars.sort(key=lambda c: c[1])

    # 組合完整車牌號碼
    plate_number = "".join([char[0] for char in detected_chars])
    return plate_number

# 新增 WebSocket 事件


@socketio.on("connect")
def handle_connect():
    print("🔗 客戶端已連線")

# 更新紀錄後通知前端


def notify_clients():
    records = get_all_parking_records()  # 取得所有紀錄
    socketio.emit("update_records", records)


def get_all_parking_records():
    records = ParkingRecord.query.all()
    return [{
        'id': record.id,
        'plate_number': record.plate_number,
        'entry_time': record.entry_time.strftime('%Y-%m-%d %H:%M:%S'),
        'exit_time': record.exit_time.strftime('%Y-%m-%d %H:%M:%S') if record.exit_time else None,
        'fee': record.fee
    } for record in records]


@app.route("/get_records", methods=["GET"])
def get_records():
    records = get_all_parking_records()
    return jsonify(records)


@app.route("/entry", methods=["POST"])
def entry():
    # 模擬進場邏輯
    plate_number = request.json.get("plate_number", "Unknown")
    entry_time = datetime.now()

    # 儲存進場紀錄（假設存入資料庫）
    new_record = ParkingRecord(
        plate_number=plate_number, entry_time=entry_time)
    db.session.add(new_record)
    db.session.commit()

    notify_clients()  # 🔥 讓所有前端即時更新
    return jsonify({"success": True, "message": "進場成功"}), 200


@app.route("/exit/<int:record_id>", methods=["POST"])
def exit_parking(record_id):
    record = db.session.get(ParkingRecord, record_id)
    if not record:
        return jsonify({"success": False, "message": "紀錄不存在"}), 400

    # 確保離場時間不早於進場時間
    current_time = datetime.now()
    if current_time < record.entry_time:
        return jsonify({"success": False, "message": "離場時間不能早於進場時間"}), 400

    # 計算停車費用
    duration = (current_time - record.entry_time).total_seconds() / \
        3600  # 轉換為小時
    fee = round(duration * 50, 2)  # 每小時 50 元

    record.exit_time = current_time
    record.fee = fee
    db.session.commit()

    notify_clients()  # 🔥 讓所有前端即時更新
    return jsonify({
        "success": True,
        "message": "離場成功",
        "record": {
            "id": record.id,
            "plate_number": record.plate_number,
            "entry_time": record.entry_time.strftime("%Y-%m-%d %H:%M:%S"),
            "exit_time": record.exit_time.strftime("%Y-%m-%d %H:%M:%S"),
            "fee": record.fee
        }
    }), 200


@app.route("/delete_record/<int:record_id>", methods=["DELETE"])
def delete_record(record_id):
    record = db.session.get(ParkingRecord, record_id)
    if not record:
        return jsonify({"success": False, "message": "紀錄不存在"}), 404

    db.session.delete(record)
    db.session.commit()

    notify_clients()  # 🔥 讓所有前端即時更新
    return jsonify({"success": True, "message": "紀錄已刪除"}), 200


def save_plate_image(image, plate_number):
    """ 儲存車牌圖片，以車牌號碼作為檔名 """
    image_path = os.path.join(PLATE_FOLDER, f"{plate_number}.jpg")
    cv2.imwrite(image_path, image)
    return image_path


@app.route('/yolo_plate_recognition', methods=['POST'])
def yolo_plate_recognition():
    try:
        data = request.json.get('image', None)
        if not data:
            return jsonify({"success": False, "message": "缺少圖片數據"}), 400

        if ',' in data:
            data = data.split(',')[1]  # 移除 base64 頭部資訊

        image_data = base64.b64decode(data)
        np_arr = np.frombuffer(image_data, np.uint8)
        frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

        if frame is None:
            return jsonify({"success": False, "message": "無法解碼圖片"}), 400

        # 🚀 YOLO 車牌辨識
        plate_number = recognize_plate_yolo(frame)

        if plate_number:
            plate_filename = f"{plate_number}.jpg"
            plate_path = os.path.join(PLATE_FOLDER, plate_filename)

            # 🔍 檢查圖片是否已存在，避免覆蓋舊的
            if not os.path.exists(plate_path):
                cv2.imwrite(plate_path, frame)

            return jsonify({"plate_number": plate_number, "image_path": plate_path})
        else:
            return jsonify({"plate_number": None})

    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500


@app.route('/')
def home():
    return render_template("index.html")


@app.route('/calculate_fee_page')
def calculate_fee_page():
    return render_template("calculate_fee.html")

# 計算費用api


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


if __name__ == "__main__":
    socketio.run(app, debug=True)
