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

        //console.log( from + ' => ' + to );

        if( !path )
        {
            if( relation = (( this.#relations[from] && this.#relations[from][to] ) || ( this.#relations[to] && this.#relations[to][from] )))
            {
                let reverse = !( this.#relations[from] && this.#relations[from][to]);

                if( relation.condition )
                {
                    path = [{ table: to, condition: relation.condition.map( c => c.split(/\s*(!=|=|<=|>=|>|<)\s*/)).map( c => ( c.length === 1 ? [ c[0], '=', c[0] ] : c )[ reverse ? 'reverse' : 'slice' ]())}];
                }
                else if( relation.path )
                {
                    let node = from;

                    path = [ ...( reverse ? relation.path : relation.path.slice().reverse() ), to ].map( to => { let p = this.path( node, to ); node = to; return p }).flat(1);

                    console.log({ PATH: path });
                }
            }

            if( path ){ this.#paths.set( from + ' => ' + to, path )}
        }

        return path;
    }
}
