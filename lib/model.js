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
		}
		else if( forbiddenColumns.length ){ table_columns = table_columns.filter( column => forbiddenColumns.indexOf( column ) === -1 ); }

		return ( alias ? alias + '.' : '' ) + table_columns.join( ',' + ( alias ? alias + '.' : '' ) );
	};

	async resolve( id, table, columns = [], forbiddenColumns = [] )
	{
		let query = this.#DB.query( table );
		let entry_column = [];
		let primary_columns = this.#config.tables[ table ].indexes.primary;

		if( Array.isArray( primary_columns )){ primary_columns = primary_columns[0]; }
		primary_columns = primary_columns.split( ',' );

		if( Array.isArray( id ) )
		{
			let where = [], where_data = {};

			if( Object.keys( id[ 0 ] ).length === 1  )
			{
				let values = [];
				let single_column = Object.keys( id[ 0 ] )[0];

				id.forEach( row => values.push( row[ single_column ] ) );

				entry_column.push( single_column );
				where.push( '( ' + single_column + ' IN ( :bind_uniq_col ))');
				where_data[ 'bind_uniq_col' ] = values;
			}
			else
			{
				for( let i = 0; i < id.length; i++ )
				{
					let part_where = [];

					for( let column in id[i] )
					{
						part_where.push( column + ' = :' + column + '_' + i );
						where_data[ column + '_' + i ] = id[i][ column ];

						if( entry_column.indexOf( column ) === -1 ){ entry_column.push( column ); }
					}

					where.push( '( ' + part_where.join( ' AND ' ) + ' )');
				}
			}

			query.where( where.join( ' OR ' ), where_data );
		}
		else
		{
			let where = [], where_data = {};

			for( let column in id )
			{
				where.push( column + ' = :' + column );
				where_data[ column ] = id[ column ];

				if( entry_column.indexOf( column ) === -1 ){ entry_column.push( column ); }
			}

			query.where( where.join( ' AND ' ), where_data );
		}

		let detail = await OK( query.get_all( this.getColumns( table, null, columns, forbiddenColumns )));

		if( !detail.ok ){ throw { code: 503, message: 'unavailable' }}

		let response = [];

		if( detail.rows.length )
		{
			if( Array.isArray( id ) )
			{
				let ids = {};

				for( let i = 0; i < detail.rows.length; i++ )
				{
					detail.rows.forEach( row => {
						let cols = [];
						entry_column.forEach( col => { cols.push( row[ col ] ); });
						ids[ cols.join( '-' ) ] = row ;
					});
				}

				for( let i = 0; i < id.length; i++ )
				{
					let val = [];
					for( let col in id[i] )
					{
						val.push( id[i][ col ] );
					}

					val = val.join( '-' );
					response.push( ( ids.hasOwnProperty( val ) ? ids[ val ] : null ) );
				}
			}
			else{ response = detail.row; }
		}
		else{ response = null; }

		return response;
	}

    async query( data, id )
	{

		if( !data ){ throw { code: 404, message: 'not-found' }; }

		let get_columns = [];
		let uniq_ids = [], sub_models = {};

		if( id )
		{
			id.forEach( row => { if( Array.isArray( row ) ){ uniq_ids = uniq_ids.concat( row ); } else if( row ) { uniq_ids.push( row ) }});
			if( !uniq_ids.length ){ throw { code: 404, message: 'not-found' }; };
		}

		let table = data.model;
        let columns = {}, columns_empty = false;
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

        if( !Object.keys( columns ).length ){ columns_empty = true; }

        let response = ( data.type === 'object' ? null : [] );

		let query = this.#DB.query( table )
			.limit( ( !id && data.type === 'object' ? 1 : ( data.limit ? data.limit : null )))
			.group_by( ( data.group ? data.group : null ) );

		let primary_columns = this.#config.tables[ table ].indexes.primary;

		if( Array.isArray( primary_columns )){ primary_columns = primary_columns[0]; }
		primary_columns = primary_columns.split( ',' );

		let uniq_column = [];
		if( !data.order ){ data.order = []; }
		if( primary_columns.length === 1 )
		{
			let search_columns = JSON.parse( JSON.stringify( primary_columns ));
			let data_uniq_ids = [];

			if( id && uniq_ids )
			{
				uniq_ids.forEach( cid => {
					if( typeof cid === 'object' )
					{
						if( cid.hasOwnProperty( search_columns[0] ) )
						{
							data_uniq_ids.push( cid[ search_columns[0] ] );
						}
						else if( Object.keys( cid ).length )
						{
							search_columns[0] = Object.keys( cid )[0];
							data_uniq_ids.push( cid[ search_columns[0] ] );
						}
					}
					else if( cid )
					{
						data_uniq_ids.push( cid );
					}
				});
			}

			uniq_column.push( search_columns[0] );
			columns[ primary_columns[0] ] = primary_columns[0];
			query.where( ( id ? search_columns[0] + ' IN ( :data_uniq_ids )' : null ), { data_uniq_ids } );
			get_columns.push( table + '.' + primary_columns[0] );

			if( search_columns[0] !== primary_columns[0] )
			{
				get_columns.push( table + '.' + search_columns[0] );
				columns[ search_columns[0] ] = search_columns[0];
			}

			data.order.push( table + '.' + primary_columns[0] + ' DESC' );
		}
		else
		{
			primary_columns.forEach( p_col => {
				columns[ p_col ] = p_col;
				get_columns.push( table + '.' + p_col );
				data.order.push( table + '.' + p_col + ' DESC' );
			});

			let where = [], where_data = {};
			for( let i = 0; i < uniq_ids.length; i++ )
			{
				let part_where = [];

				for( let column in uniq_ids[i] )
				{
					if( uniq_column.indexOf( column ) === -1 ){ uniq_column.push( column ); }

					part_where.push( column + ' = :' + column + '_' + i );
					where_data[ column + '_' + i ] = uniq_ids[i][ column ];
				}

				if( part_where.length ){ where.push( '( ' + part_where.join( ' AND ' ) + ' )') };
			}

			if( where.length ){ query.where( where.join( ' OR ' ), where_data ) };
		}

		query.order_by( ( data.order ? data.order : '' ) );

		if( Object.keys( models ).length )
        {
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
                        	if( Array.isArray( condition.column ) )
							{
								if( main_table === path[i].table )
								{
									models_column[ models[ model ].alias ] = { table: condition.value.table, column: condition.value.column };

									for( let j = 0; j < condition.column.length; j++ )
									{
										get_columns.push( path[i].table + '.'  + condition.column[j] + ' ' + condition.value.table + '_'  + condition.value.column[j] );
									}

									if( condition.value.table !== model )
									{
										sub_models[ models[ model ].alias ] = { table: condition.value.table, column: condition.value.column };
									}

									break;
								}
								else
								{
									models_column[ models[ model ].alias ] = { table: path[i].table, column: condition.column };

									for( let j = 0; j < condition.column.length; j++ )
									{
										get_columns.push( condition.value.table + '.'  + condition.value.column[j] + ' ' + path[i].table + '_'  + condition.column[j] );
									}

									if( path[i].table !== model )
									{
										sub_models[ models[ model ].alias ] = { table: path[i].table, column: condition.column };
									}

									break;
								}
							}
                        	else
							{
								if( main_table === path[i].table )
								{
									models_column[ models[ model ].alias ] = { table: condition.value.table, column: condition.value.column };
									get_columns.push( path[i].table + '.'  + condition.column + ' ' + condition.value.table + '_'  + condition.value.column );

									if( condition.value.table !== model )
									{
										sub_models[ models[ model ].alias ] = { table: path[i].table, column: condition.column };
									}

									break;
								}
								else
								{
									models_column[ models[ model ].alias ] = { table: path[i].table, column: condition.column };
									get_columns.push( condition.value.table + '.'  + condition.value.column + ' ' + path[i].table + '_'  + condition.column );

									if( path[i].table !== model )
									{
										sub_models[ models[ model ].alias ] = { table: path[i].table, column: condition.column };
									}

									break;
								}
							}
                        }
                    }
                }
                else
                {
                	throw { code: 404, message: 'not-found' };
                }
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
					where_data[ i + '_'+ j ] = condition.value;
					where_and.push( condition.column + ' ' + condition.operator + ( condition.operator.toUpperCase() === 'IN' ? '( :' + i + '_'+ j + ' ) ' : ' :' + i + '_'+ j )  );
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

		let getRows = await OK( query.map( 'id' ).get_all( get_columns.join(', ')));
		let model_ids = {};

		if( getRows.rows.length )
		{
			let ids = ( !id && data.type === 'object' ? null : [] );

			for( let i = 0; i < getRows.rows.length; i++ )
			{
				if( !id && data.type === 'object' )
				{
					ids = {};
					primary_columns.forEach( row => { ids[ row ] = getRows.rows[i][ row ]; });
				}
				else
				{
					let primary_key = {};
					primary_columns.forEach( row => { primary_key[ row ] = getRows.rows[i][ row ]; });
					ids.push( primary_key );
				}

				for( let model_name in models_column )
				{
					if( models_column.hasOwnProperty( model_name ) )
					{
						if( !model_ids.hasOwnProperty( model_name ) ){ model_ids[ model_name ] = []; }

						if( Array.isArray( models_column[ model_name ].column ) )
						{
							let multiple_columns = {};

							models_column[ model_name ].column.forEach( row => { multiple_columns[ row ] = getRows.rows[i][ models_column[ model_name ].table + '_'  + row ]; });

							model_ids[ model_name ].push( multiple_columns );
						}
						else
						{
							model_ids[ model_name ].push( { [ models_column[ model_name ].column ]: getRows.rows[i][ models_column[ model_name ].table + '_'  + models_column[ model_name ].column ] } );
						}
					}
				}
			}

			if( ( !id && data.type === 'object' && ids ) || ids.length )
			{
				response = await this.resolve( ids, table, columns || [] );

				let new_models = {};

				if( response && models && Object.keys( models ).length )
				{
					let promise_all_models = [];
					let models_list = [];

					for( let model in models )
					{
						models_list.push( { alias: models[ model ].alias, model, middle: sub_models.hasOwnProperty( models[ model ].alias ) } );

						if( sub_models.hasOwnProperty( models[ model ].alias ) )
						{
							let new_data = {
								model: sub_models[ models[ model ].alias ].table,
								conditions: [],
								type: 'array',
								columns: {
									[ model ]: models[ model ].data
								}
							};

							promise_all_models.push( ( Service.get( this.#models[ sub_models[ models[ model ].alias ].table ] )).query( new_data, model_ids[ models[model].alias ] ) );
						}
						else
						{
							promise_all_models.push( ( Service.get( this.#models[ model ] )).query( models[ model ].data, model_ids[ models[model].alias ] ) );
						}
					}

					let awaited = await Promise.all( promise_all_models );

					for( let i = 0; i < awaited.length; i++ )
					{
						if( models_list[ i ].middle )
						{
							let new_mode_data = [];

							for( let q = 0; q < awaited[ i ].length; q++ )
							{
								if( awaited[ i ][ q ].length )
								{
									for( let w = 0; w < awaited[ i ][ q ].length; w++ )
									{
										new_mode_data.push( awaited[ i ][ q ][ w ][ models_list[i].model ] );
									}
								}
								else
								{
									new_mode_data.push( [] );
								}
							}

							new_models[ models_list[i].model ] = { model: new_mode_data, alias: models_list[i].alias };
						}
						else
						{
							new_models[ models_list[i].model ] = { model: awaited[ i ], alias: models_list[i].alias };
						}
					}

					if( Array.isArray( response ) )
					{
						for( let i = 0; i < response.length ; i++ )
						{
							for( let model in new_models )
							{
								if( new_models.hasOwnProperty( model ) && new_models[ model ].model )
								{
									response[i][[ new_models[ model ].alias ]] = new_models[ model ].model[ [i] ];
								}
							}
						}
					}
					else
					{
						for( let model in new_models )
						{
							if( new_models.hasOwnProperty( model ) ){ response[[ new_models[ model ].alias ]] = ( new_models[ model ].model && new_models[ model ].model.length ? new_models[ model ].model[0] : null ); }
						}
					}
				}

				if( response && id )
				{
					let ordered_response = {};

					response.forEach( row => {
						if( row )
						{
							if( uniq_column.length > 1 )
							{
								let multi = [];
								uniq_column.forEach( col => multi.push( row[ col ] ));

								if( columns_empty )
								{
									let new_row = {};

									for( let model in new_models )
									{
										if( row.hasOwnProperty( new_models[ model ].alias ) )
										{
											new_row[ new_models[ model ].alias ] = row[ new_models[ model ].alias ];
										}
									}

									row = new_row;
								}

								ordered_response[ multi.join( '-' ) ] = row;
							}
							else
							{
								let row_header = row[ uniq_column[0] ];
								if( columns_empty )
								{
									let new_row = {};

									for( let model in new_models )
									{
										if( row.hasOwnProperty( new_models[ model ].alias ) )
										{
											new_row[ new_models[ model ].alias ] = row[ new_models[ model ].alias ];
										}
									}

									row = new_row;
								}

								ordered_response[ row_header ] = row;
							}
						}
					});

					response = []; ids = [];

					for( let i = 0; i < id.length; i++ )
					{

						if( data.type === 'array' )
						{
							if( Array.isArray( id[ i ] ) )
							{
								let sub_array = [];
								let multi_col = [];
								uniq_column.forEach( col => multi_col.push( id[ i ][ col ] ) );

								if( ordered_response.hasOwnProperty( multi_col ) )
								{
									sub_array.push( ordered_response[ multi_col ] );
								}

								response.push( sub_array );
							}
							else
							{
								let sub_array = [];

								if( typeof id[ i ] === 'object' )
								{
									let multi_col = [];
									uniq_column.forEach( col => multi_col.push( id[ i ][ col ] ) );

									multi_col = multi_col.join( '-' );

									if( ordered_response.hasOwnProperty( multi_col ) )
									{
										sub_array.push( ordered_response[ multi_col ] );
									}
								}
								else
								{
									if( ordered_response.hasOwnProperty( id[ i ] ) )
									{
										sub_array.push( ordered_response[ id[ i ] ] );
									}
								}

								response.push( sub_array );
							}
						}
						else
						{
							let sub_array = null;


							if( typeof id[ i ] === 'object' )
							{
								let multi_col = [];
								uniq_column.forEach( col => multi_col.push( id[ i ][ col ] ) );

								multi_col = multi_col.join( '-' );

								if( ordered_response.hasOwnProperty( multi_col ) )
								{
									sub_array = ordered_response[ multi_col ];
								}
							}
							else
							{
								if( ordered_response.hasOwnProperty( id[ i ] ) )
								{
									sub_array = ordered_response[ id[ i ] ];
								}
							}

							response.push( sub_array );
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
				path = [z];
                let node = z;
				let node_name = z;

                while( tree.length && node_name !== a )
				{
					let current_node = tree.shift().get( node_name );
                    let relevancy = 0;

                    for( let table in current_node )
					{
						if( current_node.hasOwnProperty( table ) && relevancy < current_node[ table ].relevancy )
						{
							if( node_name === table ){ node_name = current_node[ table ].conditions.value.table; }else{ node_name = table; }
							node = { table: table, condition: current_node[ table ].conditions };
							relevancy = current_node[ table ].relevancy;
						}
					}

					if( typeof node === 'object' ) { path.push( node ) };
				}

				path.reverse();
			}
			else{ path = null; }

			Paths.set( [a,z].join('-'), path );
		}

		return path;
	}
}
