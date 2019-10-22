'use strict';

const Relations = require('./relations');

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

    _applyCondition( sql_query, query, condition )
    {
        if( query.condition )
        {
            for( let comparison of query.condition )
            {
                sql_query.where( query.table + '.' + comparison[0] + ' ' + comparison[1] + ' :?', comparison[2] );
            }
        }

        if( condition )
        {
            for( let comparison of condition )
            {
                sql_query.where( query.table + '.' + comparison[0] + ' ' + comparison[1] + ' :?', comparison[2] );
            }
        }
    }

    _queriedColumns( query, condition )
    {
        let columns = new Set(), column;

        for( let alias in query.columns )
        {
            if( typeof ( column = query.columns[alias] ) === 'string' )
            {
                columns.add( column );
            }
            else
            {
                let path = this.#relations.path( query.table, column.table );

                if( path )
                {
                    for( let comparison of path[0].condition )
                    {
                        if( typeof comparison[2] === 'string' )
                        {
                            columns.add( comparison[2].replace(/^.*\./,'') );
                        }
                    }

                    if( column.condition )
                    {
                        for( let comparison of column.condition )
                        {
                            if( typeof comparison[2] === 'string' )
                            {
                                columns.add( comparison[2] );
                            }
                        }
                    }
                }
            }
        }

        if( condition )
        {
            for( let comparison of condition )
            {
                columns.add( comparison[0].replace(/^.*\./,'') );
            }
        }

        return [ ...columns ];  
    }

    async get( query, condition )
    {
        //console.log( query );

        if( this.#tables.has( query.table ))
        {
            console.log( 'Mam table', query.table );

            let sql_query = this.#DB.query( query.table );

            this._applyCondition( sql_query, query, condition );

            let rows = [], result = await sql_query.select( this._queriedColumns( query, condition ).join(','));

            console.log( 'Query', result );

            for( let row of result.rows )
            {
                let data = {};

                for( let alias in query.columns )
                {
                    if( typeof query.columns[alias] === 'string' )
                    {
                        data[alias] = row[query.columns[alias]];
                    }
                }

                rows.push( data );
            }

            for( let alias in query.columns )
            {
                if( typeof query.columns[alias] === 'object' )
                {
                    let path = this.#relations.path( query.table, query.columns[alias].table );

                    console.log({ path: query.table + ' => ' + query.columns[alias].table, alias, path });

                    if( path )
                    {
                        let path_condition = path[0].condition.map( c => [ c[0].replace(/^.*\./,''), 'IN', result.rows.map( r => r[c[2].replace(/^.*\./,'')] ) ] );

                        let sub = await this.get( query.columns[alias], path_condition );

                        console.log( sub );
                    }
                }
            }
            
            return rows;
        }
    }
}