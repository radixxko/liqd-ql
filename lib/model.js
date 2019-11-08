'use strict';

const Parser = require('./parser');
const Relations = require('./relations');
const MultiQuery = require('./multiquery');
const Contains = ( obj, data ) => !( Object.keys( data ).find( k => typeof obj[k] === 'undefined' || data[k] != obj[k] ));

module.exports = class QLModel
{
    #DB; #router; #scheme; #relations;

	constructor( DB, scheme, router )
	{
        this.#DB = DB;
        
        this.#scheme = Parser.scheme( scheme );
		this.#relations = new Relations( this.#scheme );
		this.#router = router;
    }

    async get( query, parent )
    {
        if( typeof query === 'string' ){ query = require('./ql').parse( query )}

        //console.log( JSON.stringify( query, null, '  ' ));

        //console.log( query );

        if( this.#scheme[ query.table ])
        {
            let sql, path, rows = [], links = new Map(), columns = [...[...Object.values( query.columns )].reduce(( columns, column ) => (
                ( typeof column === 'string' )
                    ? ( this.#scheme[ query.table ].getters[column] ? this.#scheme[ query.table ].getters[column].requires.forEach( name => columns.add( name )) : columns.add( column ))
                    : this.#relations.path( query.table, column.table )[0].columns[query.table].names.forEach( name => columns.add( name ))
                , columns )
            , new Set())];

            if( parent )
            {
                if( path = this.#relations.path( parent.table, query.table ))
                {
                    //TODO query optimizer when linking by single column equal value => column in ( :ids ) instead of SELECT FROM DUAL inner join
                    //TODO unique tuples

                    let links = parent.rows.map( r => path[0].columns[parent.table].names.reduce(( l, c ) => ( l[c] = r[c], l ), {}));

                    sql = ( links.length > 1 && query.limit ) ? new MultiQuery( this.#DB, links, parent.table ) : this.#DB.query( links, parent.table );
                    path.forEach( node => sql.inner_join( node.table, node.condition ));
                }
            }
            else{ sql = this.#DB.query( query.table )}

            query.limit && sql.limit( query.limit );
            query.orderBy && sql.order_by( query.orderBy );
            //query.groupBy && sql.group_by( query.groupBy );

            query.condition && query.condition.forEach( c => sql.where( query.table + '.' + c[0] + ' ' + c[1] + ' :?', c[2] ));

            let select = await sql.select(( parent ? path[0].columns[parent.table].aliases + ', ' : '' ) + columns.map( c => query.table + '.' + c ).join(', '));

            //console.log( select.query, select.rows.length );

            if( select.rows )
            {
                await Promise.all([...Object.values( query.columns )].filter( c => typeof c === 'object' ).map( q => this.get( q, { table: query.table, rows: select.rows })));

                let getters = [];

                for( let db_row of select.rows )
                {
                    let row = {}, prefix = '_' + ( parent ? parent.table : '' ) + '_';

                    for( let [ alias, column ] of Object.entries( query.columns ))
                    {
                        if( typeof column === 'string' )
                        {
                            if( this.#scheme[ query.table ].getters[column] )
                            {
                                let get = this.#scheme[ query.table ].getters[column].callback( db_row, {});

                                if( get instanceof Promise )
                                {
                                    getters.push( get.then( v => row[ alias ] = v ));
                                }
                                else
                                {
                                    row[ alias ] = get;
                                }
                            }
                            else{ row[ alias ] = db_row[ column ]}
                        }
                        else if( alias === '...' )
                        {
                            Object.assign( row, db_row[ column.table ]);
                        }
                        else
                        {
                            row[ alias ] = db_row[ column.table ];
                        }
                    }

                    parent && links.set( row, Object.keys( db_row ).filter( c => c.startsWith( prefix )).reduce(( cc, c ) => ( cc[ c.substr( prefix.length )] = db_row[c], cc ), {}));
                    rows.push( row );
                }

                getters.length && await Promise.all( getters );
            }

            if( parent )
            {
                //console.log({ links });

                for( let parent_row of parent.rows )
                {
                    parent_row[ query.table ] = rows.filter( row => Contains( parent_row, links.get( row )));

                    if( query.type === 'object' ){ parent_row[ query.table ] = parent_row[ query.table ][0] }
                }
            }

            return ( query.type === 'object' ) ? rows[0] : rows;
        }
        else{ return await this.#router( query, parent )}
    }
}
