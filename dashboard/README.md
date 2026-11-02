# Nolan 副食品 Dashboard

從 repo 根目錄執行 `node dashboard/build.mjs`，以 `logs/YYYY-MM-DD.md` 的實吃表格和 `dashboard/foods.json` 產生 `dashboard/dist/` 與單檔版 `dashboard/dashboard.html`。不讀計畫表作為實吃證據。`dashboard.html` 可直接雙擊開啟；或執行 `node dashboard/serve.mjs`，開啟 http://127.0.0.1:4173。無外部字型、圖表庫或追蹤服務。

## 每次回報後的更新

1. 更新當日日誌、README overview 及 docs/food-log.md。
2. 新食材先新增 `foods.json` 的名稱、唯一 id、別名、主要分類及觀察狀態。每種只歸一類，之後增加水果等類別也能顯示。
   有明確過敏相關回報時另更新 `allergies.json`：每次事件包含唯一 `id`、`foodId`、`date`、原始 `symptoms`、`status`（`confirmed` 已確認或 `suspected` 疑似），並保留 `confirmedBy` 確認依據、`onset` 出現時間及 `note`。不要由一般想吐或拒吃自動推論過敏；尚無回報時維持空陣列。
3. 家長補充的歷史天數放 `confirmedDays`，連續天數放 `confirmedConsecutiveDays`；具體日期未知就不補造日誌。實際開始日期已確認為 `actualStartDate: 2026-10-21`，至 11/02 為第 13 天。已補齊的歷史日期記入日誌及 `confirmedDates`，只按日期去重；不再顯示日期待補或另加三天。10/21–10/29 歷史三個區間的整體回饋各在區間最後一天彙記一次，不當成三次獨立偏好回饋。
4. 耐受標註和最新不適分開保留。偏好只取食量與興趣，想吐等反應不當作不喜歡。新增表達若未被規則辨識，先依原文補充 `build.mjs` 中的語意規則，再重建；不能把無訊號當負評。這是可重現的語意線索歸納，不宣稱使用外部語言模型。
5. 執行 `node dashboard/build.mjs` 與 `node dashboard/check.mjs`。確認數字、喜好證據與未知項目後，按 Sites 技能使用此資料夾的 `.openai/hosting.json` 更新同一個私人 Site，保留同一個 project_id。重新部署成功才算線上版本更新。

## 數字與排行定義

- distinct food：同一食材不同做法只算一種。品牌與配方未知不拆成已試過的額外食材。
- 試吃天數：不同實吃日期去重，與歷史確認天數取較大值，不相加；歷史日期未知時顯示「至少」。
- 連續天數：只連接相鄰日期，或採家長補充確認，不以日曆跨度推算。
- 喜好：以單餐食量與興趣欄的明確語意線索評分。每訊號同餐只計一次，限制 -5～+5；依 30 天衰減的權重取平均。同天可有多次進食，但偏好回饋天數按日期去重。
- Top 10 只列正向、Bottom 10 只列負向；無偏好訊號不評分，不足十種不補位。分數混合為零時只留在詳細表。
- 分類圖是不同食材數，不是營養素克數或營養是否足夠的判斷。
- 目前 5 種已試食材均依家長明確確認標註耐受，不補造未吃的天數。耐受狀態留在每種食材的資料與詳細紀錄中；首頁只顯示副食品探索天數與不同食材數，不另列耐受總數區塊。
- 獨立 Planning 頁面由 `plans/overview.md` 和全部月計畫讀取候選日期與每天餐單；`planning-data.mjs` 整理階段窗口和既有家庭份量算例。進度條分開呈現計畫日曆進度與實際首試食材數，不能把日期進度當成能力已完成。質地階段重疊呈現。母乳沒有固定取代日，頁面清楚標出 10–12 個月仍是三餐與奶類並行。
- 過敏紀錄：依明確回報建檔，已確認與疑似分開，各按不同食物去重；Top 10 依最近回報日期排序，不是嚴重度排名。每種保留所有相關事件的症狀和日期。沒有紀錄時顯示「目前尚未發現過敏原」，不填入候選過敏原或一般進食不適。

## 維護與發布

`index.html`、`app.js`、`style.css` 為實吃總覽來源；`planning-template.html`、`planning.js`、`planning.css` 和 `planning-data.mjs` 為計畫頁來源；`dist/` 為可部署的靜態快照。Sites 來源保留生成器與本次快照，但日誌保留在主 repo，資料更新必須從主 repo 執行 build。線上頁面不會直接讀取 GitHub 私人 repo，也沒有宣稱會自動拉取尚未部署的新日誌。

`render.mjs` 在建置時將數字、圖表、喜好排行、食材表和過敏區塊寫進 HTML；未執行瀏覽器 JavaScript 也能看見目前資料。發布用 `dist/index.html` 與本機單檔版均內含 CSS、資料及互動程式，不依賴額外的私人資源請求。互動程式使用獨立作用域，啟動後再提供搜尋與篩選；再次啟動不重複新增選項。回歸檢查涵蓋未執行 JavaScript 時的實際交付 HTML。

`check.mjs` 包含目前資料的快照檢查；實吃資料增加後，應相應更新預期數字，保留否定句、缺失資料、日期去重及歷史重疊等驗證。

家長已在對話中明確同意將 dashboard 的進食資料發布至私人 Sites `nolan-food-journal.mattebee2.chatgpt.site`。線上地址：https://nolan-food-journal.mattebee2.chatgpt.site 。發布成功以 Sites 回傳狀態為準。來源透過已忽略的 `.sites-publish/` checkout 同步，主 repo 保留 dashboard 來源；先前失敗初始化留下的空 Git 中繼資料保留於已忽略的 `.sites-git-backup/`。
