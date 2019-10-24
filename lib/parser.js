'use strict';

const QLParser = new (require('liqd-parser'))( require('fs').readFileSync( __dirname + '/syntax/query.syntax' ));

function normalizeValue( value )
{
    if( value.string ){ return value.string; }
    if( value.number ){ return parseFloat( value.number ); }
}

function postprocess( parsed_query )
{
    let condition = [], columns = {};

    if( parsed_query.condition ) for( let comparison of parsed_query.condition.condition )
    {
        condition.push([ comparison.column, comparison.operator, normalizeValue( comparison.value )])
    }

    for( let column of parsed_query.columns )
    {
        if( typeof column.column === 'string' )
        {
            columns[ column.alias || column.column ] = column.column;
        }
        else
        {
            columns[ column.alias || column.column.table ] = postprocess( column.column );
        }
    }

    parsed_query.condition = condition;
    parsed_query.columns = columns;

    return parsed_query;
}

module.exports = class Parser
{
    static parse( query )
    {
        let parsed_query = QLParser.parse( query );

        return postprocess( parsed_query );
    }
}