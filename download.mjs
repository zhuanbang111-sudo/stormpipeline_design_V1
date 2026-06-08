import fs from 'fs';
import pdf from 'pdf-parse/lib/pdf-parse.js';

const dataBuffer = fs.readFileSync('sz.pdf');
pdf(dataBuffer).then(function(data) {
  console.log(data.text);
}).catch(console.error);
