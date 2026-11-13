(function(root){
 'use strict';
 let loading;
 async function ensure(){
  if(root.XLSX)return;
  if(!loading)loading=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='assets/vendor/xlsx-0.20.3.min.js';script.onload=resolve;script.onerror=()=>{loading=null;reject(Error('Komponen Excel gagal dimuat. Periksa koneksi dan coba lagi.'));};document.head.appendChild(script);});
  await loading;
  if(!root.XLSX)throw Error('Komponen Excel belum tersedia. Muat ulang halaman.');
 }
 const headers=['ID','Nama','Jumlah','Satuan','Stok sistem','Selisih','Harga','Nilai selisih'];
 async function exportFile({kind,start,end,scope,period,rows}){
  await ensure();
  const book=root.XLSX.utils.book_new();
  const meta=[['Format','StockOpname-v1'],['Jenis',kind],['Divisi',scope],['Periode',period||''],['Dari',start],['Sampai',end]];
  root.XLSX.utils.book_append_sheet(book,root.XLSX.utils.aoa_to_sheet(meta),'Info');
  const sheet=root.XLSX.utils.aoa_to_sheet([headers,...rows.map(r=>[r.key,r.name,r.qty??'',r.unit||'',r.system??'',r.variance??'',r.price??'',r.variance_value??''])]);
  sheet['!cols']=[{wch:42},{wch:30},{wch:16},{wch:14},{wch:16},{wch:16},{wch:16},{wch:18}];
  root.XLSX.utils.book_append_sheet(book,sheet,'Data');
  root.XLSX.writeFile(book,(kind==='sales'?'Sales-':'Stock-Opname-')+end+'.xlsx');
 }
 async function readFile(file,{kind,start,end,scope,period,rows}){
  await ensure();
  if(!file||!file.name.toLowerCase().endsWith('.xlsx')||file.size>2*1024*1024)throw Error('Pilih file .xlsx maksimal 2 MB.');
  const book=root.XLSX.read(await file.arrayBuffer(),{type:'array',sheetRows:10002,cellFormula:true});
  if(!book.Sheets.Info||!book.Sheets.Data)throw Error('Gunakan template Excel dari aplikasi ini.');
  if(book.Sheets.Data['!fullref']&&root.XLSX.utils.decode_range(book.Sheets.Data['!fullref']).e.r>10000)throw Error('Jumlah baris file terlalu banyak.');
  for(const sheet of [book.Sheets.Info,book.Sheets.Data])for(const [key,cell] of Object.entries(sheet))if(key[0]!=='!'&&cell.f)throw Error('Rumus tidak didukung. Gunakan angka biasa pada file.');
  const info=root.XLSX.utils.sheet_to_json(book.Sheets.Info,{header:1,defval:''});
  const meta=Object.fromEntries(info.map(row=>[String(row[0]),String(row[1]??'')]));
  if(meta.Format!=='StockOpname-v1'||meta.Jenis!==kind||meta.Divisi!==scope)throw Error('Jenis atau divisi file tidak cocok dengan form aktif.');
  if(meta.Dari!==start||meta.Sampai!==end)throw Error('Tanggal file tidak cocok. Samakan tanggal form dengan tanggal pada file.');
  if(kind==='close'&&meta.Periode!==period)throw Error('File opname berasal dari periode lain.');
  const data=root.XLSX.utils.sheet_to_json(book.Sheets.Data,{header:1,defval:'',blankrows:false});
  if(!data[0]||headers.some((v,i)=>data[0][i]!==v)||data.length>10001)throw Error('Format atau jumlah baris file tidak sesuai template.');
  const available=new Map(rows.map(row=>[row.key,row])),seen=new Set(),counts={};
  for(const line of data.slice(1)){
   const key=String(line[0]||'');if(!key)throw Error('Ada baris tanpa ID barang atau menu.');
   const row=available.get(key);if(!row||row.error||seen.has(key))throw Error('Barang/menu tidak tersedia, tidak valid, atau berulang: '+key);
   seen.add(key);
   const unit=String(line[3]||'');
   if(kind==='close'&&!row.units?.some(u=>u.unit===unit))throw Error('Satuan tidak sesuai untuk '+row.name+'.');
   const value=line[2];if(value===''||value==null)continue;
   if(typeof value!=='number'||!Number.isFinite(value)||value<0)throw Error('Jumlah harus berupa angka tidak negatif: '+row.name+'.');
   counts[key]={qty:String(value),...(kind==='close'?{unit}:{})};
  }
  if(!Object.keys(counts).length)throw Error('File belum berisi jumlah.');
  return counts;
 }
 root.StockExcel={exportFile,readFile};
})(window);
