'use strict';

function getColumns( condition, table )
{
    let names = [...[...condition.matchAll( new RegExp('(?<![a-zA-Z0-9_])'+table+'\\.([a-zA-Z0-9_]+)', 'g'))].reduce(( c, m ) => c.add(m[1]) && c, new Set())];
    let aliases = names.map( n => table + '.' + n + ' _' + table + '_' + n ).join(', ');

    return { names, aliases };
}

module.exports = class Relations
{
    #paths = new Map(); #relations;

    constructor( relations )
    {
        this.#relations = relations;
    }

    path( from, to )
    {
        let path = this.#paths.get( from + ' => ' + to ), relation;

        if( !path )
        {
            if( relation = (( this.#relations[from] && this.#relations[from][to] ) || ( this.#relations[to] && this.#relations[to][from] )))
            {
                let reverse = !( this.#relations[from] && this.#relations[from][to]), node = from;

                if( relation.condition )
                {
                    path = [{ table: to, condition: relation.condition, columns: { [from]: getColumns( relation.condition, from ), [to]: getColumns( relation.condition, to )}}];
                }
                else if( relation.path )
                {
                    path = [ ...( reverse ? relation.path : relation.path.slice().reverse() ), to ].map( to => { let p = this.path( node, to ); node = to; return p }).flat(1);
                }
            }

            if( path ){ this.#paths.set( from + ' => ' + to, path )}
        }

        return path;
    }
}
