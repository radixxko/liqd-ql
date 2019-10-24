const WHITESPACES_RE = /^\s+/;
const STRING_RE = /^("(([^\\"]|\\.)*?)"|'(([^\\']|\\.)*?)')/;
const NUMBER_RE = /^[-]{0,1}[0-9.]+/;
const NAME_RE = /^[a-zA-Z_]+/;
const OPERATORS_RE = /^(\*=\*|\*=|=\*|=|!=|<=|<|>=|>)/;
const OPERATORS =
	{
		'*=*'   : { operator: 'LIKE', pattern: '%$%' },
		'*='    : { operator: 'LIKE', pattern: '%$' },
		'=*'    : { operator: 'LIKE', pattern: '$%' },
		'='     : { operator: '=' },
		'!='    : { operator: '!=' },
		'<='    : { operator: '<=' },
		'<'     : { operator: '<' },
		'>='    : { operator: '>=' },
		'>'     : { operator: '>' }
	}

function plural( word )
{
	return word ? word + ( word.endsWith('s') ? '' : 's' ) : word;
}

function match( query, re, capture = undefined, move = true )
{
	let match = query.string.substring( query.position ).match( re );

	if( match ){ query.position += match[0].length }

	return match ? ( capture !== undefined ? match[capture] : match ) : undefined;
}

function rollback( query, string )
{
	let index = query.string.lastIndexOf( string, query.position );

	if( index > -1 ){ query.position = index; }
}

function skipWhitespaces( query )
{
	match( query, WHITESPACES_RE ); return true;
}

function parseString( query )
{
	let str = skipWhitespaces( query ) && match( query, STRING_RE );

	return str ? ( str[2] || str[4] || '' )/*.replace(/\\/g,'')*/ : undefined; // TODO
}

function parseNumber( query )
{
	let num = skipWhitespaces( query ) && match( query, NUMBER_RE, 0 );

	return num ? ( num.includes('.') ? parseFloat( num ) : parseInt( num )) : undefined;
}

function parseValue( query )
{
	let value = parseString( query );

	if( value !== undefined ){ return value; }

	value = parseNumber( query );

	if( value !== undefined ){ return value; }

	return undefined;
}

function parseOperator( query )
{
	let operator = skipWhitespaces( query ) && match( query, OPERATORS_RE, 0 );

	return operator ? OPERATORS[operator] : undefined;
}

function parseSelection( query )
{
	let selection = {};

	while( !( skipWhitespaces( query ) && match( query, /^\)/ ) ))
	{
		console.log( 'skip' );

		if( skipWhitespaces( query ) && match( query, /^;/ ) )
		{
			let selector = parseName( query );

			console.log({ selector });

			if( selector )
			{
				skipWhitespaces( query ) && match( query, /^:/ );

				selection[ selector ] = parseValue( query );
			}
		}
	}

	//LOG.critical('pici', { alexkoko: query.string.substr( query.position, query.position + 15 ) });

	console.log({ selection });

	return selection;
}

function parseCondition( query )
{
	let condition = skipWhitespaces( query ) && match( query, /^\(/ );

	if( condition )
	{
		let conditions = [[]];

		do
		{
			let column = parseColumn( query );

			console.log({ column });

			if( column )
			{
				let condition = { column }, operator = parseOperator( query );

				if( operator ){ condition = { ...condition, ...operator }};

				let value = parseValue( query );

				if( operator ){ condition.value = value };

				conditions[0].push( condition );
			}
		}
		while( skipWhitespaces( query ) && match( query, /^,/ ));

		console.log({ conditions });

		return conditions;
	}

	return undefined;
}

function parseColumns( query )
{
	let start = skipWhitespaces( query ) && match( query, /^[\[\{]/, 0 ), columns = {}, type = ( start === '{' ? 'object' : 'array' );

	if( start )
	{
		do
		{
			let column, alias = column = parseColumn( query );

			console.log({ column });

			if( column )
			{
				skipWhitespaces( query );

				if(  match( query, /^:/ ))
				{
					column = parseColumn( query );
				}
				else if( match( query, /^\(/ ))
				{
					rollback( query, '(' );
					rollback( query, column );

					columns[alias] = parseQuery( query ); continue;
				}

				columns[alias] = column;
			}
		}
		while( skipWhitespaces( query ) && match( query, /^,/ ));

		skipWhitespaces( query ) && match( query, /^[\]\}]/, 0 );
	}

	return { type, columns };
}

function parseName( query )
{
	return skipWhitespaces( query ) && match( query, NAME_RE, 0 );
}

function parseColumn( query )
{
	return skipWhitespaces( query ) && match( query, NAME_RE, 0 );
}

function parseModel( query )
{
	return plural( skipWhitespaces( query ) && match( query, NAME_RE, 0 ));
}

function parseQuery( query )
{
	let table = parseModel( query );
	
	console.log({ table });

	if( table )
	{
		return { table, conditions: parseCondition( query ), ...parseSelection( query ), ...parseColumns( query )};
	}
}

function parseWhere( query )
{
	return { conditions: parseCondition( query ) };
}

module.exports = function( query, where = null )
{
	let parsed = '';

	if( where )
	{
		parsed = parseWhere({ string: query, position: 0 });
	}
	else
	{
		parsed = parseQuery({ string: query, position: 0 });
	}

	//LOG.debug( 'query', parsed );

	return parsed;
};


//; order: surname DESC; limit: 30; after: { id: 10, name: Jozo }
