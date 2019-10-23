'use strict';

const Relations = require('./relations');
const Contains = ( obj, data ) => !( Object.keys( data ).find( k => typeof obj[k] === 'undefined' || data[k] != obj[k] ));

module.exports = class QLModel
{
    #DB; #router; #tables; #relations;

	constructor( DB, tables, relations, router )
	{
		this.#DB = DB;
		this.#tables = new Set( tables );
		this.#relations = new Relations( relations );
		this.#router = router;
    }

    async get( query, parent )
    {
        if( this.#tables.has( query.table ))
        {
            let sql, path, rows = [], links = new Map(), columns = [...[...Object.values( query.columns )].reduce(( columns, column ) => (
                ( typeof column === 'string' ) 
                    ? columns.add( column )
                    : this.#relations.path( query.table, column.table )[0].columns[query.table].names.forEach( name => columns.add( name ))
                , columns )
            , new Set())];

            if( parent )
            {
                if( path = this.#relations.path( parent.table, query.table ))
                {
                    //TODO query optimizer when linking by single column equal value => column in ( :ids ) instead of SELECT FROM DUAL inner join
                    //TODO unique tuples
                    sql = this.#DB.query( parent.rows.map( r => path[0].columns[parent.table].names.reduce(( l, c ) => ( l[c] = r[c], l ), {})), parent.table );

                    path.forEach( node => sql.inner_join( node.table, node.condition ));
                }
            }
            else{ sql = this.#DB.query( query.table )}

            query.condition && query.condition.forEach( c => sql.where( query.table + '.' + c[0] + ' ' + c[1] + ' :?', c[2] ));

            let select = await sql.select(( parent ? path[0].columns[parent.table].aliases + ', ' : '' ) + columns.map( c => query.table + '.' + c ).join(', '));

            //console.log( select.query, select.rows.length );

            if( select.rows )
            {
                await Promise.all([...Object.values( query.columns )].filter( c => typeof c === 'object' ).map( q => this.get( q, { table: query.table, rows: select.rows })));

                for( let db_row of select.rows )
                {
                    let row = {}, prefix = '_' + ( parent ? parent.table : '' ) + '_';

                    for( let [ alias, column ] of Object.entries( query.columns ))
                    {
                        row[ alias ] = db_row[ typeof column === 'string' ? column : column.table ];
                    }

                    parent && links.set( row, Object.keys( db_row ).filter( c => c.startsWith( prefix )).reduce(( cc, c ) => ( cc[ c.substr( prefix.length )] = db_row[c], cc ), {}));
                    rows.push( row );
                }
            }

            if( parent )
            {
                for( let parent_row of parent.rows )
                {
                    parent_row[ query.table ] = rows.filter( row => Contains( parent_row, links.get( row )));
                }
            }

            return rows;
        }
    }
}