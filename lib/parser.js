'use strict';

const Parser = require('liqd-parser');
const SchemeParser = new Parser( require('fs').readFileSync( __dirname + '/syntax/scheme.syntax' ));
const QueryParser = new Parser( require('fs').readFileSync( __dirname + '/syntax/query.syntax' ));

const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;

function normalizeValue( value )
{
    if( value.string ){ return value.string; }
    if( value.number ){ return parseFloat( value.number ); }
    if( value.sql ){ return value.sql }
}

function postprocessQuery( parsed_query )
{
    //console.log( '--------\n' + JSON.stringify( parsed_query, null, ' '  ) + '\n---------');

    let condition = [], columns = {};

    if( parsed_query.condition )
    {
        for( let comparison of parsed_query.condition.condition )
        {
            condition.push([ comparison.column, comparison.operator, normalizeValue( comparison.value )])
        }

        if( parsed_query.condition.modifiers ) for( let modifier of parsed_query.condition.modifiers )
        {
            parsed_query[ modifier.modifier ] = normalizeValue( modifier.value )
        }
    }

    for( let column of parsed_query.columns )
    {
        if( typeof column.column === 'string' )
        {
            columns[ column.alias || column.column ] = column.column;
        }
        else
        {
            columns[ column.alias || column.column.table ] = postprocessQuery( column.column );
            column.expand && ( columns[ column.alias || column.column.table ].expand = true );
        }
    }

    parsed_query.condition = condition;
    parsed_query.columns = columns;
    parsed_query.type = 'array';
    
    if( parsed_query.bracket === '{' )
    {
        parsed_query.type = 'object';
        parsed_query.limit = 1;
    }

    delete parsed_query.bracket;

    return parsed_query;
}

function postprocessScheme( parsed_scheme )
{
    let scheme = {};

    for( let table of parsed_scheme.tables )
    {
        let table_scheme = { relations: {}, getters: {}, setters: {}, setter_triggers: {}};

        for( let definition of table.definitions )
        {
            if( definition.table )
            {
                if( definition.condition )
                {
                    table_scheme.relations[ definition.table ] = { condition: definition.condition }
                }
                else if( definition.path )
                {
                    if( definition.path[ definition.path.length - 1 ] === table.table )
                    {
                        table_scheme.relations[ definition.table ] = { path: definition.path.slice( 0, -1 )}
                    }
                    else{ throw 'Relation path must end with current table ("' + table.table + '")' }
                }
            }
            else if( definition.getter )
            {
                table_scheme.getters[ definition.getter.column ] = 
                { 
                    requires: definition.getter.requires.columns,
                    variable: definition.getter.callback.variable,
                    type: definition.getter.callback.bracket === '{' ? 'object' : 'array',
                    callback:  new ( definition.getter.callback.script.includes('await') ? AsyncFunction : Function )( definition.getter.callback.variable, 'scope', 'with( scope ){ ' + definition.getter.callback.script.trim() + ' }' )
                }
            }
            else if( definition.alias )
            {
                scheme[ definition.alias.name ] = { alias: table.table, condition: definition.alias.condition }
            }
        }

        scheme[ table.table ] = table_scheme;
    }

    return scheme;
}

module.exports = class Parser
{
    static scheme( scheme )
    {
        let parsed_scheme = SchemeParser.parse( scheme );

        return postprocessScheme( parsed_scheme );
    }

    static query( query )
    {
        let parsed_query = QueryParser.parse( query );

        return postprocessQuery( parsed_query );
    }
}