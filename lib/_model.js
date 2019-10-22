'use strict';

const Paths = new Map();
const Relations = require('./relations.js');

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
	#DB; #router; #tables; #relations;

	constructor( DB, tables, relations, router )
	{
		this.#DB = DB;
		this.#tables = tables;
		this.#relations = new Relations( relations );
		this.#router = router;
	}

	getColumns( table, alias = null, columns = null, forbiddenColumns = [] )
	{
		let table_columns = Object.keys( this.#tables[ table ].columns || {} );

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
		let primary_columns = this.#tables[ table ].indexes.primary;

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

	async filter_models_from_columns( columns )
	{
		let table_columns = {}, models = {};

		for( let column in columns )
		{
			if( columns.hasOwnProperty( column ) )
			{
				if( typeof columns[ column ] === 'object' )
				{
					models[ columns[ column ].table ] = { alias: column, type: columns[ column ].type, data: columns[ column ] };
				}
				else
				{
					table_columns[ column ] = columns[ column ];
				}
			}
		}

		return [ table_columns, models ];
	}

	async query( data, id )
	{
		if( !data ){ throw { code: 404, message: 'not-found' }; }
		if( !data.order ){ data.order = []; }

		let response = ( data.type === 'object' ? null : [] );
		let uniq = { primary_columns: [], ids: [], column: [] };

		if( id )
		{
			id.forEach( row => { if( Array.isArray( row ) ){ uniq.ids = uniq.ids.concat( row ); } else if( row ) { uniq.ids.push( row ) }});
			if( !uniq.ids.length ){ throw { code: 404, message: 'not-found' }; };
		}

		let [ query_columns, models ]= await this.filter_models_from_columns( data.columns );

		let query = this.#DB.query( data.table )
			.limit( ( !id && data.type === 'object' ? 1 : ( data.limit ? data.limit : null )))
			.group_by( ( data.group ? data.group : null ) );

		let table_primary = JSON.parse( JSON.stringify( this.#tables[ data.table ].indexes.primary ));
		if( Array.isArray( table_primary )){ table_primary = table_primary[0].split( ',' ); }
		else { table_primary = table_primary.split( ',' ); }

		if( table_primary.length === 1 )
		{
			let search_columns = table_primary;
			let data_uniq_ids = [];

			if( id && uniq.ids )
			{
				uniq.ids.forEach( cid => {
					if( typeof cid === 'object' )
					{
						if( cid.hasOwnProperty( search_columns[0] ) ) //todo odkontrolovat to treba a treba to prirobit aj na multi
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

			uniq.column.push( search_columns[0] );
			query_columns[ table_primary[0] ] = table_primary[0];
			query.where( ( id ? search_columns[0] + ' IN ( :data_uniq_ids )' : null ), { data_uniq_ids } );
			uniq.primary_columns.push( table_primary[0] );

			if( search_columns[0] !== table_primary[0] )
			{
				uniq.primary_columns.push(  search_columns[0] );
				query_columns[ search_columns[0] ] = search_columns[0];
			}

			data.order.push( table_primary[0] + ' DESC' );
		}
		else
		{
			table_primary.forEach( p_col => {
				query_columns[ p_col ] = p_col;
				uniq.primary_columns.push( p_col );
				data.order.push( data.table + '.' + p_col + ' DESC' );
			});

			let where = [], where_data = {};
			for( let i = 0; i < uniq.ids.length; i++ )
			{
				let part_where = [];

				for( let column in uniq.ids[i] )
				{
					if( uniq.column.indexOf( column ) === -1 ){ uniq.column.push( column ); }

					part_where.push( column + ' = :' + column + '_' + i );
					where_data[ column + '_' + i ] = uniq.ids[i][ column ];
				}

				if( part_where.length ){ where.push( '( ' + part_where.join( ' AND ' ) + ' )') };
			}

			if( where.length ){ query.where( where.join( ' OR ' ), where_data ) };
		}

		query.order_by( ( data.order ? data.order : '' ) );

		let [ submodels, submodels_primary ] = await this.find_submodels( data.table, models );

		let select_primary_columns = uniq.primary_columns.concat( submodels_primary );

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

		let getRows = await OK( query.map( 'id' ).get_all( select_primary_columns.join(', ')));
		let submodel_ids = {};

		if( getRows.rows.length )
		{
			let ids = ( !id && data.type === 'object' ? null : [] );

			for( let i = 0; i < getRows.rows.length; i++ )
			{
				if( !id && data.type === 'object' )
				{
					ids = {};
					uniq.primary_columns.forEach( row => { ids[ row ] = getRows.rows[i][ row ]; });
				}
				else
				{
					let primary_key = {};
					uniq.primary_columns.forEach( row => { primary_key[ row ] = getRows.rows[i][ row ]; });
					ids.push( primary_key );
				}


				for( let model_name in submodels )
				{
					if( submodels.hasOwnProperty( model_name ) )
					{
						if( !submodel_ids.hasOwnProperty( model_name ) ){ submodel_ids[ model_name ] = []; }

						if( Array.isArray( submodels[ model_name ].column ) )
						{
							let multiple_columns = {};

							submodels[ model_name ].column.forEach( row => { multiple_columns[ row ] = getRows.rows[i][ submodels[ model_name ].table + '_'  + row ]; });

							submodel_ids[ model_name ].push( multiple_columns );
						}
						else
						{
							submodel_ids[ model_name ].push( { [ submodels[ model_name ].column.split('.')[1] ]: getRows.rows[i][ submodels[ model_name ].column.replace( '.', '_' ) ] } );
						}
					}
				}
			}

			if( ( !id && data.type === 'object' && ids ) || ids.length )
			{
				response = await this.resolve( ids, data.table, query_columns || [] );

				let new_models = {};

				if( response && models && Object.keys( models ).length )
				{
					let promise_all_models = [];
					let models_list = [];

					for( let model in models )
					{
						models_list.push( { alias: models[ model ].alias, model, middle: submodels.hasOwnProperty( models[ model ].alias ) } );

						if( submodels.hasOwnProperty( models[ model ].alias ) )
						{
							let new_data = {
								table: submodels[ models[ model ].alias ].table,
								conditions: [],
								main_type: models[ model ].type,
								type: 'array',
								columns: models[ model ].data.columns
							};

							promise_all_models.push( this.#router( submodels[ models[ model ].alias ].table ).query( new_data, submodel_ids[ models[model].alias ] ) );
						}
						else
						{
							promise_all_models.push( this.#router( model ).query( models[ model ].data, submodel_ids[ models[model].alias ] ) );
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
									if( awaited[ i ][ q ].length === 1 )
									{
										new_mode_data.push( awaited[ i ][ q ] );
									}
									else {
										for( let w = 0; w < awaited[ i ][ q ].length; w++ )
										{
											new_mode_data.push( awaited[ i ][ q ][ w ][ models_list[i].model ] );
										}
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
								//todo preskumat new_models[ model ].model je null, preco?
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
							if( uniq.column.length > 1 )
							{
								let multi = [];
								uniq.column.forEach( col => multi.push( row[ col ] ));

								if( !Object.keys( query_columns ).length )
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
								if( !ordered_response.hasOwnProperty( row[ uniq.column[0] ])){ ordered_response[ row[ uniq.column[0] ] ] = ( data.main_type === 'object' ? null : [] ); }

								if( !Object.keys( query_columns ).length )
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


								if( data.main_type === 'object' ){ ordered_response[ row[ uniq.column[0] ] ] = row; }
								else { ordered_response[ row[ uniq.column[0] ] ].push( row ); }
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
								uniq.column.forEach( col => multi_col.push( id[ i ][ col ] ) );

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
									uniq.column.forEach( col => multi_col.push( id[ i ][ col ] ) );

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
								uniq.column.forEach( col => multi_col.push( id[ i ][ col ] ) );

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

	async find_submodels( table, models )
	{
		let submodels = {}, submodels_primary_columns = [];
		if( Object.keys( models ).length )
		{
			for( let model in models )
			{
				let path = this.#relations.path( table, model );

				if( path )
				{
					for( let i = 0; i < path.length; i++ )
					{
						for( let j = 0; j < path[i].condition.length; j++ )
						{
							submodels_primary_columns.push( path[i].condition[j][2] + ' ' + path[i].condition[j][0].replace( '.', '_' ) );
							submodels[ models[ model ].alias ] = { table: path[i].table, column: path[i].condition[j][0] };
						}

						break;
					}
				}
				else { throw { code: 404, message: 'path-not-found' }; }
			}
		}

		return [ submodels, submodels_primary_columns ];
	}
}
