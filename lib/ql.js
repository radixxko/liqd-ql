'use strict';

const QLModel = require('./model');

module.exports = class QL
{
    static parse( query )
    {

    }

    static build()
    {

    }

    static get Model()
    {
        return QLModel;
    }
}

/*model: 'user'
filter:
{
    condition:
    [

    ],
    order: { name: 'ASC', surname: 'DESC' },
    group: 'dasdasda',
    limit: 1
}


query => [ id ]
resolve( [id] ) => [{  }]


(
    at = '2019-01-01 19:23:23',
     10 <= age + created,
     age + created < end,
      name =* [ 'John', 'Jack' ],
       surname = 'Smith' )
||
( active = 1, session.start > '2019-01-02'



users(( at = '2019-01-01 19:23:23', 10 <= age + created < end, name =* [ 'John' ], surname = 'Smith' ) || ( active = 1, session.start > '2019-01-02' ); limit: 30; order: name ASC, surname DESC )
{
    name,
    surname,
    sesna: session( status = 'online' )
    {
        start,
        end,
        client:
        {
            id,
            name
        }
    }
}

QL.users().properties('start,end')*/
