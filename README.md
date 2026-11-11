# 螞蟻家庫存

網站：https://tatashih.github.io/ant-home-inventory/

## GitHub Pages 使用限制

GitHub Pages 提供靜態網站。這個版本在 GitHub Pages 上使用瀏覽器 localStorage 儲存修改，各裝置與瀏覽器的資料彼此獨立，**尚未支援三人同步庫存**。清除網站資料可能遺失該瀏覽器的修改。

## 檔案

- `index.html`：GitHub Pages 首頁，內容與原始 `Index.html` 相同。
- `apps-script/Index.html`：原始 Apps Script 前端。
- `apps-script/Code.gs`：Apps Script 後端，無法在 GitHub Pages 執行。
- `部署說明.txt`：原始部署說明。

## 三人共用版本

需另行將 `Code.gs` 與 `Index.html` 部署至 Google Apps Script，並連接指定的 Google 試算表。編輯密碼目前仍為未設定的佔位文字；正式部署前應在私人 Apps Script 專案設定，勿將實際密碼提交到公開 GitHub 儲存庫。

本次 GitHub 發布未部署 Apps Script，亦未修改雲端試算表。
