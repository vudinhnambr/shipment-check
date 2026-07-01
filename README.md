# NCR Ring Check — web tra cứu tình trạng đóng non-conformity của ring lẻ

Web app nhỏ để Inspector nhập số S/N của Bearing Set (đọc từ Tag Name) và tự động:

1. Tra ra S/N của các ring lẻ (Inner Upper / Inner Lower / Inner / Outer) từ file
   `Check SN ring from SN bearing set`.
2. Tra tình trạng NCR/SR của từng ring đó (cột **Processing Results**) trong file
   `Inspection Notice-NCR-SR Tracking`.
3. Trả kết luận: có thể xuất hàng hay còn NCR chưa Close.

Cả 2 file dữ liệu vẫn nằm trên Google Drive như hiện tại — app chỉ đọc (read-only)
qua Google Drive API mỗi khi có người tra cứu. App tự nhận diện file là `.xlsx` thật
hay Google Sheet gốc (không cần bạn nhớ loại nào).

Bản v1 này **chưa** tự đọc ảnh Tag Name bằng AI — Inspector đọc/scan số S/N rồi
gõ vào ô tìm kiếm. Phần đọc ảnh bằng AI có thể thêm sau (xem mục "Mở rộng sau này").

---

## 1. Đưa code lên GitHub

Dùng GitHub Desktop (khuyên dùng, không cần gõ lệnh) hoặc git CLI. Đảm bảo trong
repo có đủ `lib/`, `pages/`, `scripts/`, `styles/`, `package.json`, `.gitignore`,
`next.config.js` - và KHÔNG có `node_modules/`, `.next/`, `.env.local`.

## 2. Tạo Google service account để đọc file trên Drive

App không dùng tài khoản Google cá nhân của bạn để đăng nhập - nó dùng một
"service account" (tài khoản máy) chỉ có quyền Viewer trên đúng 2 file cần đọc. 2 file
vẫn giữ ở chế độ Restricted như bình thường - không public cho ai khác.

1. Vào https://console.cloud.google.com/ - tạo project mới (hoặc dùng project có sẵn).
2. Vào APIs & Services -> Library -> tìm "Google Drive API" -> bấm Enable.
3. Vào APIs & Services -> Credentials -> Create Credentials -> Service account.
   - Đặt tên bất kỳ, ví dụ ncr-ring-check-reader.
   - Bỏ qua phần gán "role" (không cần).
4. Sau khi tạo xong, mở service account đó -> tab Keys -> Add Key -> Create new key -> JSON.
   Trình duyệt sẽ tải về 1 file .json - giữ nguyên file này, không sửa/mở bằng Word.

## 3. Đổi file JSON đó thành 1 chuỗi base64 (để dán vào Vercel không bị lỗi)

Nếu dán trực tiếp nội dung JSON (có private_key nhiều dòng, ký tự \n) vào ô
Environment Variable của Vercel, rất dễ bị đứt dòng/sai ký tự, dẫn tới lỗi
error:1E08010C:DECODER routines::unsupported khi app chạy. Cách chắc ăn: đổi cả
file JSON thành 1 chuỗi base64 (không xuống dòng, không ký tự đặc biệt) rồi dán chuỗi
đó vào - không thể bị lỗi format nữa.

Mở PowerShell, dán và Enter lệnh sau - nó tự tìm file JSON mới tải nhất trong
Downloads, đổi base64, và COPY SẴN vào clipboard:

```powershell
$f = Get-ChildItem "$env:USERPROFILE\Downloads\*.json" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
[Convert]::ToBase64String([IO.File]::ReadAllBytes($f.FullName)) | Set-Clipboard
Write-Host "Da copy base64 cua file: $($f.Name)"
```

Kiểm tra tên file nó in ra đúng là file service account key vừa tải, rồi dán
(Ctrl+V) trực tiếp vào ô giá trị của biến GOOGLE_SERVICE_ACCOUNT_KEY_B64 trên Vercel.

## 4. Chia sẻ 2 file với service account

1. Mở Google Drive, chuột phải vào đúng 2 file dữ liệu (Check SN ring from SN bearing
   set và Inspection Notice-NCR-SR Tracking).
2. Bấm Share -> dán địa chỉ email của service account (dạng
   ...@...iam.gserviceaccount.com, xem trong file JSON ở trường client_email) ->
   quyền Viewer -> Share.

   File vẫn "Restricted" - chỉ thêm đúng 1 identity (service account) được xem, không
   ai khác (kể cả có link) xem được. Muốn thu hồi quyền lúc nào chỉ cần bỏ share.

## 5. Lấy File ID của 2 file - và xác nhận đúng file

Mở mỗi file, copy link trên thanh địa chỉ trình duyệt, dạng:

```
https://docs.google.com/spreadsheets/d/1Y1WNofyG-Y0Ny85LbbytEo1KJwKscDJZ/edit?...
                                        ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ đây là File ID
```

(Link có thể là drive.google.com/file/d/.../view hoặc docs.google.com/spreadsheets/d/.../edit
đều được - App tự nhận diện đúng loại file.)

Cách chắc chắn không nhập nhầm 2 file: mở từng link, nhìn tên file ở đầu trang
trình duyệt/tab để biết đó là file nào, rồi gán đúng:

- Link mở ra file có tên chứa "Check SN ring..." -> copy File ID -> dán vào DRIVE_SN_FILE_ID
- Link mở ra file có tên chứa "Inspection Notice..." / "NCR-SR Tracking" -> copy File ID -> dán vào DRIVE_NCR_FILE_ID

## 6. Deploy lên Vercel

1. Vào https://vercel.com/ - đăng nhập bằng GitHub.
2. Add New -> Project -> chọn repo vừa push.
3. Ở phần Environment Variables, thêm đủ 4 biến (xem file .env.example):
   - GOOGLE_SERVICE_ACCOUNT_KEY_B64 (chuỗi base64 từ bước 3 - dán y nguyên, không
     thêm dấu ngoặc kép, không tự xuống dòng)
   - DRIVE_SN_FILE_ID
   - DRIVE_NCR_FILE_ID
   - CACHE_TTL_SECONDS (không bắt buộc, mặc định 300 = làm mới dữ liệu mỗi 5 phút)
4. Bấm Deploy. Sau ~1-2 phút, Vercel cấp cho bạn 1 địa chỉ web - mở được từ điện
   thoại/máy tính bất kỳ.

Mỗi lần bạn push code mới lên GitHub, Vercel tự build & deploy lại bản mới. Nếu bạn
thêm/sửa biến môi trường SAU khi đã deploy, phải bấm Redeploy (Deployments -> "..."
ở bản mới nhất -> Redeploy) để áp dụng.

## 7. Chạy thử ở máy local (không bắt buộc)

```bash
npm install
cp .env.example .env.local   # roi dien gia tri that vao .env.local (KHONG commit file nay len GitHub)
npm run dev
```
Mở http://localhost:3000

Ngoài ra có 1 script kiểm tra logic tra cứu mà KHÔNG cần Google Drive/API,
chạy trực tiếp trên 2 file Excel đã tải xuống máy - dùng để kiểm tra nhanh khi
sửa lib/lookup.js:

```bash
node scripts/test-lookup.js "duong-dan/Check SN ring from SN bearing set.xlsx" \
                             "duong-dan/Inspection Notice-NCR-SR Tracking.xlsx" \
                             "VN-GEE-P280027B-262239" "VN-GEE-P3X00545-262503"
```

## 8. Cách dùng khi đã deploy

- Mở trang web trên điện thoại/máy tính.
- Đọc số S/N của Bearing Set trên tag (mục "S/N:" trên bảng kim loại), gõ hoặc paste
  vào ô, mỗi bearing set một dòng nếu kiểm tra nhiều cái cùng lúc.
- Bấm Kiểm tra. App hiện từng ring, trạng thái Processing Results, và kết luận
  OK / CHƯA OK cho từng bearing set.
- Nút Làm mới dữ liệu & kiểm tra buộc app tải lại 2 file mới nhất từ Drive ngay
  lúc đó (bỏ qua cache 5 phút) - dùng khi bạn vừa cập nhật 2 file trên Drive.

## Gặp lỗi khi test trên web?

Vào Vercel -> project -> Deployments -> bản mới nhất -> tab Logs (hoặc Runtime
Logs), lọc theo route /api/check, thử bấm "Kiểm tra" lại trên web rồi đọc dòng lỗi
hiện ra ở đó - dòng lỗi luôn cho biết chính xác thiếu biến gì hoặc sai ở đâu.

## Mở rộng sau này (AI tự đọc ảnh Tag Name)

Khi muốn thêm bước "upload ảnh -> AI tự đọc số S/N" thay cho gõ tay:

1. Cần một Anthropic API key (tính phí theo số lượt gọi).
2. Thêm 1 API route mới (ví dụ /api/read-tag) nhận ảnh, gọi Claude (model có vision)
   để đọc chữ khắc trên tag, trả về chuỗi S/N.
3. Ở trang chủ, thêm nút "Upload ảnh" gọi route đó trước, rồi tự điền kết quả vào ô
   tìm kiếm và gọi /api/check như bình thường.

Phần lookup (lib/lookup.js) không cần đổi gì khi thêm bước này.
