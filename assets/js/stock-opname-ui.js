(function(root){
 'use strict';
 const service=root.StockOpnameService;
 const e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const number=v=>Number(v||0).toLocaleString('id-ID',{maximumFractionDigits:3});
 const money=v=>'Rp'+Number(v||0).toLocaleString('id-ID',{maximumFractionDigits:0});
 const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const labels={initial:'Stock Awal',receipt:'Barang Masuk',expense:'Pengeluaran',production:'Produksi WIP',sales:'Sales',close:'Stock Opname',move_in:'Move Masuk',adjustment:'Penyesuaian Move',adjustment_in:'Penyesuaian Move Masuk'};
 const formHelp={initial:'Isi stok pertama untuk seluruh bahan, suplies, dan WIP, termasuk angka 0.',receipt:'Catat bahan dan suplies yang diterima. Total harga invoice per barang boleh dikosongkan.',expense:'Catat barang yang digunakan atau dipindahkan sesuai kategori pengeluaran.',production:'Isi jumlah batch. Hasil WIP dihitung otomatis sesuai resep.',sales:'Pilih rentang tanggal, lalu isi total terjual setiap menu dalam satu form.',close:'Cocokkan stok sistem dengan fisik. Isi seluruh barang, termasuk angka 0.'};
 let form=null,busy=false,notice='',targetRows=[],viewGeneration=0,draftSaved=false;
 const page=()=>document.getElementById('page-stock-opname');
 const get=()=>service.current();
 function period(){const ps=get()?.state?.periods||[];const p=ps.at(-1);return p?.status==='held'?ps.at(-2):p;}
 function isPending(){return period()?.status!=='reopened' && ['closed','held'].includes(get()?.state?.periods?.at(-1)?.status);}
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
 function reset(){viewGeneration++;form=null;notice='';targetRows=[];busy=false;draftSaved=false;service.reset();}
 async function initialize(client,context){viewGeneration++;form=null;notice='';targetRows=[];draftSaved=false;await service.initialize(client,context);navigation();}
 function navigation(){const n=document.querySelector('[data-page="stock-opname"]');if(n)n.style.display=service.available()?'':'none';}
 function button(label,action,extra='',primary=false){return '<button type="button" data-so-action="'+action+'" '+extra+' class="'+(primary?'so-primary':'')+'" '+(busy?'disabled':'')+'>'+e(label)+'</button>';}
 function open(kind,existing){
  if(kind==='initial'&&period()){notice='Stock Awal pertama sudah diisi. Berikutnya gunakan konfirmasi hasil opname.';render();return;}
  if((form||service.loadDraft())&&!root.confirm('Draft sebelumnya akan ditimpa oleh form baru. Lanjutkan? Pilih Batal lalu Pulihkan Draft untuk melanjutkan isian lama.'))return false;
  const d=existing?(get().state.documents||[]).find(x=>x.id===existing):null;
  form={kind,request:crypto.randomUUID(),id:d?.id||null,start:d?.start||today(),end:d?.end||today(),counts:{},category:d?.category||'Waste',target:d?.target||'',mapping:{},basePeriod:period()?.id||null};
  if(d)for(const l of d.lines||[])form.counts[l.key]={qty:String(l.qty),unit:l.unit||'',invoice_total:l.invoice_total??''};
  if(kind==='close'&&period()?.status==='reopened'){
   form.end=period().end;form.start=period().start;
   for(const row of period().result||[])form.counts[row.key]={qty:String(row.physical),unit:row.unit};
  }
  notice='';snapshot();render();return true;
 }
 async function restore(){const draft=service.loadDraft();if(!draft){notice='Belum ada draft di perangkat ini.';render();return;}
  if(draft.basePeriod && draft.basePeriod!==period()?.id && ['initial','close'].includes(draft.kind)){notice='Draft berasal dari periode berbeda. Periksa melalui riwayat; draft tidak dipindahkan otomatis.';render();return;}
  form=draft;draftSaved=true;notice='Draft perangkat dipulihkan. Periksa tanggal dan jumlah sebelum menyimpan.';if(form.target)targetRows=await service.targetCatalog(form.target);render();
 }
 function rowsForForm(){let rows=catalog();const k=form.kind;
  if(k==='sales')rows=rows.filter(x=>x.key.startsWith('s:'));
  else if(k==='production')rows=rows.filter(x=>x.key.startsWith('w:'));
  else if(k==='receipt')rows=rows.filter(x=>x.key.startsWith('m:'));
  else rows=rows.filter(x=>!x.key.startsWith('s:'));
  return rows.sort((a,b)=>a.name.localeCompare(b.name,'id'));
 }
 function countConversion(row){
  const value=form.counts[row.key]||{},factor=(row.units||[]).find(u=>u.unit===(value.unit||row.unit))?.factor;
  if(row.error||value.qty==null||value.qty===''||!Number.isFinite(Number(value.qty))||Number(value.qty)<0||!(Number(factor)>0))return '—';
  return number(Number(value.qty)*Number(factor))+' '+row.unit;
 }
 function masterLinks(){return '<p class="so-notice">Lengkapi master atau resep yang belum tersedia agar input dapat digunakan.</p><div class="so-actions">'+button('Master Barang','master','data-so-page="master-items"')+button('Resep WIP','master','data-so-page="wips"')+button('Menu','master','data-so-page="menus"')+'</div>';}
 function formHTML(){
  if(!form)return '';
  const k=form.kind,rows=rowsForForm(),b=balances(),isCount=['initial','close'].includes(k),withUnit=!['sales','production'].includes(k),receipt=k==='receipt';
  const dates='<div class="so-toolbar">'+(k==='sales'?'<label>Dari tanggal<input type="date" data-so-field="start" value="'+e(form.start)+'" required></label>':'')+'<label>'+(k==='sales'?'Sampai tanggal':'Tanggal')+'<input type="date" data-so-field="end" value="'+e(form.end)+'" required></label></div>';
  let extra='';
  if(k==='expense')extra='<div class="so-toolbar"><label>Kategori<select data-so-field="category">'+['Kalibrasi','RnD','QC','Suplies','Move','Waste','Lainnya'].map(x=>'<option '+(x===form.category?'selected':'')+'>'+x+'</option>').join('')+'</select></label></div>';
  if(form.category==='Move'&&k==='expense')extra+='<div class="so-toolbar"><label>Tujuan<select data-so-field="target"><option value="">Pilih tujuan aktif</option>'+(get().targets||[]).map(x=>'<option value="'+e(x.id)+'" '+(form.target===x.id?'selected':'')+'>'+e(x.name)+'</option>').join('')+'</select></label></div>'+(!(get().targets||[]).length?'<p class="so-notice">Belum ada outlet/divisi tujuan yang aktif.</p>':'');
  const head='<tr><th>'+(isCount?'Barang':k==='sales'?'Menu':k==='production'?'WIP / hasil otomatis':'Barang / stok sistem')+'</th>'+(isCount?'<th class="so-desktop-only so-stock">Stok sistem</th>':'')+'<th class="so-quantity">'+(k==='production'?'Batch':k==='sales'?'Terjual':isCount?'Fisik':'Jumlah')+'</th>'+(withUnit?'<th class="so-unit">Satuan</th>':'')+(isCount?'<th class="so-desktop-only so-conversion">Konversi fisik</th>':'')+(receipt?'<th class="so-invoice">Total invoice</th>':'')+'</tr>';
  const body=rows.map(r=>{
   const v=form.counts[r.key]||{},units=r.units||[],disabled=!!r.error;
   let meta=disabled?r.error:k==='sales'?'Total selama rentang pilihan':k==='production'?'Hasil: '+number(Number(v.qty||0)*Number(r.yield))+' '+r.unit+' · 1 batch = '+number(r.yield)+' '+r.unit:'Sistem: '+number(b[r.key])+' '+(r.unit||'');
   let html='<tr><td><strong>'+e(r.name)+'</strong><small data-so-output="'+e(r.key)+'" class="'+(disabled?'so-error':isCount?'so-system-mobile':'')+'">'+e(meta)+'</small>';
   if(form.category==='Move'&&k==='expense')html+='<label><small>Barang tujuan</small><select data-so-map="'+e(r.key)+'" aria-label="Padanan tujuan '+e(r.name)+'"><option value="">Pilih padanan</option>'+targetRows.filter(t=>!t.error&&t.unit===r.unit).map(t=>'<option value="'+e(t.key)+'" '+(form.mapping[r.key]===t.key?'selected':'')+'>'+e(t.name)+'</option>').join('')+'</select></label>';
   html+='</td>'+(isCount?'<td class="so-desktop-only so-stock">'+(disabled?'—':number(b[r.key])+' '+e(r.unit))+'</td>':'')+'<td data-so-label="Jumlah"><input type="number" inputmode="decimal" min="0" step="any" data-so-key="'+e(r.key)+'" data-so-prop="qty" aria-label="'+e(labels[k]+' '+r.name)+'" value="'+e(v.qty??'')+'" '+(disabled?'disabled':'')+'></td>';
   if(withUnit)html+='<td data-so-label="Satuan"><select data-so-key="'+e(r.key)+'" data-so-prop="unit" aria-label="Satuan '+e(r.name)+'" '+(disabled?'disabled':'')+'>'+units.map(u=>'<option value="'+e(u.unit)+'" '+((v.unit||r.unit)===u.unit?'selected':'')+'>'+e(u.unit)+'</option>').join('')+'</select></td>';
   if(isCount)html+='<td class="so-desktop-only so-conversion" data-so-conversion="'+e(r.key)+'">'+e(countConversion(r))+'</td>';
   if(receipt)html+='<td data-so-label="Total invoice"><input type="number" inputmode="decimal" min="0" step="any" data-so-key="'+e(r.key)+'" data-so-prop="invoice_total" aria-label="Total invoice '+e(r.name)+'" value="'+e(v.invoice_total??'')+'" placeholder="Opsional"></td>';
   return html+'</tr>';
  }).join('');
  return '<section class="so-panel so-form"><header class="so-form-head"><h2>'+e(labels[k])+'</h2><p>'+e(formHelp[k])+'</p></header>'+dates+extra+(rows.some(r=>r.error)?masterLinks():'')+(isPending()&&k!=='close'?'<p class="so-notice">Stock Awal berikutnya belum dikonfirmasi. Isian ini disimpan sebagai draft.</p>':'')+(rows.length?'<table class="so-ledger'+(isCount?' so-count-ledger':receipt?' so-receipt-ledger':'')+'" aria-label="'+e(labels[k])+'"><thead>'+head+'</thead><tbody>'+body+'</tbody></table>':'<p class="so-notice">Data belum tersedia.</p>')+(!rows.length?masterLinks():'')+'<footer class="so-form-footer"><p id="soDraftStatus" class="so-status" role="status">'+e(draftStatus())+'</p><div class="so-actions">'+button('Simpan Draft','draft')+button('Tutup Form','cancel')+button(isCount?'Konfirmasi':'Simpan Transaksi','submit','',true)+'</div></footer></section>';
 }
 function historyHTML(){
  const s=get().state,p=period();let out='<section class="so-panel"><h2>Riwayat</h2>';
  out+='<ul class="so-history">'+[...s.periods].reverse().filter(x=>x.result).map(x=>'<li><strong>Opname '+e(x.end)+' · '+(x.status==='reopened'?'Sedang dikoreksi':'Selesai')+'</strong><details><summary>Lihat hasil dan selisih</summary><div class="so-result">'+x.result.map(r=>'<article><strong>'+e(r.name)+'</strong><dl><dt>Stock Awal</dt><dd>'+number(r.opening)+' '+e(r.unit)+'</dd>'+Object.entries(r.movements||{}).map(([kind,qty])=>'<dt>'+e(labels[kind]||kind)+'</dt><dd>'+number(qty)+' '+e(r.unit)+'</dd>').join('')+'<dt>Stok sistem</dt><dd>'+number(r.system)+' '+e(r.unit)+'</dd><dt>Stok fisik</dt><dd>'+number(r.physical)+' '+e(r.unit)+'</dd><dt>Selisih</dt><dd>'+number(r.variance)+' '+e(r.unit)+'</dd><dt>Harga / '+e(r.unit)+'</dt><dd>'+money(r.price)+'</dd><dt>Selisih rupiah</dt><dd>'+money(r.variance_value)+'</dd></dl></article>').join('')+'</div></details></li>').join('')+'</ul>';
  out+='<ul class="so-history">'+[...s.documents].reverse().map(d=>'<li><strong>'+e(labels[d.type]||d.type)+(d.category&&['expense','adjustment'].includes(d.type)?' · '+e(d.category):'')+(d.void?' · Dibatalkan':'')+'</strong><small>'+e(d.start)+(d.end!==d.start?' – '+e(d.end):'')+'</small><details><summary>Rincian transaksi</summary>'+(d.postings||[]).map(l=>'<p>'+e(l.name)+': '+number(l.qty)+' '+e(l.unit)+'</p>').join('')+'</details>'+(!d.void&&d.period_id===p?.id&&['active','reopened'].includes(p?.status)&&!['move_in','adjustment_in','adjustment'].includes(d.type)?button('Edit','edit','data-so-id="'+e(d.id)+'"')+button('Batalkan','void','data-so-id="'+e(d.id)+'"'):'')+(!d.void&&d.category==='Move'&&d.type==='expense'?button('Penyesuaian Move','adjust','data-so-id="'+e(d.id)+'"'):'')+'</li>').join('')+'</ul>';
  return out+(!s.documents.length&&!s.periods.some(x=>x.result)?'<div class="so-empty"><strong>Belum ada riwayat</strong><p>Transaksi dan hasil opname yang sudah tersimpan akan muncul di sini.</p></div>':'')+'</section>';
 }
 function render(){
  if(!page())return;const d=get();
  if(!d){page().innerHTML='<p class="so-notice">Stock Opname belum siap.</p>';return;}
  if(d.developer){page().innerHTML='<div class="so-head"><h1>Stock Opname</h1></div><section class="so-panel"><h2>Aktivasi divisi</h2><p>Atur akses untuk outlet dan divisi yang sedang dipilih. Transaksi dikerjakan admin divisi.</p><p>Status: '+(d.enabled?'Aktif':'Nonaktif')+'</p>'+button(d.enabled?'Nonaktifkan akses':'Aktifkan akses','configure','',true)+'</section>';return;}
  if(!d.state){page().innerHTML='<p class="so-notice">Stock Opname belum tersedia untuk akun/divisi ini.</p>';return;}
  const p=period(),last=d.state.periods.at(-1),b=balances(),negative=Object.values(b).some(n=>n<0);
  let controls='';
  if(!p)controls=button('Isi Stock Awal','open','data-so-kind="initial"',true);
  else if(last?.status==='closed')controls=button('Jadikan Stock Awal Berikutnya','activate','',true)+button('Buka Kembali Opname','reopen');
  else if(last?.status==='held'&&p?.status==='closed')controls=button('Konfirmasi Stock Awal Hasil Koreksi','reactivate','',true);
  else controls=button('Isi Stock Opname','open','data-so-kind="close"',true)+(d.state.periods.some(x=>x.status==='closed')&&p?.status==='active'?button('Buka Opname Terakhir','reopen'):'');
  page().innerHTML='<div class="so-head"><div><h1>Stock Opname</h1><p>'+e(root.AppAuth?.getContext()?.workspaceName||'')+' · '+e(root.AppAuth?.getContext()?.activeDivisionName||'')+'</p></div>'+button('Muat Ulang','refresh')+'</div><section class="so-overview" aria-label="Periode stok"><div class="so-notice">'+(p?'Periode mulai '+e(p.start)+' · '+({active:'Berjalan',reopened:'Koreksi opname',closed:'Menunggu konfirmasi Stock Awal',held:'Ditahan'}[p.status]||p.status):'Isi Stock Awal satu kali untuk memulai.')+'</div><div class="so-actions">'+controls+button('Pulihkan Draft','restore')+'</div></section>'+(notice?'<p class="so-notice" role="alert">'+e(notice)+'</p>':'')+(negative?'<p class="so-notice so-warning">Ada stok sistem minus. Periksa transaksi dan cocokkan saat opname.</p>':'')+formHTML()+historyHTML();
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
  if(!root.confirm(k==='close'?'Hitung seluruh transaksi periode ini dan selesaikan opname?':k==='initial'?'Konfirmasi Stock Awal pertama?':'Simpan transaksi ini?'))return;
  try{await service.write(['initial','close'].includes(k)?k:'save',input,form.request);}
  catch(error){if(error.message.includes('SALES_OVERLAP')&&root.confirm('Rentang Sales bertumpuk. Simpan sebagai tambahan, bukan pengganti?'))await service.write('save',{...input,confirm_overlap:true},form.request);else throw error;}
  service.clearDraft();form=null;notice='Berhasil tersimpan.';
  // Reload shared catalog after invoice updates so other master pages see the new price.
  if(k==='receipt'){const ctx=root.AppAuth.getContext();await root.MasterDataStore.initialize(root.AppAuth.getClient(),ctx.workspaceId,ctx.activeDivisionId);}
 }
 async function action(name,el){
  if(busy)return;
  const token=viewGeneration;busy=true;
  try{
   if(name==='open'){open(el.dataset.soKind);return;}
   if(name==='cancel'){if(snapshot())form=null;return;}
   if(name==='draft'){if(snapshot())notice='Draft tersimpan di perangkat.';return;}
   if(name==='restore'){await restore();return;}
   if(name==='master'){root.go(el.dataset.soPage||'master-items');return;}
   if(name==='refresh'){const saved=snapshot();await service.read();if(saved)notice='Data terbaru dimuat. Draft tetap tersedia.';return;}
   if(name==='configure'){if(root.confirm('Ubah aktivasi Stock Opname pada divisi yang dipilih?'))await service.configure(!get().enabled);return;}
   if(name==='edit'){const doc=get().state.documents.find(d=>d.id===el.dataset.soId);if(open(doc.type,doc.id)&&doc.target)targetRows=await service.targetCatalog(doc.target);return;}
   if(name==='submit'){await submit();return;}
   if(name==='adjust'){
    const doc=get().state.documents.find(d=>d.id===el.dataset.soId);
    if(root.confirm('Buat pembalikan Move di periode aktif kedua divisi? Setelah itu buat Move baru dengan jumlah yang benar.')){
     await service.write('adjust_move',{id:doc.id},crypto.randomUUID());notice='Penyesuaian Move tersimpan. Buat Move baru jika diperlukan.';
    }return;
   }
   if(name==='void'){
    const doc=get().state.documents.find(d=>d.id===el.dataset.soId);
    if(root.confirm('Batalkan transaksi ini? Stok akan dihitung kembali.'))await service.write('void',{id:doc.id},crypto.randomUUID());return;
   }
   if(['activate','reactivate','reopen'].includes(name)&&root.confirm(name==='reopen'?'Buka kembali opname terakhir? Periode berikutnya ditahan sampai koreksi dikonfirmasi.':'Konfirmasi stok fisik sebagai Stock Awal periode berikutnya?')){
    await service.write(name,{},crypto.randomUUID());notice=name==='reopen'?'Opname dibuka kembali. Koreksi transaksi atau stok fisik, lalu selesaikan ulang.':'Stock Awal dikonfirmasi. Draft transaksi dapat dipulihkan dan disimpan.';
   }
  }catch(error){if(token===viewGeneration)notice=error.message;}
  finally{if(token===viewGeneration){busy=false;render();}}
 }
 document.addEventListener('click',ev=>{const el=ev.target.closest('[data-so-action]');if(el){ev.preventDefault();action(el.dataset.soAction,el);}});
 document.addEventListener('input',ev=>{
  const el=ev.target;if(!form||!page()?.contains(el))return;
  if(el.dataset.soKey){const key=el.dataset.soKey;form.counts[key]={...form.counts[key],[el.dataset.soProp]:el.value};if(form.kind==='production'){const row=catalog().find(x=>x.key===key);const output=el.closest('tr')?.querySelector('[data-so-output]');if(row&&output)output.textContent='Hasil: '+number(Number(el.value||0)*Number(row.yield))+' '+row.unit+' · 1 batch = '+number(row.yield)+' '+row.unit;}}
  else if(el.dataset.soMap)form.mapping[el.dataset.soMap]=el.value;
  else if(el.dataset.soField)form[el.dataset.soField]=el.value;
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
