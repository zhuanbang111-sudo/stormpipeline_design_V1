const fs = require('fs');
const { PdfReader } = require('pdfreader');

new PdfReader().parseFileItems("sz.pdf", function(err, item) {
  if (err) console.error(err);
  else if (!item) console.log("EOF");
  else if (item.text) console.log(item.text);
});
