'use strict';

const Paths = new Map();
const OK = async( query ) =>
{
	let data = await query;

	if( !data.ok ){ throw { code: 503, message: 'unavailable' }; }
	return data;
};

const getOffset = ( order, row, direction ) =>
{
    let condition_map = {};
    let data = {}, condition = null;
    let first_condition = [];

    for( let i = 0; i < order.length; i++ )
    {
        for( let k = 0; k < ( order.length - i + 1 ); k++ )
        {
            let [ order_column, sort ] = order[i].trim().split( ' ' );
            data[ order_column ] = row[ order_column ];

            if( !condition_map.hasOwnProperty( k ) ){ condition_map[k] = []; }

            if( k === 0 )
            {
                first_condition.push( order_column + ' ' + ( direction === 'after' ? ( sort === 'ASC' ? '>=' : '<=' ) : ( sort === 'ASC' ? '<=' : '>=' ) ) + ' :'+order_column );
            }
            else if( k === ( order.length - i ) )
            {
                condition_map[ k ].push( order_column + ' ' + ( direction === 'after' ? ( sort === 'ASC' ? '>' : '<' ) : ( sort === 'ASC' ? '<' : '>' ) ) + ' :'+order_column );
            }
            else
            {
                condition_map[ k ].push( order_column + ' = :'+order_column );
            }
        }
    }

    if( Object.keys( condition_map ).length )
    {
        let other_condition_map = [];
        Object.values( condition_map ).forEach( condition => other_condition_map.push( condition.join( ' AND ' )));
        condition = first_condition.join( ' AND ' ) + ' AND ( ' + other_condition_map.join( ' ) OR ( ' ) + ' )';
    }

    return ( condition ? { condition, data } : null );
}

module.exports = class QLModel
{
    #DB; #config; #columns; #relations_map; #models; #model;

    constructor( config )
    {
		this.#config = config;
        this.#DB = config.DB;
        this.#columns = config.columns;
        this.#relations_map = config.relations;
        this.#models = config.models;
        this.#model = config.model;
    }

    getColumns( table, alias = null, columns = null, forbiddenColumns = [] )
	{
		let table_columns = this.#columns[ table ];

		if( columns )
		{
			let new_table_columns = [];

			if( typeof columns === 'string'){ columns = columns.trim().substring( 1, columns.length -1 ).split(',') }

			if( !Array.isArray( columns ) )
			{
				for( let alias in columns )
				{
					let column = columns[ alias ];
					alias = ( column === alias ? '' : alias );
					if( table_columns.indexOf( column ) !== -1 ){ new_table_columns.push( column + ( alias ? ' ' + alias : '' ) ); }
				}
			}
			else
			{
				columns.forEach( row =>
				{
					row = ( row ? row.trim() : null );
					if( row )
					{
						let [ alias, column ] = row.split(':');
						column = ( column ? column.trim() : alias.trim() );
						alias = ( column === alias ? '' : alias.trim() );
						if( table_columns.indexOf( column ) !== -1 ){ new_table_columns.push( column + ' ' + alias ); }
					}
				});
			}

			table_columns = new_table_columns;
			if( table_columns.indexOf( 'id' ) === -1 ){ table_columns.push( this.#config.primary.column ); }
		}
		else if( forbiddenColumns.length ){ table_columns = table_columns.filter( column => forbiddenColumns.indexOf( column ) === -1 ); }

		return ( alias ? alias + '.' : '' ) + table_columns.join( ',' + ( alias ? alias + '.' : '' ) );
	};

	async resolve( id, table, columns = [], forbiddenColumns = [] )
	{
		let detail = await OK( this.#DB.query( table ).where( this.#config.primary.column + ' IN :?', ( Array.isArray( id ) ? id : [ id ] ) ).map( this.#config.primary.column ).get_all( this.getColumns( table, null, columns, forbiddenColumns )));

		let response = [];
		if( !detail.ok ){ throw { code: 503, message: 'unavailable' }}

		if( detail.rows.length )
		{
			if( Array.isArray( id ) )
			{
				let ids = {};
				detail.rows.forEach( row => { ids[ row.id ] = row ; } );

				for( let i = 0; i < id.length; i++ ){ response.push( ( ids.hasOwnProperty( id[i] ) ? ids[ id[i] ] : null ) ); }
			}
			else{ response = detail.row; }
		}
		else{ response = null; }

		return response;
	}

	async get( data )
	{
		LOG.notice( { service: 'accounts' }, 'enter_acc acc response', { data } );
		if( !data ){ throw { code: 404, message: 'not-found' }; }

		let response = null;
		let query = this.#DB.query( data.table )
			.where( ( data.condition ? data.condition : null ), ( data.values ? data.values : {} ) )
			.group_by( ( data.group ? data.group : null ) )
			.order_by( ( data.order ? data.order : '' ) );

		let getRows = await OK( query.get( 'id' ) );

		if( getRows.row )
		{
			response = this.resolve( getRows.row.id, data.table, data.columns );
		}

		return response;
	}

    async query( data, id )
	{
        if( !data ){ throw { code: 404, message: 'not-found' }; }
		if( !data.order ){ data.order = [ 'id ASC' ]; }

		let uniq_ids = [];
		if( id )
		{
			id.forEach( row => { if( Array.isArray( row ) ){ uniq_ids = uniq_ids.concat( row ); } else if( row ) { uniq_ids.push( row ) }});
			if( !uniq_ids.length ){ return id };
		}

		let table = data.model;
        let columns = {};
        let models = {}, models_column = {};

        for( let column in data.columns )
        {
            if( data.columns.hasOwnProperty( column ) )
            {
                if( typeof data.columns[ column ] === 'object' )
                {
                    models[ data.columns[ column ].model ] = { alias: column, type: data.columns[ column ].type, data: data.columns[ column ] };
                }
                else
                {
                    columns[ column ] = data.columns[ column ];
                }
            }
        }

        let response = [];

		let query = this.#DB.query( table )
			.limit( ( data.type === 'object' ? 1 : ( data.limit ? data.limit : 10 )))
			.group_by( ( data.group ? data.group : null ) )
			.order_by( ( data.order ? data.order : 'id ASC' ) );

		let primary_columns = this.#config.tables[ table ].indexes.primary;

		if( Array.isArray( primary_columns )){ primary_columns = primary_columns[0]; }
		primary_columns = primary_columns.split( ',' );

		if( primary_columns.length === 1 )
		{
			query.where( ( id ? primary_columns[0] + ' IN ( :uniq_ids )' : null ), { uniq_ids } );
		}
		else
		{

		}

        let simple_get = true, mode_models = {};
		let get_columns = [];

        if( Object.keys( models ).length )
        {
            simple_get = false;

            for( let model in models )
            {
				let main_table = table;
				let path = await this.findPath( table, model );

                if( path )
                {
					for( let i = 0; i < path.length; i++ )
                    {
						let next_table = path[ i + 1 ];
						if( typeof next_table === 'object' ){ next_table = next_table.table };

						let condition = path[i].condition;

						if( typeof path[i] === 'object' )
                        {
							if( main_table === path[i].table )
							{
								if( this.#models[ condition.value.table ] === this.#model ) //todo pravdepodobne ak je tam viac idciel tak group by
								{
									query.join( condition.value.table, path[i].table + '.' + condition.column + ' ' + condition.operator + ' ' + condition.value.table + '.'  + condition.value.column );
									get_columns.push( condition.value.table + '.'  + condition.value.column + ' ' + condition.value.table + '_'  + condition.value.column );
								}
								else
								{
									models_column[ models[ model ].alias ] = path[i].table + '_'  + condition.column;
									get_columns.push( path[i].table + '.'  + condition.column + ' ' + path[i].table + '_'  + condition.column );
								}

								main_table = condition.value.table;
							}
							else
							{
								if( this.#models[ path[i].table ] === this.#model ) //todo pravdepodobne ak je tam viac idciel tak group by
								{
									query.join( path[i].table, path[i].table + '.' + condition.column + ' ' + condition.operator + ' ' + condition.value.table + '.'  + condition.value.column );
									get_columns.push( path[i].table + '.'  + condition.column + ' ' + path[i].table + '_'  + condition.column );
								}
								else
								{
									models_column[ models[ model ].alias ] = condition.value.table + '_'  + condition.value.column;
									get_columns.push( condition.value.table + '.'  + condition.value.column + ' ' + condition.value.table + '_'  + condition.value.column );
								}

								main_table = path[i].table;
							}
                        }
                    }
                }
                else { throw { code: 404, message: 'not-found' }; }
            }
        }

		if( data.conditions )
		{
			let where = [], where_data = {};

			for( let i = 0; i < data.conditions.length; i++ )
			{
				let where_and = [];
				for( let j = 0; j < data.conditions[i].length; j++ )
				{
					let condition = data.conditions[i][j];
					where_data[ i + '_'+ j ] = condition.value;  //todo in like
					where_and.push( condition.column + ' ' + condition.operator + ' :' + i + '_'+ j );
				}

				if( where_and.length ){ where.push( '( ' + where_and.join( ' AND ' ) + ' ) ' ); }
			}

			if( where.length ){ query.where( where.join( ' OR ' ), where_data ); }
		}

		if( data.after || data.before )
		{
			let offset = getOffset( data.order, data.after || data.before, ( data.after ? 'after' : 'before' ) );
			if( offset ){ query.where( offset.condition, offset.data ); }
		}

		let getRows = await OK( query.map( 'id' ).get_all( [ 'id' ].concat( get_columns ).join(', ')));
		let model_ids = {};

		if( getRows.rows.length )
		{
			for( let i = 0; i < getRows.rows.length; i++ )
			{
				for( let model_name in models_column )
				{
					if( models_column.hasOwnProperty( model_name ) )
					{
						if( !model_ids.hasOwnProperty( model_name ) ){ model_ids[ model_name ] = []; }
						model_ids[ model_name ].push( getRows.rows[i][ models_column[ model_name ] ] );
					}

				}
			}

			let ids = ( !id && data.type === 'object' ? getRows.row.id : Array.from( getRows.map.keys() ) ); //todo prerobit

			if( ( !id && data.type === 'object' && ids ) || ids.length )
			{
				response = await this.resolve( ids, table, columns || [] );

				if( models )
				{
					let promise_all_models = [];
					let models_list = [];

					for( let model in models )
					{
						models_list.push( { alias: models[ model ].alias, model } )
						promise_all_models.push( ( Service.get( this.#models[ model ] )).query( models[ model ].data, model_ids[ models[model].alias ] ) );
					}

					let awaited = await Promise.all( promise_all_models );
					let new_models = {};

					for( let i = 0; i < awaited.length; i++ )
					{
						new_models[ models_list[i].model ] = { model: awaited[ i ], alias: models_list[i].alias };
					}

					for( let i = 0; i < response.length ; i++ )
					{
						for( let model in new_models )
						{
							if( new_models.hasOwnProperty( model ) ){ response[i][[ new_models[ model ].alias ]] = new_models[ model ].model[ [i] ]; }
						}
					}
				}

				if( id )
				{
					let ordered_response = {};
					response.forEach( row => { if( row ){ ordered_response[ row.id ] = row;} } );
					response = [], ids = [];

					for( let i = 0; i < id.length; i++ )
					{
						if( data.type === 'array' )
						{
							let sub_array = [];
							for( let masterID of id[ i ] )
							{
								if( ordered_response.hasOwnProperty( masterID ) )
								{
									sub_array.push( ordered_response[ masterID ] );
								}
							}

							response.push( sub_array );
						}
						else
						{
							response.push( ( ordered_response.hasOwnProperty( id[ i ] ) ? ordered_response[ id[ i ] ] : {} ) );
						}
					}
				}
			}
		}

		return response;
	}

    async findPath( a, z )
	{
       	let end_loop = false;
		let relations = this.#relations_map;
		let path = Paths.get([a,z].join('-'));
		let counter = 20, counted = 0;

        if( path === undefined )
		{
			let tree = [ new Map([[a,null]]) ];

			pathfinder: while( tree[0].size )
			{
				counted++;
				tree.unshift( new Map() );

				for( let a_node of tree[1].keys() )
				{
					for( let node in relations )
					{
						if( node === a_node )
						{
							for( let b_node of Object.keys( relations[node].relations ))
							{
                                tree[0].set( b_node, ( tree[0].get( b_node ) ? Object.assign( tree[0].get( b_node ), { [ b_node ]: relations[node].relations[ b_node ] } ) : { [ b_node ]: relations[node].relations[ b_node ] } ));

								if( b_node === z ){ end_loop = true; }
							}
						}
						else if( relations[node].relations.hasOwnProperty( a_node ) )
						{
                            tree[0].set( node, ( tree[0].get( node ) ? Object.assign( tree[0].get( node ), { [a_node] : relations[node].relations[ a_node ] } ) : { [a_node] : relations[node].relations[ a_node ] } ) );

							if( node === z ){ end_loop = true; }
						}
					}
				}

				if( end_loop || counted >= counter ){ break pathfinder; }
			}

			if( counted >= counter )
			{
				throw { code: 404, message: 'not-found' };
			}

			if( tree[0].size && tree[0].has( z ) )
			{
                let node = z; path = [z];

                while( tree.length && node !== a )
				{
					if( typeof node === 'object' ){ node = node.table; }

					let current_node = tree.shift().get( node );
					let relevancy = 0;

                    for( let table in current_node )
					{
						if( current_node.hasOwnProperty( table ) && relevancy < current_node[ table ].relevancy )
						{
							node = { table: table, condition: current_node[ table ].conditions };
							relevancy = current_node[ table ].relevancy;
						}
					}

					if( typeof node === 'object' ) { path.push( node ) };
				}

				path.reverse();
			}
			else{ path = null; }
		}

		return path;
	}
}
