/**
 * 螞蟻家庫存｜Google Apps Script 雲端後端
 * 將此 Code.gs 與 Index.html 放在「庫存資料庫」試算表的 Apps Script 專案中。
 * 在專案設定的指令碼屬性設定 EDIT_PIN，然後部署為網頁應用程式。
 */
const STOCK_CONFIG = Object.freeze({
  SPREADSHEET_ID: '1muJtwE_jLDscIHjakC0POIN8fTV9Yl9_rr8atH6_pZs',
  INVENTORY_SHEET: '庫存',
  HISTORY_SHEET: '異動紀錄',
  CATEGORY_SHEET: '系列',
  EDIT_PIN: PropertiesService.getScriptProperties().getProperty('EDIT_PIN') || ''
});

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('螞蟻家庫存｜雙倉庫')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

/** 檢視者無需密碼；任何具有網頁檢視權的人都能讀取庫存。 */
function getInventory() {
  const file = SpreadsheetApp.openById(STOCK_CONFIG.SPREADSHEET_ID);
  const sheet = requireSheet_(file, STOCK_CONFIG.INVENTORY_SHEET);
  const data = sheet.getDataRange().getValues();
  const entries = data.slice(1).filter(function(r){ return r[0] && r[10] !== false; }).map(rowToItem_);
  const logSheet = requireSheet_(file, STOCK_CONFIG.HISTORY_SHEET);
  const last = logSheet.getLastRow();
  let history = [];
  if (last >= 2) {
    const first = Math.max(2, last - 499);
    history = logSheet.getRange(first, 1, last - first + 1, 12).getValues().reverse()
      .filter(function(r){return !!r[0];})
      .map(function(r){
        return {timestamp: toText_(r[0]), action:toText_(r[1]), id:toText_(r[2]),
          warehouse:toText_(r[3]), name:toText_(r[4]), oldQuantity:r[5]===''?null:Number(r[5]),
          newQuantity:r[6]===''?null:Number(r[6]), delta:r[7]===''?null:Number(r[7]),
          oldIncoming:Number(r[8])||0, newIncoming:Number(r[9])||0,
          actor:toText_(r[10]), notes:toText_(r[11])};
      });
  }
  const categorySheet = file.getSheetByName(STOCK_CONFIG.CATEGORY_SHEET);
  const categories = categorySheet && categorySheet.getLastRow() >= 2
    ? categorySheet.getRange(2,1,categorySheet.getLastRow()-1,5).getValues()
      .filter(function(r){return r[0] && r[1] && r[4] !== false;})
      .map(function(r){return {warehouse:toText_(r[0]),name:toText_(r[1]),createdAt:toText_(r[2]),createdBy:toText_(r[3]),active:true};})
    : [];
  return {items:entries,categories:categories,history:history,now:new Date().toISOString()};
}

/** 編輯密碼只在後端驗證，絕不輸出到公開 HTML。 */
function verifyPin(pin) {
  if (!/^\d{6,8}$/.test(STOCK_CONFIG.EDIT_PIN)) {
    throw new Error('管理者尚未設定 6～8 位數的編輯密碼，請先在專案設定的指令碼屬性設定 EDIT_PIN。');
  }
  return String(pin || '') === STOCK_CONFIG.EDIT_PIN;
}
function authorize_(pin) {
  if (!verifyPin(pin)) throw new Error('編輯密碼不正確');
}

function setQuantity(request) {
  const p = request || {};
  authorize_(p.pin);
  const qty = validInt_(p.quantity, '現貨數量');
  const actor = safeText_(p.actor || '小幫手', 40);
  return withLock_(function(file){
    const s=requireSheet_(file, STOCK_CONFIG.INVENTORY_SHEET);
    const found=findRow_(s,p.id);
    const old=found.item;
    if (Object.prototype.hasOwnProperty.call(p,'expectedQuantity')) {
      const expected = p.expectedQuantity === null ? null : Number(p.expectedQuantity);
      if (expected !== old.quantity) throw new Error('這個品項已被其他人更新，請重新整理後再修改');
    }
    if (old.quantity === qty) return old;
    const at=new Date().toISOString();
    s.getRange(found.row, 5).setValue(qty);
    if(old.quantity===null && old.notes==='待盤點｜尚未提供初始數量')s.getRange(found.row, 8).setValue('');
    s.getRange(found.row, 9, 1, 2).setValues([[at,actor]]);
    log_(file,at,'調整庫存',old,old.quantity,qty,old.incoming,old.incoming,actor,old.quantity===null?'首次盤點':'');
    return Object.assign({},old,{quantity:qty,notes:old.quantity===null?'':old.notes,updatedAt:at,updatedBy:actor});
  });
}

/** 允許新增與修改品項，但需知道編輯密碼。 */
function upsertProduct(request) {
  const p = request || {};
  authorize_(p.pin);
  const warehouse = String(p.warehouse || '');
  if (!['塔塔小倉庫','朵朵小倉庫'].includes(warehouse)) throw new Error('請選擇正確的倉庫');
  const name=safeText_(p.name,60), category=safeText_(p.category,50),notes=safeText_(p.notes,200),actor=safeText_(p.actor||'小幫手',40);
  if (!name || !category) throw new Error('商品名稱與分類不可空白');
  const qty=validInt_(p.quantity,'現貨數量'),min=validInt_(p.minStock,'補貨提醒'),incoming=validInt_(p.incoming,'待到貨數量');
  return withLock_(function(file){
    const s=requireSheet_(file,STOCK_CONFIG.INVENTORY_SHEET);
    const at=new Date().toISOString();
    let id=String(p.id||''), old=null, row;
    if (id) {
      const f=findRow_(s,id);row=f.row;old=f.item;
    } else {
      id=(warehouse==='朵朵小倉庫'?'D':'T')+'-'+Utilities.getUuid().slice(0,8).toUpperCase();
      row=s.getLastRow()+1;
    }
    const obj={id:id,warehouse:warehouse,category:category,name:name,quantity:qty,minStock:min,incoming:incoming,notes:notes,updatedAt:at,updatedBy:actor,active:true};
    s.getRange(row,1,1,11).setValues([[obj.id,obj.warehouse,obj.category,obj.name,obj.quantity,obj.minStock,obj.incoming,obj.notes,obj.updatedAt,obj.updatedBy,true]]);
    log_(file,at,old?'更新品項':'新增品項',obj,old?old.quantity:0,qty,old?old.incoming:0,incoming,actor,notes);
    return obj;
  });
}

/** 新增一個獨立系列，允許 0 商品；會在三人的雲端檢視中持續存在。 */
function addCategory(request) {
  const p=request||{};
  authorize_(p.pin);
  const warehouse=String(p.warehouse||'');
  if(!['塔塔小倉庫','朵朵小倉庫'].includes(warehouse))throw new Error('請選擇正確的倉庫');
  const name=safeText_(p.name,50),actor=safeText_(p.actor||'小幫手',40);
  if(!name||name.length>50)throw new Error('請輸入 1～50 字的系列名稱');
  return withLock_(function(file){
    const inventory=requireSheet_(file,STOCK_CONFIG.INVENTORY_SHEET);
    const categories=requireSheet_(file,STOCK_CONFIG.CATEGORY_SHEET);
    const all=allCategoryNames_(inventory,categories,warehouse);
    if(all.some(function(v){return v.toLocaleLowerCase()===name.toLocaleLowerCase();}))throw new Error('同倉庫已有這個系列名稱');
    const at=new Date().toISOString();
    categories.appendRow([warehouse,name,at,actor,true]);
    log_(file,at,'新增系列',{id:'CATEGORY',warehouse:warehouse,name:name},null,null,0,0,actor,'建立空系列');
    return {success:true,name:name,warehouse:warehouse};
  });
}
function allCategoryNames_(inventory,categories,warehouse){
  const names=[];
  if(inventory.getLastRow()>=2){
    inventory.getRange(2,1,inventory.getLastRow()-1,11).getValues().forEach(function(r){
      if(r[1]===warehouse && r[10]!==false && r[2])names.push(String(r[2]));
    });
  }
  if(categories.getLastRow()>=2){
    categories.getRange(2,1,categories.getLastRow()-1,5).getValues().forEach(function(r){
      if(r[0]===warehouse && r[4]!==false && r[1])names.push(String(r[1]));
    });
  }
  return names;
}

/** 系列改名一次更新同倉庫所有品項，保留庫存與單筆異動記錄。 */
function renameCategory(request) {
  const p=request||{};
  authorize_(p.pin);
  const warehouse=String(p.warehouse||'');
  if (!['塔塔小倉庫','朵朵小倉庫'].includes(warehouse)) throw new Error('請選擇正確的倉庫');
  const oldName=safeText_(p.oldName,50),newName=safeText_(p.newName,50),actor=safeText_(p.actor||'小幫手',40);
  if (!oldName||!newName) throw new Error('請填寫系列名稱');
  if (oldName===newName) return {success:true,changed:0};
  return withLock_(function(file){
    const sheet=requireSheet_(file,STOCK_CONFIG.INVENTORY_SHEET);
    const categories=requireSheet_(file,STOCK_CONFIG.CATEGORY_SHEET);
    const existing=allCategoryNames_(sheet,categories,warehouse);
    if(existing.some(function(v){return v.toLocaleLowerCase()===newName.toLocaleLowerCase();}))throw new Error('此倉庫已有同名系列，請使用不同名稱');
    const last=sheet.getLastRow();
    const grid=last>=2?sheet.getRange(2,1,last-1,11).getValues():[];
    const matches=[];
    grid.forEach(function(row,i){
      if(row[1]===warehouse && row[10]!==false && row[2]===oldName)matches.push(i+2);
    });
    const catLast=categories.getLastRow();
    const catGrid=catLast>=2?categories.getRange(2,1,catLast-1,5).getValues():[];
    const catMatches=[];
    catGrid.forEach(function(row,i){
      if(row[0]===warehouse && row[1]===oldName && row[4]!==false)catMatches.push(i+2);
    });
    if(!matches.length&&!catMatches.length)throw new Error('找不到要修改的系列');
    matches.forEach(function(r){sheet.getRange(r,3).setValue(newName);});
    catMatches.forEach(function(r){categories.getRange(r,2).setValue(newName);});
    const at=new Date().toISOString();
    log_(file,at,'系列改名',{id:'CATEGORY',warehouse:warehouse,name:oldName},null,null,0,0,actor,oldName+' → '+newName);
    return {success:true,changed:matches.length,warehouse:warehouse,oldName:oldName,newName:newName};
  });
}

/** 到貨後將待到貨數轉進現貨，避免未到貨商品被誤算。 */
function receiveIncoming(request) {
  const p=request||{};
  authorize_(p.pin);
  const actor=safeText_(p.actor||'小幫手',40);
  return withLock_(function(file){
    const s=requireSheet_(file,STOCK_CONFIG.INVENTORY_SHEET);
    const f=findRow_(s,p.id),old=f.item;
    if (old.incoming<=0) throw new Error('這個品項沒有待到貨數量');
    const qty=old.quantity+old.incoming,at=new Date().toISOString();
    s.getRange(f.row,5).setValue(qty);
    s.getRange(f.row,7).setValue(0);
    s.getRange(f.row,9,1,2).setValues([[at,actor]]);
    log_(file,at,'到貨入庫',old,old.quantity,qty,old.incoming,0,actor,'已把待到貨轉為現貨');
    return Object.assign({},old,{quantity:qty,incoming:0,updatedAt:at,updatedBy:actor});
  });
}

/** 刪除使用軟刪除，保留紀錄供追溯。 */
function deleteProduct(request) {
  const p=request||{};
  authorize_(p.pin);
  const actor=safeText_(p.actor||'小幫手',40);
  return withLock_(function(file){
    const s=requireSheet_(file,STOCK_CONFIG.INVENTORY_SHEET);
    const f=findRow_(s,p.id),at=new Date().toISOString();
    s.getRange(f.row,11).setValue(false);
    s.getRange(f.row,9,1,2).setValues([[at,actor]]);
    log_(file,at,'刪除品項',f.item,f.item.quantity,f.item.quantity,f.item.incoming,f.item.incoming,actor,'已停用');
    return {success:true,id:f.item.id};
  });
}

// 以下為共用內部函式，不會直接暴露給前端。
function withLock_(fn) {
  const lock=LockService.getScriptLock();
  lock.waitLock(20000);
  try {return fn(SpreadsheetApp.openById(STOCK_CONFIG.SPREADSHEET_ID));}
  finally {lock.releaseLock();}
}
function requireSheet_(file,name) {
  const s=file.getSheetByName(name);
  if (!s) throw new Error('找不到資料工作表：'+name);
  return s;
}
function findRow_(s,id) {
  id=String(id||'');
  const last=s.getLastRow();
  if (!id || last<2) throw new Error('找不到商品');
  const ids=s.getRange(2,1,last-1,1).getValues();
  for(let i=0;i<ids.length;i++) {
    if(String(ids[i][0])===id) {
      const row=i+2;
      const data=s.getRange(row,1,1,11).getValues()[0];
      if(data[10]===false) throw new Error('這個品項已刪除');
      return {row:row,item:rowToItem_(data)};
    }
  }
  throw new Error('找不到商品：'+id);
}
function rowToItem_(r) {
  return {id:toText_(r[0]),warehouse:toText_(r[1]),category:toText_(r[2]),name:toText_(r[3]),
    quantity:r[4]===''||r[4]===null?null:Number(r[4]),minStock:Number(r[5])||0,incoming:Number(r[6])||0,
    notes:toText_(r[7]),updatedAt:toText_(r[8]),updatedBy:toText_(r[9]),active:r[10]!==false};
}
function log_(file,at,action,item,oldQty,newQty,oldIncoming,newIncoming,actor,note) {
  requireSheet_(file,STOCK_CONFIG.HISTORY_SHEET).appendRow([
    at,action,item.id,item.warehouse,item.name,oldQty===null?'':oldQty,newQty===null?'':newQty,oldQty===null?'':newQty-oldQty,
    oldIncoming,newIncoming,actor,note
  ]);
}
function validInt_(v,label) {
  const n=Number(v);
  if (!Number.isSafeInteger(n)||n<0||n>999999) throw new Error(label+'必須是 0～999999 的整數');
  return n;
}
function safeText_(v,max) {
  let s=String(v==null?'':v).trim().slice(0,max);
  // 避免使用者輸入的文字在試算表內被當成公式執行。
  if (/^[=+@]/.test(s)) s="'"+s;
  return s;
}
function toText_(v) {
  if (v instanceof Date) return v.toISOString();
  return v==null?'':String(v);
}
