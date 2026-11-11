# 螞蟻家庫存｜三人同步

[開啟共用庫存](https://tatashih.github.io/ant-home-inventory/)

GitHub Pages 首頁會自動導向 Google Apps Script 網頁應用程式。螞蟻、塔塔、朵朵使用同一份 Google 試算表資料；修改後其他人的畫面每 30 秒自動同步，也可手動重新整理。查看與編輯均免密碼，選擇更新人員後即可開始編輯。任何持有連結者都能新增、修改或刪除庫存。選擇人員用來記錄更新者，並非獨立帳號驗證。

## 原始碼

- `index.html`：前往雲端同步版的入口。
- `apps-script/Index.html`：庫存介面，確認按鈕為「開始編輯」。
- `apps-script/Code.gs`：Google 試算表讀寫、異動紀錄、鎖定與庫存衝突檢查。
- `部署說明.txt`：原始版本的參考說明；目前設定請依本 README。

## 部署

後端已部署為 Apps Script 網頁應用程式，執行身分為擁有者，存取方式為所有人。

免密碼版本不再讀取或驗證 `EDIT_PIN`。原有指令碼屬性即使保留，也不影響編輯。

前端與後端程式更新時，需在 Apps Script「管理部署作業」選取新版本並部署；只更新 GitHub 不會更新 Apps Script 的已部署版本。

原 GitHub 單機預覽版中，各瀏覽器尚未同步的修改不會自動匯入雲端資料庫。
