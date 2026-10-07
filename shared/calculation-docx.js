/* Offline editable Word reports. Requires vendor/docx/docx-9.6.1.iife.js (MIT). */
(function (root) {
  'use strict';
  const str = value => value == null ? '' : String(value);
  function validate(report) {
    if (!report || !str(report.title).trim() || !Array.isArray(report.inputs) || !Array.isArray(report.steps) || !report.steps.length) throw new Error('缺少有效的本次計算資料');
    if (report.valid === false || report.stale === true) throw new Error('請重新完成有效計算後再匯出');
    for (const input of report.inputs) if (typeof input.value === 'number' && !Number.isFinite(input.value)) throw new Error('輸入含無效數值');
    for (const step of report.steps) if (typeof step.result === 'number' && !Number.isFinite(step.result)) throw new Error('計算含無效結果');
    for (const table of report.tables || []) {
      if (!Array.isArray(table.headers) || !table.headers.length || !Array.isArray(table.rows) || table.rows.some(row => !Array.isArray(row) || row.length !== table.headers.length)) throw new Error('來源表格列欄不完整');
    }
  }
  async function diagramRun(d, lib) {
    if (!d) return null;
    if (typeof d === 'string') d = {svg:d};
    let data = d.data, type = d.type || 'png';
    const width = Math.min(Number(d.width) || 560, 560), height = Number(d.height) || 240;
    if (d.svg) {
      // PNG is embedded alongside SVG so Office and older viewers both display it.
      const svgBytes = new TextEncoder().encode(d.svg);
      let fallback = d.fallback;
      if (!fallback && root.document) {
        const url = URL.createObjectURL(new Blob([d.svg], {type:'image/svg+xml'}));
        try {
          const img = new Image();
          await new Promise((resolve,reject) => {img.onload=resolve;img.onerror=()=>reject(new Error('示意圖無法轉換'));img.src=url;});
          const canvas = document.createElement('canvas'); canvas.width=width*2;canvas.height=height*2;
          const ctx=canvas.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
          fallback=new Uint8Array(await (await new Promise(resolve=>canvas.toBlob(resolve,'image/png'))).arrayBuffer());
        } finally { URL.revokeObjectURL(url); }
      }
      if (!fallback) throw new Error('SVG 示意圖需要 PNG fallback 或瀏覽器轉換');
      return new lib.ImageRun({type:'svg',data:svgBytes,fallback:{type:'png',data:fallback},transformation:{width,height},altText:{title:d.caption||'計算示意圖',description:d.caption||'計算輸入與公式對應示意圖',name:'diagram'}});
    }
    if (!data) throw new Error('示意圖缺少影像資料');
    return new lib.ImageRun({type,data,transformation:{width,height}});
  }
  async function build(report) {
    // Freeze the entire calculation and diagram before any asynchronous image work.
    report = structuredClone(report);
    validate(report);
    const d = root.docx; if (!d) throw new Error('離線 Word 元件尚未載入');
    const p = (text,opts={}) => new d.Paragraph({children:str(text).split(/\r?\n/).map((line,index)=>new d.TextRun({text:line,break:index?1:0,font:'Microsoft JhengHei',size:22,color:'000000'})),spacing:{after:120},...opts});
    const heading = text => p(text,{heading:d.HeadingLevel.HEADING_1,keepNext:true});
    const border={style:d.BorderStyle.SINGLE,size:4,color:'D9D9D9'};
    const rows=[['輸入項目','本次值','單位'],...report.inputs.map(i=>[i.label,i.value,i.unit])];
    const table=new d.Table({width:{size:100,type:d.WidthType.PERCENTAGE},columnWidths:[4200,3000,1800],rows:rows.map((row,index)=>new d.TableRow({tableHeader:index===0,children:row.map((text,col)=>new d.TableCell({width:{size:[4200,3000,1800][col],type:d.WidthType.DXA},margins:{top:100,bottom:100,left:120,right:120},verticalAlign:d.VerticalAlign.CENTER,borders:{top:border,bottom:border,left:border,right:border},shading:index===0?{fill:'E8EEF4'}:undefined,children:[p(text,{alignment:col?d.AlignmentType.CENTER:d.AlignmentType.LEFT})]}))}))});
    const children=[p(report.title,{heading:d.HeadingLevel.TITLE}),p(report.summary||'本報告列出本次輸入、實際計算步驟與結果。'),heading('本次輸入'),table,p(''),heading('詳細計算過程')];
    report.steps.forEach((s,index)=>{
      children.push(p(`${index+1} ${s.title||'計算步驟'}`,{heading:d.HeadingLevel.HEADING_2,keepNext:true}));
      [['公式',s.formula],['代入',s.substitution],['結果',s.result == null ? '' : `${s.result}${s.unit ? ' '+s.unit : ''}`],['條件與限制',s.condition],['來源與查表',s.source]].forEach(([label,value])=>{if(str(value)) children.push(p(`${label}：${value}`));});
    });
    if(report.diagram){children.push(heading('示意圖'));children.push(new d.Paragraph({children:[await diagramRun(report.diagram,d)],alignment:d.AlignmentType.CENTER}));if(report.diagram.caption)children.push(p(report.diagram.caption));}
    children.push(heading('結果與判定'));
    (report.conclusions||[]).forEach(c=>children.push(p(c)));
    for (const t of report.tables || []) {
      children.push(heading(t.title || '來源表格'));
      if (t.source) children.push(p('來源：' + t.source));
      if (t.note) children.push(p(t.note));
      const n=t.headers.length,widths=t.widths || Array(n).fill(Math.floor(9000/n));
      children.push(new d.Table({width:{size:100,type:d.WidthType.PERCENTAGE},columnWidths:widths,rows:[t.headers,...t.rows].map((row,index)=>new d.TableRow({tableHeader:index===0,children:row.map((text,col)=>new d.TableCell({width:{size:widths[col],type:d.WidthType.DXA},margins:{top:100,bottom:100,left:120,right:120},verticalAlign:d.VerticalAlign.CENTER,borders:{top:border,bottom:border,left:border,right:border},shading:index===0?{fill:'E8EEF4'}:undefined,children:[p(text,{alignment:col?d.AlignmentType.CENTER:d.AlignmentType.LEFT})]}))}))}));
      children.push(p(''));
    }
    const doc=new d.Document({creator:'Engineering Calculator',title:report.title,description:'本次計算詳細過程',styles:{default:{document:{run:{font:'Microsoft JhengHei',size:22,color:'000000'}}},paragraphStyles:[{id:'Title',name:'Title',basedOn:'Normal',run:{color:'000000',size:36,bold:true}},{id:'Heading1',name:'Heading 1',basedOn:'Normal',run:{color:'000000',size:28,bold:true}},{id:'Heading2',name:'Heading 2',basedOn:'Normal',run:{color:'000000',size:24,bold:true}}]},sections:[{properties:{page:{size:{width:11906,height:16838},margin:{top:1134,bottom:1134,left:1134,right:1134}}},children}]});
    return new Uint8Array(await d.Packer.toArrayBuffer(doc));
  }
  async function download(report,filename) {
    const bytes=await build(report),url=URL.createObjectURL(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}));
    const a=document.createElement('a');a.href=url;a.download=(filename||'計算過程.docx').replace(/(?:\.docx)?$/i,'.docx');document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);return bytes;
  }
  root.CalculationDocx=Object.freeze({build,download,validate});
})(typeof globalThis!=='undefined'?globalThis:window);
