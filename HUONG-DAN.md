# Trang web Phân tích Hành vi & Hướng dẫn Động tác (v3.0.4)

## Chạy
- Windows: bấm đúp `start.bat`
- macOS / Linux: `./start.sh`
- Hoặc: `python server.py` rồi mở http://localhost:8000

Cần Python 3. Điện thoại: mở địa chỉ IP máy tính hiện trong cửa sổ server (cùng mạng Wi-Fi).

## Tùy chọn
- Link YouTube/TikTok/FB: chạy `setup_video_urls.bat` (cài yt-dlp) một lần.
- Gemini miễn phí: lấy API Key tại aistudio.google.com/apikey → dán vào tab **Hệ thống → Cài đặt AI**.
- Dùng offline: `python tools/download_offline.py`.

## Cấu trúc
- `index.html` – giao diện (đã nhúng CSS)
- `js/app.bundle.js` – mã ứng dụng đã đóng gói; `js/workers`, `js/core` – luồng AI
- `js/*.js` – mã nguồn (sửa xong build lại bằng esbuild)
- `server.py` + `*.py` – máy chủ, CSDL SQLite (`database/` tự tạo khi chạy)

## Giao diện v3.0.4
- Điện thoại: tiêu đề gọn, vùng chọn video và nhập URL xếp dọc, bốn mục điều hướng cố định ở dưới.
- Máy tính: khung Video/Camera cao khoảng 2/3 màn hình. Trợ lý trượt từ phải ra và thu hẹp toàn bộ nội dung bên trái; nội dung vẫn bấm và cuộn được. Trợ lý giữ cố định khi cuộn trang, không làm mờ nội dung.
- Điện thoại: Trợ lý trượt từ phải ra, chiếm gần toàn màn hình. Đóng bằng nút **×**, phím Escape hoặc chạm phần ngoài ngăn trên điện thoại.
- Giữ nguyên bảng màu, các chức năng và thuật toán phân tích của v3.0.2.
- Nút mặt trời / mặt trăng trên thanh trên cùng chuyển **Dark / Light** và tự lưu lựa chọn. Chế độ tối giữ nguyên bảng màu v3.0.2.
- Light mode: nền trắng, chữ và màu trạng thái tương phản rõ hơn.
- Mỗi chỉnh sửa lớn được xuất thành một ZIP phiên bản mới, giữ lại ZIP phiên bản trước.
