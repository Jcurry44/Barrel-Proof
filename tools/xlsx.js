const zlib = require("node:zlib");

function readXlsxRows(buffer, sheetPath) {
  const entries = readZipEntries(buffer);
  const sheetXml = entries.get(sheetPath);
  if (!sheetXml) throw new Error("Missing " + sheetPath);
  const sharedStringsXml = entries.get("xl/sharedStrings.xml");
  const sharedStrings = sharedStringsXml ? parseSharedStringsXml(sharedStringsXml.toString("utf8")) : [];
  return parseWorksheetXml(sheetXml.toString("utf8"), sharedStrings);
}

function readZipEntries(buffer) {
  const entries = new Map();
  const eocdOffset = findEndOfCentralDirectory(buffer);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  let offset = centralDirectoryOffset;

  for (let i = 0; i < totalEntries; i += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error("Invalid ZIP central directory");
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.slice(offset + 46, offset + 46 + fileNameLength).toString("utf8");

    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.slice(dataStart, dataStart + compressedSize);
    const data = method === 0 ? compressed : zlib.inflateRawSync(compressed);
    entries.set(name, data);

    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

function findEndOfCentralDirectory(buffer) {
  for (let offset = buffer.length - 22; offset >= 0; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  throw new Error("Invalid ZIP file");
}

function parseSharedStringsXml(xml) {
  const strings = [];
  const itemRegex = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let itemMatch;
  while ((itemMatch = itemRegex.exec(xml))) strings.push(extractTextRuns(itemMatch[1]));
  return strings;
}

function parseWorksheetXml(xml, sharedStrings = []) {
  const rows = [];
  const rowRegex = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let rowMatch;
  while ((rowMatch = rowRegex.exec(xml))) {
    const row = [];
    const cellRegex = /<c\b([^>]*)>([\s\S]*?)<\/c>/g;
    let cellMatch;
    while ((cellMatch = cellRegex.exec(rowMatch[1]))) {
      const attrs = parseAttrs(cellMatch[1]);
      const index = columnIndex(attrs.r || "");
      row[index] = readCellValue(cellMatch[2], attrs.t, sharedStrings);
    }
    rows.push(row.map((value) => value || ""));
  }
  return rows;
}

function readCellValue(cellXml, type, sharedStrings) {
  if (type === "inlineStr") return extractTextRuns(cellXml);
  const valueMatch = cellXml.match(/<v>([\s\S]*?)<\/v>/);
  const value = valueMatch ? decodeXml(valueMatch[1]) : "";
  if (type === "s") return sharedStrings[Number(value)] || "";
  return value;
}

function extractTextRuns(xml) {
  const runs = [];
  const textRegex = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
  let match;
  while ((match = textRegex.exec(xml))) runs.push(decodeXml(match[1]));
  return runs.join("");
}

function parseAttrs(value) {
  const attrs = {};
  const attrRegex = /([A-Za-z_:][\w:.-]*)="([^"]*)"/g;
  let match;
  while ((match = attrRegex.exec(value))) attrs[match[1]] = decodeXml(match[2]);
  return attrs;
}

function columnIndex(ref) {
  const letters = String(ref).match(/^[A-Z]+/);
  if (!letters) return 0;
  let index = 0;
  for (const letter of letters[0]) index = index * 26 + letter.charCodeAt(0) - 64;
  return index - 1;
}

function decodeXml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'");
}

module.exports = {
  parseWorksheetXml,
  readXlsxRows
};
