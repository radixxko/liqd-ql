const QL = require('../lib/ql');

let query = 'janko( a = 1232131, b *=* "test"; after : {"janko":"hrasko"}; before: { "a": {}, "b": [ 1, 2, 3 ] }; limit: 40 ){ hrasko, ferko: marienka }';
let parsed = `{
  "model": "janko",
  "conditions": [
    [
      {
        "column": "a",
        "operator": "=",
        "value": 1232131
      },
      {
        "column": "b",
        "operator": "LIKE",
        "value": "test",
        "pattern": "%$%"
      }
    ]
  ],
  "columns": {
    "hrasko": "hrasko",
    "ferko": "marienka"
  },
  "modifiers": {
    "after": {
      "janko": "hrasko"
    },
    "before": {
      "a": {},
      "b": [
        1,
        2,
        3
      ]
    },
    "limit": 40
  }
}`;

function test()
{
    let start = process.hrtime(), len = 0, runs = 1000  00;

    for( let i = 0; i < runs; ++i )
    {
        len += QL.parse( query ).model.length;
        //len += JSON.parse( parsed ).model.length;
    }

    let end = process.hrtime( start ), took = end[0] + end[1] / 1e9

    console.log( Math.round( runs / took ) + ' q/s ' );
    console.log( JSON.stringify( QL.parse( query ), null, '  ' ));
}

setTimeout( test, 1000 );
