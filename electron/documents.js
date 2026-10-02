const fs = require("fs/promises");
const path = require("path");

async function extractDocument(filePath) {
  const stat = await fs.stat(filePath);
  if (!stat.isFile() || stat.size > 10 * 1024 * 1024) throw new Error("Choose a document smaller than 10 MB.");
  const ext = path.extname(filePath).toLowerCase();
  let text;
  if ([".txt", ".md"].includes(ext)) text = await fs.readFile(filePath, "utf8");
  else if (ext === ".docx") text = (await require("mammoth").extractRawText({ path: filePath })).value;
  else if (ext === ".pdf") {
    const { PDFParse } = require("pdf-parse");
    const parser = new PDFParse({ data: await fs.readFile(filePath), isEvalSupported: false });
    try { text = (await parser.getText({ pageJoiner: "\n\n" })).text; }
    finally { await parser.destroy(); }
  } else throw new Error("Choose a PDF, DOCX, TXT, or Markdown document.");
  text = text.replace(/\u0000/g, "").trim();
  if (!text) throw new Error("No text could be read. For a scanned PDF, paste its text into the field instead.");
  if (text.length > 30000) throw new Error("This document exceeds 30,000 characters. Paste the relevant sections instead.");
  return { name: path.basename(filePath), text };
}

module.exports = { extractDocument };
