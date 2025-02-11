import os
import cv2
import sqlite3
from flask import Flask, request, render_template, jsonify
from datetime import datetime

app = Flask(__name__)

# 設定圖片上傳資料夾
UPLOAD_FOLDER = 'uploads'
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# 確保上傳資料夾存在
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

# 初始化 SQLite 資料庫


def init_db():
    conn = sqlite3.connect('database.db')
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT NOT NULL,
            plate_number TEXT NOT NULL,
            timestamp TEXT NOT NULL
        )
    ''')
    conn.commit()
    conn.close()

# 車牌辨識函數 (範例，需根據實際情況替換)


def recognize_plate(image_path):
    # 讀取圖片
    image = cv2.imread(image_path)

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)  # 轉為灰階
    _, thresh = cv2.threshold(gray, 127, 255, cv2.THRESH_BINARY_INV)  # 轉為黑白
    contours, _ = cv2.findContours(
        thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)  # 尋找輪廓

    # 假設辨識到車牌號碼，如果沒有則返回 'UNKNOWN'
    plate_number = "ABC1234"  # 這只是個範例，實際需要使用車牌識別模型
    if not plate_number:
        plate_number = "UNKNOWN"  # 沒有識別到車牌，返回 'UNKNOWN'

    return plate_number

# 上傳圖片並處理


@app.route('/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'})

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'})

    if file:
        # 儲存圖片到伺服器
        filename = file.filename
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)

        # 車牌辨識
        plate_number = recognize_plate(filepath)

        # 儲存辨識結果到資料庫
        timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        conn = sqlite3.connect('database.db')
        cursor = conn.cursor()
        cursor.execute('INSERT INTO records (filename, plate_number, timestamp) VALUES (?, ?, ?)',
                       (filename, plate_number, timestamp))
        conn.commit()
        conn.close()

        # 返回車牌號碼和圖片路徑
        return jsonify({
            'plate_number': plate_number,
            'filename': filename
        })
# 顯示辨識紀錄


@app.route('/')
def index():
    conn = sqlite3.connect('database.db')
    cursor = conn.cursor()
    # 查詢資料表中的所有紀錄
    cursor.execute('SELECT * FROM records ORDER BY timestamp DESC')
    records = cursor.fetchall()  # 取得所有紀錄
    conn.close()

    return render_template('index.html', records=records)


if __name__ == '__main__':
    init_db()  # 初始化資料庫
    app.run(debug=True)
