(function(root){
 'use strict';
 const service=root.StockOpnameService;
 const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const number=v=>Number(v||0).toLocaleString('id-ID',{maximumFractionDigits:3});
 const money=v=>'Rp'+Number(v||0).toLocaleString('id-ID',{maximumFractionDigits:0});
 const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const labels={initial:'Stock Awal',receipt:'Barang Masuk',expense:'Pengeluaran',production:'Produksi WIP',sales:'Sales',close:'Stock Opname',move_in:'Move Masuk',adjustment:'Penyesuaian Move',adjustment_in:'Penyesuaian Move Masuk'};
 const formHelp={initial:'Isi stok pertama untuk seluruh bahan, suplies, dan WIP, termasuk angka 0.',receipt:'Catat bahan dan suplies yang diterima. Simpan Transaksi langsung menambah stok; Simpan Draft untuk isian yang belum selesai.',expense:'Catat barang yang digunakan atau dipindahkan. Simpan Transaksi langsung mengurangi stok; Simpan Draft belum mengubah stok.',production:'Isi jumlah batch. Simpan Transaksi langsung memproses bahan dan hasil WIP; Simpan Draft belum mengubah stok.',sales:'Pilih rentang tanggal, lalu isi total terjual setiap menu dalam satu form.',close:'Cocokkan stok sistem dengan fisik. Isi seluruh barang, termasuk angka 0.'};
 let form=null,busy=false,notice='',targetRows=[],receiptQuery='',viewGeneration=0,draftSaved=false,activeConfirm=null,historyKind='close',historyLimit=10;
 const page=()=>document.getElementById('page-stock-opname');
 const get=()=>service.current();
 function period(){const ps=get()?.state?.periods||[];const p=ps.at(-1);return p?.status==='held'?ps.at(-2):p;}
 function isPending(){return period()?.status!=='reopened' && ['closed','held','opening_pending'].includes(get()?.state?.periods?.at(-1)?.status);}
 function staleOpeningDraft(draft){return draft?.kind==='initial'&&period()?.status==='opening_pending'&&draft.resetMarker!==period().opening_reset_at;}
 function staleCorrectionDraft(draft){return draft?.kind==='close'&&draft.basePeriod&&draft.basePeriod!==period()?.id;}
 function balances(){const s=get()?.state||{},p=period();const b={...p?.opening};for(const d of s.documents||[])if(d.period_id===p?.id&&!d.void)for(const l of d.postings||[])b[l.key]=(Number(b[l.key])||0)+Number(l.qty);return b;}
 function catalog(){const all=[...(get()?.catalog||[])];for(const r of period()?.opening_catalog||[])if(!all.some(x=>x.key===r.key))all.push(r);for(const d of get()?.state?.documents||[])if(d.period_id===period()?.id&&!d.void)for(const r of d.postings||[])if(!all.some(x=>x.key===r.key))all.push(r);return all;}
 function draftStatus(){return draftSaved?'Draft lokal tersimpan di perangkat ini; belum masuk database.':'Draft lokal belum tersimpan. Jangan tutup halaman sebelum berhasil menyimpan.';}
 function snapshot(){
  if(!form)return true;
  try{service.saveDraft(form);draftSaved=true;}
  catch(_){draftSaved=false;notice='Penyimpanan perangkat penuh/tidak tersedia. Jangan tutup halaman sebelum berhasil menyimpan.';}
  const n=document.getElementById('soDraftStatus');if(n)n.textContent=draftStatus();
  return draftSaved;
 }
 function reset(){activeConfirm?.(false);viewGeneration++;form=null;notice='';targetRows=[];receiptQuery='';busy=false;draftSaved=false;historyKind='close';historyLimit=10;service.reset();}
 async function initialize(client,context){activeConfirm?.(false);viewGeneration++;form=null;notice='';targetRows=[];receiptQuery='';draftSaved=false;historyKind='close';historyLimit=10;await service.initialize(client,context);navigation();}
 function navigation(){const n=document.querySelector('[data-page="stock-opname"]');if(n)n.style.display=service.available()?'':'none';}
 function button(label,action,extra='',primary=false){return '<button type="button" data-so-action="'+action+'" '+extra+' class="'+(primary?'so-primary':'')+'" '+(busy?'disabled':'')+'>'+e(label)+'</button>';}
 function hasDraftContent(draft){
  return !!draft&&(!!draft.id||!!draft.touched||Object.values(draft.counts||{}).some(value=>value&&[value.qty,value.invoice_total].some(v=>v!=null&&String(v).trim()!==''))||draft.kind==='expense'&&draft.category&&draft.category!=='Waste'||!!draft.target||Object.values(draft.mapping||{}).some(Boolean));
 }
 function correctionCounts(){
  const p=period(),counts={};
  if(p?.status!=='reopened')return counts;
  for(const row of p.result||[])counts[row.key]={qty:String(row.physical),unit:row.unit};
  if(!p.result&&p.physical)for(const row of catalog().filter(x=>!x.key.startsWith('s:')))if(p.physical[row.key]!=null)counts[row.key]={qty:String(p.physical[row.key]),unit:row.unit};
  return counts;
 }
 function restoreCorrectionCounts(draft){
  if(draft.kind!=='close'||period()?.status!=='reopened'||draft.basePeriod&&draft.basePeriod!==period().id)return false;
  const baseline=correctionCounts();let recovered=false;
  const counts={...draft.counts};
  for(const key of Object.keys(baseline)){
   if(counts[key]?.qty==null||String(counts[key].qty).trim()===''){counts[key]={...baseline[key]};recovered=true;}
   else counts[key]={...baseline[key],...counts[key]};
  }
  draft.counts=counts;
  if(draft.end>period().end){draft.end=period().end;recovered=true;}
  return recovered;
 }
 function confirmStock(message,title='Konfirmasi Stock Opname',acceptLabel='Lanjutkan'){
  activeConfirm?.(false);
  return new Promise(resolve=>{
   const previous=document.activeElement,dialog=document.createElement('dialog');
   dialog.className='so-confirm-dialog';
   dialog.setAttribute('aria-labelledby','soConfirmTitle');
   dialog.setAttribute('aria-describedby','soConfirmMessage');
   dialog.innerHTML='<h2 id="soConfirmTitle"></h2><p id="soConfirmMessage"></p><div class="so-confirm-actions"><button type="button" data-so-decline>Batal</button><button type="button" data-so-accept></button></div>';
   dialog.querySelector('#soConfirmTitle').textContent=title;
   dialog.querySelector('#soConfirmMessage').textContent=message;
   dialog.querySelector('[data-so-accept]').textContent=acceptLabel;
   let finished=false;
   const finish=approved=>{
    if(finished)return;finished=true;activeConfirm=null;
    dialog.close();dialog.remove();
    if(previous?.isConnected)previous.focus();
    resolve(approved);
   };
   activeConfirm=finish;
   dialog.querySelector('[data-so-decline]').addEventListener('click',()=>finish(false));
   dialog.querySelector('[data-so-accept]').addEventListener('click',()=>finish(true));
   dialog.addEventListener('cancel',ev=>{ev.preventDefault();finish(false);});
   dialog.addEventListener('click',ev=>{if(ev.target===dialog)finish(false);});
   document.body.appendChild(dialog);dialog.showModal();
   dialog.querySelector('[data-so-decline]').focus();
  });
 }
 function pickerDialog(title,content,actions=''){
  const dialog=document.createElement('dialog');dialog.className='so-picker-dialog';
  dialog.setAttribute('aria-label',title);
  dialog.innerHTML='<header><h2>'+e(title)+'</h2><button type="button" data-picker-close>Tutup</button></header><div class="so-picker-content">'+content+'</div>'+actions;
  document.body.appendChild(dialog);dialog.showModal();
  dialog.addEventListener('close',()=>dialog.remove(),{once:true});
  dialog.querySelector('[data-picker-close]').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',ev=>{if(ev.target===dialog)dialog.close();});
  return dialog;
 }
 function dateLabel(value){const d=new Date(value+'T12:00:00');return Number.isNaN(d.getTime())?value:new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'long',year:'numeric'}).format(d);}
 function openDatePicker(field){
  let selected=form[field],cursor=new Date((selected||today())+'T12:00:00');cursor.setDate(1);
  const draw=dialog=>{
   const year=cursor.getFullYear(),month=cursor.getMonth(),first=(new Date(year,month,1).getDay()+6)%7,days=new Date(year,month+1,0).getDate();
   let cells='';for(let i=0;i<first;i++)cells+='<span class="so-calendar-empty"></span>';
   for(let day=1;day<=days;day++){const value=year+'-'+String(month+1).padStart(2,'0')+'-'+String(day).padStart(2,'0');cells+='<button type="button" data-date-value="'+value+'" class="'+(value===selected?'is-selected':'')+'">'+day+'</button>';}
   dialog.querySelector('.so-calendar-title').textContent=new Intl.DateTimeFormat('id-ID',{month:'long',year:'numeric'}).format(cursor);
   dialog.querySelector('.so-calendar-grid').innerHTML='<span>Sen</span><span>Sel</span><span>Rab</span><span>Kam</span><span>Jum</span><span>Sab</span><span>Min</span>'+cells;
  };
  const d=pickerDialog('Pilih '+(field==='start'?'tanggal awal':'tanggal'),'<div class="so-calendar-nav"><button type="button" data-month="-1" aria-label="Bulan sebelumnya">‹</button><strong class="so-calendar-title"></strong><button type="button" data-month="1" aria-label="Bulan berikutnya">›</button></div><div class="so-calendar-grid"></div><p class="so-calendar-selected"></p>','<footer><button type="button" data-picker-cancel>Batal</button><button type="button" class="so-primary" data-picker-apply>Gunakan tanggal</button></footer>');
  draw(d);d.querySelector('.so-calendar-selected').textContent=dateLabel(selected);
  d.querySelectorAll('[data-month]').forEach(btn=>btn.addEventListener('click',()=>{cursor.setMonth(cursor.getMonth()+Number(btn.dataset.month));draw(d);}));
  d.querySelector('.so-calendar-grid').addEventListener('click',ev=>{const btn=ev.target.closest('[data-date-value]');if(!btn)return;selected=btn.dataset.dateValue;draw(d);d.querySelector('.so-calendar-selected').textContent=dateLabel(selected);});
  d.querySelector('[data-picker-cancel]').addEventListener('click',()=>d.close());
  d.querySelector('[data-picker-apply]').addEventListener('click',()=>{if(selected){form[field]=selected;form.touched=true;snapshot();notice='';render();}d.close();});
 }
 function openChoicePicker(el){
  const options=JSON.parse(el.dataset.soOptions||'[]'),field=el.dataset.soField,map=el.dataset.soMap,key=map||el.dataset.soKey;
  const current=map?form.mapping[key]:key?form.counts[key]?.unit:form[field];
  const content='<div class="so-choice-list">'+options.map(o=>'<button type="button" data-choice-value="'+e(o.value)+'" class="'+(o.value===current?'is-selected':'')+'"><span>'+e(o.label)+'</span><span class="so-choice-check">'+(o.value===current?'✓':'')+'</span></button>').join('')+'</div>';
  const d=pickerDialog(el.dataset.soTitle||'Pilih '+(el.getAttribute('aria-label')||''),content);
  d.querySelector('.so-choice-list').addEventListener('click',async ev=>{const btn=ev.target.closest('[data-choice-value]');if(!btn)return;const value=btn.dataset.choiceValue;
   if(map)form.mapping[key]=value;else if(key)form.counts[key]={...form.counts[key],unit:value};else form[field]=value;
   form.touched=true;snapshot();d.close();if(field==='target')try{targetRows=value?await service.targetCatalog(value):[];}catch(error){notice=error.message;}render();
  });
 }
 async function open(kind,existing){
  receiptQuery='';
  if(kind==='initial'&&period()&&period().status!=='opening_pending'){notice='Stock Awal pertama sudah diisi. Berikutnya gunakan konfirmasi hasil opname.';render();return;}
  if(staleOpeningDraft(form)){service.clearDraft('initial');form=null;}
  if(staleCorrectionDraft(form)){service.clearDraft('close');form=null;}
  if(form&&!snapshot())return false;
  let saved=service.loadDraft(kind);
  if(staleOpeningDraft(saved)){service.clearDraft('initial');saved=null;}
  if(staleCorrectionDraft(saved)){service.clearDraft('close');saved=null;}
  if(existing&&hasDraftContent(saved)&&saved.id!==existing&&!await confirmStock('Draft '+labels[kind]+' yang tersimpan akan diganti.','Ganti draft tersimpan?','Ganti draft'))return false;
  if(existing&&saved?.id!==existing)service.clearDraft(kind);
  if(saved&&!existing){
   form=saved;draftSaved=true;const recovered=restoreCorrectionCounts(form);
   notice=recovered?'Draft Stock Opname dipulihkan; kolom yang kosong diisi dari stok fisik opname tersimpan. Periksa sebelum menyelesaikan.':'Draft '+labels[kind]+' dipulihkan. Lanjutkan isian.';
   if(kind==='initial'&&period()?.status==='opening_pending')form.start=form.end=period().start;
   if(recovered)snapshot();
   if(form.target)targetRows=await service.targetCatalog(form.target);
   historyKind=kind;historyLimit=10;render();return true;
  }
  const d=existing?(get().state.documents||[]).find(x=>x.id===existing):null;
  form={kind,request:crypto.randomUUID(),id:d?.id||null,start:d?.start||today(),end:d?.end||today(),counts:{},category:d?.category||'Waste',target:d?.target||'',mapping:{},basePeriod:period()?.id||null,touched:false};
  if(kind==='initial'&&period()?.status==='opening_pending'){form.start=form.end=period().start;form.resetMarker=period().opening_reset_at;}
  if(d)for(const l of d.lines||[])form.counts[l.key]={qty:String(l.qty),unit:l.unit||'',invoice_total:l.invoice_total??''};
  if(kind==='close'&&period()?.status==='reopened'){
   form.end=period().end;form.start=period().start;
   form.counts=correctionCounts();
  }
  notice='';snapshot();historyKind=kind;historyLimit=10;render();return true;
 }
 async function restore(){const draft=service.loadDraft();if(!draft){notice='Belum ada draft di perangkat ini.';render();return;}
  if(staleOpeningDraft(draft)){service.clearDraft('initial');notice='Draft Stock Awal lama diabaikan setelah reset. Isi ulang manual.';render();return;}
  if(staleCorrectionDraft(draft)){service.clearDraft('close');notice='Koreksi opname sudah dibatalkan. Draft koreksi lama tidak digunakan lagi.';render();return;}
  if(draft.basePeriod && draft.basePeriod!==period()?.id && ['initial','close'].includes(draft.kind)){notice='Draft berasal dari periode berbeda. Periksa melalui riwayat; draft tidak dipindahkan otomatis.';render();return;}
  form=draft;draftSaved=true;const recovered=restoreCorrectionCounts(form);notice=recovered?'Draft Stock Opname dipulihkan; kolom yang kosong diisi dari stok fisik opname tersimpan. Periksa sebelum menyelesaikan.':'Draft perangkat '+labels[form.kind]+' dipulihkan. Periksa tanggal dan jumlah sebelum menyimpan.';if(recovered)snapshot();if(form.target)targetRows=await service.targetCatalog(form.target);historyKind=form.kind;historyLimit=10;render();
 }
 function receiptItems(){
  if(form?.kind!=='receipt')return [];
  if(!Array.isArray(form.receiptItems))form.receiptItems=Object.keys(form.counts||{}).filter(key=>key.startsWith('m:')&&[form.counts[key]?.qty,form.counts[key]?.invoice_total].some(value=>value!=null&&String(value).trim()!==''));
  return form.receiptItems;
 }
 function receiptSuggestions(query){
  const term=query.trim().toLocaleLowerCase('id-ID');
  if(!term)return '<p>Ketik nama barang untuk mencari.</p>';
  const available=receiptItems();
  const matches=catalog().filter(r=>r.key.startsWith('m:')&&!available.includes(r.key)&&String(r.name||'').toLocaleLowerCase('id-ID').includes(term)).sort((a,b)=>a.name.localeCompare(b.name,'id')).slice(0,8);
  if(!matches.length)return '<p>Tidak ada barang yang cocok atau barang sudah dipilih.</p>';
  return matches.map(r=>'<button type="button" data-so-action="receipt-add" data-so-item-key="'+e(r.key)+'" '+(r.error?'disabled':'')+'><span>'+e(r.name)+'</span><small>'+e(r.error||r.unit||'')+'</small></button>').join('');
 }
 function rowsForForm(){let rows=catalog();const k=form.kind;
  if(k==='sales')rows=rows.filter(x=>x.key.startsWith('s:'));
  else if(k==='production')rows=rows.filter(x=>x.key.startsWith('w:'));
  else if(k==='receipt')rows=rows.filter(x=>receiptItems().includes(x.key));
  else rows=rows.filter(x=>!x.key.startsWith('s:'));
  return k==='receipt'?rows.sort((a,b)=>receiptItems().indexOf(a.key)-receiptItems().indexOf(b.key)):rows.sort((a,b)=>a.name.localeCompare(b.name,'id'));
 }
 function countConversion(row){
  const value=form.counts[row.key]||{},factor=(row.units||[]).find(u=>u.unit===(value.unit||row.unit))?.factor;
  if(row.error||value.qty==null||value.qty===''||!Number.isFinite(Number(value.qty))||Number(value.qty)<0||!(Number(factor)>0))return '—';
  return number(Number(value.qty)*Number(factor))+' '+row.unit;
 }
 function masterLinks(){return '<p class="so-notice">Lengkapi master atau resep yang belum tersedia agar input dapat digunakan.</p><div class="so-actions">'+button('Master Barang','master','data-so-page="master-items"')+button('Resep WIP','master','data-so-page="wips"')+button('Menu','master','data-so-page="menus"')+'</div>';}
 function pickerButton(label,attrs,options){return '<button type="button" class="so-picker-trigger" aria-haspopup="dialog" data-so-action="pick-choice" '+attrs+' data-so-options="'+e(JSON.stringify(options))+'"><span>'+e(label)+'</span><span class="so-picker-chevron" aria-hidden="true"></span></button>';}
 function formHTML(){
  if(!form)return '';
  const k=form.kind,rows=rowsForForm(),b=balances(),isCount=['initial','close'].includes(k),withUnit=!['sales','production'].includes(k),receipt=k==='receipt';
  const dateButton=(field,title)=>'<button type="button" class="so-picker-trigger" aria-haspopup="dialog" data-so-action="pick-date" data-so-field="'+field+'" data-so-title="'+title+'" '+(k==='initial'&&period()?.status==='opening_pending'?'disabled':'')+'><span>'+e(dateLabel(form[field]))+'</span><span class="so-picker-chevron" aria-hidden="true"></span></button>';
  const dates='<div class="so-toolbar">'+(k==='sales'?'<label>Dari tanggal'+dateButton('start','Pilih tanggal awal')+'</label>':'')+'<label>'+(k==='sales'?'Sampai tanggal':'Tanggal')+dateButton('end','Pilih tanggal')+'</label></div>';
  let extra='';
  if(k==='expense')extra='<div class="so-toolbar"><label>Kategori'+pickerButton(form.category,'data-so-field="category" data-so-title="Pilih kategori"',['Kalibrasi','RnD','QC','Suplies','Move','Waste','Lainnya'].map(x=>({value:x,label:x})))+'</label></div>';
  if(form.category==='Move'&&k==='expense')extra+='<div class="so-toolbar"><label>Tujuan'+pickerButton((get().targets||[]).find(x=>x.id===form.target)?.name||'Pilih tujuan aktif','data-so-field="target" data-so-title="Pilih tujuan outlet/divisi"',[{value:'',label:'Pilih tujuan aktif'},...(get().targets||[]).map(x=>({value:x.id,label:x.name}))])+'</label></div>'+(!(get().targets||[]).length?'<p class="so-notice">Belum ada outlet/divisi tujuan yang aktif.</p>':'');
  const receiptSearch=receipt?'<div class="so-receipt-search"><label for="soReceiptSearch">Cari barang masuk</label><input id="soReceiptSearch" type="search" data-so-receipt-search placeholder="Ketik nama barang..." aria-label="Cari nama barang" autocomplete="off" value="'+e(receiptQuery)+'"><div class="so-receipt-search-results" data-so-receipt-results role="group" aria-label="Hasil pencarian barang">'+receiptSuggestions(receiptQuery)+'</div></div>':'';
  const head='<tr><th>'+(isCount?'Barang':k==='sales'?'Menu':k==='production'?'WIP / hasil otomatis':'Barang / stok sistem')+'</th>'+(isCount?'<th class="so-desktop-only so-stock">Stok sistem</th>':'')+'<th class="so-quantity">'+(k==='production'?'Batch':k==='sales'?'Terjual':isCount?'Fisik':'Jumlah')+'</th>'+(withUnit?'<th class="so-unit">Satuan</th>':'')+(isCount?'<th class="so-desktop-only so-conversion">Konversi fisik</th>':'')+(receipt?'<th class="so-invoice">Total invoice</th>':'')+'</tr>';
  const body=rows.map(r=>{
   const v=form.counts[r.key]||{},units=r.units||[],disabled=!!r.error;
   let meta=disabled?r.error:k==='sales'?'Total selama rentang pilihan':k==='production'?'Hasil: '+number(Number(v.qty||0)*Number(r.yield))+' '+r.unit+' · 1 batch = '+number(r.yield)+' '+r.unit:'Sistem: '+number(b[r.key])+' '+(r.unit||'');
   let html='<tr><td><strong>'+e(r.name)+'</strong><small data-so-output="'+e(r.key)+'" class="'+(disabled?'so-error':isCount?'so-system-mobile':'')+'">'+e(meta)+'</small>';
   if(receipt)html+='<button type="button" class="so-receipt-remove" data-so-action="receipt-remove" data-so-item-key="'+e(r.key)+'" aria-label="Hapus '+e(r.name)+' dari transaksi">Hapus</button>';
   if(form.category==='Move'&&k==='expense')html+='<label><small>Barang tujuan</small>'+pickerButton(targetRows.find(t=>t.key===form.mapping[r.key])?.name||'Pilih padanan','data-so-map="'+e(r.key)+'" data-so-title="Pilih padanan barang"',[{value:'',label:'Pilih padanan'},...targetRows.filter(t=>!t.error&&t.unit===r.unit).map(t=>({value:t.key,label:t.name}))])+'</label>';
   html+='</td>'+(isCount?'<td class="so-desktop-only so-stock">'+(disabled?'—':number(b[r.key])+' '+e(r.unit))+'</td>':'')+'<td data-so-label="Jumlah"><input type="number" inputmode="decimal" min="0" step="any" data-so-key="'+e(r.key)+'" data-so-prop="qty" aria-label="'+e(labels[k]+' '+r.name)+'" value="'+e(v.qty??'')+'" '+(disabled?'disabled':'')+'></td>';
   if(withUnit)html+='<td data-so-label="Satuan">'+pickerButton(v.unit||r.unit,'data-so-key="'+e(r.key)+'" data-so-title="Pilih satuan" aria-label="Satuan '+e(r.name)+'" '+(disabled?'disabled':''),units.map(u=>({value:u.unit,label:u.unit})))+'</td>';
   if(isCount)html+='<td class="so-desktop-only so-conversion" data-so-conversion="'+e(r.key)+'">'+e(countConversion(r))+'</td>';
   if(receipt)html+='<td data-so-label="Total invoice"><input type="number" inputmode="decimal" min="0" step="any" data-so-key="'+e(r.key)+'" data-so-prop="invoice_total" aria-label="Total invoice '+e(r.name)+'" value="'+e(v.invoice_total??'')+'" placeholder="Opsional"></td>';
   return html+'</tr>';
  }).join('');
  return '<section class="so-panel so-form"><header class="so-form-head"><h2>'+e(labels[k])+'</h2><p>'+e(formHelp[k])+'</p></header>'+dates+extra+receiptSearch+(rows.some(r=>r.error)?masterLinks():'')+(isPending()&&k!=='close'?'<p class="so-notice">Stock Awal berikutnya belum dikonfirmasi. Isian ini disimpan sebagai draft.</p>':'')+(rows.length?'<table class="so-ledger'+(isCount?' so-count-ledger':receipt?' so-receipt-ledger':'')+'" aria-label="'+e(labels[k])+'"><thead>'+head+'</thead><tbody>'+body+'</tbody></table>':'<p class="so-notice">'+(receipt?'Belum ada barang dipilih. Cari dan pilih barang di atas.':'Data belum tersedia.')+'</p>')+(!rows.length&&(!receipt||!catalog().some(r=>r.key.startsWith('m:')))?masterLinks():'')+'<footer class="so-form-footer"><p id="soDraftStatus" class="so-status" role="status">'+e(draftStatus())+'</p><div class="so-actions">'+button('Simpan Draft','draft')+button('Tutup Form','cancel')+button(isCount?'Konfirmasi':'Simpan Transaksi','submit','',true)+'</div></footer></section>';
 }
 function groupedHistory(items,dateOf,renderEntry){
  const groups=new Map();
  items.forEach(item=>{
   const date=String(dateOf(item)||'').slice(0,10);
   if(!groups.has(date))groups.set(date,[]);
   groups.get(date).push(item);
  });
  return [...groups.entries()].sort((a,b)=>b[0].localeCompare(a[0])).map(([date,entries])=>
   '<li class="so-history-date"><details><summary><span>'+e(dateLabel(date))+'</span><small>'+number(entries.length)+' transaksi</small></summary><ul class="so-history so-history-nested">'+entries.map(renderEntry).join('')+'</ul></details></li>'
  ).join('');
 }
 function salesHistoryRows(doc){
  const saved=doc.catalog_snapshot||{},postings=Array.isArray(doc.postings)?doc.postings:[];
  const recipes=Array.isArray(saved.menuRecipeLines)?saved.menuRecipeLines:[];
  const menus=Array.isArray(saved.menus)?saved.menus:[];
  const lines=Array.isArray(doc.lines)?doc.lines.filter(l=>typeof l?.key==='string'&&l.key.startsWith('s:')&&Number(l.qty)>0):[];
  let offset=0,unmatched=false;
  const rows=lines.map(l=>{
   const id=l.key.slice(2),recipe=recipes.filter(r=>r.menu_id===id);
   const used=postings.slice(offset,offset+recipe.length);
   const matches=recipe.length>0&&used.length===recipe.length&&recipe.every((r,i)=>used[i]?.key===(r.component_type==='material'?'m:'+r.item_id:'w:'+r.component_wip_id))&&used.every(p=>Number.isFinite(Number(p.qty))&&Number(p.qty)<0);
   offset+=recipe.length;
   if(!matches)unmatched=true;
   const menu=menus.find(m=>m.id===id),name=menu?.nama_menu||'Menu '+id;
   const detail=matches?'<div class="so-opening-lines">'+used.map(p=>'<div><span>'+e(p.name||p.key)+'</span><strong>'+number(Math.abs(Number(p.qty)))+' '+e(p.unit||'')+'</strong></div>').join('')+'</div>':'<p class="so-sales-unavailable">Rincian bahan per menu tidak tersedia pada catatan ini.</p>';
   return '<details class="so-sales-menu"><summary><span>'+e(name)+'</span><strong>'+number(Number(l.qty))+' terjual</strong></summary>'+detail+'</details>';
  });
  if(!rows.length)return '<p class="so-sales-unavailable">Daftar menu terjual belum tersedia pada catatan ini.</p>';
  const fallback=unmatched||offset!==postings.length?'<details class="so-sales-fallback"><summary>Lihat total pemakaian bahan transaksi</summary><div class="so-opening-lines">'+postings.map(p=>'<div><span>'+e(p.name||p.key)+'</span><strong>'+number(Math.abs(Number(p.qty)))+' '+e(p.unit||'')+'</strong></div>').join('')+'</div></details>':'';
  return '<div class="so-sales-menu-list">'+rows.join('')+fallback+'</div>';
 }
 function materialHistoryByDate(docs,p){
  const dates=new Map();
  for(const d of docs){
   const day=String(d.start||'').slice(0,10);
   if(!dates.has(day))dates.set(day,[]);
   dates.get(day).push(d);
  }
  return [...dates.entries()].sort((a,b)=>b[0].localeCompare(a[0])).map(([day,entries])=>{
   const totals=new Map();
   for(const d of entries){
    if(d.void)continue;
    for(const l of d.postings||[]){
     const qty=Number(l.qty),unit=String(l.unit||'');
     if(!Number.isFinite(qty)||!qty)continue;
     const direction=qty<0?'out':'in';
     const category=historyKind==='expense'?(d.category||({'move_in':'Move Masuk','adjustment':'Penyesuaian Move','adjustment_in':'Penyesuaian Move Masuk'}[d.type])||'Lainnya'):'';
     const key=JSON.stringify([category,l.key||l.name,unit,direction]);
     if(!totals.has(key))totals.set(key,{name:l.name||l.key||'Barang',unit,qty:0,direction,category});
     totals.get(key).qty+=Math.abs(qty);
    }
   }
   const materials=[...totals.values()].filter(v=>v.qty>0).sort((a,b)=>a.name.localeCompare(b.name,'id'));
   const row=m=>'<div class="so-date-material-row"><span>'+e(m.name)+(historyKind==='expense'&&m.direction==='in'?'<small>Masuk / penyesuaian</small>':'')+'</span><strong>'+number(m.qty)+' '+e(m.unit)+'</strong></div>';
   let lines='';
   if(historyKind==='expense'){
    const categories=new Map();
    for(const material of materials){
     if(!categories.has(material.category))categories.set(material.category,[]);
     categories.get(material.category).push(material);
    }
    lines=[...categories.entries()].sort((a,b)=>a[0].localeCompare(b[0],'id')).map(([category,items])=>'<section class="so-date-material-category"><h4>'+e(category)+'</h4>'+items.map(row).join('')+'</section>').join('');
   }else lines=materials.map(row).join('');
   const transactions=entries.map(d=>'<li class="so-history-compact"><div class="so-history-entry"><div><strong>'+e(labels[d.type]||d.type)+(d.category&&['expense','adjustment'].includes(d.type)?' · '+e(d.category):'')+'</strong></div>'+(d.void?'<span class="so-history-tag is-void">Dibatalkan</span>':'')+'</div><details><summary>Rincian transaksi</summary><div class="so-opening-lines">'+(d.postings||[]).map(l=>'<div><span>'+e(l.name)+'</span><strong>'+number(l.qty)+' '+e(l.unit)+'</strong></div>').join('')+'</div></details>'+(!d.void&&d.period_id===p?.id&&['active','reopened'].includes(p?.status)&&!['move_in','adjustment_in','adjustment'].includes(d.type)?'<div class="so-history-actions">'+button('Edit','edit','data-so-id="'+e(d.id)+'"')+button('Batalkan','void','data-so-id="'+e(d.id)+'"')+'</div>':'')+(!d.void&&d.category==='Move'&&d.type==='expense'?'<div class="so-history-actions">'+button('Penyesuaian Move','adjust','data-so-id="'+e(d.id)+'"')+'</div>':'')+'</li>').join('');
   return '<li class="so-history-date"><details><summary><span>'+e(dateLabel(day))+'</span><small>'+number(entries.length)+' transaksi</small></summary><div class="so-date-materials">'+(lines||'<p class="so-sales-unavailable">Tidak ada pemakaian aktif pada tanggal ini.</p>')+'</div><details class="so-date-original-transactions"><summary>Transaksi asli ('+number(entries.length)+')</summary><ul class="so-history so-history-nested">'+transactions+'</ul></details></details></li>';
  }).join('');
 }
 function historyHTML(){
  const s=get().state,p=period(),kinds=['initial','expense','receipt','production','sales','close'];
  const docs=[...s.documents].reverse().filter(d=>({expense:['expense','move_in','adjustment','adjustment_in']}[historyKind]||[historyKind]).includes(d.type));
  const periods=[...s.periods].reverse().filter(x=>historyKind==='initial'?Object.keys(x.opening||{}).length:!!x.result);
  const count=kind=>kind==='initial'?s.periods.filter(x=>Object.keys(x.opening||{}).length).length:kind==='close'?s.periods.filter(x=>x.result).length:s.documents.filter(d=>({expense:['expense','move_in','adjustment','adjustment_in']}[kind]||[kind]).includes(d.type)).length;
  let out='<section class="so-panel so-history-panel" id="soHistory"><header class="so-history-head"><div><h2>Riwayat '+e(labels[historyKind])+'</h2><p>Data yang sudah tersimpan di '+e(labels[historyKind])+'.</p></div><span class="so-history-count">'+number(count(historyKind))+' catatan</span></header>';
  out+='<nav class="so-history-tabs" aria-label="Pilih riwayat fitur">'+kinds.map(kind=>'<button type="button" data-so-action="history-tab" data-so-kind="'+kind+'" aria-pressed="'+(kind===historyKind)+'" class="'+(kind===historyKind?'is-active':'')+'"><span>'+e(labels[kind])+'</span><small>'+number(count(kind))+'</small></button>').join('')+'</nav>';
  if(historyKind==='initial'){
   out+='<ul class="so-history">'+groupedHistory(periods.slice(0,historyLimit),x=>x.start,x=>{
    const rows=Object.entries(x.opening).map(([key,qty])=>{
     const item=(x.opening_catalog||[]).find(r=>r.key===key)||s.periods.flatMap(period=>period.result||[]).find(r=>r.key===key)||get().catalog.find(r=>r.key===key);
     return {key,name:item?.name||key,unit:item?.unit||'',qty};
    }).sort((a,b)=>a.name.localeCompare(b.name,'id'));
    return '<li><div class="so-history-entry"><div><strong>Stock Awal '+e(dateLabel(x.start))+'</strong><small>'+(x.previous_id?'Dari stok fisik opname sebelumnya':'Pengisian pertama')+' · '+number(rows.length)+' barang</small></div><span class="so-history-tag">Tersimpan</span></div><details><summary>Lihat stok per barang</summary><div class="so-opening-lines">'+rows.map(r=>'<div><span>'+e(r.name)+'</span><strong>'+number(r.qty)+' '+e(r.unit)+'</strong></div>').join('')+'</div></details></li>';
   })+'</ul>';
  }else if(historyKind==='close'){
   out+='<ul class="so-history">'+groupedHistory(periods.slice(0,historyLimit),x=>x.end,x=>'<li><div class="so-history-entry"><div><strong>Opname '+e(dateLabel(x.end))+'</strong><small>'+number(x.result.length)+' barang dihitung</small></div><span class="so-history-tag">'+(x.status==='reopened'?'Sedang dikoreksi':'Selesai')+'</span></div><details><summary>Lihat hasil dan selisih</summary><div class="so-result">'+x.result.map(r=>'<details class="so-result-item"><summary><span class="so-result-top"><strong>'+e(r.name)+'</strong><b>'+money(r.variance_value)+'</b></span><span class="so-result-bottom"><span>Sistem '+number(r.system)+' → Fisik '+number(r.physical)+' '+e(r.unit)+'</span><span>Selisih '+number(r.variance)+' '+e(r.unit)+'</span></span></summary><dl><dt>Stock Awal</dt><dd>'+number(r.opening)+' '+e(r.unit)+'</dd>'+Object.entries(r.movements||{}).map(([kind,qty])=>'<dt>'+e(labels[kind]||kind)+'</dt><dd>'+number(qty)+' '+e(r.unit)+'</dd>').join('')+'<dt>Stok sistem</dt><dd>'+number(r.system)+' '+e(r.unit)+'</dd><dt>Stok fisik</dt><dd>'+number(r.physical)+' '+e(r.unit)+'</dd><dt>Selisih</dt><dd>'+number(r.variance)+' '+e(r.unit)+'</dd><dt>Harga / '+e(r.unit)+'</dt><dd>'+money(r.price)+'</dd><dt>Selisih rupiah</dt><dd>'+money(r.variance_value)+'</dd></dl></details>').join('')+'<div class="so-result-total"><span>Total selisih rupiah</span><strong>'+money(x.result.reduce((total,r)=>total+Number(r.variance_value||0),0))+'</strong></div></div></details></li>')+'</ul>';
  }else if(historyKind==='expense'||historyKind==='receipt'){
   out+='<ul class="so-history">'+materialHistoryByDate(docs.slice(0,historyLimit),p)+'</ul>';
  }else{
   out+='<ul class="so-history">'+groupedHistory(docs.slice(0,historyLimit),d=>d.start,d=>'<li class="so-history-compact"><details class="so-history-compact-details"><summary><span class="so-history-compact-name">'+e(labels[d.type]||d.type)+(d.category&&['expense','adjustment'].includes(d.type)?' · '+e(d.category):'')+'</span><span class="so-history-compact-meta">'+(d.end!==d.start?e(dateLabel(d.start))+' – '+e(dateLabel(d.end)):'')+(d.void?'<span class="so-history-tag is-void">Dibatalkan</span>':'')+'</span><span class="so-history-compact-cue">Rincian</span></summary>'+(d.type==='sales'?salesHistoryRows(d):'<div class="so-opening-lines">'+(d.postings||[]).map(l=>'<div><span>'+e(l.name)+'</span><strong>'+number(l.qty)+' '+e(l.unit)+'</strong></div>').join('')+'</div>')+'</details>'+(!d.void&&d.period_id===p?.id&&['active','reopened'].includes(p?.status)&&!['move_in','adjustment_in','adjustment'].includes(d.type)?'<div class="so-history-actions">'+button('Edit','edit','data-so-id="'+e(d.id)+'"')+button('Batalkan','void','data-so-id="'+e(d.id)+'"')+'</div>':'')+(!d.void&&d.category==='Move'&&d.type==='expense'?'<div class="so-history-actions">'+button('Penyesuaian Move','adjust','data-so-id="'+e(d.id)+'"')+'</div>':'')+'</li>')+'</ul>';
  }
  const total=historyKind==='initial'||historyKind==='close'?periods.length:docs.length;
  if(!total)out+='<div class="so-empty"><strong>Belum ada riwayat '+e(labels[historyKind])+'</strong><p>Data fitur ini akan muncul setelah berhasil tersimpan.</p></div>';
  if(total>historyLimit)out+='<div class="so-history-more">'+button('Tampilkan lebih banyak','history-more')+'</div>';
  return out+'</section>';
 }
 function render(){
  if(!page())return;const d=get();
  if(!d){page().innerHTML='<p class="so-notice">Stock Opname belum siap.</p>';return;}
  if(d.developer){page().innerHTML='<div class="so-head"><h1>Stock Opname</h1></div><section class="so-panel"><h2>Aktivasi divisi</h2><p>Atur akses untuk outlet dan divisi yang sedang dipilih. Transaksi dikerjakan admin divisi.</p><p>Status: '+(d.enabled?'Aktif':'Nonaktif')+'</p>'+button(d.enabled?'Nonaktifkan akses':'Aktifkan akses','configure','',true)+'</section>';return;}
  if(!d.state){page().innerHTML='<p class="so-notice">Stock Opname belum tersedia untuk akun/divisi ini.</p>';return;}
  if(staleOpeningDraft(form)){service.clearDraft('initial');form=null;draftSaved=false;notice='Draft Stock Awal lama diabaikan setelah reset. Isi ulang manual.';}
  if(staleCorrectionDraft(form)){service.clearDraft('close');form=null;draftSaved=false;notice='Koreksi opname sudah dibatalkan. Form koreksi lama ditutup.';}
  const p=period(),last=d.state.periods.at(-1),b=balances(),negative=Object.values(b).some(n=>n<0);
  let controls='';
  if(!p)controls=button('Isi Stock Awal','open','data-so-kind="initial"',true);
  else if(p.status==='opening_pending')controls=button('Isi Ulang Stock Awal','open','data-so-kind="initial"',true);
  else if(last?.status==='closed')controls=button('Jadikan Stock Awal Berikutnya','activate','',true)+button('Buka Kembali Opname','reopen');
  else if(last?.status==='held'&&p?.status==='closed')controls=button('Konfirmasi Stock Awal Hasil Koreksi','reactivate','',true);
  else controls=button('Isi Stock Opname','open','data-so-kind="close"',true)+(p.status==='reopened'&&d.state.periods.length===1?button('Isi Ulang Stock Awal','reset-opening'):'')+(d.state.periods.some(x=>x.status==='closed')&&p?.status==='active'?button('Buka Opname Terakhir','reopen'):'');
  page().innerHTML='<div class="so-head"><div><h1>Stock Opname</h1><p>'+e(root.AppAuth?.getContext()?.workspaceName||'')+' · '+e(root.AppAuth?.getContext()?.activeDivisionName||'')+'</p></div>'+button('Muat Ulang','refresh')+'</div><section class="so-overview" aria-label="Periode stok"><div class="so-notice">'+(p?'Periode mulai '+e(p.start)+' · '+({active:'Berjalan',reopened:'Koreksi opname',opening_pending:'Stock Awal perlu diisi ulang',closed:'Menunggu konfirmasi Stock Awal',held:'Ditahan'}[p.status]||p.status):'Isi Stock Awal satu kali untuk memulai.')+'</div><div class="so-actions">'+controls+button('Pulihkan Draft','restore')+'</div></section>'+(notice?'<p class="so-notice" role="alert">'+e(notice)+'</p>':'')+(negative&&p?.status!=='opening_pending'?'<p class="so-notice so-warning">Ada stok sistem minus. Periksa transaksi dan cocokkan saat opname.</p>':'')+formHTML()+historyHTML();
 }
 async function submit(){
  if(!form)return;const k=form.kind,counts={},lines=[];
  for(const r of rowsForForm()){
   const v=form.counts[r.key]||{},qty=v.qty;
   if(['initial','close'].includes(k)){
    if(r.error)throw Error(r.name+': '+r.error);
    if(qty==null||qty===''||!Number.isFinite(Number(qty))||Number(qty)<0)throw Error('Isi stok fisik '+r.name+', termasuk angka 0.');
    counts[r.key]={qty:String(qty),unit:v.unit||r.unit};
   }else if(qty!==''&&qty!=null&&Number(qty)!==0){
    if(r.error)throw Error(r.name+': '+r.error);
    if(!Number.isFinite(Number(qty))||Number(qty)<0)throw Error('Jumlah '+r.name+' tidak valid.');
    lines.push({key:r.key,qty:String(qty),unit:v.unit||r.unit,invoice_total:v.invoice_total??''});
   }
  }
  const saved=snapshot();if(isPending()&&!['close','initial'].includes(k)){if(saved)notice='Transaksi tersimpan sebagai draft. Konfirmasi Stock Awal, lalu simpan draft ini.';return;}
  const isMove=k==='expense'&&form.category==='Move';
  if(isMove&&!form.target)throw Error('Pilih tujuan Move yang sudah aktif sebelum menyimpan.');
  const input={id:form.id||undefined,type:k,start:k==='sales'?form.start:form.end,end:form.end,date:form.end,counts,lines,category:k==='expense'?form.category:null,target:isMove?form.target:null,mapping:isMove?Object.entries(form.mapping||{}).map(([source,target])=>({source,target})):[]};
  if(!['initial','close'].includes(k)&&!lines.length)throw Error('Isi minimal satu jumlah lebih dari 0.');
  if(!await confirmStock(k==='close'?'Hitung seluruh transaksi periode ini dan selesaikan opname?':k==='initial'?'Konfirmasi Stock Awal pertama?':'Simpan transaksi ini?',k==='close'?'Selesaikan opname?':k==='initial'?'Konfirmasi Stock Awal?':'Simpan transaksi?',k==='close'?'Selesaikan':'Simpan'))return;
  try{if(k==='initial'&&period()?.status==='opening_pending')await service.resetOpening('confirm',{counts},form.request);else await service.write(['initial','close'].includes(k)?k:'save',input,form.request);}
  catch(error){if(error.message.includes('SALES_OVERLAP')&&await confirmStock('Rentang Sales bertumpuk. Simpan sebagai tambahan, bukan pengganti?','Rentang Sales bertumpuk','Simpan tambahan'))await service.write('save',{...input,confirm_overlap:true},form.request);else throw error;}
  service.clearDraft(k);form=null;notice='Berhasil tersimpan.';
  // Reload shared catalog after invoice updates so other master pages see the new price.
  if(k==='receipt'){const ctx=root.AppAuth.getContext();await root.MasterDataStore.initialize(root.AppAuth.getClient(),ctx.workspaceId,ctx.activeDivisionId);}
 }
 async function action(name,el){
  if(busy)return;
  const token=viewGeneration;busy=true;
  try{
   if(name==='history-tab'){historyKind=el.dataset.soKind;historyLimit=10;return;}
   if(name==='history-more'){historyLimit+=10;return;}
   if(name==='pick-date'){openDatePicker(el.dataset.soField);return;}
   if(name==='pick-choice'){openChoicePicker(el);return;}
   if(name==='receipt-add'&&form?.kind==='receipt'){
    const key=el.dataset.soItemKey,row=catalog().find(r=>r.key===key&&r.key.startsWith('m:')&&!r.error);
    if(row&&!receiptItems().includes(key)){
     receiptItems().push(key);
     form.counts[key]={...form.counts[key],unit:form.counts[key]?.unit||row.unit};
     form.touched=true;snapshot();receiptQuery='';
    }
    return;
   }
   if(name==='receipt-remove'&&form?.kind==='receipt'){
    const key=el.dataset.soItemKey;
    form.receiptItems=receiptItems().filter(item=>item!==key);
    delete form.counts[key];form.touched=true;snapshot();return;
   }
   if(name==='open'){await open(el.dataset.soKind);return;}
   if(name==='cancel'){if(snapshot())form=null;return;}
   if(name==='draft'){if(snapshot())notice='Draft tersimpan di perangkat.';return;}
   if(name==='restore'){await restore();return;}
   if(name==='master'){root.go(el.dataset.soPage||'master-items');return;}
   if(name==='refresh'){const saved=snapshot();await service.read();const recovered=form&&restoreCorrectionCounts(form);if(recovered)snapshot();if(saved&&draftSaved)notice=recovered?'Data terbaru dimuat. Angka fisik opname tersimpan dipulihkan; periksa sebelum menyelesaikan.':'Data terbaru dimuat. Draft tetap tersedia.';return;}
   if(name==='configure'){if(await confirmStock('Ubah aktivasi Stock Opname pada divisi yang dipilih?','Ubah akses Stock Opname?','Ubah akses'))await service.configure(!get().enabled);return;}
   if(name==='reset-opening'){
    if(await confirmStock('Angka Stock Awal lama akan dikosongkan. Semua transaksi dan stok fisik opname terakhir tetap tersimpan; hasil selisih harus dihitung ulang setelah Stock Awal baru diisi.','Isi ulang Stock Awal?','Kosongkan Stock Awal')){
     if(form&&!snapshot())return;
     await service.resetOpening('reset',{},crypto.randomUUID());service.clearDraft('initial');form=null;notice='Stock Awal dikosongkan. Isi ulang seluruh barang, termasuk angka 0.';
    }return;
   }
   if(name==='edit'){const doc=get().state.documents.find(d=>d.id===el.dataset.soId);if(await open(doc.type,doc.id)&&doc.target)targetRows=await service.targetCatalog(doc.target);return;}
   if(name==='submit'){await submit();return;}
   if(name==='adjust'){
    const doc=get().state.documents.find(d=>d.id===el.dataset.soId);
    if(await confirmStock('Buat pembalikan Move di periode aktif kedua divisi? Setelah itu buat Move baru dengan jumlah yang benar.','Penyesuaian Move?','Buat penyesuaian')){
     await service.write('adjust_move',{id:doc.id},crypto.randomUUID());notice='Penyesuaian Move tersimpan. Buat Move baru jika diperlukan.';
    }return;
   }
   if(name==='void'){
    const doc=get().state.documents.find(d=>d.id===el.dataset.soId);
    if(await confirmStock('Batalkan transaksi ini? Stok akan dihitung kembali.','Batalkan transaksi?','Batalkan transaksi'))await service.write('void',{id:doc.id},crypto.randomUUID());return;
   }
   if(['activate','reactivate','reopen'].includes(name)&&await confirmStock(name==='reopen'?'Buka kembali opname terakhir? Periode berikutnya ditahan sampai koreksi dikonfirmasi.':'Konfirmasi stok fisik sebagai Stock Awal periode berikutnya?',name==='reopen'?'Buka kembali opname?':'Aktifkan Stock Awal?',name==='reopen'?'Buka kembali':'Aktifkan')){
    await service.write(name,{},crypto.randomUUID());notice=name==='reopen'?'Opname dibuka kembali. Koreksi transaksi atau stok fisik, lalu selesaikan ulang.':'Stock Awal dikonfirmasi. Draft transaksi dapat dipulihkan dan disimpan.';
   }
  }catch(error){if(token===viewGeneration)notice=error.message;}
  finally{if(token===viewGeneration){busy=false;render();}}
 }
 document.addEventListener('click',ev=>{const el=ev.target.closest('[data-so-action]');if(el){ev.preventDefault();action(el.dataset.soAction,el);}});
 document.addEventListener('input',ev=>{
  const el=ev.target;if(!form||!page()?.contains(el))return;
  if(el.dataset.soReceiptSearch!==undefined&&form.kind==='receipt'){
   receiptQuery=el.value;
   const results=el.parentElement?.querySelector('[data-so-receipt-results]');
   if(results)results.innerHTML=receiptSuggestions(receiptQuery);
   return;
  }
  if(el.dataset.soKey){const key=el.dataset.soKey;form.counts[key]={...form.counts[key],[el.dataset.soProp]:el.value};if(form.kind==='production'){const row=catalog().find(x=>x.key===key);const output=el.closest('tr')?.querySelector('[data-so-output]');if(row&&output)output.textContent='Hasil: '+number(Number(el.value||0)*Number(row.yield))+' '+row.unit+' · 1 batch = '+number(row.yield)+' '+row.unit;}}
  else if(el.dataset.soMap)form.mapping[el.dataset.soMap]=el.value;
  else if(el.dataset.soField)form[el.dataset.soField]=el.value;
  form.touched=true;
  if(el.dataset.soKey&&['initial','close'].includes(form.kind)){const row=catalog().find(r=>r.key===el.dataset.soKey),output=el.closest('tr')?.querySelector('[data-so-conversion]');if(row&&output)output.textContent=countConversion(row);}
  snapshot();
 });
 document.addEventListener('change',async ev=>{const el=ev.target;if(!form||!page()?.contains(el))return;
  if(el.dataset.soField==='category'){render();}
  if(el.dataset.soField==='target'){const token=viewGeneration;try{targetRows=el.value?await service.targetCatalog(el.value):[];if(token===viewGeneration)render();}catch(error){notice=error.message;render();}}
 });
 root.addEventListener('app:auth-signed-out',reset);
 root.StockOpnameUI={initialize,reset,render,navigation,open};
})(window);
