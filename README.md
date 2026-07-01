# NCR Ring Check — web tra cứu tình trạng đóng non-conformity của ring lẻ

Web app nhỏ để Inspector nhập số S/N của Bearing Set (đọc từ Tag Name) và tự động:

1. Tra ra S/N của các ring lẻ (Inner Upper / Inner Lower / Inner / Outer) từ file
   `Check SN ring from SN bearing set.xlsx`.
2. Tra tình trạng NCR/SR của từng ring đó (cột **Processing Results**) trong file
   `Inspection Notice-NCR-SR Tracking.xlsx`.
3. Trả kết luận: có thể xuất hàng hay còn NCR chưa Close.

Cả 2 file dữ liệu vẫn nằm trên Google Drive như hiện tại — app chỉ đọc (read-only)
qua Google Drive API mỗi khi có người tra cứu.

Bản v1 này **chưa** tự đọc ảnh Tag Name bằng AI — Inspector đọc/scan số S/N rồi
gõ vào ô tìm kiếm. Phần đọc ảnh bằng AI có thể thêm sau (xem mục "Mở rộng sau này").

---

## 1. Đưa code lên GitHub

1. Tạo repo mới (private) trên GitHub, ví dụ `ncr-ring-check`.
2. Trong thư mục này, chạy:
   ```bash
   git init
   git add .
   git commit -m "Initial NCR ring check web app"
   git branch -M main
   git remote add origin https://github.com/<ten-cua-ban>/ncr-ring-check.git
   git push -u origin main
   ```

## 2. Tạo Google service account để đọc file trên Drive

App không dùng tài khoản Google cá nhân của bạn để đăng nhập — nó dùng một
"service account" (tài khoản máy) chỉ có quyền Viewer trên đúng 2 file cần đọc. 2 file
vẫn giữ ở chế độ **Restricted** như bình thường — không public cho ai khác.

1. Vào https://console.cloud.google.com/ → tạo project mới (hoặc dùng project có sẵn).
2. Vào **APIs & Services → Library** → tìm "Google Drive API" → bấm **Enable**.
3. Vào **APIs & Services → Credentials** → **Create Credentials → Service account**.
   - Đặt tên bất kỳ, ví dụ `ncr-ring-check-reader`.
   - Bỏ qua phần gán "role" (không cần).
4. Sau khi tạo xong, mở service account đó → tab **Keys** → **Add Key → Create new key → JSON**.
   File JSON tải về có 2 giá trị cần dùng:
   - `client_email` → dán vào biến `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `private_key` → dán vào biến `GOOGLE_PRIVATE_KEY` (giữ nguyên các `\n` trong chuỗi)

## 3. Chia sẻ 2 file Excel với service account

1. Mở Google Drive, chuột phải vào đúng 2 file:
   - `Check SN ring from SN bearing set.xlsx`
   - `Inspection Notice-NCR-SR Tracking.xlsx`
2. Bấm **Share** → dán địa chỉ email của service account (dạng
   `...@...iam.gserviceaccount.com`) → quyền **Viewer** → Share.

   File vẫn "Restricted" — chỉ thêm đúng 1 identity (service account) được xem, không
   ai khác (kể cả có link) xem được. Muốn thu hồi quyền lúc nào chỉ cần bỏ share.

   (Nếu 2 file này là file `.xlsx` thật được đồng bộ lên Drive — không phải Google
   Sheet chuyển đổi — thì Drive API tải được nguyên file nhị phân, app đọc trực tiếp
   bằng thư viện `xlsx`. Nếu sau này bạn chuyển 2 file này thành Google Sheet gốc,
   cần sửa `lib/drive.js` để dùng `drive.files.export` thay vì `drive.files.get`.)

## 4. Lấy File ID của 2 file

Mở mỗi file trên Drive, copy link chia sẻ, dạng:

```
https://drive.google.com/file/d/1AbCдEfGhIJkLmNoPQRstuVWxyz/view
                                  ^^^^^^^^^^^^^^^^^^^^^^^^^^ đây là File ID
```

- File ID của `Check SN ring from SN bearing set.xlsx` → `DRIVE_SN_FILE_ID`
- File ID của `Inspection Notice-NCR-SR Tracking.xlsx` → `DRIVE_NCR_FILE_ID`

## 5. Deploy lên Vercel

1. Vào https://vercel.com/ → đăng nhập bằng GitHub.
2. **Add New → Project** → chọn repo `ncr-ring-check` vừa push.
3. Ở phần **Environment Variables**, thêm đủ 5 biến (xem file `.env.example`):
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `GOOGLE_PRIVATE_KEY` (dán cả dòng `-----BEGIN PRIVATE KEY-----...`, giữ `\n`)
   - `DRIVE_SN_FILE_ID`
   - `DRIVE_NCR_FILE_ID`
   - `CACHE_TTL_SECONDS` (mặc định `300` = làm mới dữ liệu mỗi 5 phút; có thể để trống dùng default)
4. Bấm **Deploy**. Sau ~1-2 phút, Vercel cấp cho bạn 1 địa chỉ web dạng
   `https://ncr-ring-check.vercel.app` — mở được từ điện thoại/máy tính bất kỳ.

Mỗi lần bạn push code mới lên GitHub, Vercel tự build & deploy lại bản mới.

## 6. Chạy thử ở máy local (không bắt buộc)

```bash
npm install
cp .env.example .env.local   # rồi điền giá trị thật vào .env.local
npm run dev
```
Mở http://localhost:3000

Ngoài ra có 1 script kiểm tra logic tra cứu mà **không cần** Google Drive/API,
chạy trực tiếp trên 2 file Excel đã tải xuống máy — dùng để kiểm tra nhanh khi
sửa `lib/lookup.js`:

```bash
node scripts/test-lookup.js "duong-dan/Check SN ring from SN bearing set.xlsx" \
                             "duong-dan/Inspection Notice-NCR-SR Tracking.xlsx" \
                             "VN-GEE-P280027B-262239" "VN-GEE-P3X00545-262503"
```

## 7. Cách dùng khi đã deploy

- Mở trang web trên điện thoại/máy tính.
- Đọc số S/N của Bearing Set trên tag (mục "S/N:" trên bảng kim loại), gõ hoặc paste
  vào ô, mỗi bearing set một dòng nếu kiểm tra nhiều cái cùng lúc.
- Bấm **Kiểm tra**. App hiện từng ring, trạng thái Processing Results, và kết luận
  OK / CHƯA OK cho từng bearing set.
- Nút **Làm mới dữ liệu & kiểm tra** buộc app tải lại 2 file Excel mới nhất từ Drive
  ngay lúc đó (bỏ qua cache 5 phút) — dùng khi bạn vừa cập nhật 2 file trên Drive.

## Mở rộng sau này (AI tự đọc ảnh Tag Name)

Khi muốn thêm bước "upload ảnh → AI tự đọc số S/N" thay cho gõ tay:

1. Cần một Anthropic API key (tính phí theo số lượt gọi).
2. Thêm 1 API route mới (ví dụ `/api/read-tag`) nhận ảnh, gọi Claude (model có 