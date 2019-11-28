'use strict';

const Parser = require('./parser');
const Relations = require('./relations');
const MultiQuery = require('./multiquery');
const Contains = ( obj, data ) => !( Object.keys( data ).find( k => typeof obj[k] === 'undefined' || data[k] != obj[k] ));

const getOffset = ( order, row, direction, query ) =>
{
    if( typeof order === 'string' ){ order = order.split(','); }
    if( typeof row === 'string' ){ row = JSON.parse( row ); }

    let data = {}, condition = '';

    for( let k = 0; k < order.length; k++ )
    {
        for( let i = 0; i < order.length - k; i++ )
        {
            let [ order_column, sort ] = order[i].trim().split( ' ' );
            data[ order_column ] = row[ Object.keys(query.columns).find(k=>query.columns[k]===order_column) ];

            let operator = ( i === ( order.length - k -1 ) ? ( direction === 'after' ? ( sort.toUpperCase() === 'ASC' ? '>' : '<' ) : ( sort.toUpperCase() === 'ASC' ? '<' : '>' ) ) : '=' );
            condition += ( !i ? ' ( ' : ' AND ' ) + query.table + '.' + order_column + ' ' + operator + ' :'+order_column;
        }

        condition += ( k  < ( order.length - 1 ) ? ' ) OR' : ' ) ' );
    }

    return ( condition ? { condition, data } : null );
};

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
            if( this.#scheme[ query.table ].alias )
            {
                query.condition.push( this.#scheme[ query.table ].condition );
                query.table = this.#scheme[ query.table ].alias;
            }

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

            if( query.orderBy && ( query.after || query.before ))
            {
                let offset = getOffset( query.orderBy, query.after || query.before, ( query.after ? 'after' : 'before' ), query );
                if( offset ){ sql.where( offset.condition, offset.data ); }
            }

            query.limit && sql.limit( query.limit );
            query.orderBy && sql.order_by( query.orderBy );
            //query.groupBy && sql.group_by( query.groupBy );

            //TODO prefixc

            query.condition && query.condition.forEach( c => {( typeof c === 'string' ? sql.where( c ) : sql.where( query.table + '.' + c[0] + ' ' + c[1] + ' :?', ( c[1] === 'IN' ? JSON.parse( c[2] ) : c[2] )))});

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
                                let get = this.#scheme[ query.table ].getters[column].callback( db_row, { QLModel: this });

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
                        else if( column.expand )
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
