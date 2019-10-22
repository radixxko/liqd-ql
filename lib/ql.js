'use strict'
const QLModel = require('./model');
const Parser = new (require('liqd-parser'))( require('fs').readFileSync( __dirname + '/syntax/query.syntax' ));
//const Parser = require('./parser.js');

function normalizeValue( value )
{
    if( value.number ){ return  parseFloat( value.number ); }
    if( value.string ){ return  value.string; } // TODO escape charactery odstranit
    if( value.json ){ return  JSON.parse( '{' + value.json.json + '}' ); }
}

function normalize( query )
{
    if( query.conditions )
    {
        if( query.conditions.modifiers )
        {
            query.modifiers = {};

            for( let modifier of query.conditions.modifiers )
            {
                query.modifiers[ modifier.modifier ] = normalizeValue( modifier.value );
            }
        }

        query.conditions = [ query.conditions.condition.map( c =>
        {
            c.value = normalizeValue( c.value );

            if( c.operator.includes( '*' ))
            {
                c.pattern = c.operator.replace(/\*/g,'%').replace(/=/g,'$'); c.operator = 'LIKE';
            }

            return c;
        })];
    }

    if( query.columns )
    {
        let columns = {};

        for( let column of query.columns )
        {
            columns[ column.alias || column.column ] = column.column;
        }

        query.columns = columns;
    }

    return query;
}

module.exports = class QL
{
    #ql_model;

    constructor( DB, tables, relations, router )
	{
        this.#ql_model = new QLModel( DB, tables, relations, router );
    }

    parse( query )
    {
        console.log( { query } );
        let parsed_query = null;
        try{ parsed_query = Parser.parse( query ); console.log( parsed_query ); }catch(e){
           console.log( 'PARSED QUERY FAILED', e, { query }  );
        }

        return this.#ql_model.query( parsed_query );
    }

    query( data, alias )
    {
        return this.#ql_model.query( data, alias );
    }

    static get Model()
    {
        return this.#ql_model;
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
