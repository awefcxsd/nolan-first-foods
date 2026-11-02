# 實際紀錄

完成每次紀錄後，也要依 [Dashboard 更新方式](../dashboard/README.md) 同步維護食材資料，執行 `node dashboard/build.mjs` 重建互動總覽，並更新同一個私人 Site。

若回報過敏相關症狀，同步維護 `dashboard/allergies.json` 的食物、發生日期、原始症狀與確認／疑似狀態；尚無發現則保持名單空白，不把一般進食反應自動歸為過敏。

將 `templates/daily-log.md` 複製到此資料夾並命名為 `YYYY-MM-DD.md`。這裡只放實際觀察，不預填吃過或無反應。請維持私人 Repo。

每次新增或補充日誌後，同步更新 [README 的 overall overview](../README.md#overall-overview實際進食進度) 與 [食材紀錄](../docs/food-log.md)：更新食物的實吃日期、最長已確認連續天數、耐受狀態、最新反應，以及 overview 的更新日期、月齡、食材數與日誌天數。只按實際回報計算；家長補充的歷史進食也可記錄，未提供的日期與反應保留待補。
