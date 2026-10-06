/* docx.js —— 纯前端、零依赖的 .docx 纯文本提取
 * 原理：.docx 本质是 ZIP 包，正文在 word/document.xml（通常 deflate 压缩）。
 * 这里手动解析 ZIP 中央目录，用浏览器原生 DecompressionStream 解压，再把 XML 转成纯文本。
 * 不依赖 JSZip / pdf.js 等任何第三方库，离线可用。
 */
(function (root) {
  'use strict';

  var SIG_EOCD = 0x06054b50;
  var SIG_CEN = 0x02014b50;
  var SIG_LOC = 0x04034b50;

  /* 从 ZIP 中取出指定条目的压缩数据 */
  function zipRead(buf, target) {
    var u8 = new Uint8Array(buf);
    var dv = new DataView(buf);
    var floor = Math.max(0, u8.length - 66000);
    var eocd = -1;
    for (var i = u8.length - 22; i >= floor; i--) {
      if (dv.getUint32(i, true) === SIG_EOCD) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('文件不是有效的 docx（缺少 ZIP 目录）');

    var total = dv.getUint16(eocd + 10, true);
    var off = dv.getUint32(eocd + 16, true);
    var td = new TextDecoder('utf-8');

    for (var n = 0; n < total; n++) {
      if (off + 46 > u8.length || dv.getUint32(off, true) !== SIG_CEN) break;
      var method = dv.getUint16(off + 10, true);
      var csize = dv.getUint32(off + 20, true);
      var nlen = dv.getUint16(off + 28, true);
      var elen = dv.getUint16(off + 30, true);
      var clen = dv.getUint16(off + 32, true);
      var lho = dv.getUint32(off + 42, true);
      var name = td.decode(u8.subarray(off + 46, off + 46 + nlen));

      if (name === target) {
        if (dv.getUint32(lho, true) !== SIG_LOC) throw new Error('docx 结构损坏');
        var lnlen = dv.getUint16(lho + 26, true);
        var lelen = dv.getUint16(lho + 28, true);
        var start = lho + 30 + lnlen + lelen;
        return { method: method, data: u8.subarray(start, start + csize) };
      }
      off += 46 + nlen + elen + clen;
    }
    throw new Error('docx 内未找到 ' + target);
  }

  /* method 0 = 未压缩；8 = deflate */
  function inflateRaw(u8, method) {
    if (method === 0) return Promise.resolve(u8);
    if (typeof DecompressionStream === 'undefined') {
      return Promise.reject(new Error('当前浏览器不支持解压 docx，请先把文件另存为 txt 再导入'));
    }
    var stream = new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Response(stream).arrayBuffer().then(function (ab) { return new Uint8Array(ab); });
  }

  /* WordprocessingML -> 纯文本：段落/表格行换行，单元格制表符，制表位与换行符保留 */
  function xmlToPlain(xml) {
    return xml
      .replace(/<w:tab\b[^>]*\/?>/g, '\t')
      .replace(/<w:br\b[^>]*\/?>/g, '\n')
      .replace(/<\/w:tc>/g, '\t')
      .replace(/<\/w:(?:p|tr)>/g, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&#x([0-9a-fA-F]+);/g, function (m, h) { return String.fromCodePoint(parseInt(h, 16)); })
      .replace(/&#(\d+);/g, function (m, d) { return String.fromCodePoint(parseInt(d, 10)); })
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/\u00a0/g, ' ');
  }

  /* 主入口：File/Blob -> 纯文本 */
  function extractDocxText(file) {
    return file.arrayBuffer()
      .then(function (buf) {
        var e = zipRead(buf, 'word/document.xml');
        return inflateRaw(e.data, e.method);
      })
      .then(function (u8) {
        return xmlToPlain(new TextDecoder('utf-8').decode(u8));
      });
  }

  /* 是否像 docx（避免把 doc/xls 当 docx 传进来时报错信息不友好） */
  function isDocx(file) {
    return /\.docx$/i.test(file && file.name ? file.name : '');
  }

  root.DocxText = {
    extractDocxText: extractDocxText,
    xmlToPlain: xmlToPlain,
    zipRead: zipRead,
    inflateRaw: inflateRaw,
    isDocx: isDocx
  };
})(typeof window !== 'undefined' ? window : globalThis);
