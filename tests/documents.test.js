const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const JSZip = require("jszip");
const { extractDocument } = require(process.env.CUE_DOCUMENTS_MODULE || "../electron/documents");

async function fixture(t, name, content) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "cue-document-test-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, name);
  await fs.writeFile(file, content);
  return file;
}

function pdf(text) {
  const stream = `BT /F1 12 Tf 40 100 Td (${text}) Tj ET`;
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let data = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(data)); data += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const start = Buffer.byteLength(data);
  data += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return data;
}

test("imports text, Markdown, PDF, and DOCX locally", async t => {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file("word/document.xml", '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Built reliable services</w:t></w:r></w:p></w:body></w:document>');
  for (const [name, content] of [["resume.txt", "Built reliable services"], ["role.md", "# Built reliable services"], ["resume.pdf", pdf("Built reliable services")], ["resume.docx", await zip.generateAsync({ type: "nodebuffer" })]]) {
    const result = await extractDocument(await fixture(t, name, content));
    assert.equal(result.name, name);
    assert.match(result.text, /Built reliable services/);
  }
});

test("rejects empty, unsupported, oversized, and excessively long documents", async t => {
  await assert.rejects(extractDocument(await fixture(t, "empty.txt", " \n")), /No text/);
  await assert.rejects(extractDocument(await fixture(t, "no-text.pdf", pdf(""))), /scanned PDF/);
  await assert.rejects(extractDocument(await fixture(t, "archive.zip", "not a document")), /Choose a PDF/);
  await assert.rejects(extractDocument(await fixture(t, "long.txt", "a".repeat(30001))), /30,000/);
  await assert.rejects(extractDocument(await fixture(t, "big.txt", Buffer.alloc(10 * 1024 * 1024 + 1))), /10 MB/);
});
