const fs = require('fs');
const Parser = require('liqd-parser');

let parser = new Parser( require('fs').readFileSync( __dirname + '/../lib/syntax/qlscheme.syntax' ));
let source = require('fs').readFileSync( __dirname + '/tests/test.qlscheme' );

let start = process.hrtime();
let parsed = parser.parse( source );

let end = process.hrtime( start );

console.log( JSON.stringify( parsed, null, '  ' ), end[1] / 1e6 );