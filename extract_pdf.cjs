const fs = require('fs');
const zlib = require('zlib');

const pdfData = fs.readFileSync('sz.pdf');

// Find all occurrences of "stream" and "endstream"
let streams = [];
let offset = 0;
while (true) {
  const start = pdfData.indexOf('stream\r\n', offset);
  if (start === -1) break;
  const end = pdfData.indexOf('\r\nendstream', start);
  if (end === -1) break;
  
  const streamData = pdfData.slice(start + 8, end);
  streams.push(streamData);
  offset = end + 11;
}

streams.forEach((streamData, index) => {
  try {
    const unzipped = zlib.unzipSync(streamData);
    const text = unzipped.toString('utf8');
    if (text.includes('A1=') || text.includes('A=') || text.includes('b=')) {
      console.log(`Stream ${index} matches!`);
      console.log(text.substring(0, 1000));
    }
    // write to file just in case it's huge
    fs.appendFileSync('pdf_text.txt', `\n--- STREAM ${index} ---\n${text}`);
  } catch (e) {
    // some streams might not be valid zlib
  }
});
console.log('Done extracting streams.');
