import os
from flask import Flask, request, render_template, send_from_directory
from ultralytics import YOLO
import cv2
import numpy as np
from werkzeug.utils import secure_filename

# 初始化 Flask
app = Flask(__name__)

# 設定圖片上傳資料夾
UPLOAD_FOLDER = "uploads"
RESULT_FOLDER = "results"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(RESULT_FOLDER, exist_ok=True)

app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER
app.config["RESULT_FOLDER"] = RESULT_FOLDER

# 載入 YOLOv8 模型
model = YOLO("best.pt")  # 確保 best.pt 存在

# 網頁首頁 (上傳圖片)


@app.route("/", methods=["GET", "POST"])
def upload_file():
    if request.method == "POST":
        # 確保有上傳檔案
        if "file" not in request.files:
            return "No file uploaded", 400
        file = request.files["file"]
        if file.filename == "":
            return "No selected file", 400

        # 儲存上傳的圖片
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config["UPLOAD_FOLDER"], filename)
        file.save(filepath)

        # 進行 YOLO 車牌辨識
        results = model.predict(source=filepath, save=True, conf=0.25)

        # 讀取 YOLO 輸出的圖片
        output_filename = f"detected_{filename}"
        output_path = os.path.join(
            app.config["RESULT_FOLDER"], output_filename)

        # 取得最新 YOLO 輸出 (存於 runs/detect/predict/)
        latest_result_path = "runs/detect/predict/" + filename
        if os.path.exists(latest_result_path):
            os.rename(latest_result_path, output_path)

        return render_template("result.html", image_name=output_filename)

    return render_template("upload.html")

# 顯示辨識後的圖片


@app.route("/results/<filename>")
def display_image(filename):
    return send_from_directory(app.config["RESULT_FOLDER"], filename)


if __name__ == "__main__":
    app.run(debug=True)
